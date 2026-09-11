# 会话运行时与治理

本文档定义 LX Agent 会话运行时的核心动态行为：Turn 状态机、Unified Exec 进程执行引擎、输入排队与插话、上下文分层治理（容量感知、压缩/修剪/看门狗/死循环守卫）、多 Agent 协作池与长程记忆。

架构总览见 [architecture.md](./architecture.md)；工具契约见 [tools.md](./tools.md)；安全与审批见 [permissions.md](./permissions.md)；模式协议见 [collaboration-modes.md](./collaboration-modes.md)；存储模型见 [database.md](./database.md)。

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
│                 │     - collaborationMode (build | plan | review | design)
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
| **Input Queue (排队)** | 运行中按 `Enter` 发送（默认投递） | 消息进入内存 FIFO 队列（上限 **20** 条），输入框清空并显示排队气泡；当前 Turn 结束后自动作为独立 User Turn 发送；Abort 操作清空队列。 |
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
- 具备 `pushChunk`、`pushBuffer`、`retainedBytes` 与 `omittedBytes` 统计能力；触发截断时经 `HarnessFeedbackGuard` 向模型注入 `<harness_warning>`，引导缩小查询范围而非重读全量。

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
             ToolCall ──► [RepeatToolGuard 3/5/7 阶梯熔断]
               │
               ▼
             [溢出捕捉] ──► isContextOverflow ──► 强制 Compaction ──► 自动重试
```

### 4.1 Compaction 结构化压缩 (`contextCompactor.ts`)

- **方案 Z 原则（可见摘要 + 全量真相）**：SQLite 数据库与 UI 视图始终保留完整原始消息历史；向 LLM 投递的上下文经过 `transformContext` 动态构造为：
  `[CompactionSummary 结构化摘要] + firstKeptSeq 之后的最新消息`
- **触发时机**：Turn 结束时，根据 `estimated > contextWindow - reserveTokens` 自动触发；或用户显式调用 `/compact`。`reserveTokens = min(配置值 16384, contextWindow × 20%)`，同时保留的最近消息预算 `keepRecentTokens ≤ contextWindow × 40%`。
- **压缩窗口对齐**：压缩摘要生成模型超时 30s、输入上限 30,000 字符；生成失败推送 `compaction_failed` 并移除 loading 占位，不影响当前会话继续。
- **溢出自愈 (Overflow Self-Healing)**：若 Provider 抛出上下文溢出错误，系统自动截获、清理失败调用、执行紧急最大化压缩，并在原 Turn 自动重试一次。

### 4.2 Tier-1 历史工具输出修剪 (`ContextPruner`)

在内存视图变换中，将历史只读类工具（`read`/`grep`/`find`/`ls`/`webfetch`/`webSearch`）的超长输出就地替换为轻量占位符。默认参数：尾部 **6** 条消息豁免；单条输出超过 **20 行**或 **500 字符**才修剪；修剪仅作用于内存拷贝，不污染持久化数据。

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

---

## 5. 多 Agent 协作与特化代理池 (`src/main/agent/subagent/`)

### 5.1 Subagent Pool 执行模型

- **递归阻断**：子代理继承父级基础工具集，但强制剔除 `task` 工具自身，杜绝无限递归衍生。
- **长程上下文续接**：通过 `subagent_id`（或名称）维护子代理池，支持多轮交互中向同一子代理追加追问并保留其内部执行状态。
- **快照持久化**：子代理内部时间轴、步骤与 Token 统计通过 `SubagentData` 挂载于 `ToolResultMessage.subagent` 随事务落盘。

### 5.2 专精 Review Agent (`reviewAgent.ts`)

- 由 `task` 工具按名称（`REVIEW_AGENT_NAME` 或名称含 `review`）路由加载的特化代码审查子代理，注入专用审查系统提示词。
- 遵循标准 Rubric 评估体系对代码 Diff 进行多维度审查：正确性与边界条件、架构一致性与反样板、安全隐患与凭据泄露、性能与资源泄漏。
- 详细审查模式的输出协议与卡片见 [collaboration-modes.md](./collaboration-modes.md)。

---

## 6. 分层记忆系统 (`src/main/agent/memories/`)

对齐 Claude Code 记忆设计标准，采用纯工具化召回：

1. **两层文件组织**：
   - `<project-root>/.lx/memory/MEMORY.md`：单行高密度索引文件（常驻提示词，加载上限 200 行 / 25KB）；
   - `<project-root>/.lx/memory/notes/*.md`：具体 Topic 笔记（带 YAML frontmatter：`name`, `description`, `type`）。
2. **记忆分类（Type）**：`user`（偏好/习惯）、`feedback`（历史踩坑/纠偏）、`project`（关键架构决策）、`reference`（外部线索）。
3. **主动召回与维护**：提示词指导 Agent 在遇到重要决策时调用 `memory` 工具（`action: "save"`）更新，需要详情时按需读取（`action: "view"`）。

---

## 7. 会话分支与 Git 快照回滚

- **Fork（从此分支）**：支持从任意历史 User Turn 进行切割复制，保持历史 entry 的相对序列，在新会话中无损重建执行上下文；位于已压缩区域的轮次不可作为分支点。
- **Git 快照与删轮回滚**：在 Git 仓库环境下，Turn 启动与结束记录 `write-tree` 哈希；当用户删除最后一轮对话时，支持联动回滚工作区文件至该轮启动前的快照状态。
