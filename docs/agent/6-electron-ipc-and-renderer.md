# 6. Electron IPC 与 AgentPage

## 6.1 目标

把 main 的 Runtime 能力安全地暴露给 renderer，并将 `AgentPage.tsx` 从 Mock 对话容器改成真实 Agent feature 的组合入口。Renderer 只处理 snapshot、事件 reducer、输入和展示状态。

## 6.2 IPC 契约

新增：

```text
src/shared/ipc/agentChannels.ts
src/shared/agent.ts
src/preload/api/agentApi.ts
src/main/ipc/agentHandlers.ts
```

建议 channel：

```ts
const AGENT_CHANNELS = {
  listSessions: "agent:sessions:list",
  createSession: "agent:sessions:create",
  openSession: "agent:sessions:open",
  forkSession: "agent:sessions:fork",
  deleteSession: "agent:sessions:delete",
  exportSession: "agent:sessions:export",
  importSession: "agent:sessions:import",
  getSnapshot: "agent:runtime:snapshot",
  command: "agent:runtime:command",
  subscribe: "agent:runtime:subscribe",
  event: "agent:runtime:event",
}
```

不为每个 AgentEvent 再创建 channel。command 是经过 schema 校验的 discriminated union；event 是单一 push channel，payload 带 `sessionId` 和 `sequence`。

## 6.3 preload

在 `src/preload/api/agentApi.ts` 组装最小白名单：

- `sessions.list/create/open/fork/delete/import/export`；
- `runtime.getSnapshot`；
- `runtime.command`；
- `runtime.onEvent(sessionId, listener)` 返回 unsubscribe。

`src/preload/index.ts` 只合并 `agentApi`，不放业务逻辑，不创建 Runtime，不保存 renderer 状态。listener 必须过滤 sessionId，并在 BrowserWindow 销毁时自动解绑。

## 6.4 main handler

`src/main/ipc/agentHandlers.ts` 只做三件事：

1. 运行时校验参数、校验 caller/session 归属和 cwd；
2. 调用 AgentRuntimeRegistry 或 SessionRepository；
3. 把 main error 映射成稳定的 `AgentErrorSummary`。

main handler 不拼 prompt、不处理 AI SDK stream、不执行工具。所有业务规则进入 `main/agent`。

## 6.5 Renderer feature 结构

目标结构：

```text
src/renderer/src/features/agent/
  AgentPage.tsx
  index.ts
  types.ts
  api/agentApi.ts
  hooks/useAgentSession.ts
  hooks/useAgentSessionEvents.ts
  hooks/useAgentSessionCommands.ts
  hooks/useAgentSessionSnapshot.ts
  components/AgentMessageList.tsx
  components/AgentMessageItem.tsx
  components/AgentToolCall.tsx
  components/AgentRunStatus.tsx
  components/AgentCommandPalette.tsx
  components/AgentHistoryPanel.tsx
```

`AgentPage.tsx` 只组合 hooks 与视图。不得在组件中调用 `window.api`、保存 session、解析 tool output 或模拟 streaming。

## 6.6 状态投影

`useAgentSession` 的状态源是：初次 `getSnapshot` + `onEvent` reducer。reducer 规则：

- `message_start` 创建 message；`message_update` 按 messageId 合并 delta；`message_end` 固化 message；
- tool start/update/end 更新 tool card，不把 tool output 当普通 assistant 字符串；
- phase/error/queue/runtime diagnostics 更新顶部状态；
- sequence 重复丢弃，gap 暂停局部更新并重新拉 snapshot；
- session switch 先 unsubscribe、清理本地 reducer，再订阅新 session；
- 页面卸载不保存数据，main 已在 save point 持久化。

## 6.7 UI 语义映射

| pi TUI 能力 | Electron 映射 |
| --- | --- |
| `/new`、`/resume`、`/fork`、`/tree` | 命令面板和历史/树视图 |
| `/compact` | 命令面板 + compaction 状态条 |
| thinking/model cycle | 模型选择器和 thinking level 控件 |
| tool execution update | 可折叠 tool card、stdout 增量区域 |
| status/widget/notify | `AgentRunStatus`、Toast、feature slot |
| `ctx.ui.confirm/select/input` | 受控 modal/dialog 服务 |
| custom TUI component | schema 驱动的 React extension slot，不加载 TUI runtime |
| keybinding | 应用 command registry，不在 AgentPage 写全局 keydown |

遵循现有黑色主题、6px 圆角、lucide 图标和稳定布局约束。动态 tool output 不能改变输入区和页面主布局高度。

## 6.8 与现有组件的迁移

- `AgentInput` 保留输入、提交、停止，但动作改调用 `command({ kind: ... })`。
- `AgentMessageItem` 改为按 content block 渲染 text/thinking/tool/error；编辑消息必须创建新的 user entry 或显式 branch 操作，不能直接篡改历史。
- `ChatHistoryPanel` 改为调用持久化 session summary，不再 import `chatHistoryStore`。
- `RightSideBar` 从 feature 的公开 `index.ts` 导入 `AgentPage` 与 history view，不深层导入 hooks；取消 `chatKey` 重挂载。
- 删除 Mock constants 和 `useAgentChat`，迁移期间可用 feature flag，但不能默认静默 fallback。

## 6.9 验收

- renderer bundle 无 Node/Electron/AI SDK/tool executor import。
- invoke 与 push event 的参数、返回值、错误、unsubscribe 都有 preload 契约测试。
- renderer 重载、窗口重建或事件 gap 后能恢复 snapshot，不产生重复消息。
- 新建、恢复、fork、abort、compact、tree navigation 都不依赖组件卸载时机。
- 可访问名称、键盘提交/停止、错误显示和流式中布局稳定。

## 6.10 当前不实施

- 不实现 pi 的终端 raw input、ANSI、TUI component tree、terminal theme sync。
- 不新增 CLI/RPC/client/server transport；IPC 是唯一宿主适配层。
