# 前端设计要求

本文定义 LX Agent renderer 的视觉、交互与多主题约束。

## 主题与字体

- 默认黑主题：主色 `#000000`，次色 `#212121`；禁止渐变色。
- 组件圆角统一 `6px`；默认字体 `13px`，tag、描述等辅助文本 `12px`；文字尺寸在 `styles.css` 中统一重载 Tailwind。
- 设置组件和视图样式必须统一使用 CSS Token（如 `--color-theme-*`、`--color-user-bubble` 等）适配多主题系统，严禁硬编码固定背景色或边框色。

## 主题系统

主题采用 CSS Token 驱动 + DOM 属性分发（`data-theme`）架构：

- 业务组件禁止写死主题分支逻辑（如 `if (theme === "minecraft")` 渲染不同 DOM），外观差异全部由 CSS 选择器承载。
- 主题由 `themeStore` 统一管理并持久化至 `localStorage`（键名 `lx_app_theme`），在 `main.tsx` 中于 React 挂载前同步至 `document.documentElement`，根治首屏闪烁。
- 每个主题必须在根选择器（`[data-theme="<theme_id>"]`）下声明标准 Token：

| CSS 变量名 | 含义 |
| :--- | :--- |
| `--color-theme-bg` | 应用全局基础背景色 |
| `--color-theme-surface` | 容器/卡片表面基础色 |
| `--color-theme-surface-hover` | 容器/条目悬浮态颜色 |
| `--color-theme-border` | 通用边框颜色 |
| `--color-theme-border-strong` | 聚焦态、激活态边框颜色 |
| `--color-theme-text` | 默认主文本颜色 |
| `--color-theme-text-muted` | 次要弱化文本颜色 |
| `--color-theme-text-subtle` | 占位符、禁用态、时间戳颜色 |
| `--color-theme-accent` | 主题核心强调色/激活色 |
| `--theme-font-family` | 主题专用字体栈 |
| `--theme-radius-base` | 基础圆角尺寸（默认 `6px`，像素主题 `0px`） |

- 各主题还需显式声明聊天气泡变量：`--color-user-bubble`、`--color-steer-bubble`、`--color-project-prompt-bubble`、`--color-global-prompt-bubble`。

### 主题文件结构

```text
src/renderer/src/
  stores/themeStore.ts           主题状态、DOM 分发与持久化
  styles/themes/
    default.css                  默认暗色主题 Token
    minecraft/                   复杂主题模块化示例
      index.css                  入口：Token、全局重置、布局与核心控件
      markdown-editor.css        CodeMirror 编辑器定制
      markdown-preview.css       Markdown 预览排版
      agent.css                  Agent 气泡与专属交互
  styles.css                     全局入口，统一引入各主题文件
```

### 新增主题流程

以 `cyberpunk` 为例：

1. 在 `themeStore.ts` 的 `AppTheme` 联合类型中注册主题 id。
2. 新建 `styles/themes/<theme_id>.css`（简单主题）或 `styles/themes/<theme_id>/` 模块化目录（深度定制主题），入口声明全部标准 Token。
3. 在 `styles.css` 中 `@import` 主题文件。
4. 在 `components/layout/HeaderSideBar.tsx` 的 `THEME_OPTIONS` 中添加选项。

### 新组件适配

- 优先使用语义化 Token 或 Tailwind 类名（`bg-[#212121]`、`border-white/10`），确保主题无感适配。
- 多层结构（树形导航、列表项）可挂 `data-item-level="project" | "folder" | "item"`，供特定主题精确分派色阶。
- 下拉菜单、命令面板统一挂 `role="listbox"` / `role="option"`，自动继承主题阴影、立体槽与高亮样式。

## 交互与布局

- 交互反馈、动效和状态切换应自然克制，避免突兀跳变。
- 通过留白、层级、卡片结构和微交互建立信息层次，不使用渐变作为装饰补偿。
- 页面框架放 `components/layout`，基础无业务组件放 `components/ui`。
- 组件不得因动态文案、hover 或 loading 改变既定布局尺寸。

## 组件使用

- 优先复用 `src/renderer/src/components/ui/` 的共享组件；确认没有可用组件后，才允许自定义组件或直接编写标签代码。
- 工具操作优先使用熟悉的图标按钮，并提供可访问名称和 Tooltip。
- 按钮默认不要使用高亮或高对比色背景，保持克制中性风格；仅在用户明确要求时才允许使用高亮样式。
- 使用 lucide 图标，不手写等价 SVG 图标，除非指定。
- 基础 UI 组件不得依赖 feature、page、route 或 `window.api`。
- 页面和 feature 组件负责业务组合；基础组件只承载通用交互与视觉能力。
