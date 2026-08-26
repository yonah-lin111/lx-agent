# 前端设计要求

本文定义 LX Agent renderer 的视觉与交互约束。

## 主题与字体

- 默认使用黑色主题：主色 `#000000`，次色 `#212121`。
- 设置组件和视图样式时必须统一使用 CSS Token（如 `--color-theme-*`、`--color-user-bubble` 等）适配多主题系统（见 `docs/standards/theme-development-standards.md`），严禁硬编码固定背景色或边框色。
- 禁止渐变色。
- 组件圆角统一为 `6px`。
- 默认字体大小为 `13px`；tag、描述等辅助文本为 `12px`。
- 在 `styles.css` 中统一重载 Tailwind 的文字尺寸。

## 交互与布局

- 交互反馈、动效和状态切换应自然克制，避免突兀跳变。
- 通过留白、层级、卡片结构和微交互建立信息层次，不使用渐变作为装饰补偿。
- 页面框架放 `components/layout`，基础无业务组件放 `components/ui`。
- 组件不得因动态文案、hover 或 loading 改变既定布局尺寸。

## 组件使用

- 工具操作优先使用熟悉的图标按钮，并提供可访问名称和 Tooltip。
- 使用 lucide 图标，不手写等价 SVG 图标，除非指定。
- 基础 UI 组件不得依赖 feature、page、route 或 `window.api`。
- 页面和 feature 组件负责业务组合；基础组件只承载通用交互与视觉能力。
