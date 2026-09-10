# OpenClaw 接入实施任务拆解文档 (Task)

## 1. 任务概述
本文档根据 `docs/agent/openclaw-integration-design.md` 的架构设计，将 OpenClaw 接入工作拆解为可精确验证的阶段性开发子任务。

---

## 2. 任务清单与排期拆解

### Phase 1: 数据模型与 IPC 通信契约（基础层）
- [ ] **Task 1.1: 共享类型与默认配置定义**
  - **路径**: `src/shared/contracts/openclaw.ts`, `src/shared/settings.ts`
  - **内容**:
    - 定义 `OpenClawAgentItem`、`OpenClawInstanceConfig`、`OpenClawSettings` 及默认常量；
    - 定义流式消息结构 `OpenClawChatMessage`、`OpenClawSessionState`。
  - **验收标准**: 类型无循环依赖，通过 TypeScript 编译检查。

- [ ] **Task 1.2: IPC 通道与 Preload 封装**
  - **路径**: `src/shared/ipc/openclawChannels.ts`, `src/preload/index.ts`, `src/renderer/src/env.d.ts`
  - **内容**:
    - 定义 IPC 通道：`openclaw:getSettings`、`openclaw:saveSettings`、`openclaw:fetchAgents`、`openclaw:sendMessage`、`openclaw:streamEvent`、`openclaw:abort` 等；
    - 在 Preload 中暴露 `window.api.openclaw` 并在 `env.d.ts` 中完成类型挂载。
  - **验收标准**: Preload 暴露的接口具备完整类型推导。

---

### Phase 2: Main 进程服务与通信管理（服务端）
- [ ] **Task 2.1: 设置服务扩展 (settingsService)**
  - **路径**: `src/main/services/settingsService.ts`
  - **内容**:
    - 支持在 `~/.lx/config.json` 中读取和保存 `openclaw` 配置节点；
    - 兼容老配置无 `openclaw` 字段时的优雅回退与默认值。
  - **验收标准**: 单元测试覆盖读写与容错。

- [ ] **Task 2.2: OpenClaw 客户端与连接池管理器 (OpenClawClientManager)**
  - **路径**: `src/main/services/openclaw/openclawClientManager.ts`
  - **内容**:
    - 管理多实例 WebSocket 连接（连接建立、心跳保持、错误与重连）；
    - 实现与 OpenClaw Gateway 的协议交互：拉取 Agent 列表（`fetchAgents`）与流式消息下发（`agent RPC` 或 WebSocket 文本流）。
  - **验收标准**: 能够向指定的 ws 地址发起连接握手并正确接收解析返回的消息分片。

- [ ] **Task 2.3: 注册 Main 进程 IPC Handlers**
  - **路径**: `src/main/ipc/openclawHandlers.ts`, `src/main/index.ts`
  - **内容**:
    - 注册上述 IPC 通道，对接 `settingsService` 与 `openclawClientManager`；
    - 在 `main/index.ts` 中完成初始化挂载。
  - **验收标准**: IPC 注册完全覆盖契约定义，异常均能通过标准序列化传递。

---

### Phase 3: 设置页面 OpenClaw 分区（配置前端）
- [ ] **Task 3.1: 常量与导航扩展**
  - **路径**: `src/renderer/src/features/settings/constants.ts`, `src/renderer/src/features/settings/settingsChangeNotifier.ts`
  - **内容**:
    - `SETTINGS_SECTIONS` 增加 `openclaw` 分区与专属图标（例如 `Network` 或 `Bot`）；
    - `SettingsDomain` 增加 `"openclaw"`；
    - 注册国际化键（`settings.openclaw`、`settings.openclawDesc`、`settings.openclawDoc` 等）。
  - **验收标准**: 设置页面左侧栏出现 OpenClaw 图标与标签。

- [ ] **Task 3.2: OpenClawSettings 配置组件开发**
  - **路径**: `src/renderer/src/features/settings/components/OpenClawSettings.tsx`, `src/renderer/src/pages/settings/index.tsx`
  - **内容**:
    - 左右分栏：左侧实例列表（支持添加、重命名、启用切换、删除），右侧实例表单（URL、Token、Agent 列表）；
    - 实现“测试连接并拉取 Agents (Fetch Agents)”交互，展示加载与 Toast 提示；
    - 接入 `useSettingsDraftStore` 支持统一重置与保存。
  - **验收标准**: 能正常录入保存多个 OpenClaw 实例，脏检查与保存成功生效。

---

### Phase 4: 底边栏 OpenClaw 聊天面板与状态控制
- [ ] **Task 4.1: bottomSideBarStore 状态扩展**
  - **路径**: `src/renderer/src/components/layout/bottomSideBarStore.ts`
  - **内容**:
    - `BottomSideBarViewMode` 扩充为 `"terminal" | "jobs" | "openclaw"`；
    - 增加 `openOpenClaw: (instanceId?: string, agentId?: string) => void` 快捷展开方法。
  - **验收标准**: 模式切换类型安全，调用 `openOpenClaw` 能自动展开底边栏。

- [ ] **Task 4.2: OpenClaw 聊天面板组件开发**
  - **路径**: `src/renderer/src/features/openclaw/components/OpenClawChatView.tsx`
  - **内容**:
    - 顶部工具条：切换当前实例与 Agent 的 `LxSelect`、连接状态指示器、清屏按钮；
    - 中间消息流：渲染用户消息与 OpenClaw 助理回复（流式打字效果、Markdown 格式支持）；
    - 底部输入区：支持多行输入与发送、中止生成按钮。
  - **验收标准**: 界面符合主题 Token 规范，支持与指定 OpenClaw 实例的流式问答。

- [ ] **Task 4.3: BottomSideBar.tsx 三视图集成**
  - **路径**: `src/renderer/src/components/layout/BottomSideBar.tsx`
  - **内容**:
    - 在展开态顶部操作区增加 OpenClaw 视图切换按钮；
    - 在展开内容区以 DOM 保活形式挂载 `OpenClawChatView`（`hidden / flex` 切换）；
    - 在折叠态 40px 状态栏右侧增加 OpenClaw 唤起入口。
  - **验收标准**: 在 Terminal、Jobs、OpenClaw 之间切换时不丢失任何会话与终端状态。

---

### Phase 5: @ Mention 快速定向与任务委派
- [ ] **Task 5.1: 提及补全匹配器扩展**
  - **路径**: `src/renderer/src/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils.ts`, `src/renderer/src/features/agent/components/AgentInput/AgentInputCommandPanels.tsx`
  - **内容**:
    - 在 `@` 触发时，注入已配置的 OpenClaw Agents（格式：`@claw:<instanceId>/<agentId>`）；
    - 面板呈现专属 OpenClaw 图标与 Tag。
  - **验收标准**: 输入 `@claw:` 能够准确筛选匹配已启用的 OpenClaw Agents。

- [ ] **Task 5.2: 主输入框发送拦截与底边栏转交**
  - **路径**: `src/renderer/src/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputActions.ts` (或对应的 send prompt dispatcher)
  - **内容**:
    - 发送时若匹配到 `@claw:<instanceId>/<agentId> [内容]`，拦截主本地 Agent 调度；
    - 转交调用 OpenClaw 发送接口；
    - 自动唤起底边栏并切到对应 OpenClaw 实例/Agent 视图。
  - **验收标准**: 主界面输入框发送后，底边栏自动弹出并开始流式接收 OpenClaw 回复。

---

### Phase 6: 验证与规范检查
- [ ] **Task 6.1: 代码与规范审查**
  - 检查无原生 `title` 属性（统一使用 `LxTooltip`）；
  - 检查无硬编码中文字符（全部采用 i18n）；
  - 检查全主题 Token 适配；
  - 检查无跨层旧导入和废弃 DTO。
- [ ] **Task 6.2: 类型检查与单元测试验证**
  - 运行精准测试与 TypeScript 检查。
