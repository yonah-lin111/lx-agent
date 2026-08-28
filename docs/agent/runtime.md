# 会话运行时与治理

本文档定义 LX Agent 会话运行时的核心动态行为：Turn 状态机、Unified Exec 进程执行引擎、输入排队与插话、上下文分层治理（压缩/修剪/看门狗/死循环守卫）、多 Agent 协作池与长程记忆。

架构总览见 [architecture.md](./architecture.md)；工具契约见 [tools.md](./tools.md)；安全与审批见 [permissions.md](./permissions.md)；存储模型见 [database.md](./database.md)。

---

## 1. 会话生命周期与 Turn 状态机

```text
User Input / Drain
       │
       ▼
┌─────────────────┐
│ InputQueue      │ ──► [超限 20 条报错] / [流式中入队] / [/steer 转换为插话]
└────────┬────────┘
         │ (空闲出队)
         ▼
┌─────────────────┐
│ TurnContext     │ ──► 捕获并冻结不可变环境快照:
│                 │     - cwd, is_worktree, git_branch, platform
│                 │     - collaborationMode (default | plan)
│                 │     - sandboxPolicy, approvalPolicy
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
- **动态时间感知 (`TimeReminder`)**：在每一轮 Turn 开始前，计算上一轮至当前的流逝时间，通过 `<current_time>` 动态更新时间片段，使 Agent 具备时间间隔感知能力。

---

## 2. 输入排队与即时插话机制

| 机制 | 触发方式 | 核心行为与边界 |
| :--- | :--- | :--- |
| **Input Queue (排队)** | 运行中按 `Enter` 发送 | 消息进入内存 FIFO 队列（上限 **20** 条），输入框清空并显示排队气泡；当前 Turn 结束后自动作为独立 User Turn 发送；Abort 操作清空队列。 |
| **Steer (即时插话)** | 运行中按 `Shift+Enter` 或 `/steer <text>` | 通过 `agent.steer()` 在工具调用边界即时注入当前运行上下文，促使模型提前转向；消息落库标记 `isSteer: true`。 |
| **Continue (续写)** | `/continue` 或操作栏按钮 | 当最后一条助手消息由于 `length` 或 `aborted` 截断时，由 `agent.continue()` 恢复生成上下文继续输出。 |
| **Esc 分级打断** | 按 `Esc` 键 | ① 关闭补全/命令弹窗 -> ② 清空未发送草稿 -> ③ 空输入框时触发 `abort()` 中止流式生成并清空排队。 |

---

## 3. Unified Exec 统一执行引擎 (`src/main/agent/shell/`)

借鉴工业级 Harness 规范，将短时命令、长时后台任务与持久化 PTY 终端会话统一收敛至 `UnifiedExecManager`：

### 3.1 HeadTailBuffer 对称截断缓冲区
- **50/50 对称容量分配**：缓冲区最大上限默认为 1MiB（可通过配置调优）。
- **截断标记**：当标准输出/错误总流超出上限时，自动丢弃中间数据，保留前 50% 头部与后 50% 尾部，并在交界处插入：
  ```text
  \n... [N bytes / M lines omitted] ...\n
  ```
- **纯文本与二进制支持**：具备 `pushChunk`、`pushBuffer`、`retainedBytes` 与 `omittedBytes` 统计能力。

### 3.2 进程生命周期与调度
- **PID 统一分配**：递增分配会话内部虚拟 PID，支持标准输入动态写入（`writeStdin`）。
- **Yield Time Clamping**：对可等待执行的命令统一钳位等待区间（250ms ~ 30,000ms）。
- **持久化 Shell 会话 (`PersistentShell`)**：基于 `node-pty` 维持后台终端环境，跨命令保持 `cwd` 与环境变量。
- **后台作业管理 (`JobRegistry`)**：针对 `background: true` 的长时作业（如服务启动、监听），维持状态机 `running -> stopping -> killed/completed/failed`，输出超限时自动 Spill 落盘至 `~/.lx/spill/<sessionId>/jobs/<jobId>.log`。

---

## 4. 上下文分层治理体系

```text
[原始输入] ──► ContextPruner (历史大输出修剪)
               │
               ▼
             transformContext (记忆/Todo/压缩摘要注入)
               │
               ▼
             LLM 生成 ──► [IdleWatchdog 30s 空闲看门狗]
               │
               ▼
             ToolCall ──► [RepeatToolGuard 死循环熔断]
               │
               ▼
             [溢出捕捉] ──► isContextOverflow ──► 强制 Compaction ──► 自动重试
```

### 4.1 Compaction 结构化压缩 (`contextCompactor.ts`)
- **方案 Z 原则（可见摘要 + 全量真相）**：SQLite 数据库与 UI 视图始终保留完整原始消息历史；向 LLM 投递的上下文经过 `transformContext` 动态构造为：
  `[CompactionSummary 结构化摘要] + firstKeptSeq 之后的最新消息`
- **触发时机**：Turn 结束时，根据 `totalTokens > (contextWindow - reserveTokens)` 自动触发；或用户显式调用 `/compact`。
- **溢出自愈 (Overflow Self-Healing)**：若 Provider 抛出上下文溢出错误，系统自动截获、清理失败调用、执行紧急最大化压缩，并在原 Turn 自动重试一次。

### 4.2 Tier-1 历史工具输出修剪 (`ContextPruner`)
- 在内存视图变换中，将 N 轮之前只读类工具（`read`/`grep`/`find`/`web_search`/`webfetch`）的超长输出就地替换为轻量占位符（保留行数与状态统计），最新活跃轮次完整保留。

### 4.3 Repeat Tool Guard 死循环守卫
- 监控 `(toolName, canonicalArgs)` 连续重复调用序列。
- 阶梯干预策略：
  - 连续相同调用达 **3 次**：注入软性警告提示；
  - 连续相同调用达 **5 次**：注入强警告；
  - 连续相同调用达 **7 次**：直接拒绝执行并返回错误提示回灌模型。

### 4.4 流式空闲看门狗 (`IdleWatchdog`)
- 包装流式生成流，每个数据 Chunk 重置计时器；连续 **30 秒** 无任何增量即主动触发 Abort，彻底避免半开 TCP 连接导致整个 Agent 挂死。

---

## 5. 多 Agent 协作与特化代理池 (`src/main/agent/subagent/`)

### 5.1 Subagent Pool 执行模型
- **递归阻断**：子代理继承父级基础能力，但激活工具集强制剔除 `task` 工具自身，杜绝无限递归衍生。
- **长程上下文续接**：通过 `subagent_id` 维护子代理池，支持多轮交互中向同一子代理追加追问并保留其内部执行状态。
- **快照持久化**：子代理内部时间轴、步骤与 Token 统计通过 `SubagentData` 挂载于 `ToolResultMessage.subagent` 随事务落盘。

### 5.2 专精 Review Agent (`reviewAgent.ts`)
- 运行于严格只读沙箱环境下的特化代码审查子代理。
- 遵循标准 **Rubric** 评估体系对代码 Diff 进行多维度审查：
  - 代码正确性与边界条件（Correctness & Edge Cases）
  - 架构一致性与反 AI 样板（Architecture & Anti-Slop）
  - 安全隐患与凭据泄露（Security & Credentials）
  - 性能与资源泄漏（Performance & Leaks）

---

## 6. 分层记忆系统 (`src/main/agent/memories/`)

对齐 Claude Code 记忆设计标准，彻底废弃输出文本嵌入标记，采用纯工具化召回：

1. **两层文件组织**：
   - `<project-root>/.lx/memory/MEMORY.md`：单行高密度索引文件（常驻提示词，加载上限 200 行 / 25KB）；
   - `<project-root>/.lx/memory/notes/*.md`：具体 Topic 笔记（带 YAML frontmatter：`name`, `description`, `type`）。
2. **记忆分类（Type）**：`user`（偏好/习惯）、`feedback`（历史踩坑/纠偏）、`project`（关键架构决策）、`reference`（外部线索）。
3. **主动召回与维护**：提示词指导 Agent 在遇到重要决策时调用 `memory` 工具（`action: "save"`）更新，需要详情时通过 `memory` 工具（`action: "view"`）按需读取。

---

## 7. 会话分支与 Git 快照回滚

- **Fork（从此分支）**：支持从任意历史 User Turn 进行切割复制，保持历史 entry 的相对序列，在新会话中无损重建执行上下文。
- **Git 快照与删轮回滚**：在 Git 仓库环境下，Turn 启动与结束记录 `write-tree` 哈希；当用户删除最后一轮对话时，支持联动回滚工作区文件至该轮启动前的快照状态。
