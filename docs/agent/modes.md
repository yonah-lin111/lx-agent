# 协作模式（Plan / Review / Design / Minimal）

LX Agent 定义五态协作模式：`build`（执行）、`plan`（规划）、`review`（审查）、`design`（前端设计）、`minimal`（极简：终端 + 读写）。本文档定义 Plan / Review / Design / Minimal 四态的提示词契约、运行时门禁、输出协议解析、交互卡片与 Front Design 画布闭环；`build` 无特殊协议，工具级门禁细节见 [permissions.md](./permissions.md)。

架构总览见 [architecture.md](./architecture.md)；提示词装配见 [tools.md](./tools.md) §3。

---

## 1. 模式切换与提示词装配

- **切换入口**：`Shift + Tab` 在 `build → plan → review → design → minimal → build` 循环；状态栏 `CollaborationModeButton` 同步展示，点击标签弹出模式列表可定向切换；卡片一键采纳会定向切回 `build`；新会话启动模式取 `agent.permissions.collaborationMode`（缺省 `build`）。
- **契约**：`CollaborationMode = "build" | "plan" | "review" | "design" | "minimal"`；循环顺序与 `nextCollaborationMode` 由 `COLLABORATION_MODE_ORDER` 单一来源定义；历史会话中的 `"default"` 由 `normalizeCollaborationMode` 归一化为 `"build"`。
- **提示词**：`SystemPromptManager` 的 COLLABORATION_MODE 段（order 380）按模式返回对应英文指令模板；Plan / Review 模板中明确声明「模式不因用户语气或祈使句改变」与「写入工具被禁用」；Minimal 走 `complete` 独占段（见 §5）。
- **历史条目**：切换模式会在会话中落一条 `mode_change` entry（`CollaborationModeSwitchMessage`，非 LLM 上下文，不注入模型），执行流程列表（FlowList）以 «Mode Switched: Plan Mode» 独立步骤展示（模式标签 + 职责说明、不计入对话轮次）；**会话尾部连续的切换消息（模型/模式）按同类原地合并**——来回切换只更新同一条目（entry payload 原地更新、seq 与位置不变），被真实对话消息打断后才新增条目；草稿态（会话尚未落库）切换只更新运行时模式，不产生条目。
- **运行时门禁**：Plan / Review / Design 下 `write` / `edit` / `apply_patch` / `todowrite` / `memory` 由 `PermissionManager` 直接 deny（`design` 另禁 `wireframe`），模型收到带模式说明的错误结果并以对应 XML 协议输出；Minimal 下仅 `bash` / `read` / `write` / `edit` 放行（`background: true` 参数拒绝），注册表激活层同步收窄（见 permissions.md §2）。
- **子代理派发**：`task` 由 `agent.permissions.modes.<mode>.subagents` 白名单控制——非 build 模式缺省仅允许内置探索子代理 `explorer`，可勾选其他或自定义角色（空数组 = 全禁）；Minimal 无 `task` 工具、不可派发；能力集含模式硬基线工具的角色（含未限制能力集）在该模式下永久禁用（设置页锁定 + 门控拒绝）；父模式硬基线经 `parentMode` 叠加到子代理的每次工具调用，派发不能绕过只读约束；模式段同时声明该限制，`task` 工具描述的 `Available agent types` 按模式裁剪（模型可见目录 = 实际可派发角色）。
- **共享解析**：`utils.ts` 的 `parseTextWithProposedPlan()` 是统一标签提取器——同一段助手文本中按出现顺序识别 `<review_findings>` / `<proposed_plan>` / `<front_design>` / `<front_design_update>`，拆成结构化块与普通文本块，支持标签未闭合的流式容错与多块级联解析；结构化块同时驱动 `AgentMessageList`（聊天流卡片）与 `AgentExecutionFlowList`（执行步骤），两处复用同一卡片组件。

---

## 2. Plan Mode

### 2.1 提示词契约（3 阶段 + Decision Complete）

1. **PHASE 1 — Ground in the environment**：先用只读工具（`read` / `grep` / `find` / `lsp` 等）探查事实，消除未知；不了解环境前不得提问。
2. **PHASE 2 — Intent chat**：针对代码无法发现的产品诉求、约束与权衡向用户确认。
3. **PHASE 3 — Implementation chat**：细化技术方案、接口、数据流、边界与测试策略，直到计划 **decision complete**（实施者无需再做任何决策）。
4. **Finalization**：计划就绪后必须包裹在 `<proposed_plan>` 中输出；`todowrite` 在计划期被禁用；不允许用「是否需要我开始实现？」代替动作，由用户在卡片上操作。

### 2.2 输出协议

```xml
<proposed_plan>
# [Plan Title]

## Summary
[方案摘要]

## Key Changes
| File | Change |
|------|--------|
| `path/to/file` | [变更说明] |

## Test Plan
1. [验证步骤]

## Assumptions
- [假设]
</proposed_plan>
```

### 2.3 解析与交互卡片

- **解析**：`utils.ts` 的 `parseTextWithProposedPlan()` 按 `<proposed_plan>` 标签将助手文本拆分为 `kind: "proposedPlan"` 块与普通文本块；标题经 `extractPlanTitle()` 提取；流式未闭合时以 `isStreaming: true` 容错输出部分卡片。
- **数据结构**：`ProposedPlanData { title?, content, raw, isStreaming? }`。
- **`ProposedPlanCard`**：
  - 卡片渲染标题、折叠/展开的计划正文、Markdown 预览；样式基于 `--color-theme-*` Token。
  - **[采纳并执行]**：`acceptAndExecutePlan` → `setCollaborationMode("build")` → 自动发送固定指令 `Plan approved. Proceed with implementation step-by-step using todowrite.`；卡片随后进入只读态，防止重复提交。
  - **[复制计划]**：复制完整 Markdown 到剪贴板并 Toast 反馈。
- **执行面板**：对应 `ExecutionStepKind = "proposedPlan"`；消息流与 FlowList 共用同一卡片组件。

---

## 3. Review Mode

### 3.1 提示词契约（4 维审查 Rubric）

1. **Defects & Correctness**：逻辑缺陷、边界条件、off-by-one、竞态、未捕获异常、空值解引用、数据丢失风险。
2. **Security Vulnerabilities**：注入、命令执行、路径穿越、认证/授权绕过、不安全反序列化、密钥泄露。
3. **Performance & Bottlenecks**：意外的二次方扫描、无界内存增长、热路径阻塞操作。
4. **Taste & Minimalism**：过度设计、死代码、多余抽象层、违背最小修改原则。

审查模式严格只读：`write` / `edit` / `apply_patch` / `todowrite` / `memory` 被硬拦截（模式硬基线，见 permissions.md §2），不允许在审查中直接修复；子代理派发缺省仅限内置只读探索子代理 `explorer`，父模式基线对子代理同样生效。处于 Review 模式且用户未指定审查目标时，默认审查当前未提交变更（staged / unstaged / untracked）。代码审查的唯一路径是 Review Mode，不存在 `review` 子代理角色。

### 3.2 输出协议

```xml
<review_findings>
## Summary
[审查结论概述]

### Finding 1: [Short Title]
- **Severity**: Critical | High | Medium | Low
- **Location**: `path/to/file.ts:42` (或 `path/to/file.ts:42-50`)
- **Description**: [问题与风险说明]
- **Suggestion**: [最小化修复建议]

</review_findings>
```

无问题时同样输出空的 `<review_findings>` 块（Summary 说明未发现缺陷）。

### 3.3 解析与交互卡片

- **解析**：`parseReviewFindingsContent()` 提取 Summary 与每个 `### Finding` 块：
  - `Severity` 匹配 `Critical|High|Medium|Low`，缺失时降级 `medium`；
  - `Location` 解析 `` `file:line` `` / `file:line-line` 形态，缺失时降级 `workspace:1`；
  - `Description` / `Suggestion` 按字段提取，找不到 Description 时回退整段正文。
- **数据结构**：`ReviewFindingsData { summary, findings: ReviewFindingItem[], raw, isStreaming? }`；`ReviewFindingItem { id, title, severity, location: { filePath, lineStart, lineEnd? }, description, suggestion? }`。
- **`ReviewFindingsCard`**：
  - 严重级别徽标与计数（Critical / High / Medium / Low），默认选中可修复项，支持全选/反选。
  - 点击 `filePath:line` 经 `window.api.agent.openFileAt` 在本地 IDE 定位。
  - **[填入输入框]**：将选中 Finding 格式化为文本填入聊天输入框，由用户继续编辑；
  - **[采纳并修复选中项]**：`acceptAndExecuteReviewFixes` → 切换到 `build` → 自动发送结构化修复指令（逐条列出标题、`file:line` 与修复建议，结尾要求 `Proceed with precision and verify the fixes.`）。
- **执行面板**：对应 `ExecutionStepKind = "reviewFindings"`。

---

## 4. Front Design（design 模式）

### 4.1 模式与提示词契约 (`systemPromptManager.ts`, order 380)

`design` 模式下注入专用英文提示词，核心约束：

- 工具级门禁：与 plan/review 共享同一只读硬基线并额外禁用 `wireframe`（见 permissions.md §2），可经 `agent.permissions.modes.design` 白名单进一步收紧。

- 所有前端原型必须通过 `<front_design>` 协议输出完整 HTML；`mode="tailwindcss"`（默认）或 `mode="css"`。
- **默认修改基线（`<current_design>`）**：画布有激活设计时，发送端自动注入其完整 HTML 为 `<current_design id title mode version>`，紧随其后注入 `<design_outline>` 结构大纲；提示词规定默认修改基线而非重建，仅当用户**明确要求新建**（"make a new one" 等）时才省略 `parent_id`。`mode` 属性默认沿用基线。
- **修改通道按影响面选择（默认局部补丁）**：局部可定位的改动（某张卡片/某个区块/某个按钮）与**新增内容**都必须走 `<front_design_update>`，只输出受影响或新增的标记；仅当改动覆盖整篇（整体换风格、骨架重排、多处无关区域同时改）才回退 `<front_design parent_id>` 全量重写，且重写时禁止改名文档标题、禁止重排/重绘未触及区块、必须沿用基线 body 布局类。避免"一句话改动 → 全文重生成"造成的成本与无关漂移。
- **更新动作（`action`）**：`replace`（默认，片段替换目标子树）/ `append`、`prepend`（插入目标容器内部末尾/开头，用于新增区块）/ `before`、`after`（插入目标同级前后）。`<html>`/`<body>` 不支持兄弟插入（直接失败）。未知动作归一化为 `replace`。新增类请求因此无需重写整篇文档。
- **同轮多补丁链式累积**：一轮回复中的多个 `<front_design_update>` 按出现顺序依次缝合，后一个补丁基于前一个结果（版本链 `patch1 → patch2`），避免多区域修改互相覆盖而被迫重写。
- **结构大纲（`<design_outline>`，嵌套在基线块内）**：由 `buildDesignOutline()` 从基线 HTML 现算（`body > tag:nth-child(n)` 路径选择器 + 标签/类名/文本预览，深度 4、上限 40 条），与基线严格同源，宿主保证选择器可命中；模型应**逐字复用**大纲选择器，必要时可追加一层子级步骤（如 `> summary`），无匹配节点时才自行从基线推导选择器（优先 `#id`/`[data-section]`，退化 `:nth-child()` 路径）。选择器无法解析时补丁会被丢弃。
- **意图含糊先反问**：无法判定"新建 vs 修改"时必须先调用 `question` 工具澄清，该轮不得输出 `<front_design>`；视觉细节（配色/间距/字体）不反问，由模型自行决策。
- 二次修改时提示词会收到 `<referenced_design>` 基准代码，输出必须携带 `parent_id="{referenced_id}"`，且仍输出完整可执行 HTML（不允许片段 diff）。显式引用优先于 `<current_design>`。
- 定向节点修改（`@design:{id}#{selector}`）时提示词会收到 `<global_styling_context>` 与 `<target_element>`，模型必须原样使用该 `target` 输出 `<front_design_update parent_id target>` 且**只输出目标节点的替换子树**（`replace` 动作下含目标元素自身标签与属性）。
- **布局完整性契约**：全视口单焦点页面（登录/注册/404/空状态/单卡片）必须显式水平+垂直居中（`min-h-screen flex items-center justify-center` 或 `min-height:100vh; display:flex`）；常规页面顶部对齐 + `max-w-* mx-auto` 水平约束；提示词示例本身即为居中型布局。
- **`wireframe` 工具禁用**：design 模式下 `PermissionManager` 对 `wireframe` 硬拦截（模式硬基线 `MODE_MUTATION_REASONS.design`，不进入审批弹窗），提示词同步声明禁用；布局结构必须直接表达在 `<front_design>` HTML 中。
- 工程品味约束：优先原生 `<details>` / `<dialog>` / CSS `:has()` 等原语，慎写脆弱 JS；必要脚本使用 IIFE 并规避 `DOMContentLoaded` 依赖。

```xml
<front_design id="design-2" parent_id="design-1" title="登录页 (渐变紫)" mode="tailwindcss">
<!DOCTYPE html> ... </front_design>

<front_design_update parent_id="design-1" target="#hero-cta" title="更新行动按钮">
  <button id="hero-cta" class="...">立即开始体验</button>
</front_design_update>

<front_design_update parent_id="design-1" target="body > main" action="append" title="新增登录卡片">
  <section id="login-card" class="...">...</section>
</front_design_update>
```

### 4.2 数据结构与存储

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

- **响应式订阅**：`subscribe/getState/useFrontDesign` 基于 `useSyncExternalStore`；`getDesign` / `getActiveDesign` / `getParentDesign` / `getDesignVersions` / `getRootDesigns` 提供谱系查询。侧边栏按"设计族"渲染：每个根节点一行，版本经工具栏下拉切换（`getDesignVersions`），版本不再单独成行。
- **版本派生链**：`registerDesign` 依据 `parent_id`、同会话同名设计推断派生关系；跨轮次流式二次修改自动生成 `-v{n}` 新版本而**不覆盖**旧版本；同一次流式更新就地更新同一项；防御自引用环。
- **稳定设计 id**：设计 id 前缀取消息时间戳（base36，`toChatMessage` → `buildStableDesignBaseId`），实时流式、消息定稿与会话恢复三条路径解析结果一致，避免依赖聊天消息自增 id 造成重启后 id 漂移、`parent_id` 失效。属性提取对 `id=` 做边界保护，`parent_id="x"` / `parentId="x"` 不会被误认为标签自身 id。
- **恢复期版本链回落**：历史消息中的 `parent_id` 若指向已不存在的旧 id（老数据漂移），恢复时回落到同会话版本链头，保证同一设计的多个版本聚合在单一根节点下，不在侧边栏拆成独立条目。
- **会话归属**：设计项记录 `sessionId`，草稿设计在会话落库后回填；`@` 提及与左栏均按当前会话过滤。
- **激活联动**：`autoActivate` 时激活目标设计并在必要时切换到宿主 Tab。
- **纯内存**：不写 localStorage（启动时清除历史遗留 key）。

### 4.3 解析、热更新与落盘

1. **流式解析**：标签提取器识别 `<front_design ...>` 与 `<front_design_update ...>`，提取 `id` / `parent_id` / `title` / `mode` / `target` 属性，生成 `kind: "frontDesign"` 块并实时写入 `frontDesignStore`。
2. **聊天卡片**：`FrontDesignCard` 展示标题、`v{n}` 版本徽标、血缘链接、代码预览与【基于此迭代】按钮。
3. **设计画布**：`/design` 路由的 `FrontDesignPage` 订阅 store 热更新，将 HTML 注入沙箱 Iframe（`sandbox="allow-scripts allow-same-origin"`），使用 `agentApi.compileTailwind(html)` 实时编译 Tailwind JIT；支持 Desktop / Tablet / Mobile 视口切换、刷新与复制代码。
4. **三件套落盘**：`agentApi.saveFrontDesign` 将设计拆分为 `index.html` / `style.css` / `script.js` 写入 `~/.lx/session/{sessionId}/design/{designId}/`；`openDesignDir` 在系统文件管理器中打开。
6. **左栏谱系**：`FrontDesignLeftSideBar` 按根节点聚合版本，展示原型演进历史。

### 4.4 二次修改与 `@` 设计提及

**引用 Token**：

```text
@design:{id}                         全量原型引用
@design:{id}#{selector} ({element})  局部节点引用
```

匹配正则（`agentMarkdownInputUtils.ts` 的 `extractDesignMentions`）同时支持 `#id` 与 `#[data-design-id=...]` 两种选择器形态，并支持光标处整块删除。

- **`@` 综合提及面板**：聚合文件 / Skill / 子代理角色 / 当前会话设计卡片，设计项带 Palette 图标、标题、代码行数与 `Design` 标签；选中插入 `@design:{id} ({title}) `。
- **快捷迭代入口**：`FrontDesignCard` 与 `FrontDesignPage` 工具栏的【基于此迭代】自动切到 `design` 模式、填入引用并聚焦当前 Tab 输入框。
- **发送端上下文注入（Zero Tool-Call）**：`useAgentChat.sendMessage` 经 `utils/designReferenceInjection.ts` 的 `buildDesignReferenceBlocks` 解析引用并直接注入基准代码，模型首轮即可见，无需读盘：
  - 无 `target`：注入完整 `<referenced_design id title mode>`（基准 HTML 全文）。
  - 带 `target`：调用 `extractDesignTargetContext` 做分层切片，仅注入 `<global_styling_context>`（主题、`html/body` 类名、标题）与 `<target_element selector>`（目标节点 `outerHTML`），避免携带数百行无关结构；目标未命中时降级全量注入。
  - **隐式基线**：`design` 模式下无任何显式 `@design` 引用且画布有激活设计时，注入 `<current_design id title mode version>`（完整 HTML）（块内嵌套 `<design_outline>` 结构大纲选择器清单）作为默认修改基线；激活设计已绑定会话时要求与当前会话一致（草稿放行），跨会话不注入。显式引用存在时自动基线让位。
  - 清洗用户气泡：`<referenced_design>` 与 `<current_design>` 块（含嵌套大纲）均不显示在用户消息文本中（`cleanUserPrompt`）。

### 4.5 画布检查器与 DOM 定向更新

**Visual Inspector（点选微调）**：

- `FrontDesignPage` 顶部 `MousePointerClick` 开关维护 `isInspectorActive`。
- 激活后向 iframe `contentDocument` 注入捕获阶段监听（`mousemove` / `click` / `mouseout`），`preventDefault + stopPropagation` 阻断原型自身交互；悬浮显示高亮框与 `tag#id | 宽×高` 标签。
- 点击元素调用 `generateElementSelector(element)` 生成稳定锚点，优先级：
  1. 已有唯一 `#id`；
  2. `[data-section="..."]`；
  3. 已有 `[data-design-id="..."]`；
  4. 无标识时注入 `data-design-id="el-..."`，并同步刷回当前设计项 HTML 保持引用一致。
- 生成的 Token `@design:{id}#{target} ({element}) ` 通过 `agentTabStore.insertPromptToActiveTab()` 注入激活 Tab 并切回聊天页。

**DOM 树定向缝合器 (`utils/designSynthesizer.ts`)**：

```typescript
synthesizeDesignUpdate(baseHtml, targetSelector, newFragmentHtml): { ok, synthesizedHtml?, error? }
extractDesignTargetContext(html, targetSelector): { ok, globalContext?, targetElementHtml?, error? }
generateElementSelector(element): { selector, description, injectedAttr? }
```

- 基于 `DOMParser` 克隆基准原型，`querySelector` 定位目标后 `replaceWith` 新子树，序列化生成完整且合法的 `v2` 快照并注册派生版本（`parentId` + `version` 递增）。
- 选择器归一化容错（多余 `#`、属性引号）；`data-design-id` 失配时按「tagName + class 全等且唯一」回退匹配。

**容灾与降级**：

- 目标节点未命中、选择器非法或 DOM 解析失败：弹出 `frontDesign.updateTargetNotFound` Toast，**放弃该次更新，不落库破损版本**。
- 模型输出全量 `<front_design parent_id>` 时保持既有全量派生链路，不阻断。

### 4.6 路由与组件清单

| 位置 | 内容 |
|---|---|
| `lib/pageRoutes.ts` / `lib/navigationItems.ts` | `design: "/design"`，左栏底部 Palette 导航项 |
| `routes/PageRouter.tsx` / `App.tsx` | 注册 `FrontDesignPage` 与专属 `FrontDesignLeftSideBar` |
| `features/agent/components/blocks/FrontDesignCard.tsx` | 聊天流设计卡片（版本徽标 / 血缘 / 迭代入口 / 展开预览） |
| `pages/front-design/FrontDesignPage.tsx` | 设计画布容器：组合工具栏与画布，编排导出/复制/刷新动作 |
| `pages/front-design/hooks/useDesignTheme.ts` | 主题持久化、系统深浅色订阅与 `effectiveMode` 计算 |
| `pages/front-design/hooks/useDesignPreview.ts` | Tailwind 编译、沙箱文档构建、iframe 增量更新与落盘同步 |
| `pages/front-design/hooks/useDesignInspector.ts` | Inspector 开关、快捷键、iframe 浮层与 `@design` 引用回填 |
| `pages/front-design/components/FrontDesignToolbar.tsx` | 顶部工具栏（版本 / 视口 / 主题 / Inspector / 复制 / 打开设计目录） |
| `pages/front-design/components/FrontDesignCanvas.tsx` | 空状态提示与沙箱 iframe 预览 |
| `pages/front-design/components/FrontDesignLeftSideBar.tsx` | 设计族谱与版本导航 |
| `features/agent/hooks/frontDesignStore.ts` | 响应式单例存储与版本谱系 |
| `features/agent/utils/designSynthesizer.ts` | DOM 切片提取、选择器生成与定向缝合纯函数 |
| `features/agent/utils/designOutline.ts` | 基线结构大纲生成（`body > tag:nth-child(n)` 路径选择器清单），供模型选择 `<front_design_update target>` |
| `features/agent/utils/designReferenceInjection.ts` | 显式引用与隐式 `<current_design>` 基线的上下文注入纯函数 |

### 4.7 已知限制

- 设计看板状态为纯内存单例，应用重启后不自动恢复；可用数据源是聊天消息中的协议原文与 `~/.lx/session/.../design/` 下的落盘文件。
- Inspector 依赖 iframe 同源访问（`allow-same-origin`）；跨源或沙箱策略收紧时高亮与点选不可用。
- 版本派生在模型未输出 `parent_id` 且标题相同的情况下按标题推断，标题被大改时会视为独立根设计。

---

## 5. Minimal Mode（极简终端 + 读写）

最小工具集的轻量模式，用于测试与对比模型基础表现。**有意偏离 dsh minimal**：dsh `presets/minimal.patch.yml` 只组合 persona（`complete`）+ persistent-shell（shell-only），本实现在此之上额外开放 `read` / `write` / `edit`（文件读写有专用工具后不再依赖 shell 转义与 heredoc）：

- **工具白名单**：仅 `bash` / `read` / `write` / `edit`（fail-closed）——注册表激活层只注册/激活这四个工具，MCP、skill、子代理与其余内置工具（含 `ls` / `grep` / `find` / `apply_patch` / `todowrite` / `memory`）对模型不可见；门控层对白名单外工具直接 deny（`MODE_MUTATION_REASONS.minimal`），`bash` 的 `background: true` 参数单独拒绝（`MINIMAL_BACKGROUND_REASON`，引导改用 `command &` 或 `bash.session` 持久会话）。
- **独占提示词**：`MINIMAL_MODE_PROMPT` 以 `complete: true` 段注册（`SystemPromptManager` 的 `harness:minimal-mode`）——一句身份 + 最小工具约定（bash 负责列目录/搜索/命令，read 优先于 cat，读写走专用工具），渲染时压掉其余全部 section 与 context（不注入 AGENTS.md、MEMORY、skills、环境变量与模式段），与 dsh persona `complete: true` + `includeRuntimeContext: false` 同构；非 minimal 模式该段渲染为空、不参与压制。
- **shell 写文件**：Security Guard 对重定向（`>` / `>>`）与内容改写（tee file、sed -i、truncate）的硬拦在所有模式一致生效——写文件走 `write` / `edit`（结构化参数、经 Guardian 路径评估），`bash` 负责列目录、搜索与执行命令；破坏性指令（rm 受保护目标、mkfs、dd、git reset --hard 等）照旧绝对阻断。
- **能力配置**：`agent.permissions.modes.minimal` 只能在其白名单内再收紧（例如 `tools: []` 全禁）；设置页「协作模式」分区中该模式行只读展示「仅允许：bash, read, write, edit」，不提供编辑入口。
- **子代理模式**：`agent.subagents.mode` 不接受 `minimal`（子代理工具集由角色权限决定，与 Minimal 白名单语义不匹配；非法值保存拒绝、读时告警并回退 `build`）。

---

## 6. 国际化命名空间

| 命名空间 | 用途 |
| :--- | :--- |
| `agent.collaborationModeBuild` / `collaborationModePlan` / `collaborationModeReview` / `collaborationModeDesign` / `collaborationModeMinimal` | 状态栏模式名、模式列表与切换提示 |
| `agent.plan.*` | 计划卡片：`cardTitle` / `acceptAndExecute` / `planAccepted` / `copyPlan` / `copySuccess` |
| `agent.review.*` | 审查卡片：`badge` / `applyFixes` / `fillInput` / `noFindings` / `selectedCount` 等 |
| `frontDesign.*` | 设计卡片与画布：`iterateAction` / `basedOnPrefix` / `versionBadge` / `inspectMode` / `viewportDesktop|Tablet|Mobile` / `openDesignDir` / `updateTargetNotFound` 等 |

全部文案经 `useTranslation` 输出，禁止硬编码与原生 `title` 属性；样式统一使用 `--color-theme-*` CSS Token。
