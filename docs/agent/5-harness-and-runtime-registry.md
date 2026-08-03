# 5. AgentHarness 与 Runtime Registry

## 5.1 目标

在 Agent Loop、ToolRegistry、SessionRepository 和 ResourceLoader 之上建立可独立测试的 `AgentHarness`，再由 `AgentRuntimeRegistry` 管理多个 session runtime。

## 5.2 文件归属

```text
src/main/agent/harness/agentHarness.ts
src/main/agent/harness/turnSnapshot.ts
src/main/agent/harness/operationLock.ts
src/main/agent/harness/extensionBus.ts
src/main/agent/runtimeRegistry.ts
src/main/agent/runtimeFactory.ts
src/main/agent/runtimeSnapshot.ts
```

## 5.3 Harness 配置与 snapshot

Harness config 是最新可读写配置：model、thinking level、all tools、active tools、resources、system prompt、stream options、queue modes。

每个 operation 创建不可变 `TurnSnapshot`：

```ts
interface TurnSnapshot {
  sessionId: string
  cwd: string
  messages: AgentMessage[]
  systemPrompt: string
  model: ModelDescriptor
  thinkingLevel: AgentThinkingLevel
  tools: AgentToolDefinition[]
  activeToolNames: string[]
  resources: AgentResources
  streamOptions: StreamOptions
  startedAt: number
}
```

运行中的 setter 只能影响下一次 snapshot，不能改变已经发出的 provider request。资源 provider、tool context provider、credentials provider 每次建 snapshot/request 按明确边界解析一次。

## 5.4 Public Harness API

当前实现的 public API：

- `prompt(text, images?)`、`continue()`；
- `skill(name, instructions?)`、`promptFromTemplate(name, args?)`；
- `steer`、`followUp`、`nextTurn`、`abort`、`waitForIdle`；
- `appendMessage`、`compact`、`navigateTree`；
- `get/setModel`、`get/setThinkingLevel`；
- `get/setTools`、`get/setActiveTools`；
- `get/setSteeringMode`、`get/setFollowUpMode`；
- `newSession`、`resume`、`fork`、`import`、`export`、`dispose`。

结构操作在 phase 非 idle 时同步拒绝并保持状态不变；队列操作在允许的安全点接受；每个 public mutation 在提交状态后再 await hook/listener。

## 5.5 生命周期

```text
idle
  -> turn
  -> compaction       (context overflow / manual compact)
  -> branch_summary   (tree navigation / fork summary)
  -> retry            (retryable provider failure)
  -> idle
```

每个 operation 具备 `operationId`，进入 phase 必须发生在第一次 await 前。正常结束、abort、hook failure、storage failure 都要清理 active controller、pending tool calls 和 phase。

save point 发生在 assistant message 与该 turn 的 tool result 全部完成之后：先追加 agent entries，再 flush pending writes，再通知 observer。hook/subscriber 失败不会回滚已提交的 entry，但 public operation 返回 `hook` 错误。

## 5.6 Runtime Registry

```ts
interface AgentRuntimeRegistry {
  create(input: CreateRuntimeInput): Promise<AgentRuntime>
  get(sessionId: string): AgentRuntime | undefined
  open(sessionId: string): Promise<AgentRuntime>
  list(): RuntimeSummary[]
  dispose(sessionId: string): Promise<void>
  disposeAll(): Promise<void>
}
```

Registry 规则：

1. key 是持久化 `sessionId`，不是 renderer window 或 React component。
2. 一个 session 同时只能有一个 Runtime owner；第二次 open 返回已有实例或明确 busy。
3. 不同 session 的 model stream、shell 和事件可以并行。
4. `dispose` 先 abort/waitForIdle，再解绑扩展、flush session writes、关闭资源。
5. renderer 重连只拿 snapshot，不新建 Runtime。

## 5.7 事件和快照

Runtime 持有单调 `sequence`。`getSnapshot(sessionId, afterSequence?)` 返回：

- transcript projection；
- phase、isStreaming、pending tools、queue counts、current model；
- last sequence、active leaf、session metadata；
- diagnostics、model fallback message、recoverability flag。

事件发送失败不能中断 Agent Loop；发送端保留最近一段事件或直接要求 renderer 重新拉 snapshot。持久化成功先于“已完成”事件。

## 5.8 验收

- prompt/new/resume/fork/import/dispose 的生命周期没有资源泄漏。
- 运行中 setModel/setTools 只影响下一 turn；当前 request 的 snapshot 可通过测试捕获。
- hook 在 prompt、tool、compaction、tree、session switch 位置可阻止或变换行为，错误策略稳定。
- 两个 session 并发运行时，事件、AbortController、cwd、model 和 SQLite entry 不串线。
- 应用退出会等待 active operations 的定义超时，超时后记录不可恢复诊断而不是假装成功。

## 5.9 当前不实施

- 不实现 durable harness 文档的 run/step/task 恢复、effect journal、lane/ref 以及 faulted-to-resume 状态机。
- 不实现跨进程共享同一 session 的多写 owner；先保证单 main process owner。
