# 底边栏 Ghostty 风格多标签终端开发任务规格说明

## 1. 需求与架构目标

在 `src/renderer/src/components/layout/BottomSideBar.tsx` 底部栏中集成高可用、跨平台（macOS / Linux / Windows）的 Ghostty 风格多标签终端系统。

### 核心特性
- **布局设计**：左侧为终端 Tab/Tag 列表（含新建、删除、切换操作），右侧为主终端 xterm 显示与交互区域。
- **跨平台 PTY**：主进程采用 `node-pty` 管理原生系统进程，渲染进程采用 `@xterm/xterm` 与 `@xterm/addon-fit`、`@xterm/addon-web-links`。
- **关联项目工作区**：
  - 新建终端时，若在项目列表（`ProjectNavigationList`）中选中了带有效物理路径的项目，则以该项目根目录作为初始 `cwd`。
  - 若无选中项目或为虚拟项目，默认回退至操作系统桌面（`app.getPath("desktop")`）。
  - 切换项目时不干扰已运行终端的进程状态（不自动注入 `cd`）。
- **底边栏折叠/展开协同**：
  - 折叠（40px）：展示 Tag 快速切换栏与管理按钮，隐藏 xterm 画布。
  - 展开（300px）：完整展示左侧 Tag 侧栏与右侧终端交互区，并触发 `fitAddon.fit()`。
- **Ghostty 视觉设计**：深色暗黑磨砂调色、平滑光标、快捷键支持（`Cmd/Ctrl + C/V`、新建/关闭标签等）。

---

## 2. 系统拆分与职责划分

### 2.1 主进程（Main Process）
- **依赖**：`node-pty`
- **服务层 (`src/main/services/terminalService.ts`)**：
  - 管理终端实例映射 `Map<string, IPty>`。
  - Shell 跨平台解析策略：
    - macOS: `process.env.SHELL || "/bin/zsh" || "/bin/bash"`
    - Linux: `process.env.SHELL || "/bin/bash" || "/bin/sh"`
    - Windows: 优先检测 `Git\\bin\\bash.exe` 或 `powershell.exe`，回退 `cmd.exe`
  - 接口定义：`createTerminal(id, cwd, cols, rows)`、`writeTerminal(id, data)`、`resizeTerminal(id, cols, rows)`、`killTerminal(id)`。
- **IPC 桥接层 (`src/main/ipc/terminalHandlers.ts`)**：
  - `terminal:create` (invoke) -> `{ success, id }`
  - `terminal:write` (on/send)
  - `terminal:resize` (on/send)
  - `terminal:kill` (on/send)
  - `terminal:data:${id}` (webContents.send)
  - `terminal:exit:${id}` (webContents.send)

### 2.2 Preload 与共享层（Shared & Preload）
- **共享契约 (`src/shared/terminal.ts`)**：
  - 终端配置、创建参数、Tab 元数据类型定义。
  - 渲染进程 API 接口定义 `TerminalApi`。
- **Preload API (`src/preload/index.ts` & `src/renderer/src/env.d.ts`)**：
  - 暴露安全、事件解绑可控的 `window.api.terminal` 对象。

### 2.3 渲染进程（Renderer Process - Feature-First）
- **状态管理 (`src/renderer/src/features/terminal/terminalStore.ts`)**：
  - 活跃 Tab、所有 Tab 列表、关联 project/item 映射、标题命名。
- **终端视图组件 (`src/renderer/src/features/terminal/components/`)**：
  - `TerminalPane.tsx`：xterm 实例挂载容器与 ResizeObserver / FitAddon 控制。
  - `TerminalTabs.tsx`：Ghostty 风格的垂直/水平 Tag 标签栏。
  - `GhosttyTerminalView.tsx`：整合 Tabs 与 Pane 的主视图容器。
- **布局整合 (`src/renderer/src/components/layout/BottomSideBar.tsx`)**：
  - 嵌入终端组件，处理折叠/展开高度与布局过渡。

---

## 3. 具体实施步骤与检查清单

1. [ ] **依赖配置与原生构建**
   - 引入 `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links`、`node-pty`。
   - 配置 `scripts/rebuildNativeIfNeeded.mjs` 支持 `node-pty` 与 Electron 目标重构。
2. [ ] **共享契约与 IPC 通道**
   - 新增 `src/shared/terminal.ts`。
   - 编写 `src/main/services/terminalService.ts` 与 `src/main/ipc/terminalHandlers.ts`。
   - 在 `src/preload/index.ts` 暴露 API 并更新全局声明。
3. [ ] **渲染端 Feature 模块实现**
   - 实现 `src/renderer/src/features/terminal/`（Store、Hook、Ghostty 主题样式与快捷键）。
   - 实现 xterm 实例生命周期保持与切换（隐藏式 DOM 保持避免进程或滚动重置）。
4. [ ] **底边栏 UI 整合**
   - 重构 `BottomSideBar.tsx` 支持 40px 折叠 Tag 栏与 300px 完整终端工作台。
   - 获取当前选中的 `projectId` / `itemId` 动态解析默认 `cwd`。
5. [ ] **精准测试与类型校验**
   - 编写 terminal store / utils 单测。
   - 执行 `pnpm typecheck` 与 `pnpm lint`。
