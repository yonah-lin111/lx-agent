# 会话运行时与治理

本文档定义 LX Agent 会话运行时的核心动态行为：Turn 状态机、Unified Exec 进程执行引擎、输入排队与插话、上下文分层治理（容量感知、压缩/修剪/看门狗/死循环守卫/Token Saver）、多 Agent 协作池与角色治理、长程记忆与会话回滚。

架构总览与存储见 [architecture.md](./architecture.md)；工具契约见 [tools.md](./tools.md)；安全与审批见 [permissions.md](./permissions.md)；模式协议见 [modes.md](./modes.md)。

---

## 1. 会话生命周期与 Turn 状态机

```text
User Input / Drain
       │
       ▼
┌─────────────────┐
│ InputQueue      │ ──► [超限 20 条报错] / [流式中入队] / [Shift+Enter 转换为插话]
└────────┬────────┘
         │ (空闲出队)
         ▼
┌─────────────────┐
│ TurnContext     │ ──► 捕获并冻结不可变环境快照:
│                 │     - cwd, is_worktree, git_branch, platform
│                 │     - collaborationMode (build | plan | review | design | minimal)
│                 │     - sandboxPolicy
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Assembly & Run  │ ──► SystemPromptManager 分层拼装 -> AgentLoop 执行
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Flush & Settle  │ ──► turnStore.flushTurn() 单事务写入 SQLite
│                 │     - 写入 Message Entries + AgentCall 记录 + Todo 状态
│                 │     - 同步 updated_at
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Drain & Compact │ ──► 触发下一次 InputQueue.drain() -> 异步检查 Token 阈值执行压缩
└─────────────────┘
```

### 1.1 核心状态流转规则

- **延迟建表 (Lazy Session Creation)**：空会话仅维持内存态。首条消息发送后才在事务中创建 `agent_session` 记录与首条能力快照。
- **错误恢复语义**：若首轮推理由于模型认证缺失报错且无消息落盘，系统自动回收刚创建的空会话行；若单轮运行中遇到局部工具错误，错误回灌模型由模型自主重试或解释，不破坏会话完整性。
- **动态时间感知 (`TimeReminder`)**：在每一轮 Turn 开始前，计算上一轮至当前的流逝时间，通过 `<current_time>` 动态更新时间片段。
- **多会话并发**：每个会话由独立 `AgentSessionRunner` 承载（见 architecture.md §1.2），`SessionRunnerManager` 按 `sess:` / `tab:` 键路由；会话间状态、工具集、事件流完全隔离。

---

## 2. 输入排队与即时插话机制

| 机制 | 触发方式 | 核心行为与边界 |
| :--- | :--- | :--- |
| **Input Queue (排队)** | 运行中按 `Enter` 发送（默认投递） | 消息进入内存 FIFO 队列（`MAX_QUEUE` = **20** 条），输入框清空并显示排队气泡；当前 Turn 结束后自动作为独立 User Turn 发送；Abort 操作清空队列。 |
| **Steer (即时插话)** | 运行中按 `Shift+Enter`（`delivery: "steer"`） | 通过 `agent.steer()` 在工具调用边界即时注入当前运行上下文，促使模型提前转向；消息落库标记 `isSteer: true`。 |
| **Continue (续写)** | `/continue` 或操作栏按钮 | 当最后一条助手消息由于 `length` 或 `aborted` 截断时，由 `agent.continue()` 恢复生成上下文继续输出。 |
| **Esc 分级打断** | 按 `Esc` 键 | ① 关闭补全/命令弹窗 -> ② 清空未发送草稿 -> ③ 输入为空且正在生成时：**双击 Esc（1 秒内）** 触发 `onStop()` 中止流式，单按仅 Toast 提示。 |

---

## 3. Unified Exec 统一执行引擎 (`src/main/agent/shell/`)

将短时命令、长时后台任务与持久化 PTY 终端会话统一收敛至 `UnifiedExecManager`：

### 3.1 HeadTailBuffer 对称截断缓冲区

- **50/50 对称容量分配**：缓冲区上限 `DEFAULT_UNIFIED_EXEC_OUTPUT_MAX_BYTES` = **1 MiB**。
- **截断标记**：当标准输出/错误总流超出上限时，自动丢弃中间数据，保留前 50% 头部与后 50% 尾部，并在交界处插入：
  ```text
  \n... [N bytes / M lines omitted] ...\n
  ```
- 具备 `pushChunk`、`pushBuffer`、`retainedBytes` 与 `omittedBytes` 统计能力；触发截断时在输出中保留省略标记，引导模型缩小查询范围而非重读全量。

### 3.2 进程生命周期与调度

- **PID 统一分配**：递增分配会话内部虚拟 PID，支持标准输入动态写入（`writeStdin`）。
- **Yield Time Clamping**：可等待执行的命令统一钳位等待区间（250ms ~ 30,000ms）。
- **持久化 Shell 会话 (`PersistentShell`)**：基于 `node-pty` 维持后台终端环境，跨命令保持 `cwd` 与环境变量。
- **后台作业管理 (`JobRegistry`)**：针对 `background: true` 的长时作业（如服务启动、监听），维持状态机 `running -> stopping -> killed/completed/failed`，输出超限时自动 Spill 落盘至 `~/.lx/spill/<sessionId>/jobs/<jobId>.log`。

---

## 4. 上下文分层治理体系

```text
[原始输入] ──► ContextPruner (历史大输出修剪)
               │
               ▼
             transformContext (记忆/Todo/压缩摘要注入 + <context_window_guidance> 容量告警)
               │
               ▼
             LLM 生成 ──► [IdleWatchdog 60s 空闲看门狗]
               │
               ▼
             [Token Saver 出站转换] ──► RTK 工具输出压缩 + Caveman/Ponytail 风格注入
               │
               ▼
             ToolCall ──► [RepeatToolGuard 3/5/7 阶梯熔断]
               │
               ▼
             [溢出捕捉] ──► isContextOverflow ──► 强制 Compaction ──► 自动重试
```

### 4.1 Compaction 结构化压缩 (`contextCompactor.ts`)

- **方案 Z 原则（可见摘要 + 全量真相）**：SQLite 数据库与 UI 视图始终保留完整原始消息历史；向 LLM 投递的上下文经过 `transformContext` 动态构造为：
  `[CompactionSummary 结构化摘要] + firstKeptSeq 之后的最新消息`
- **触发时机**：Turn 结束时，根据 `estimated > contextWindow - reserveTokens` 自动触发；或用户显式调用 `/compact`。`reserveTokens = min(配置值 16384, contextWindow × 20%)`（`DEFAULT_COMPACTION_SETTINGS`：`contextWindow 128000`、`keepRecentTokens 20000`、`reserveTokens 16384`），同时保留的最近消息预算 `keepRecentTokens ≤ contextWindow × 40%`。
- **压缩窗口对齐**：压缩摘要生成模型超时 30s、输入上限 30,000 字符；生成失败推送 `compaction_failed` 并移除 loading 占位，不影响当前会话继续。
- **溢出自愈 (Overflow Self-Healing)**：若 Provider 抛出上下文溢出错误，系统自动截获、清理失败调用、执行紧急最大化压缩，并在原 Turn 自动重试一次。

### 4.2 Tier-1 历史工具输出修剪 (`ContextPruner`)

在内存视图变换中，将历史只读类工具（`read`/`grep`/`find`/`ls`/`webfetch`/`webSearch`/`view_image`）的超长输出就地替换为轻量占位符。默认参数：尾部 **6** 条消息豁免；单条输出超过 **20 行**或 **500 字符**才修剪；`view_image` 结果的图片块在豁免窗口外统一替换为 `[Image omitted from historical context: <path>]` 文本占位（UI 仍展示原图）。修剪仅作用于内存拷贝，不污染持久化数据。图片块的 token 估计按 **1500 tokens/张**计入容量与压缩判定。

### 4.3 Context Window Guidance 动态容量感知 (`systemPromptManager.ts`, order 358)

- **双阈值**：上下文占用 `ratio = tokens / contextWindow`；`ratio < 75%` 返回空串（零 Token 污染）；`75% ≤ ratio < 90%` 注入 `level="warning"` 引导（避免大文件倾倒、优先符号级检索）；`ratio ≥ 90%` 注入 `level="critical"`（收敛输出、建议用户 `/compact`）。
- **数据来源**：直接读取 `ContextCompactor.getUsage()` 内存估算，无额外 IO 与模型调用；随每轮提示词装配实时刷新，压缩后自动回落到零污染。
- **UI 对齐**：`AgentContextUsagePill` 按同一阈值分档（<75% 常色 / 75–90% 琥珀 / ≥90% 红色脉冲），Tooltip 提示压缩。

### 4.4 Repeat Tool Guard 死循环守卫

- 监控 `(toolName, canonicalArgs)` 连续重复调用序列（深度排序 Key + Canonical JSON 指纹）；`todowrite` / `question` / `task` 为对链透明工具，不计入连续计数。
- 阶梯干预策略：
  - 连续相同调用达 **3 次**：注入软性警告提示；
  - 达 **5 次**：注入强警告（附参数预览，默认 300 字符）；
  - 达 **7 次**：直接拒绝执行并返回错误提示回灌模型。

### 4.5 流式空闲看门狗 (`IdleWatchdog`)

包装流式生成流，每个数据 Chunk 重置计时器；连续 **60 秒**（`DEFAULT_STREAM_IDLE_TIMEOUT_MS`）无任何增量即主动触发 Abort，避免半开 TCP 连接导致整个 Agent 挂死。

### 4.6 Token Saver 出站请求治理 (`src/main/agent/tokenSaver/`)

Token Saver 在 `aiSdkStreamFn` 发出请求前对**出站副本**做压缩与风格注入，持久化历史与 UI 展示始终保持原始内容；转换全程 fail-open（任何异常原样放行）。仅对 `chat` / `subagent` purpose 生效，标题、建议问题与压缩摘要等请求不受影响。配置节点 `~/.lx/config/agent.json` → `tokenSaver`（设置 → Token Saver，保存后下一轮请求生效）：

- **RTK 工具输出压缩**（`rtkEnabled`，默认开启）：单条工具输出低于 500 字符跳过、高于 10 MiB 放行；自动探测输出类型后经 12 个过滤器压缩（`git diff` / `git log` / `git status` / `grep` / `find` / `ls` / `tree` / 构建输出 / 通用日志去重 / 编号行读取 / 搜索结果列表 / 智能截断），保留行数上限按过滤器定义（如 git diff 单 hunk 100 行、git log 200 行、grep 每文件 10 条）；工具错误结果一律跳过。
- **Caveman 输出风格**（`cavemanEnabled`，默认关闭）：档位 `lite` / `full` / `ultra` 与文言档 `wenyan-lite` / `wenyan` / `wenyan-ultra`，以英文提示词注入系统提示词，压缩回复篇幅但保留代码、路径、错误字符串与安全警告原文。
- **Ponytail 实现倾向**（`ponytailEnabled`，默认关闭）：档位 `lite` / `full` / `ultra`，引导优先标准库/最小实现、不引入多余抽象与依赖。
- **生效记录**：实际命中时写入 `AssistantMessage.tokenSaver`（`TokenSaverRun`：`rtkFilters` / `rtkSavedChars` / 按 `toolCallId` 归因的 `hits` / `cavemanLevel` / `ponytailLevel`），随消息 entry 落库；执行流程底栏据此展示工具步骤的 `RTK −xxk` 标注与回复步骤的风格标注，重启恢复后仍在。

---

## 5. 多 Agent 协作与特化代理池 (`src/main/agent/subagent/`)

### 5.1 角色目录与派发

- **角色派发**：`task` 工具通过 `agent_type` 从内置角色（`explorer` / `worker`）与用户角色（`~/.lx/config/agent.json` → `agent.subagents.roles`）中显式选型；未知值返回错误并列出可用角色，不静默回退。`task` 工具 description 在会话装配时动态注入 `Available agent types:` 目录，配置了 `maxConcurrent` 时追加并发提示行。
- **内置角色**：`explorer`（只读权限：`tools` = `read` / `ls` / `grep` / `find` / `lsp` / `time`，`websearch` 全开，`skills` 全禁）与 `worker`（不限制，继承父激活集）；保留名 `review` / `explorer` / `worker` 禁止用户角色占用（`review` 归属协作模式 Review Mode，不存在 `review` 子代理角色）。
- **能力只收缩不提权**：子代理工具集以父激活集（已剔除 `task`）为基础，按角色 `permissions` 四组独立求交（缺省 = 不限制继承父集，显式空数组 = 该组全禁）：`tools` 管内置工具（含 `task` 嵌套）、`mcp` 按 server 名匹配 `mcp__server__tool` 全名、`websearch` 管 `web_search` / `webfetch`、`skills` 管 `read_skill` 与子代理提示词的 `available_skills` 注入（同源收窄）。权限门控复用父 `permissionManager.gate`（协作模式按 `agent.subagents.mode` 绑定，缺省 `build`，不继承主 Agent 模式），沙箱策略原样继承，角色无法提升。嵌套 `task` 仅在子代理深度 `< maxDepth` 且 `permissions.tools` 未排除 `task` 时注入，否则维持剔除。
- **模型优先级**：`role.model → defaultModel → 父会话模型`；任一级解析失败 `console.warn` 并降级到下一级，仅新建时解析，续接沿用创建时模型。
- **批量扇出**：`tasks[]`（上限 64 项）一次派发多个新子代理并行执行，结果按输入顺序聚合为文本分段与 `details.subagents` 数组；批量项不支持 `subagent_id` 续接（续接走单任务模式），任一 `agent_type` 非法则整批早退、不消费槽位。
- **并发与深度治理**：会话级 `SubagentRuntime` 在 `maxConcurrent`（1–32，缺省不限）达到上限时，顶层会话（depth 0，含单任务与批量项）按 FIFO 排队等待槽位，槽位释放直接移交队首；嵌套子代理（depth ≥ 1）保持 fail-fast 返回错误文案（父代理占槽等待子代理会形成循环等待死锁）。父 run 中止时排队项出队返回 aborted。`maxDepth` 取 1–5（默认 1；根会话为 0，子代理 = 父 + 1），越界不再嵌套。
- **配置快照**：角色目录与治理项在会话 registry 装配时快照，设置保存仅对新会话生效。
- **续接不可变**：经 `subagent_id` / `name` 命中池内子代理时沿用创建时的角色、模型与工具集；携带与已固定角色冲突的 `agent_type` 直接报错，未携带或相同则等价于未携带。
- **长程上下文续接与快照持久化**：向同一子代理多轮追问并保留内部执行状态；内部时间轴、步骤与 Token 统计通过 `SubagentData` 挂载于 `ToolResultMessage.subagent`（批量模式为 `ToolResultMessage.subagents[]`，按输入顺序）随事务落盘，条目携带 `roleName` 与单项 `status`（流式快照 `running`，终态 `done` / `error` / `aborted`）供卡片、面板与执行流程逐项标记完成；批量模式下单项完成即回推终态快照，不等整批结束。
- **`@` 子代理提及**：输入框 `@` 面板列出内置与用户角色（`@agent:<name>`），选定后以独立 token 高亮插入；token 随用户消息原样进入模型上下文作为委派意图提示，主进程不做强制路由；Backspace 在 token 末尾整块删除。

### 5.2 子代理配置 Schema（`~/.lx/config/agent.json` → `agent.subagents`）

```jsonc
{
  "agent": {
    "subagents": {
      // 可选；缺省不限。1–32 的整数。
      "maxConcurrent": 4,
      // 可选；缺省 1。1–5 的整数：子代理不可再派生。
      "maxDepth": 1,
      // 可选；缺省继承父会话模型。
      "defaultModel": { "provider": "anthropic", "model": "claude-sonnet-4-5" },
      // 可选；子代理协作模式（build | plan | review | design），缺省 build；不继承主 Agent 模式。
      "mode": "build",
      "roles": {
        "auditor": {
          // 必填：注入 task 工具描述，模型据此选型。
          "description": "Strict review of a specific change set.",
          "instructions": "You are a strict reviewer...",
          "model": { "provider": "openai", "model": "gpt-5.1" },
          // 能力权限：每组缺省 = 不限制（继承父会话），空数组 = 该组全禁，非空 = 白名单。
          "permissions": {
            "tools": ["read", "grep", "find", "lsp"],
            "mcp": ["codegraph"],
            "skills": ["code-review"],
            "websearch": []
          }
        }
      }
    }
  }
}
```

校验规则（`subagentConfig.ts` 单点实现；读取 fail-soft 告警忽略，设置页保存严格拒绝）：

| 字段 | 规则 | 非法处理 |
| :--- | :--- | :--- |
| 角色名 | `^[a-z][a-z0-9_-]{0,31}$`；不得命中保留名（`review` / `explorer` / `worker`） | 保存拒绝（设置页报错）；读配置时告警 + 忽略该条 |
| `description` | 去空白后非空 | 同上 |
| `instructions` | 字符串，可缺省 | 非字符串 → 告警 + 忽略 |
| `permissions` | 对象，四个可选数组字段（`tools` / `mcp` / `skills` / `websearch`）；每组缺省 = 不限制，空数组 = 该组全禁，非空 = 白名单；逐项去空白、去重 | 非对象 → 告警 + 忽略；非数组分组 → 告警 + 忽略该组；非法项忽略并告警 |
| `tools`（旧字段） | 兼容读取：非空白名单拆入 `permissions`（`web_search`/`webfetch` → `websearch`，`read_skill` → 允许全部 skill，其余 → `tools`，未列组置空 = 全禁）；空数组按历史语义视为缺省 | 保存不再写回该字段 |
| `builtinPermissions` | 对象，键限内置角色名（`explorer` / `worker`），值为 `permissions`；仅覆盖权限，名称/描述/指令/模型保持系统定义；与内置默认一致时设置页自动清除该键 | 非法键 → 告警 + 忽略；非对象 → 告警 + 忽略 |
| `maxDepth` | 整数 1–5 | 越界保存拒绝；读时回退 1 并告警 |
| `maxConcurrent` | 整数 1–32 | 越界保存拒绝；读时回退缺省（不限）并告警 |
| `defaultModel` | `ModelSelection`（provider/model 需存在，由消费者降级） | 缺省即继承；非法仅运行时告警降级 |
| `mode` | `build` / `plan` / `review` / `design` | 缺省即 `build`；非法保存拒绝，读时告警 + 忽略（回退 `build`） |

设置与 IPC：`settings:subagents:get/save/builtins/get-capabilities` 四个通道；设置页「子代理」分区（全局治理卡片 + 内置角色列表（权限可编辑、身份只读）+ 用户角色增删改，`SubagentSettings.tsx`）；角色弹窗宽 720px、内嵌 `SubagentPermissionsForm.tsx` 2×2 权限编辑器（组开关 + 多选清单 + 全选/清空，能力目录来自 `get-capabilities`，卡片挂 `settings-item-card` 供主题适配）。

### 5.3 子代理系统提示词与审查路径

- 子代理系统提示词按「子代理基座提示词（按 `agent.subagents.mode` 渲染，缺省 Build，不注入主 Agent 协作模式）→ `SUBAGENT_PROMPT_SUFFIX` → `role.instructions`」顺序追加（适用于 `explorer` / `worker` 与用户角色）；`SubagentStart` / `SubagentStop` hook payload 的 `agent_type` 使用解析后的角色名。
- 代码审查的唯一路径是协作模式 Review Mode（只读审计 + `<review_findings>` 输出契约），不存在 `review` 子代理角色；处于 Review 模式且用户未指定审查目标时，默认审查当前未提交变更。输出协议与卡片见 [modes.md](./modes.md) §3。

---

## 6. XML 记忆系统 (`src/main/agent/memories/`)

只沉淀**用户习惯**与**可复用工作流程**；一次性 bug 修复、评审结论、任务进度等易污染上下文的内容禁止写入：

1. **双作用域单文件**：
   - 用户级 `~/.lx/memory/memory.xml`：跨项目习惯（type `user`）；
   - 项目级 `<project-root>/.lx/memory/memory.xml`：仓库特定流程（type `workflow`）。
   每条记忆一个 `<memory type name>` 元素，注入上限 **200 行 / 25KB**（按完整元素截断，不切断元素）。
2. **旧格式迁移**：检测到旧版 `MEMORY.md` + `notes/` 分层结构时直接清理重建，不留兼容路径。
3. **常驻注入与维护**：`<auto_memory>`（含 `<memory_guidance>` 指导语）常驻系统提示词；模型识别到持久习惯/流程时调用 `memory` 工具（`save`/`view`/`search`/`delete`）维护；文件损坏时保存侧先备份为 `memory.xml.corrupt-<时间戳>` 再重建。

---

## 7. 会话分支与 Git 快照回滚

- **Fork（从此分支）**：支持从任意历史 User Turn 进行切割复制，保持历史 entry 的相对序列，在新会话中无损重建执行上下文；位于已压缩区域的轮次不可作为分支点。
- **Git 快照与删轮回滚**：在 Git 仓库环境下，Turn 启动与结束记录 `write-tree` 哈希（`gitSnapshotService`）；当用户删除最后一轮对话时，支持联动回滚工作区文件至该轮启动前的快照状态。
