# Agent 架构总览

LX Agent 的 Agent 能力（对话 + 工具 + 协作）运行于 Electron main 进程：LLM 调用、工具执行、进程管理、安全沙箱与会话状态全部在 main；renderer 纯 UI，经 IPC 订阅事件流并派发指令。底层基于 Vercel AI SDK 适配自定义状态机循环，数据校验体系全面基于 Zod。

文档分工：

- [architecture.md](./architecture.md)（本篇）：整体分层架构、进程模型、并发模型、核心契约与消息流
- [runtime.md](./runtime.md)：Turn 状态机、Unified Exec 执行引擎、上下文治理、记忆与后台作业
- [tools.md](./tools.md)：内置工具全集（文件/检索/补丁/记忆/MCP/Skill/协作）与提示词装配规范
- [permissions.md](./permissions.md)：四模式硬门禁、三档沙箱策略、Guardian 防护网与多级审批
- [hooks.md](./hooks.md)：用户级生命周期钩子（11 事件）、配置 schema、子进程线协议与 fail-open 语义
- [collaboration-modes.md](./collaboration-modes.md)：Plan / Review 模式的输出协议、解析契约与交互卡片
- [front-design.md](./front-design.md)：Front Design 模式的输出协议、热更新、版本迭代与画布点选微调
- [openclaw.md](./openclaw.md)：OpenClaw Gateway 接入的页面、会话扇出与跨页委派
- [database.md](./database.md)：SQLite 数据模型、Session Entry 事务落盘与版本回退

---

## 1. 架构与数据流

```mermaid
flowchart TD
    UI[Renderer: AgentPage / AgentTabBar / ExecutionFlow] -->|window.api.agent| Preload[Preload: api/agent]
    Preload -->|IPC invoke / events| IPC[Main: agentHandlers]
    IPC --> SRM[SessionRunnerManager: 多会话实例池]

    subgraph AgentSessionRunner [单会话运行器]
        SRM --> Runner[AgentSessionRunner + TurnStore]
        Runner --> TurnSM[TurnContext 状态机 + InputQueue]
        TurnSM --> AgentCore[Core Agent + AgentLoop]
        AgentCore --> Adapter[aiSdkStreamFn + IdleWatchdog]
        Adapter --> MF[ModelFactory]
        MF --> Providers[Anthropic / OpenAI / DeepSeek / Compatible]
    end

    subgraph Governance & Security
        Runner --> SPM[SystemPromptManager: 动态提示词分层装配]
        Runner --> Guardian[GuardianEvaluator: 四维风险防线]
        Runner --> Perm[PermissionManager: 模式/沙箱/规则/审批策略]
        Runner --> Guard[RepeatToolGuard + HarnessFeedbackGuard]
        Runner --> Compaction[ContextCompactor + ContextPruner]
    end

    subgraph Tooling & Subsystems
        AgentCore --> Tools[ToolRegistry]
        Tools --> Exec[UnifiedExecManager: HeadTailBuffer + PTY]
        Tools --> FileOps[FileMutationQueue: Read/Write/Edit/ApplyPatch]
        Tools --> Memory[MemoryManager: MEMORY.md + Topic Notes]
        Tools --> Subagents[SubagentPool: Task / ReviewAgent]
        Tools --> MCP[McpManager: Stdio Servers]
        Tools --> Skills[SkillLoader: SKILL.md]
        Tools --> LSP[LspManager: 语言服务器与写后诊断]
    end

    Runner --> DB[(SQLite: agentSessionService)]
    AgentCore -->|AgentEvent 带 sessionId/tabId| Runner
    Runner -->|agent:event| UI
```

### 1.1 一次对话的完整数据流

1. **输入与路由**：Renderer 发起 `sendMessage(text, options)`，经 `AgentSendContext` 携带 `sessionId` / `tabId` → Main `agentHandlers` → `SessionRunnerManager.getOrCreateRunner()` 按 `sess:<id>` / `tab:<id>` 键取到对应 `AgentSessionRunner`。若该会话正在流式运行，消息默认进入 FIFO `InputQueue`（上限 20 条），或通过 `delivery: "steer"` 转换为即时插话。
2. **环境切片与装配**：`TurnContext` 冻结当前 Turn 的 `cwd`、`is_worktree`、`git_branch`、协作模式（`build`/`plan`/`review`/`design`）、沙箱策略等不可变快照；`SystemPromptManager` 按 order 分层动态拼装（见 tools.md §3）。
3. **驱动循环 (Agent Loop)**：
   - 构造 `LlmMessage` 列表，执行上下文修剪（`ContextPruner`）与记忆/任务状态注入（`transformContext`）。
   - 调用 `aiSdkStreamFn` 发起流式推理，由 `IdleWatchdog`（默认 60s）监控防止网络半开假死。
   - 检测到 Tool Call：依次通过 `CommandSafetyGuard`、`GuardianEvaluator`、`PermissionManager`（模式/沙箱/白名单/审批）安全门控。
   - 安全放行后通过 `UnifiedExecManager` 或 `FileMutationQueue` 调度执行，结果格式化回灌模型。
4. **单事务结算与广播**：Turn 结束时调用 `turnStore.flushTurn()` 单事务落库；广播 `turn_end`、`agent_end`；触发 `InputQueue.drain()` 消费下一条排队输入；异步执行 Token 估算与按需压缩。

### 1.2 多会话并发模型

- `SessionRunnerManager`（`agentRunner.ts`，单例 `agentRunner`）持有活跃会话的 `AgentSessionRunner` 实例池，同一时刻多个会话可并行流式输出与调用工具。
- 实例键：有 `sessionId` 用 `sess:<sessionId>`，仅草稿用 `tab:<tabId>`，无参数回退 `default`。新会话首条消息落库后，runner 从 `tab:` 键重挂到 `sess:` 键（旧 tab 键保留映射）。
- 所有 `AgentEvent` 与 IPC 调用均携带可选 `sessionId` / `tabId`，renderer 据此将事件路由到对应 Tab 实例；无路由字段时回退当前活跃实例。

---

## 2. 模块拓扑结构

```text
src/main/agent/
├── core/                  # 状态机与底层循环引擎
│   ├── types.ts           #   AgentTool, StreamFn, Context, AgentState
│   ├── agent.ts           #   Agent 状态机 (prompt/continue/steer/abort/reset)
│   ├── agent-loop.ts      #   低层工具调用与事件分发循环
│   ├── turnContext.ts     #   Turn 级不可变环境切片
│   ├── timeReminder.ts    #   Turn 级周期动态时间感知 (<current_time>)
│   ├── event-stream.ts    #   流式事件流基础基类
│   ├── stream-fn.ts       #   StreamFn 契约
│   ├── validate.ts        #   工具参数统一前置校验
│   └── worldState.ts      #   会话级世界状态投影
├── stream/                # LLM 模型与流式适配
│   ├── aiSdkStreamFn.ts   #   Vercel AI SDK 适配器
│   ├── modelFactory.ts    #   多 Provider/Model 装配与缓存
│   ├── toModelMessages.ts #   消息与工具定义转换
│   └── idleWatchdog.ts    #   流式空闲看门狗 (默认 60s)
├── shell/                 # 统一进程与终端执行引擎
│   ├── unifiedExecManager.ts # UnifiedExecManager (生命周期/PID/标准输入)
│   ├── headTailBuffer.ts     # HeadTailBuffer 对称截断缓冲区 (1 MiB, 50/50)
│   └── persistentShell.ts    # 基于 node-pty 的持久化会话
├── subagent/              # 多 Agent 协作与特化代理池
│   ├── subagentPool.ts    #   SubagentPool (会话续接、隔离生命周期)
│   ├── reviewAgent.ts     #   专精代码审查子代理 (Rubric 评估体系)
│   ├── agentRoles.ts      #   内置角色目录与用户角色合并解析 (review/explorer/worker)
│   └── subagentRuntime.ts #   会话级子代理并发槽位治理 (超限快返)
├── guard/                 # 安全防护网与死循环守卫
│   ├── guardianEvaluator.ts   # Guardian 四维安全规则引擎
│   ├── commandSafetyGuard.ts  # 高危 Shell 命令语法树拆解与拦截
│   ├── repeatToolGuard.ts     # 工具重复调用死循环熔断 (3/5/7)
│   └── harnessFeedbackGuard.ts# 截断/Patch 失败的模型自愈反馈
├── permissions/           # 权限信任与多级审批体系
│   ├── permissionManager.ts  # 模式/沙箱/规则/会话白名单调度
│   └── rule.ts               # Tool(arg) 规则解析引擎
├── hooks/                 # 用户级生命周期钩子引擎 (配置/子进程/解析/派发，详见 hooks.md)
├── prompts/               # 动态提示词与自适应装配
│   ├── systemPromptManager.ts# 分层装配引擎 (Sections, Contexts, Variables, Interceptors)
│   ├── modelAdapters.ts      # 模型自适应规则 (Codex, Claude, Generic)
│   ├── promptTemplateLoader.ts # Slash 命令 Markdown 模板加载器
│   └── personalities/        # 人格提示词 (pragmatic / friendly)
├── memories/              # 分层记忆系统
│   └── memoryManager.ts   #   MEMORY.md 索引与 Topic Notes 管理
├── tools/                 # 内置工具全集 (清单详见 tools.md)
├── skills/                # SkillLoader 扫描与 read_skill 工具
├── mcp/                   # Stdio MCP 连接池与 JSON Schema→Zod 映射
├── lsp/                   # 语言服务器客户端与写后自动诊断
├── jobs/                  # 后台作业注册表 (JobRegistry)
├── spill/                 # 大文本落盘引用管理器 (SpillManager)
├── compaction/            # 历史工具输出内存修剪 (ContextPruner)
├── compaction.ts          # 结构化压缩与溢出自愈算法
├── contextCompactor.ts    # 压缩调度编排器
├── export/                # 会话导出器 (Markdown / JSONL / 单文件 HTML)
├── question/              # 模型提问的挂起-应答管理
├── instructionLoader.ts   # AGENTS.md 级联加载
├── titleGenerator.ts      # 会话标题生成
├── suggestedQuestionsGenerator.ts # 后续建议问题生成
├── assembly.ts            # 工具注册表装配与默认 cwd 解析
├── sessionRunner.ts       # AgentSessionRunner: 单会话运行器
├── agentRunner.ts         # SessionRunnerManager: 多会话管理器 (单例 agentRunner)
└── turnStore.ts           # 事务级会话落盘与状态投影
```

> `tools/visuals.ts`（render_svg / render_ascii / render_html）为保留文件但**不注册**，回归测试 `renderToolsRemovalRegression` 明确禁止其回到工具集。

---

## 3. 核心消息模型 (`src/shared/contracts/agent.ts`)

```typescript
type ContentBlock = TextContent | ThinkingContent | ToolCall | ImageContent
type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted"

interface UserMessage {
  role: "user"
  content: string | (TextContent | ImageContent)[]
  timestamp: number
  isSteer?: boolean          // 即时插话消息
  command?: UserMessageCommand // Prompt 模板 / Skill / Slash 命令来源
  files?: AttachedFileMeta[]
}

interface AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  provider: string
  model: string
  usage: Usage
  stopReason: StopReason
  errorMessage?: string
  timestamp: number
}

interface ToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  isError: boolean
  timestamp: number
  durationMs?: number           // 工具执行耗时 (ms)
  diff?: AgentDiff              // 文件写操作行级结构化 Diff
  subagent?: SubagentData       // 子代理运行完整快照
  lsp?: LspToolDetails          // LSP 诊断或跳转细节
}

// 非交互消息
type CompactionSummaryMessage = { role: "compactionSummary"; summary: string; tokensBefore: number; manual: boolean; model?: string; usage?: CompactionUsage; summaryTokens?: number; timestamp: number }
type UndoSummaryMessage       = { role: "undoSummary"; id?: string; undoPayload?: AgentUndoSummaryPayload; timestamp: number }
type TodoStateMessage         = { role: "todoState"; todos: TodoList; timestamp: number } // transformContext 专用，不落库
type ModelSwitchMessage       = { role: "modelSwitch"; provider: string; model: string; variant?: string; family: string; instructions?: string; isInitial?: boolean; timestamp: number }

type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | CompactionSummaryMessage
  | UndoSummaryMessage
  | TodoStateMessage
  | ModelSwitchMessage
```

---

## 4. AgentEvent 事件流体系

主进程通过唯一的 `agent:event` IPC 通道向下游 Renderer 广播强类型事件，所有事件均带可选 `sessionId` / `tabId` 路由字段：

| 分类 | 事件名称 | 负载说明 |
| :--- | :--- | :--- |
| **生命周期** | `agent_start` / `agent_end` | 会话轮次启动 / 终止，`agent_end` 携带完整 `messages` |
| **Turn** | `turn_start` / `turn_end` | 单轮起止，`turn_end` 携带最终消息与工具结果 |
| **消息增量** | `message_start` / `message_update` / `message_end` | 助手流式文本、思考块及 ToolCall 实时增量 |
| **工具执行** | `tool_execution_start` / `_update` / `_end` | 工具 ID、名称、参数、耗时 `durationMs` 及结果 |
| **模型** | `model_switch` | 会话内模型切换 / 初始模型条目 |
| **模式状态** | `collaboration_mode_changed` | 四态协作模式切换 |
| **会话标题** | `session_title` | AI 生成的会话标题更新 |
| **安全审批** | `permission_request` / `question_request` | 权限提升弹窗、多级审批选项或模型主动提问 |
| **队列与任务** | `queue_changed` / `todo_updated` | 输入排队长度/列表、`todowrite` 任务清单变动 |
| **MCP 状态** | `mcp_status_changed` | 已连接 MCP server 列表与工具数 |
| **后台作业** | `job_started` / `job_output_chunk` / `job_settled` | 后台 Bash 进程状态与输出流 |
| **治理与用量** | `compaction_start` / `compaction_summary` / `compaction_failed` / `context_usage` | 压缩生命周期、Token 统计与窗口容量 |

---

## 5. IPC 契约清单 (`src/shared/ipc/agentChannels.ts`)

| 分组 | Channel 名称 | 核心职责 |
| :--- | :--- | :--- |
| **对话流** | `send` / `continue` / `abort` / `compact` / `undoCompaction` | 会话发送、续写、打断及手动压缩 |
| **会话管理** | `listSessions` / `restoreSession` / `renameSession` / `deleteSession` / `deleteMessageTurn` / `forkSession` / `restore` | 会话 CRUD、分支切割、历史轮次删除 |
| **协作与工作区** | `setCollaborationMode` / `switchWorktree` / `switchProject` / `switchModel` | 模式切换、Worktree / 项目 / 模型切换 |
| **交互回传** | `permissionResponse` / `questionResponse` | 审批决策回传（Once/Session/Prefix/Deny）与提问答复 |
| **状态查询** | `getMcpStatus` / `getLspStatus` / `installLspServers` / `getContextUsage` / `getPromptAssembly` | 服务状态、用量与提示词装配快照审查 |
| **模板与技能** | `listPromptTemplates` / `listSkills` / `getSkillContent` / `suggestedQuestions` | Slash 模板、Skill 列表与建议问题 |
| **作业管理** | `listJobs` / `killJob` / `removeJob` / `clearSettledJobs` / `readJobOutput` | 后台长时进程管控 |
| **导出集成** | `exportSession` / `copySession` / `openFileAt` / `showItemInFolder` | 会话格式化导出与本地文件跳转 |
| **前端设计** | `compileTailwind` / `saveFrontDesign` / `openDesignDir` | Tailwind JIT 编译、设计三件套落盘与目录打开 |

---

## 6. 多标签页（Multi-Tab）体系

Renderer 侧 `agentTabStore` 管理多标签状态，`AgentTabBar` 横向标签栏位于 `RightSidebar` 顶部（视图切换按钮之间）：

1. **Tab 状态模型**：`{ id, sessionId: string | null, title?, turnCount?, draftBinding?, createdAt }`；草稿 Tab 的 `sessionId` 为 `null`，首条消息落库后回填。
2. **上限与保底**：最多 8 个 Tab（`MAX_TABS`），至少保留 1 个；关闭流式中的 Tab 先 `agentApi.abort()`。
3. **1:1 会话互斥**：一个 `sessionId` 全局只能被一个 Tab 绑定；历史面板打开已被占用的会话时切换到宿主 Tab，`createTab(initialSessionId)` 命中已有绑定则直接激活而非新建。
4. **保活渲染**：多 `AgentPage` 实例常驻 DOM，仅用 CSS `hidden` 切换显隐，保证后台流式、滚动位置与草稿不丢失。
5. **状态感知**：`streamingMap` 维护各 Tab 流式状态，标签项展示运行脉冲点与状态 Tooltip（标题、轮数、模型、项目）。
6. **纯内存**：Tab 列表不持久化（启动时清理旧版 localStorage key），每次启动生成一个默认草稿 Tab。
7. **输入联动**：`registerInputSetter` 注册各 Tab 输入框设值器，`insertPromptToActiveTab()` 支撑「点选微调 / 一键迭代」等跨组件回填。

---

## 7. Renderer 架构与 ExecutionFlow 体系

Renderer 采用 **Feature-First** 模块化设计（`src/renderer/src/features/agent/`）：

1. **输入与交互区 (`AgentInput`)**：Markdown 编辑、`@` 综合提及（文件 / Skill / 设计卡片）、`$` Skill 面板、`/` Slash 模板补全、多级 Esc 梯次打断、排队状态气泡。
2. **消息流渲染 (`AgentMessageList`)**：Block 级折叠聚合（普通工具组、文件 Diff 组、思考折叠、子代理链路），结构化卡片（`ProposedPlanCard` / `ReviewFindingsCard` / `FrontDesignCard`）。
3. **全景执行面板 (`AgentExecutionFlowList`)**：
   - 将底层消息流与 `PromptAssembly` 统一投影为标准执行步骤序列（`system` / `user` / `assistant` / `thinking` / `tool` / `subagent` / `compaction` / `undo` / `modelSwitch` / `error` / `proposedPlan` / `reviewFindings` / `frontDesign`）。
   - 专用渲染分发器：`FlowToolBash`（命令高亮、退出码、终端窗格）、`FlowToolFileOps`（行级 Diff 统计）、`FlowToolSearch`（搜索命中概览）。
   - 聚合 Telemetry 指标：单步耗时 `durationMs`、Token 明细与缓存命中状态。
4. **状态栏 (`AgentStatusBar`)**：协作模式按钮（四态循环）、权限状态、后台作业状态与 `AgentContextUsagePill` 容量指示。
5. **面板 (`panels/`)**：`ChatHistoryPanel` 会话历史、`AgentJobsMonitorView` 作业监控、`AgentSubagentPanel` 子代理时间轴。
