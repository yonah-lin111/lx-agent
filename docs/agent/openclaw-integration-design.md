# OpenClaw 接入架构设计文档 (Design)

## 1. 目标与背景
本项目拟在 `lx-agent` 中接入 OpenClaw 生态，实现：
1. **多 OpenClaw 实例与 Agent 管理**：在设置页（Settings）支持录入多个 OpenClaw Gateway 实例（地址、凭证与启用状态），维护并支持一键拉取探测每个实例下注册的 Agents。
2. **底边栏专属常驻聊天面板**：在 `BottomSideBar`（底边栏）中与现有的 Terminal、Jobs 并列，新增 OpenClaw 聊天视窗（DOM 保活），支持无缝切换实例与 Agent 进行流式对话。
3. **定向任务分派与 @ Mention 机制**：在主输入框和底边栏聊天框支持 `@claw:<instanceId>/<agentId>` 快速指定目标 Agent；主编辑区触发时自动唤起底边栏并转交任务执行。

---

## 2. 核心架构与进程边界

严格遵循 Electron 三进程职责分工与 feature-first 结构：

```
┌────────────────────────────────────────────────────────┐
│                   Renderer Process                     │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │ Settings Page          │  │ BottomSideBar        │  │
│  │ (OpenClawSettings Tab) │  │ (OpenClawChatView)   │  │
│  └───────────┬────────────┘  └──────────┬───────────┘  │
│              │                          │              │
│              ▼                          ▼              │
│        settingsApi                openclawApi          │
└───────────────────────┬─────────────────┬──────────────┘
                        │ IPC             │ IPC
┌───────────────────────▼─────────────────▼──────────────┐
│                    Preload Layer                       │
│  window.api.settings / window.api.openclaw             │
└───────────────────────┬─────────────────┬──────────────┘
                        │                 │
┌───────────────────────▼─────────────────▼──────────────┐
│                    Main Process                        │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │ settingsService       │   │ OpenClawClientManager│  │
│  │ (~/.lx/config.json)   │   │ (WS 连接池 & RPC)    │  │
│  └───────────────────────┘   └──────────┬───────────┘  │
└─────────────────────────────────────────┼──────────────┘
                                          │ ws://<gateway>:18789
                                          ▼
                                ┌───────────────────┐
                                │ OpenClaw Gateway  │
                                └───────────────────┘
```

1. **Main Process（主进程）**：
   - 托管 `OpenClawClientManager` 服务，按 `instanceId` 管理与各个 Gateway 的 WebSocket 长连接、心跳重连、RPC 方法调用（`agent`、`sessions_list`、`sessions_history` 等）和流式事件解析。
   - 在 `settingsService` 维护 `openclaw` 配置节点的读取与原子写入（`~/.lx/config.json`）。
   - 通过专门的 `openclawHandlers.ts` 暴露 IPC 接口，不将敏感的 Token 裸露在渲染进程长期存储中。

2. **Preload Layer（预加载桥接）**：
   - 在 `@shared/ipc/openclawChannels.ts` 定义明确的通道契约。
   - `preload/index.ts` 暴露类型安全的 `window.api.openclaw` API。

3. **Renderer Process（渲染进程）**：
   - **设置模块**：在 `features/settings/components/OpenClawSettings.tsx` 中增加多实例与 Agent 配置，接入 `useSettingsDraftStore`、`SETTINGS_SECTIONS`，支持重置、脏检查与保存。
   - **底边栏面板**：在 `features/openclaw/components/OpenClawChatView.tsx` 中呈现聊天室，与 `GhosttyTerminalView`、`AgentJobsMonitorView` 并列挂载，由 `useBottomSideBarStore` 管理 `viewMode: "terminal" | "jobs" | "openclaw"`。
   - **@ Mention 集成**：扩展 `AgentMarkdownInput` 的提及解析器，支持 `@claw:<instanceId>/<agentId>`，支持下拉补全与标签化高亮。

---

## 3. 数据模型设计 (Shared Contracts)

### 3.1 实体类型 (`src/shared/contracts/openclaw.ts` 或 `src/shared/settings.ts`)

```typescript
/** OpenClaw 下属 Agent 信息 */
export interface OpenClawAgentItem {
  id: string
  name: string
  description?: string
  workspace?: string
  isDefault?: boolean
}

/** OpenClaw 实例配置 */
export interface OpenClawInstanceConfig {
  id: string
  name: string
  gatewayUrl: string // 例如 ws://127.0.0.1:18789 或 http://127.0.0.1:18789
  token?: string
  enabled: boolean
  agents: OpenClawAgentItem[]
}

/** 全局 OpenClaw 配置 */
export interface OpenClawSettings {
  instances: Record<string, OpenClawInstanceConfig>
  defaultInstanceId?: string
  defaultAgentId?: string
}

/** 默认配置常量 */
export const DEFAULT_OPENCLAW_SETTINGS: OpenClawSettings = {
  instances: {},
  defaultInstanceId: undefined,
  defaultAgentId: undefined,
}
```

### 3.2 聊天消息与会话状态 (`src/shared/contracts/openclawChat.ts`)

```typescript
export interface OpenClawChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  agentId?: string
  status?: "pending" | "streaming" | "completed" | "error"
  error?: string
}

export interface OpenClawSessionState {
  instanceId: string
  agentId: string
  sessionKey: string
  messages: OpenClawChatMessage[]
  isConnected: boolean
  isStreaming: boolean
}
```

---

## 4. 详细流程与交互设计

### 4.1 设置页配置流程
1. 用户进入 `Settings -> OpenClaw` 分区。
2. 左侧为已配置的 OpenClaw 实例列表（支持添加、重命名、启用/禁用、删除）。
3. 右侧配置实例详情：
   - 实例名称、Gateway URL（默认 `ws://127.0.0.1:18789`）、Token / API 密钥。
   - 下属 Agents 列表展示：支持手动新增/编辑 Agent 条目。
   - “测试连接并拉取 Agents (Fetch Agents)”按钮：主进程向目标 Gateway 发送状态探测请求，自动填充或合并 `agents` 列表。
4. 顶部操作栏保存：联动全局 `SettingsActionBar` 触发保存，写入 `~/.lx/config.json`，并触发 `notifySettingsChanged("openclaw")` 广播。

### 4.2 底边栏（BottomSideBar）三视图布局
1. **展开态三视图切换**：
   - 顶部操作区三个图标：终端 (TerminalIcon)、长任务监控 (Activity)、OpenClaw (BotIcon / NetworkIcon)。
   - 激活模式：`useBottomSideBarStore.viewMode` 扩充为 `"terminal" | "jobs" | "openclaw"`。
   - 各组件采用 `hidden / flex` 保持 DOM 常驻，切出不会销毁未完结的对话流或终端进程。
2. **折叠态紧凑栏**：
   - 增加 OpenClaw 快速唤起图标。若当前有消息正在流式传输或连接异常，展示状态小徽标。
3. **OpenClawChatView 视图结构**：
   - 顶部栏：实例下拉切换器 (`LxSelect`)、Agent 下拉切换器 (`LxSelect`)、连接状态指示灯、清屏/新会话按钮。
   - 中间：消息展示滚动流（支持 Markdown 渲染、代码块高亮与复制）。
   - 底部：输入工具栏，支持多行文本发送、中止生成按钮、以及通过 `@` 快速切换当前会话的目标 Agent。

### 4.3 主输入框 `@claw` 任务委派联动
1. 用户在主编辑区输入框中键入 `@`。
2. 提及面板（`AgentInputFilePanel` 或独立的 `MentionItem`）混合检索出所有已启用的 OpenClaw Agents（格式：`@claw:local/main`），带有专属 OpenClaw 标识与 Tag。
3. 回车补全并在主输入框留下 `@claw:<instanceId>/<agentId> `。
4. 用户发送消息：
   - 前端拦截器检测到输入前缀为 `@claw:<instanceId>/<agentId>`。
   - 提取后续指令文本，调用 `openclawApi.sendMessage(instanceId, agentId, prompt)`。
   - 自动调用 `useBottomSideBarStore.getState().openOpenClaw(instanceId, agentId)` 展开底边栏，切至 OpenClaw 视图进行交互。
   - 主 Agent 输入框清空，主对话历史保留一条轻量级委派记录或保持当前本地任务独立。

---

## 5. 安全与错误处理
- **Token 保护**：Token 仅在主进程用于 WebSocket 鉴权握手，配置保存在本地用户目录权限控制下的 `config.json`，不暴露在渲染进程日志中。
- **连接容错**：Gateway 断线时前端直观显示“未连接 / 重新连接中”，支持指数退避重连；请求超时时提供重发选项。
- **国际化与主题规范**：严格使用 `useTranslation` / `t` 多语言文案，CSS 全部使用项目主题 Token（如 `bg-white/[0.02]`、`border-white/8`、`text-white/60` 等），禁止硬编码文字与固定颜色。
