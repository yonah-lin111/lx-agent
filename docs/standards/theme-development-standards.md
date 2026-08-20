# 主题设计与扩展规范

本文档定义 LX Agent 的主题系统架构、Token 变量命名规范以及新增/扩展主题的标准化流程。

---

## 1. 架构设计原则

主题系统采用 **CSS Token 驱动 + DOM 属性分发（`data-theme`）** 的架构：
- **无侵入性**：禁止在业务组件内部写死具体主题的分支逻辑（如 `if (theme === 'minecraft')` 渲染不同 DOM），所有主题外观表现统一由 CSS 选择器承载；
- **状态持久化与防闪烁**：主题由 `themeStore` 统一管理并持久化至 `localStorage`（键名 `lx_app_theme`），在 React 应用挂载前（`main.tsx`）立即同步至 `document.documentElement`，根治首屏加载闪烁；
- **组件结构复用**：所有主题必须兼容现有 Tailwind 颜色体系与 CSS 变量，确保新开发组件或第三方视图开箱即用。

---

## 2. 核心文件结构

```text
src/renderer/src/
├── stores/
│   └── themeStore.ts             # 主题状态 Hook、DOM 分发与持久化
├── styles/
│   └── themes/
│       ├── default.css           # 默认暗色主题 Token 定义
│       └── minecraft/            # 模块化复杂主题示例（Minecraft 像素暗色）
│           ├── index.css         # 主题入口（变量、全局重置、布局与核心控件）
│           ├── markdown-editor.css # CodeMirror 编辑器专用定制样式
│           ├── markdown-preview.css# Markdown 预览排版与代码块样式
│           └── agent.css         # Agent 会话气泡与专属交互样式
└── styles.css                    # 全局样式入口，统一引入各主题 css 文件
```

---

## 3. CSS Token 变量规范

每个主题文件必须在根选择器（`[data-theme="<theme_id>"]`）下声明标准变量：

| CSS 变量名 | 含义 | 说明 |
| :--- | :--- | :--- |
| `--color-theme-bg` | 应用全局基础背景色 | 对应最底层画布/页面背景 |
| `--color-theme-surface` | 容器/卡片表面基础色 | 对应 Header、Aside、Nav、Modal 等 |
| `--color-theme-surface-hover` | 容器/条目悬浮态颜色 | 列表项、按钮 Hover 背景 |
| `--color-theme-border` | 通用边框颜色 | 容器分割线、卡片边框 |
| `--color-theme-border-strong` | 强强调边框颜色 | 聚焦态、激活态边框 |
| `--color-theme-text` | 默认主文本颜色 | 正文、主要标题 |
| `--color-theme-text-muted` | 次要弱化文本颜色 | 描述文本、辅助信息、图标 |
| `--color-theme-text-subtle` | 极低对比度文本颜色 | 占位符、禁用态、时间戳 |
| `--color-theme-accent` | 主题核心强调色 / 激活色 | 选区、高光、聚焦光圈 |
| `--theme-font-family` | 主题专用字体栈 | 等宽/无衬线代码字体配置 |
| `--theme-radius-base` | 基础圆角尺寸 | 如默认 `6px`，像素主题 `0px` |

### Tailwind 气泡全局颜色覆盖

各主题需显式声明 Agent 聊天消息气泡的色值变量：
- `--color-user-bubble`：用户发送消息气泡颜色；
- `--color-steer-bubble`：即时插话（Steer）消息气泡颜色；
- `--color-project-prompt-bubble`：项目级 Prompt 模板气泡色；
- `--color-global-prompt-bubble`：全局级 Prompt 模板气泡色。

---

## 4. 新增主题开发流程

新增一个名为 `cyberpunk` 的新主题时，遵循以下 4 步：

### Step 1：在 `themeStore.ts` 中注册主题类型
```typescript
// src/renderer/src/stores/themeStore.ts
export type AppTheme = "default" | "minecraft" | "cyberpunk"
```

### Step 2：新建主题 CSS 样式

- **简单主题**：在 `src/renderer/src/styles/themes/<theme_id>.css` 中单文件定义；
- **深度定制/复杂主题（推荐模式）**：参照 `minecraft` 目录模式建立子目录 `src/renderer/src/styles/themes/<theme_id>/`，拆分为模块化样式表：
  - `index.css`：引入子模块、定义全局 Token、直角/圆角重置、基础容器及通用组件；
  - `markdown-editor.css`：定制编辑器（CodeMirror）光标、选区、行号与高亮样式；
  - `markdown-preview.css`：定制预览区排版、代码块、标题与引用样式；
  - `agent.css`：定制 Agent 气泡、思考块、交互卡片及特殊状态。

单文件/入口基础 Token 示例（以 `cyberpunk` 为例）：
```css
[data-theme="cyberpunk"] {
  --color-theme-bg: #0d0221;
  --color-theme-surface: #19053b;
  --color-theme-surface-hover: #260959;
  --color-theme-border: #ff007f;
  --color-theme-border-strong: #00f0ff;
  --color-theme-text: #ffffff;
  --color-theme-text-muted: #b8a9c9;
  --color-theme-text-subtle: #7a688d;
  --color-theme-accent: #00f0ff;
  --theme-font-family: inherit;
  --theme-radius-base: 2px;

  --color-user-bubble: #2d0c5a;
  --color-steer-bubble: #4a1c0d;
  --color-project-prompt-bubble: #0a3d3d;
  --color-global-prompt-bubble: #3d0a3d;

  color: var(--color-theme-text);
  background: var(--color-theme-bg);
}
```

### Step 3：在 `styles.css` 中引入主题文件
```css
/* src/renderer/src/styles.css */
@import "./styles/themes/default.css";
@import "./styles/themes/minecraft/index.css";
@import "./styles/themes/cyberpunk.css"; /* 或 ./styles/themes/cyberpunk/index.css */
```

### Step 4：在顶部切换栏中添加选项
在 `src/renderer/src/components/layout/HeaderSideBar.tsx` 的 `THEME_OPTIONS` 列表中添加：
```typescript
const THEME_OPTIONS: { id: AppTheme; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "minecraft", label: "Minecraft" },
  { id: "cyberpunk", label: "Cyberpunk" },
]
```

---

## 5. 新组件适配主题的最佳实践

编写新的业务或基础 UI 组件时，遵守以下准则：

1. **优先使用语义化 Token / Tailwind 类名**：
   - 背景使用 `bg-[#212121]` 或直接使用 CSS 变量，确保主题能通过全局覆盖类或属性无感适配；
   - 边框使用 `border-white/5`、`border-white/10`；
2. **需要特定层级反差时使用数据属性**：
   - 树形导航、列表 item 等多层级结构，可在 DOM 挂载 `data-item-level="project" | "folder" | "item"`，方便特定主题（如像素主题）精确分派色阶；
3. **弹窗与浮层统一角色属性**：
   - 下拉菜单、命令面板统一挂载 `role="listbox"` / `role="option"`，即可自动继承已配置好的主题阴影、立体槽和高亮样式。
