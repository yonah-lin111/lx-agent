# 8. Compaction、Branch Summary、Retry 与 Observability

## 8.1 目标

实现 coding-agent 已有的 context compaction、overflow recovery、branch summary 和 provider retry，并加入可重放的运行事件与默认脱敏遥测。durable harness v2 的完整 crash recovery 只登记不实现。

## 8.2 Compaction

目标文件：

```text
src/main/agent/compaction/compaction.ts
src/main/agent/compaction/tokenEstimator.ts
src/main/agent/compaction/branchSummary.ts
src/main/agent/compaction/summaryPrompt.ts
```

触发条件：

- 当前 context token 接近 model context window 的 configured reserve；
- provider 返回可识别 context overflow；
- 用户显式执行 compact；
- tree navigation 需要压缩旧分支。

流程：

1. 以当前 active branch 构建 `CompactionPreparation`，确定 first kept entry 和保留 token。
2. 发出 `session_before_compact`，扩展可取消或提供自定义 summary。
3. 使用当前 model 或 compaction model 生成 summary；必要时 split turn。
4. 追加 compaction entry，更新 context projector 和 token totals。
5. 如由 overflow 触发，重试被中断的 prompt；如是 manual compact，不自动重放用户 prompt。
6. 发出 compaction event，回到原 phase 或 retry phase。

summary 必须记录 tokensBefore、tokensAfter、firstKeptEntryId、reason、willRetry、usage 和 extension source。summary 文本属于会话内容，默认不进入 telemetry。

## 8.3 Branch Summary

tree navigation/fork 前，对被折叠分支生成 branch summary：目标、约束、进度、关键决策、下一步、阻塞、关键上下文和累计文件变更。累计文件追踪基于 session entries，不扫描全盘猜测。

## 8.4 Retry 策略

错误分类：

- retryable provider/network：指数退避、最大次数、可 abort；
- context overflow：转 compaction，不直接重试；
- auth/invalid request/tool validation：立即失败；
- extension hook：按 hook policy，不能无条件重试副作用；
- storage failure：停止进一步写入并进入不可恢复诊断。

每次 retry 写入 attempt、reason、delay、aborted、final stop reason；不能重复提交同一个 `clientRequestId` 的 user message。

## 8.5 Observability

目标文件：

```text
src/main/agent/observability/agentTelemetry.ts
src/main/agent/observability/traceContext.ts
src/main/agent/observability/redaction.ts
src/shared/agentDiagnostics.ts
```

span 层级：

```text
agent.run
  ├─ agent.step
  │   ├─ agent.generation
  │   │   └─ provider.request
  │   └─ agent.tool
  ├─ agent.checkpoint
  ├─ agent.hook
  └─ session.append
```

默认 payload 只包含 provider、model、sessionId、runId、toolName、status、stop reason、usage、cost、duration、retry count。以下默认禁止：prompt、completion、tool args/results、shell output、文件内容、API key、headers、provider body。

telemetry subscriber 是 passive：subscriber 异常被隔离，不能影响 Agent；hook 是 control plane，异常可影响 operation，二者不能共用错误处理。

## 8.6 事件日志与 renderer 诊断

Runtime 保留有限诊断环形缓冲，SQLite 只持久化必要的 run summary 和错误，不默认存完整 token stream。renderer 可请求 session diagnostics，但拿不到 secrets 和原始 provider payload。

## 8.7 验收

- token threshold、overflow、manual compact、branch summary、extension custom summary 各有测试。
- compaction 失败可回到稳定 phase，不丢当前 session entry；overflow retry 不重复 user entry。
- retry 对 abort、auth、validation、network 的行为可区分。
- telemetry payload 通过自动脱敏测试，subscriber 异常不影响 prompt；hook 异常按约定影响 prompt。
- 可用 runId/sequence 从 UI 错误定位到 main 诊断，但不能还原敏感内容。

## 8.8 当前不实施

- 不实现 durable effects/generator、journal replay、run resume、lane recovery 和跨进程故障接管。
- 不接入 OTel、Sentry 等厂商；只定义 vendor-neutral subscriber adapter。
