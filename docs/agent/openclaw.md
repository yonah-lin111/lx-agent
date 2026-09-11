# OpenClaw 接入

LX Agent 通过 WebSocket 接入 OpenClaw 生态：多实例 Gateway 管理、独立 OpenClaw 页面、单条消息多 Agent 扇出与跨页任务委派。架构总览见 [architecture.md](./architecture.md)。

## 1. 目标与边界

1. **多实例与 Agent 管理**：设置页录入多个 OpenClaw Gateway 实例（地址、认证方式、启用状态），一键探测并拉取其下注册的 Agents。
2. **独立页面**：办公区（实例）与员工（Agent）切换、流式对话收敛到专属 `/openclaw` 页面，不占用底边栏。
3. **一条会话内多目标扇出**：单条消息可 `@` 或选中多个 Agent 同时下发；各 Agent 上下文相互隔离，仅在视觉上合流为一条消息流。
4. **跨页任务委派**：主 Agent 输入框中的 `@claw:<instance>/<agent>` 可跳转到 OpenClaw 页面并派发任务。

## 2. 进程架构

```
┌──────────────────────────────────────────────────────────────┐
│                        Renderer Process                      │
│  ┌───────────────────────┐     ┌───────────────────────────┐ │
│  │ LeftSideBar           │     │ OpenClawPage              │ │
│  │ (办公区 + 员工名册)   │     │ ├ 消息合流时间线           │ │
│  │                       │     │ └ 共享输入框 + 命令/提及面板 │ │
│  └──────────┬────────────┘     └──────────┬────────────────┘ │
│             │                             │                  │
│             ▼                             ▼                  │
│     openclawOfficeStore           useOpenClawChatStore       │
│     (办公区/选中态/派发)           (会话快照投影缓存)          │
└───────────────────────────────┬──────────────────────────────┘
                                │ IPC
┌───────────────────────────────▼──────────────────────────────┐
│ Preload: window.api.openclaw / window.api.settings           │
└───────────────────────────────┬──────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────┐
│ Main: OpenClawClientManager (WS 连接池 & RPC & 流式事件)      │
│       settingsService (~/.lx/config.json 的 openclaw 节点)    │
└───────────────────────────────┬──────────────────────────────┘
                                │ ws://<gateway>:18789
                                ▼
                       OpenClaw Gateway
```

- **Main**：`services/openclaw/openclawClientManager.ts` 按 `instanceId` 维护 WebSocket 长连接、心跳重连、RPC 调用与流式事件解析；`openclawDeviceAuth.ts` 处理设备配对；`settingsService` 负责 `openclaw` 配置读写。Token 仅在主进程用于握手，不下发渲染进程长期持有。
- **Preload**：`@shared/ipc/openclawChannels.ts` 定义通道契约，`window.api.openclaw` 暴露类型安全接口。
- **Renderer**：feature-first 组织，`features/openclaw` 承载状态与视图，`pages/openclaw` 承载路由页面与专属左栏；契约类型在 `@shared/contracts/openclaw.ts`。

## 3. 页面与路由

| 位置 | 内容 |
|---|---|
| `lib/pageRoutes.ts` | `openclaw: "/openclaw"` |
| `lib/navigationItems.ts` | 左栏底部导航新增 OpenClaw 项（`Bot` 图标） |
| `routes/PageRouter.tsx` | 注册 `OpenClawPage` |
| `App.tsx` | 依据 `pathname` 渲染 `OpenClawLeftSideBar` |
| `pages/openclaw/` | 页面与专属左栏 |

底边栏 `BottomSideBar` 仅保留 `"terminal" | "jobs"` 双视图；终端与长任务监控保持 DOM 保活行为。

## 4. 会话模型与数据流

### 4.1 一个办公区 = 一个实例 = 一条对话流

- 「办公区」即一个 OpenClaw 实例；「员工」即该实例下的 Agent。
- 底层会话键为 `instanceId + agentId`（`openClawSessionKey`），**各 Agent 上下文天然隔离**。
- 页面把当前实例下所有员工的会话**按时间戳合并为单一时间线**（`mergeOfficeTimeline`），仅做视觉合流，不共享任何模型上下文。

### 4.2 多目标扇出

`resolveClawDispatchTargets(text, officeAgentIds, selectedAgentIds)`：

1. 文本存在 `@claw:` 提及 → 以提及目标为准（**仅保留当前办公区内的 Agent**）；
2. 否则回退到左栏名册中选中的员工集合；
3. 目标去重并保持顺序，正文剥离全部提及。

发送时对每个目标分别调用 `sendMessage(instanceId, agentId, body)`，即 N 条独立会话并行执行。

### 4.3 员工状态

`resolveOfficeAgentStatus(snapshot)`（`agentStatus.ts`）把会话快照映射为可视状态：

| 状态 | 判定 |
|---|---|
| `working` | `isStreaming` |
| `idle` | `connectionStatus === "connected"` |
| `connecting` | `connectionStatus === "connecting"` |
| `blocked` | `connectionStatus === "pairing-required"` |
| `error` | `connectionStatus === "error"` |
| `offline` | 无快照或 `disconnected` |

进入办公区时并发 `connect(instanceId)` 并为该实例下**所有 Agent** `loadSession`，保证名册反映完整状态；状态由左栏名册（状态灯 + 文案）承载。

### 4.4 渲染进程状态划分

| Store | 职责 | 持久化 |
|---|---|---|
| `useOpenClawChatStore`（`openclawChatStore.ts`） | 主进程会话快照的投影缓存（消息、连接状态、流式标记） | 否 |
| `openclawOfficeStore.ts` | `selectedInstanceId`、`selectedAgentIds`、`pendingDispatch` | 否（仅内存） |

`pendingDispatch` 用于跨页委派：主输入框写入后跳转，页面挂载时消费并执行。

## 5. 输入框与命令

### 5.1 复用策略

`OpenClawInput` 复用 Agent 输入框的既有能力，避免重复实现：

- 编辑器主题：`agentEditorTheme`、`agentHighlightStyle`、`markdownMarkerHighlight`；
- 面板组件：`AgentInputCommandPanel`（命令）、`AgentInputFilePanel`（提及）；
- 纯函数：`getMentionQuery`、`isFuzzyMatch`、`getAgentPanelPosition`。

仅实现 OpenClaw 需要的三种面板：`/` 命令、当前办公区内的 `@claw` 提及、`/office`・`/agent` 选择面板；本地会话专属面板（model / worktree / project / session / skill / design / 文件提及）不接入。

### 5.2 内置命令

| 命令 | 行为 |
|---|---|
| `/clear` | 清空当前办公区全部会话消息 |
| `/new` | 为当前办公区重置会话（换 `sessionKey`） |
| `/stop` | 中止当前办公区内所有流式任务 |
| `/agent` | 打开员工选择面板（可连续多选） |
| `/office` | 打开办公区切换面板 |

按键：`↑/↓` 移动、`Enter` 选择、`Esc` 关闭/中止流式；无面板时 `Enter` 发送、`Shift+Enter` 换行。命令集刻意保持最小，后续按需扩展（如 `/export`）。

## 6. 跨页任务委派

主 Agent 输入框发送 `@claw:<instanceId>/<agentId> <任务>` 时：

1. 剥离提及得到任务正文（正文为空则提示补充任务）；
2. 清空主输入框与附件，主对话**不留痕**；
3. `openclawOfficeStore.requestDispatch({ instanceId, agentId, task })`；
4. `navigateTo(PAGE_ROUTES.openclaw)` 跳转（`lib/navigate.ts` 改写 `location.hash`，避免 feature hook 依赖 Router 上下文）；
5. 页面消费 `pendingDispatch`：落位办公区/员工 → `connect` → `sendMessage`。

## 7. 安全与错误处理

- **Token 保护**：仅主进程用于握手，不进入渲染进程长期存储。
- **连接容错**：断线显示「未连接 / 连接中」，支持手动重连；配对待审批时展示审批指引与 `requestId`。
- **国际化与主题**：全部文案经 `useTranslation` 输出（中/英），样式使用项目主题 Token 与 `bg-white/[0.0x]`、`border-white/8` 等约定，禁止硬编码中文字符串与原生 `title` 属性。

## 8. 测试与已知限制

- **测试覆盖**：纯逻辑单测——`agentStatus`（状态映射）、`clawMention`（提及解析/删除范围/扇出目标）、`mergeOfficeTimeline`（时间线合并）、`openclawCommands`（命令匹配）、`openclawOfficeStore`（办公区/员工选中与派发）；组件渲染测试——`OpenClawConversationView`（多 Agent 交错消息流）、`OpenClawLeftSideBar`（办公区/名册/选中交互）。
- **已知限制**：
  - 真实 Gateway 的连接、流式与重连行为需在 Electron 真机环境人工验证；
  - 员工数量很大时名册仅靠滚动承载，暂未虚拟化或分组；
  - 命令集仅 5 个基础命令。

> 变更记录：早期「底边栏聊天面板」与基于 PixiJS 的像素办公室视图均已移除（`pixi.js` 依赖、`viewMode` 与 `/mode` 命令一并删除）；办公区/员工状态统一由左栏名册承载，强调色取色规则迁至 `features/openclaw/agentAccent.ts`。
