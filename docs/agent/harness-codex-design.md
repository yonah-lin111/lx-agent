# 全量 Codex Harness 架构重构设计方案

## 1. 背景与目标

参考 `codex-main`（路径 `/Users/yonah/projects/agent/codex-main`）的工业级 Harness 架构与系统提示词规范，对 LX Agent 进行全量 Harness 重构。目标是建立一套结构清晰、数据流单向、环境隔离可控、状态机严格的 Agent 运行时驱动层。

### 1.1 参考源定位
- **Prompt 规范与模板**：
  - `codex-rs/core/gpt_5_2_prompt.md`
  - `codex-rs/core/gpt-5.2-codex_prompt.md`
  - `codex-rs/core/templates/collab/experimental_prompt.md`
- **Session / Turn 运行模型与队列**：
  - `codex-rs/core/src/session/session.rs`
  - `codex-rs/core/src/session/mod.rs`
  - `codex-rs/core/src/session/input_queue.rs`
- **环境隔离与 Worktree 策略**：
  - `codex-rs/core/src/session/environment.rs`
  - `codex-rs/sandboxing/`

---

## 2. 核心架构设计

```text
+-------------------------------------------------------------------------+
|                              Renderer / UI                              |
|   (AgentPage.tsx / AgentInput.tsx / AgentMessageList.tsx / FlowList)     |
+------------------------------------+------------------------------------+
                                     | IPC (send, abort, events)
                                     v
+-------------------------------------------------------------------------+
|                              AgentRunner                                |
|                                                                         |
|  +---------------------+   +---------------------+   +---------------+  |
|  | InputQueue / Buffer |-->|   TurnContext / SM  |-->|  TurnStore    |  |
|  +---------------------+   +---------------------+   +---------------+  |
|                                    |                                    |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  |             Dynamic SystemPromptManager & Assembly                |  |
|  |  [Layer 0: Core Persona]                                          |  |
|  |  [Layer 1: Behavior Harness (Preamble / Planning / Ambition)]     |  |
|  |  [Layer 2: Environment Snapshot (<env> Git / Worktree / Platform)]|  |
|  |  [Layer 3: Project Instructions (AGENTS.md Scope Cascade)]        |  |
|  |  [Layer 4: Active Skills / Capabilities & Active Tools]           |  |
|  +-------------------------------------------------------------------+  |
|                                    |                                    |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  |                           Agent Core                              |  |
|  |        (ToolRegistry / Permission Guard / LLM Streaming)          |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### 2.1 Prompt 分层装配体系 (SystemPromptManager)
对齐 Codex 的五层装配体系：
1. **Persona & Tone**：务实、极简、面向行动。
2. **Behavior Harness**：
   - **Preamble**：调用具有副作用或复杂操作的工具前，必须简述 1-2 句意图；只读操作免说明。
   - **Task Planning**：严格维护 `todowrite` 任务状态（`in_progress` 唯一性、完成校验后标记、禁止事后补标）。
   - **Ambition vs Precision**：全新任务大胆发挥，现有代码库实施手术刀式精准修改。
   - **Safety Boundary & Dirty Worktrees**：感知工作区状态，禁止任何破坏性 `git reset --hard`、`git checkout --` 等操作。
   - **Anti-AI-Slop 前端规范**：避免模板化和千篇一律的卡片堆叠。
3. **Environment Injection (`<env>`)**：
   - `Working directory`
   - `Workspace root folder`
   - `Git branch`
   - `Is git worktree`
   - `Platform`
   - `Today's date`
4. **Project Instructions (`AGENTS.md`)**：按路径层级由远及近级联匹配，子目录规范继承并覆盖上层。
5. **Capabilities & Skills**：按会话能力快照激活工具集与已声明技能。

### 2.2 Turn 状态机与环境切片 (TurnContext)
每轮对话（Turn）创建独立的 `TurnContext`：
- 冻结该 Turn 启动时刻的 `cwd`、`is_worktree`、`git_branch` 等环境快照。
- 封装 `InputQueue` 串行处理与消息合并逻辑。
- 记录该 Turn 的 Tool 调用统计与错误回滚点。

### 2.3 安全沙箱与权限流转
- 工具调用前拦截：针对文件系统写操作、终端执行、Worktree 修改实施动态权限审批。
- 拦截器机制：支持运行时动态注入 LSP 诊断上下文或安全告警。

---

## 3. 全量重构阶段规划

* **Phase 1: Prompt & Harness 规范与环境切片**
  - 全量对齐系统提示词与行为准则。
  - 增强 `<env>` 变量收集与 Worktree 探测。
* **Phase 2: Turn 状态机与 InputQueue 机制**
  - 抽象 `TurnContext` 状态切片。
  - 规范消息排队与中断生命周期。
* **Phase 3: 工具链与安全沙箱强化**
  - 针对高危指令与 Worktree 边界强化拦截与权限提升。
* **Phase 4: 前端事件同步与全链路验证**
  - 对齐 IPC 事件流，补齐回归测试套件。
