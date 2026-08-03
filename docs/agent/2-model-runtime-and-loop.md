# 2. Model Runtime 与 Agent Loop

## 2.1 目标

把当前设置中的 Provider 配置转换为 main-only `ModelRuntime`，再实现 pi `Agent` 的流式循环语义：一次用户 prompt 可以产生多个 provider turn，期间执行多个 tool call，直到 stop、abort 或错误。

## 2.2 依赖

依赖 `1-contracts-and-boundaries.md`。不依赖 renderer；可用内存 fake provider 和 fake tool 先完成 main 测试。

## 2.3 ModelRuntime

目标文件：

```text
src/main/agent/model-runtime.ts
src/main/agent/model-registry.ts
src/main/agent/provider-adapters/aiSdkAdapter.ts
src/main/agent/provider-adapters/openai.ts
src/main/agent/provider-adapters/anthropic.ts
src/main/agent/provider-adapters/google.ts
src/main/agent/provider-adapters/openaiCompatible.ts
```

`ModelRuntime` 只暴露 LX 自有类型：

```ts
interface ModelRuntime {
  stream(input: ModelRequest, signal: AbortSignal): Promise<ModelStream>
  listModels(): Promise<ModelDescriptor[]>
  resolveCredentials(model: ModelDescriptor): Promise<ResolvedCredentials>
}
```

适配器内部使用当前项目已有的 `ai`、`@ai-sdk/*` 和 `@ai-sdk/openai-compatible`。AI SDK 的 stream chunk、错误对象和 provider message 不得穿过 `main/agent` 之外。

### 2.3.1 必须保留的模型语义

- provider/model/thinking level/transport/headers/metadata；
- text、thinking、tool call、usage、stop reason 的增量和最终值；
- context window、max output、输入/输出 modality 和成本字段；
- API key/base URL 的设置读取、环境变量覆盖和错误脱敏；
- retryable provider error、auth error、context overflow、abort 的分类；
- 每次 provider request 使用当前 turn snapshot，不被运行中 setter 改写。

## 2.4 Agent Loop

目标文件：

```text
src/main/agent/agent-loop.ts
src/main/agent/agent.ts
src/main/agent/message-normalizer.ts
src/main/agent/queue.ts
```

循环的单次 turn：

1. 从 snapshot 取 system prompt、messages、active tools、model 和 stream options。
2. 发起 `ModelRuntime.stream`，把增量转换为 `message_update`。
3. provider 返回 assistant message 后，按 tool call 顺序或配置并行执行工具。
4. 每个工具结果写入上下文，发出 tool start/update/end。
5. 若有 tool result，继续下一次 provider turn；否则发出 turn_end 和 agent_end。
6. 轮询 steering queue；Agent 正常结束后再轮询 follow-up queue。
7. 所有 listener、持久化 save point 和事件发送完成后才进入 idle。

`prompt`、`continue`、`abort`、`waitForIdle` 的行为对齐 pi `Agent`：运行中再次 prompt 返回 `busy`，steer/follow-up 不丢失，abort 清空队列并等待当前工具/请求 settlement。

## 2.5 队列语义

维护两个独立队列：

- `steeringQueue`：注入当前 agent run 的下一安全 turn；
- `followUpQueue`：当前 assistant 正常结束后才成为下一个 user turn。

队列 mode 为 `one-at-a-time` 或 `all`，是 live config，不进入当前 provider request snapshot。`clearAllQueues`、队列长度和队列事件必须有测试。

## 2.6 流式与取消

- 每个 run 创建独立 `AbortController`；main command `abort` 只取消对应 `sessionId` 的 controller。
- provider stream、tool process、extension hook 都必须接收同一个 signal。
- abort 产生可持久化的 assistant failure message，`stopReason = aborted`，不能静默丢掉半截 turn。
- provider stream 的 in-band error 与 Promise rejection 都归一为 `AgentErrorSummary`。
- renderer 只根据事件显示 streaming；不在浏览器定时器里模拟 token。

## 2.7 失败与重试

实现 pi 当前已有的 retry 行为：

1. 仅对明确的 retryable provider error 重试；auth、validation、tool policy error 不自动重试。
2. 指数退避带最大延迟，abort 立即打断等待。
3. context overflow 进入 compaction 阶段，而不是普通 provider retry。
4. 每次尝试发出 generation start/end/error 事件，并记录 attempt、delay 和 stop reason。

## 2.8 验收

- fake provider 可生成纯文本、thinking、单工具、多工具、provider error 和 overflow 六种流。
- 单工具循环的事件顺序与 pi `agent-loop.test.ts` 语义一致。
- 工具执行并行时，消息上下文仍按 tool call id 稳定归并；串行模式按调用顺序执行。
- abort 在 provider stream、shell、文件写入和 hook 阶段都能最终回到 idle。
- 同一个 Runtime 不能出现两个 active run；跨 Runtime 可并行。

## 2.9 当前不实施

- 不实现 pi durable v2 的 generator/effect scheduler。
- 不把 provider 请求 payload 原文写入 session 或默认 telemetry。
- 不实现 CLI print/json 的同步输出协议。
