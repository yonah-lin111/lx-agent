# Front Design 模式与设计画布

Front Design（`design`）是四态协作模式中的前端原型设计态：Agent 以 XML 协议输出 HTML/Tailwind 原型，客户端流式捕获、热更新到独立设计画布，并支持跨轮次二次修改、`@` 设计与 DOM 节点级定向微调。模式门禁见 [permissions.md](./permissions.md)；Plan/Review 见 [collaboration-modes.md](./collaboration-modes.md)。

## 1. 模式与提示词契约 (`systemPromptManager.ts`, order 380)

`design` 模式下注入专用英文提示词，核心约束：

- 所有前端原型必须通过 `<front_design>` 协议输出完整 HTML；`mode="tailwindcss"`（默认）或 `mode="css"`。
- 二次修改时提示词会收到 `<referenced_design>` 基准代码，输出必须携带 `parent_id="{referenced_id}"`，且仍输出完整可执行 HTML（不允许片段 diff）。
- 定向节点修改时提示词会收到 `<global_styling_context>` 与 `<target_element>`，模型必须输出 `<front_design_update parent_id target>` 且**只输出目标节点的替换子树**；明确禁止在该场景输出 `<front_design>` 全量。
- 工程品味约束：优先原生 `<details>` / `<dialog>` / CSS `:has()` 等原语，慎写脆弱 JS；必要脚本使用 IIFE 并规避 `DOMContentLoaded` 依赖。

```xml
<front_design id="design-2" parent_id="design-1" title="登录页 (渐变紫)" mode="tailwindcss">
<!DOCTYPE html> ... </front_design>

<front_design_update parent_id="design-1" target="#hero-cta" title="更新行动按钮">
  <button id="hero-cta" class="...">立即开始体验</button>
</front_design_update>
```

模式切换：`Shift + Tab` 四态循环到 `design`，或状态栏 / 卡片按钮定向切换。

## 2. 数据结构与存储

```typescript
// ChatBlock 中的设计块（types.ts）
export interface FrontDesignData {
  id: string
  parentId?: string | null
  version?: number
  title?: string
  target?: string | null   // front_design_update 的目标选择器
  isUpdate?: boolean
  html: string
  raw: string
  isStreaming?: boolean
  sessionId?: string | null
  mode?: "tailwindcss" | "css"
  designDir?: string
}

// 响应式单例存储（frontDesignStore.ts）
export interface FrontDesignItem {
  id: string
  parentId?: string | null
  version?: number
  title: string
  html: string
  updatedAt: number
  isStreaming?: boolean
  sessionId?: string | null
  mode?: "tailwindcss" | "css"
  designDir?: string
}
```

`frontDesignStore` 关键行为：

- **响应式订阅**：`subscribe/getState/useFrontDesign` 基于 `useSyncExternalStore`；`getDesign` / `getActiveDesign` / `getParentDesign` / `getDesignVersions` / `getRootDesigns` 提供谱系查询。
- **版本派生链**：`registerDesign` 依据 `parent_id`、同会话同名设计推断派生关系；跨轮次流式二次修改自动生成 `-v{n}` 新版本而**不覆盖**旧版本；同一次流式更新就地更新同一项；防御自引用环。
- **会话归属**：设计项记录 `sessionId`，草稿设计在会话落库后回填；`@` 提及与左栏均按当前会话过滤。
- **激活联动**：`autoActivate` 时激活目标设计并在必要时切换到宿主 Tab。
- **纯内存**：不写 localStorage（启动时清除历史遗留 key）。

## 3. 解析、热更新与落盘

1. **流式解析**：`utils.ts` 的标签提取器识别 `<front_design ...>` 与 `<front_design_update ...>`，提取 `id` / `parent_id` / `title` / `mode` / `target` 属性，生成 `kind: "frontDesign"` 块并实时写入 `frontDesignStore`。
2. **聊天卡片**：`FrontDesignCard` 展示标题、`v{n}` 版本徽标、`基于 {parentId} 迭代` 血缘链接、代码预览与【基于此迭代】按钮。
3. **设计画布**：`/design` 路由的 `FrontDesignPage` 订阅 store 热更新，将 HTML 注入沙箱 Iframe（`sandbox="allow-scripts allow-same-origin"`），使用 `agentApi.compileTailwind(html)` 实时编译 Tailwind JIT；支持 Desktop / Tablet / Mobile 视口切换、刷新与复制代码。
4. **三件套落盘**：`agentApi.saveFrontDesign` 将设计拆分为 `index.html` / `style.css` / `script.js` 写入 `~/.lx/session/{sessionId}/design/{designId}/`；`openDesignDir` 在系统文件管理器中打开。
5. **左栏谱系**：`FrontDesignLeftSideBar` 按根节点聚合版本，展示原型演进历史。

## 4. 二次修改与 `@` 设计提及

### 4.1 引用 Token

```text
@design:{id}                         全量原型引用
@design:{id}#{selector} ({element})  局部节点引用
```

匹配正则（`agentMarkdownInputUtils.ts` 的 `extractDesignMentions`）同时支持 `#id` 与 `#[data-design-id=...]` 两种选择器形态，并支持光标处整块删除。

- **`@` 综合提及面板**：聚合文件 / Skill / 当前会话设计卡片，设计项带 Palette 图标、标题、代码行数与 `Design` 标签；选中插入 `@design:{id} ({title}) `。
- **快捷迭代入口**：`FrontDesignCard` 与 `FrontDesignPage` 工具栏的【基于此迭代】自动切到 `design` 模式、填入引用并聚焦当前 Tab 输入框。

### 4.2 发送端上下文注入（Zero Tool-Call）

`useAgentChat.sendMessage` 解析引用并直接注入基准代码，模型首轮即可见，无需读盘：

- 无 `target`：注入完整 `<referenced_design id title mode>`（基准 HTML 全文）。
- 带 `target`：调用 `extractDesignTargetContext` 做分层切片，仅注入 `<global_styling_context>`（主题、`html/body` 类名、标题）与 `<target_element selector>`（目标节点 `outerHTML`），避免携带数百行无关结构。
- 清洗用户气泡：`<referenced_design>` 块不显示在用户消息文本中。

## 5. 画布检查器与 DOM 定向更新

### 5.1 Visual Inspector（点选微调）

- `FrontDesignPage` 顶部 `MousePointerClick` 开关维护 `isInspectorActive`。
- 激活后向 iframe `contentDocument` 注入捕获阶段监听（`mousemove` / `click` / `mouseout`），`preventDefault + stopPropagation` 阻断原型自身交互；悬浮显示粉色高亮框与 `tag#id | 宽×高` 标签。
- 点击元素调用 `generateElementSelector(element)` 生成稳定锚点，优先级：
  1. 已有唯一 `#id`；
  2. `[data-section="..."]`；
  3. 已有 `[data-design-id="..."]`；
  4. 无标识时注入 `data-design-id="el-..."`，并同步刷回当前设计项 HTML 保持引用一致。
- 生成的 Token `@design:{id}#{target} ({element}) ` 通过 `agentTabStore.insertPromptToActiveTab()` 注入激活 Tab 并切回聊天页。

### 5.2 DOM 树定向缝合器 (`utils/designSynthesizer.ts`)

```typescript
synthesizeDesignUpdate(baseHtml, targetSelector, newFragmentHtml): { ok, synthesizedHtml?, error? }
extractDesignTargetContext(html, targetSelector): { ok, globalContext?, targetElementHtml?, error? }
generateElementSelector(element): { selector, description, injectedAttr? }
```

- 基于 `DOMParser` 克隆基准原型，`querySelector` 定位目标后 `replaceWith` 新子树，序列化生成完整且合法的 `v2` 快照并注册派生版本（`parentId` + `version` 递增）。
- 选择器归一化容错（多余 `#`、属性引号）；`data-design-id` 失配时按「tagName + class 全等且唯一」回退匹配。

### 5.3 容灾与降级

- 目标节点未命中、选择器非法或 DOM 解析失败：弹出 `frontDesign.updateTargetNotFound` Toast，**放弃该次更新，不落库破损版本**。
- 模型输出全量 `<front_design parent_id>` 时保持既有全量派生链路，不阻断。

## 6. 路由与组件清单

| 位置 | 内容 |
|---|---|
| `lib/pageRoutes.ts` / `lib/navigationItems.ts` | `design: "/design"`，左栏底部 Palette 导航项 |
| `routes/PageRouter.tsx` / `App.tsx` | 注册 `FrontDesignPage` 与专属 `FrontDesignLeftSideBar` |
| `features/agent/components/blocks/FrontDesignCard.tsx` | 聊天流设计卡片（版本徽标 / 血缘 / 迭代入口 / 展开预览） |
| `pages/front-design/FrontDesignPage.tsx` | 设计画布：Inspector、视口切换、Tailwind JIT、Iframe 热更新、落盘与打开目录 |
| `pages/front-design/components/FrontDesignLeftSideBar.tsx` | 设计族谱与版本导航 |
| `features/agent/hooks/frontDesignStore.ts` | 响应式单例存储与版本谱系 |
| `features/agent/utils/designSynthesizer.ts` | DOM 切片提取、选择器生成与定向缝合纯函数 |

## 7. 已知限制

- 设计看板状态为纯内存单例，应用重启后不自动恢复；可用数据源是聊天消息中的协议原文与 `~/.lx/session/.../design/` 下的落盘文件。
- Inspector 依赖 iframe 同源访问（`allow-same-origin`）；跨源或沙箱策略收紧时高亮与点选不可用。
- 版本派生在模型未输出 `parent_id` 且标题相同的情况下按标题推断，标题被大改时会视为独立根设计。

## 8. 国际化命名空间

`frontDesign.*`（卡片的 `iterateAction` / `basedOnPrefix` / `versionBadge`；画布的 `inspectMode` / `inspectModeActive` / `viewportDesktop|Tablet|Mobile` / `openDesignDir` / `updateTargetNotFound` 等）与 `agent.collaborationModeDesign` 经 `useTranslation` 输出；样式全部使用 `--color-theme-*` CSS Token。
