# 1. 基础契约与边界

## 1.1 目标

先建立不会被具体 Provider、SQLite 查询或 React 组件反向污染的领域契约。此阶段只定义类型、错误、不变量、目录归属和扩展点，不实现模型调用。

## 1.2 文件归属

新增文件的目标位置：

```text
src/shared/agent.ts                 # DTO、消息、事件、错误码、配置快照
src/shared/ipc/agentChannels.ts     # agent:* channel 常量
src/main/agent/types.ts              # main-only 接口：ModelRuntime、Tool、Repository
src/main/agent/errors.ts             # main-only Error 类与序列化
src/renderer/src/features/agent/types.ts
                                     # 仅 renderer 视图类型，不重复定义 shared DTO
```

`src/shared` 禁止导入 React、Electron、AI SDK、Node 或数据库驱动。

## 1.3 核心数据结构

### Message

不要继续使用当前的字符串 `AgentMessage`。定义可版本化的内容块：

```ts
type AgentContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "image"; mediaType: string; data: string }
  | { type: "tool_call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; output: AgentToolOutput; isError: boolean }

interface AgentMessage {
  id: string
  role: "system" | "user" | "assistant" | "tool"
  content: AgentContentBlock[]
  model?: { provider: string; id: string }
  usage?: AgentUsage
  stopReason?: AgentStopReason
  error?: AgentErrorSummary
  timestamp: number
}
```

`unknown` 只允许在 main 内部使用；写入 SQLite 或跨 IPC 前必须通过 schema 校验并序列化。

### Event

统一事件必须带 `sessionId`、`runtimeId`、`sequence`、`runId` 和 `timestamp`：

```ts
type AgentEvent =
  | { type: "session_snapshot"; snapshot: AgentSnapshot }
  | { type: "agent_start" | "agent_end"; messages: AgentMessage[] }
  | { type: "message_start" | "message_end"; message: AgentMessage }
  | { type: "message_update"; messageId: string; delta: AgentContentBlock[] }
  | { type: "turn_start" | "turn_end"; turnId: string; error?: AgentErrorSummary }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_execution_update"; toolCallId: string; output: AgentToolOutput }
  | { type: "tool_execution_end"; toolCallId: string; result: AgentToolOutput; isError: boolean }
  | { type: "queue_update"; steering: number; followUp: number }
  | { type: "phase_change"; phase: AgentPhase }
  | { type: "error"; error: AgentErrorSummary }
```

事件必须可重复消费。renderer reducer 收到相同 sequence 时忽略，收到 gap 时请求 snapshot，不自行猜测缺失事件。

### Command

所有可变操作通过带 `clientRequestId` 的命令进入 main：

```ts
type AgentCommand =
  | { kind: "prompt"; text: string; images?: AgentImage[] }
  | { kind: "continue" | "abort" | "reset" }
  | { kind: "steer" | "follow_up" | "next_turn"; text: string }
  | { kind: "compact"; instructions?: string }
  | { kind: "navigate_tree"; entryId: string; position: "before" | "at" }
  | { kind: "set_model"; provider: string; model: string }
  | { kind: "set_thinking_level"; level: AgentThinkingLevel }
  | { kind: "set_active_tools"; names: string[] }
```

命令结果只返回 `{ requestId, accepted, error? }`；执行进度和最终状态通过 `AgentEvent` 推送。

## 1.4 状态与错误

`AgentPhase` 初始值为 `idle`，允许值为 `turn | compaction | branch_summary | retry`。结构操作在非 idle 时返回 `busy`；`steer`、`follow_up`、`abort` 和配置 setter 在文档规定的安全点可执行。

错误码至少包括：`busy`、`aborted`、`provider`、`auth`、`context_overflow`、`tool`、`tool_timeout`、`session`、`validation`、`extension`、`storage`、`faulted`。错误通过 `AgentErrorSummary` 跨 IPC，原始 Error 只留在 main 日志。

## 1.5 必须先写的契约测试

1. 所有 DTO 通过 runtime schema 时接受，缺少 discriminant、超长字符串、非法枚举和循环对象时拒绝。
2. Event sequence 严格递增；重复事件 reducer 幂等；gap 能触发 snapshot 请求。
3. 同一 session 的结构命令不能并发进入 Harness；不同 session 的命令不互相覆盖。
4. `AgentMessage` 的每种 content block 都能 JSON round-trip；敏感字段不出现在默认 error/telemetry payload。
5. shared channel 常量只定义一次，preload、main 和测试都从同一模块导入。

## 1.6 当前不实施

- 不实现 pi durable harness 的 effects/generator 类型，也不把 run/step/task 记录定义为稳定 DTO。
- 不把 `Result<T, E>` 全面强行引入 renderer；main 的内部预期错误可用 Result，公共 IPC 仍统一错误 DTO。
- 不在 shared 中放 Provider SDK 的 `LanguageModelV*` 类型、Electron `IpcMainEvent` 或 Node `AbortSignal`。
