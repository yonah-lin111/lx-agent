# Front Design 评审闭环 设计

在 front-design 画布上补齐「评审」环节：把人在画布上的判断（批注、体检发现、设计令牌约束）结构化回流给 Agent，由 Agent 产出新版本。主题是一个闭环：**画布发现问题 → 结构化指令 → Agent 定向修改 → 新版本回画布**。

## 1. 目标

- **A 批注评审**：Inspector 从「点一次往聊天框插一条裸 token」升级为「点选 → 写批注 → 画布气泡 + 右侧清单 → 批量/单条回流 Agent」。
- **B 运行时报错捕获**：预览内 `onerror` / `unhandledrejection` / `console.error` 结构化捕获，画布底部状态条展示，可多选回流 Agent 修复。
- **C 可用性审计**：6 条零依赖 DOM 规则（alt / 可访问名称 / 对比度 / 点击区 / 表单 label / html lang），产出带精确 selector 的问题清单。
- **D 设计系统令牌**：全局令牌（色板 / 圆角 / 字体 / 风格约定），design 模式下自动注入 `<design_system>` 块约束 Agent 的每一次生成与修改。
- B 与 C 合并为**统一体检面板**，共用一个「发现问题 → 勾选 → 发送」通道。

## 2. 非目标

- 不做元素直接编辑（Figma 式改属性 / 拖拽），一切修改仍由 Agent 执行。
- 不做 PNG 截图 / HTML 包导出。
- 不做多屏总览看板。
- 不做版本代码 diff 视图。
- 不做令牌自动提取（从画布反推色板）。
- 不新增数据库迁移，不改主进程 prompt 组装链路，不改 `@design` 注入协议语义（只复用）。
- 批注清单不持久化（内存态，随页面会话存亡）。
- 不采集资源加载失败（img / script / link error），噪音不可控。

## 3. 决策记录（grill 结论）

| # | 决策 | 结论 |
| :- | :--- | :--- |
| 1 | 本轮范围 | A + B + C + D 全做，主题「评审闭环」 |
| 2 | 令牌作用域与持久化 | 全局一份 + renderer localStorage，`designSystemStore`，不走 settings / IPC |
| 3 | 令牌字段 | 精简手工录入：`colors[] / radius / fontFamily / notes`，不做自动提取 |
| 4 | 批注交互 | 合并升级现有 Inspector，不并存两套点选模式；画布气泡 + 右侧清单 |
| 5 | 体检面板 | B + C 合并为统一面板（两个分组），多选后一次回流 |
| 6 | 检测范围 | 报错：`onerror` + `unhandledrejection` + `console.error`；审计：6 条规则 |
| 7 | 非目标 | 见第 2 节全部确认 |

## 4. 现状约束（已核查）

- 注入链路在 renderer：`useAgentChatSend.ts:90` 调 `buildDesignReferenceBlocks`，把设计上下文拼进用户消息头部。
- mention 语法：`/@design:([a-zA-Z0-9_-]+)(?:#(?:(\[[^\]\r\n]+\])|([^\s()]+)))?(?:\s*\(([^()\r\n]*)\))?/g`
  → 选择器**不能含空格或括号**。`generateElementSelector` 产出的 `#id` / `[data-section=x]` / `[data-design-id=el-x]` 恰好满足；`design_outline` 的 `body > main > ...` 只用于 Agent 的 `target` 属性，不能用于 mention。
- `extractDesignTargetContext` 支持任意合法 CSS 选择器（含 `body>main>form:nth-child(2)` 这种无空格路径）。
- iframe：`sandbox="allow-scripts allow-same-origin"`，父层可直接读 `contentDocument` / `contentWindow`。
- 预览文档在 `useDesignPreview` 中向 `<head>` 注入 `lx-sandbox-guard` 脚本，父层 `onLoad` 后由 `executeIframeScripts` 重放 body 脚本。
- 多块 `<front_design_update>` 在同一条消息内被递归解析并逐块 splice，无需改动解析层。

## 5. 数据结构

### 5.1 画布局部类型（`pages/front-design/types.ts` 追加）

```ts
// 批注条目
export interface DesignAnnotation {
  id: string          // 稳定 id
  selector: string    // 无空格 CSS 选择器（可被 mention 语法承载）
  description: string // 元素描述，如 button.primary
  comment: string     // 用户批注文本
  index: number       // 画布气泡编号（1 起）
  createdAt: number
}

export type PreviewIssueGroup = "runtime" | "a11y"
export type PreviewIssueLevel = "error" | "warning"

// 体检问题条目
export interface PreviewIssue {
  id: string          // runtime: `${message}|${source}`；a11y: `${rule}|${selector}`
  group: PreviewIssueGroup
  level: PreviewIssueLevel
  rule?: A11yRuleId   // 仅 a11y
  message: string     // 已按当前语言格式化
  instruction: string // 回流给 Agent 的定向指令（已按当前语言格式化）
  selector?: string   // a11y 定位选择器（无空格路径）
  detail?: string     // 堆栈 / 对比度实测值
  count: number       // 出现次数（runtime 去重后）
}

export type A11yRuleId =
  | "alt"
  | "accessible-name"
  | "contrast"
  | "target-size"
  | "form-label"
  | "lang"

// 审计原始发现（未格式化，便于单测）
export interface A11yFinding {
  rule: A11yRuleId
  level: PreviewIssueLevel
  selector?: string
  values?: Record<string, string | number>
}
```

### 5.2 设计系统令牌（`features/agent/hooks/designSystemStore.ts`）

```ts
export interface DesignSystemTokens {
  colors: string[]   // 色板，hex / 常规色值字符串
  radius: string     // 如 "8px"
  fontFamily: string // 如 "Inter, sans-serif"
  notes: string      // 风格约定自由文本
}

export const EMPTY_DESIGN_SYSTEM: DesignSystemTokens

export const designSystemStore: {
  subscribe(listener: () => void): () => void
  getTokens(): DesignSystemTokens
  setTokens(next: Partial<DesignSystemTokens>): void
  reset(): void
  isEmpty(tokens?: DesignSystemTokens): boolean
}
```

- localStorage key：`lx-agent-design-system-v1`，读取容错（坏 JSON → 空令牌），写入做长度钳制（colors ≤ 12、单值 ≤ 32、radius ≤ 24、fontFamily ≤ 120、notes ≤ 2000）。
- 与 `frontDesignStore` 同风格：模块级单例 + `subscribe` / `getState`，另提供 `useDesignSystem()` hook 供 UI 订阅。

### 5.3 预览错误缓冲（iframe 内）

```ts
interface RawPreviewError {
  level: "error" | "console"
  message: string
  source: string  // "file:line:col" / "unhandledrejection" / "console.error"
  detail: string  // stack
}
window.__lxPreviewErrors: RawPreviewError[]  // 上限 50 条，超出丢最旧
```

## 6. 交互设计

### 6.1 页面布局（新增右侧批注坞 + 底部体检条）

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Toolbar  [css|v3] [刷新]      [桌面|平板|移动]      [批注] [令牌] [目录] [主题] [复制] [清空] │
├──────────────────────────────────────────────┬────────────────────────────┤
│                                              │ 批注清单 (280px，可折叠)     │
│              画布 iframe                      │ ────────────────────────── │
│         （批注 pin ①②③ 钉在元素上）           │ #1 button.primary           │
│                                              │    "改为高对比色"  [发送][×] │
│                                              │ #2 form                      │
│                                              │    "间距太挤"      [发送][×] │
│                                              ├────────────────────────────┤
│                                              │ [发送全部 (2)]   [清空]      │
├──────────────────────────────────────────────┴────────────────────────────┤
│ 体检条  ⚠ 1 报错 · 4 可用性   [重新检测]  [展开]                            │
│ ┌ 展开后（最大 240px，内部滚动）──────────────────────────────────────────┐  │
│ │ ▸ 运行时报错(1)  □ TypeError: ... at script.js:12        [修复]        │  │
│ │ ▸ 可用性(4)      □ h1 对比度 2.1:1 (需 4.5:1)            [修复]        │  │
│ │                  □ img:nth-child(3) 缺少 alt            [修复]        │  │
│ │ [全选] [清空]                          [发给 Agent 修复 (n)]           │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

- 批注坞仅在「批注模式开启」或「清单非空」时出现；宽度固定 280px，不因内容变化（遵循布局尺寸稳定约束）。
- 体检条常驻画布底部；报错与可用性计数为 0 时显示 `未发现问题`（中性态）；生成中（isStreaming）暂停审计并显示 `生成中`。
- 所有样式走 `--color-theme-*` Token，圆角 6px，无渐变；文案全部 i18n。

### 6.2 批注评审（A）

1. 工具栏 `MousePointerClick` 按钮（或 Shift+Alt）开启批注模式，画布右侧出现批注坞。
2. **双框模型**：粉色悬停框（`data-annotation-hover`）始终跟随鼠标；蓝色选中框（`data-annotation-highlight`）在点击后常驻，只有「点击画布空白 / 选中其他元素 / 退出批注模式」才改变。两者可同时显示，互不干扰。
3. 悬停只负责指示；点击元素由 `generateElementSelector` 生成选择器；若动态注入了 `data-design-id`，则把改写后的 HTML 刷回 `frontDesignStore`（沿用现有行为，保证 mention 能命中）。
4. 点击即在元素旁弹出输入框：上方为元素信息栏（描述 + 实时尺寸），下方为 AgentInput 风格输入框（Enter 确认 / Shift+Enter 换行 / Esc 关闭）；关闭按钮位于输入框底部操作行。
5. 确认后：元素左上角钉编号 pin（圆形气泡），批注坞新增一条；选中框保持常驻。
6. pin 点击 = 打开同一输入框做编辑（含删除）；坞内条目支持编辑与删除；坞内条目 / 气泡 hover 走悬停框预览，移出后回落到选中框。
7. 底部「发送全部 (n)」；条目级「发送」只回流该条。发送后仅清空已发送条目，批注模式保持开启。
8. **ESC 分级规则**：编辑器打开时关闭编辑器 → 有选中元素时解除选中 → 无选中元素时首次按下仅 toast 提示，**连按两次（500ms 内）**才退出批注模式。

浮层与 pin 的 DOM 注入 iframe 文档（document 坐标绝对定位，滚动天然跟随），实现集中在 `utils/annotationOverlay.ts`；位置由 `ResizeObserver` 驱动自适应（目标尺寸变化、body 重建按选择器重绑、退化尺寸保留原位、首帧退化用点击点兜底）；文案由父层 `t()` 拼入注入字符串。

浮层外观（输入框 / 信息栏 / 按钮）取自应用当前主题：`utils/annotationEditorTheme.ts` 用离屏探针读取 `AgentInput` 底栏与裸按钮在**当前主题下的真实计算样式**（像素主题即自动获得直角、2px 黑描边、马赛克底纹、浮雕与主题字体），主题切换时通过 `applyTheme` 重建浮层样式表。选中框 / 悬停框 / 气泡的语义色仍是画布常量（粉色悬停、蓝色选中），因为它们是标注语义而非应用 UI。

### 6.3 画布体检（B + C）

- 预览加载完成后自动跑一次审计；`重新检测` 手动重跑；流式生成中跳过。
- 运行时错误由注入的守卫脚本采集，父层 1s 轮询读取缓冲并做 `mergePreviewErrors` 去重（key = `message|source`，`count` 取缓冲内分组长度，保证幂等）。
- 报错条目展示消息 + `source`，堆栈折叠在 `detail`；最多展示 10 条，标注溢出数量。
- 勾选后「发给 Agent 修复 (n)」→ 组装消息写入聊天输入框 + 切 design 协作模式 + 清空勾选。
- 审计与采集都只在「有 iframe 且非流式」时进行；切换设计 / 刷新后错误缓冲随 srcDoc 重建自动清空。

### 6.4 设计系统令牌（D）

- 工具栏 `SwatchBook` 按钮打开下拉面板（与主题菜单同风格）：色板 chips（输入 hex + 添加 + 删除）、圆角输入、字体输入、风格约定 textarea；底部「清空」。
- 面板显示注入预览提示：`design 模式下将随每条消息注入`。
- 非 design 模式不发注入；令牌为空时不注入。

## 7. 消息回流协议

### 7.1 批注（复用现有 mention → `<referenced_design target>` 链路）

```text
按以下批注修改（共 2 处）：
@design:abc123#[data-design-id=el-k2f9a] (button) 改为高对比色
@design:abc123#body>main>form:nth-child(2) (form) 间距太挤
```

- 每条批注一行 mention，注入层为每条产出 `<referenced_design target="...">` + `<target_element>`，Agent 输出对应数量的 `<front_design_update>`。
- 无选择器的条目（理论少见）降级为 `@design:abc123 (title) 说明`。
- 首行 `按以下批注修改（共 n 处）：` 走 i18n（`frontDesign.reviewMessageHeader`）。

### 7.2 体检问题

```text
按以下预览体检结果修复（共 2 项）：
@design:abc123#body>main>h1 (h1) 文本对比度 2.1:1，需 ≥ 4.5:1，请调整颜色
@design:abc123#body>main>img:nth-child(3) (img) 图片缺少 alt，请补充有意义的替代文本
```

- 有 selector 的条目按 mention 语法回填；无 selector（`lang` 缺失）走 `@design:abc123 (title) <说明>`。
- 报错类条目的 detail（堆栈）不塞进 mention 行，改为独立纯文本行，避免污染选择器解析。

### 7.3 设计系统注入块（`buildDesignReferenceBlocks`）

仅在 `collaborationMode === "design"` 且令牌非空时注入，排在所有设计块之前：

```text
<design_system>
Follow these design tokens for every generation and modification.
colors: #ec4899, #0b0f19
radius: 8px
font-family: Inter, sans-serif
notes: 卡片统一 rounded-lg border border-white/10
</design_system>
```

## 8. 文件清单

**新增（renderer）**

| 文件 | 职责 |
| :--- | :--- |
| `features/agent/hooks/designSystemStore.ts` | 令牌状态、localStorage 持久化、`useDesignSystem` |
| `features/agent/utils/designReviewComposer.ts` | 批注 / 体检问题 → mention 消息（纯函数，可测） |
| `pages/front-design/utils/contrast.ts` | 颜色解析、alpha 合成、相对亮度、对比度比值（纯函数） |
| `pages/front-design/utils/a11yAudit.ts` | 6 条规则审计 + 无变异路径选择器 `buildElementPathSelector` |
| `pages/front-design/utils/previewGuard.ts` | 错误采集守卫脚本字符串、`readPreviewErrors`、`mergePreviewErrors` |
| `pages/front-design/utils/annotationOverlay.ts` | iframe 内 pin / 高亮 / 批注输入浮层的注入与读写 |
| `pages/front-design/utils/issueFormat.ts` | `A11yFinding` → 展示文案 + 回流指令（i18n） |
| `pages/front-design/hooks/useDesignAnnotations.ts` | 批注模式编排（由 `useDesignInspector` 重命名升级） |
| `pages/front-design/hooks/useDesignChecks.ts` | 错误轮询、审计触发、勾选状态、计数 |
| `pages/front-design/components/FrontDesignAnnotationsPanel.tsx` | 右侧批注坞 |
| `pages/front-design/components/FrontDesignIssuesPanel.tsx` | 底部体检条 + 展开面板 |
| `pages/front-design/components/FrontDesignDesignSystemPanel.tsx` | 令牌编辑面板（工具栏下拉内容） |

**修改**

| 文件 | 变更 |
| :--- | :--- |
| `pages/front-design/FrontDesignPage.tsx` | 装配批注坞 / 体检条 / 令牌面板，发送动作编排 |
| `pages/front-design/components/FrontDesignToolbar.tsx` | 新增令牌按钮；批注按钮 Tooltip 文案更新 |
| `pages/front-design/hooks/useDesignPreview.ts` | `<head>` 追加错误采集守卫脚本 |
| `pages/front-design/types.ts` | 追加第 5.1 节类型 |
| `features/agent/utils/designReferenceInjection.ts` | 注入 `<design_system>` 块 |
| `i18n/locales/zh/frontDesign.ts` / `i18n/locales/en/frontDesign.ts` | 新增文案键 |

**删除**

| 文件 | 原因 |
| :--- | :--- |
| `pages/front-design/hooks/useDesignInspector.ts` | 被 `useDesignAnnotations.ts` 取代（重命名升级，不留旧文件） |

## 9. 实现要点

1. **错误采集时机**：守卫脚本注入 `<head>` 顶部，早于 body 脚本；父层首次读取在 `onLoad`（补捞早期错误），此后 1s 轮询。父层去重 key 幂等，重复轮询不会虚增 `count`。
2. **`console.error` 拦截**：保留原实现并转发，采集时 `map(arg => arg?.message ?? String(arg)).join(" ")`，单条截断 600 字符，整个缓冲上限 50 条。
3. **对比度规则**：取元素自身文本节点的计算色，向上穿透祖先寻找首个非透明背景色并按 alpha 合成；`font-size ≥ 24px` 或 `≥ 18.66px 且 bold` 视为大字（阈值 3:1，否则 4.5:1）；跳过不可见（`display:none` / `visibility:hidden` / `opacity:0` / 零尺寸）元素。
4. **无变异选择器**：审计用 `buildElementPathSelector`（`tag:nth-child(n)` 路径、`>` 无空格拼接）生成，绝不向设计 DOM 注入属性，避免与已落盘 HTML 失配。
5. **审计上限**：单规则最多 5 条、总计最多 20 条，超出在面板标注「已截断」。
6. **审计容器**：只扫描 `document.body` 子树，跳过 `[data-design-id]` 之外的注入节点（`lx-sandbox-guard` 等 `#lx-*` id 前缀节点）。
7. **发送动作**：`agentApi.setCollaborationMode("design", sessionId, tabId)`（失败不阻断）+ `agentTabStore.insertPromptToActiveTab(message)`，与现有 inspector 行为一致。
8. **子文件体量**：`useDesignAnnotations.ts` 预计 300 行内，`annotationOverlay.ts` 350 行内，均低于 500 行上限；超限再按职责拆。

## 10. 测试策略

| 测试 | 覆盖 |
| :--- | :--- |
| `test/renderer/pages/front-design/contrast.test.ts` | hex/rgb/rgba 解析、alpha 合成、相对亮度、比值（含阈值边界 4.5 / 3.0） |
| `test/renderer/pages/front-design/a11yAudit.test.ts` | 6 条规则各自命中与不命中的最小 DOM（jsdom + 内联样式，因 jsdom 不应用样式表）、`buildElementPathSelector` 无空格且可被 `querySelector` 命中、注入节点被跳过、数量截断 |
| `test/renderer/pages/front-design/previewIssues.test.ts` | 错误缓冲去重幂等、count 取分组长度、上限与截断、`console.error` 与 `unhandledrejection` 归一化 |
| `test/renderer/pages/front-design/issueFormat.test.ts` | `A11yFinding` → 文案与指令（zh/en 两套 key 存在且无缺键） |
| `test/renderer/features/agent/designReviewComposer.test.ts` | mention 消息格式、无选择器降级、批注/体检两类头行、选择器含空格时不进 mention 走降级、空列表返回空串 |
| `test/renderer/features/agent/designSystemInjection.test.ts` | 令牌非空 + design 模式才注入、排在设计块之前、空令牌/非 design 模式不注入、notes 换行折行 |
| `test/renderer/pages/front-design/annotationLayer.test.ts` | 图层归属判定（跨文档 / body 重建必须重建）、气泡与编号、信息栏与底部关闭按钮、空内容校验、Enter/Esc、双框并存与配色、预览回落、锚点重绑、退化尺寸不跳左上角、ResizeObserver 重排、销毁清理 |
| `test/renderer/pages/front-design/annotationEditorTheme.test.ts` | 像素主题映射（直角/描边/底纹/浮雕/字体/按钮）、默认主题逐项回退、透明底色兜底、探针必须在读取期间仍挂载 |

- 验证命令：`pnpm test`（受影响文件）→ `pnpm typecheck` → `pnpm lint`（biome）。
- 未纳入单测（iframe 交互编排、pin 浮层、面板组件交互）通过 `docs/feature/front-design-review-loop/task.md` 的手工验收清单确认；不额外引入 jsdom iframe 测试脚手架。

## 11. 风险与取舍

| 风险 | 说明 | 处置 |
| :--- | :--- | :--- |
| 审计选择器与落盘 HTML 失配 | 审计读取的是运行中 iframe DOM，落盘 HTML 是 `sanitizeHtmlDocument` 后的版本 | 用无变异路径选择器；结构路径不依赖属性注入，实测以手工验收确认 |
| jsdom 无样式表计算 | jsdom 的 `getComputedStyle` 不解析 class 样式，对比度单测只能用内联样式 | 对比度核心逻辑独立成纯函数（`contrast.ts`）做完整覆盖，审计规则层只验证命中与选择器 |
| 画布内浮层样式无法用应用 Token | iframe 内没有应用样式表 | 沿用现有 inspector 粉色常量与父层 `t()` 文案注入；在代码注释标明该例外 |
| 轮询开销 | 1s 轮询读数组 | 数组上限 50 条、仅页面挂载且有 iframe 时运行；成本可忽略 |
| 生成中审计噪音 | 流式过程中 DOM 不稳定 | 流式期间跳过审计与错误展示，面板显示「生成中」 |
| 令牌注入放大 token 消耗 | 每条 design 消息头部多一个块 | 令牌为空不注入；字段长度钳制；实际增量 < 200 token |
| 探针耦合 AgentInput 类名 | 浮层外观以 `.agent-input-container` 为参考钩子，改名会让主题读取静默回退默认值 | 回退值即默认主题观感，不会报错；类名变更时同步更新 `annotationEditorTheme.ts` |
| 计算样式是活动对象 | 探针脱离文档后 `getComputedStyle` 取值会变为空串（真实浏览器行为，jsdom 桩不可见），曾导致像素主题完全不生效 | 已改为探针挂载期间读取全部字段，`finally` 清理；新增「读取期间探针必须在文档内」回归用例 |
| 前台无法覆盖全部主题组合 | 主题 × 面板 × 双框组合多，自动化只覆盖样式映射与状态机 | 交付后由使用者在默认 / 像素两套主题下手工验收 |

## 12. 交付后细化记录（v1.1）

初版交付后按试用反馈迭代，最终语义以本节为准：

| 项 | 初版 | 最终 |
| :--- | :--- | :--- |
| 点选后选中框 | 点击即插 mention 到聊天框（旧 Inspector） | 点击写批注 → 输入框 + 常驻蓝色选中框 |
| 选中框数量 | 单框切换配色 | 粉色悬停框 + 蓝色选中框双框并存 |
| 选中框生存期 | 关闭输入框即消失 | 常驻；点空白 / 改选 / 退出模式才解除 |
| ESC | 单次退出批注模式 | 编辑器 → 选中 → 双击退出模式（首次 toast 提示） |
| 输入框外观 | 自绘深色卡片，字号/圆角/描边硬编码 | 对齐 AgentInput 底栏，外观取自当前应用主题（像素主题自动换肤） |
| 关闭按钮位置 | 信息栏右侧（顶部） | 输入框底部操作行 |
| 标记自适应 | 无 | ResizeObserver 重排（高亮框 / 气泡 / 输入框 + 尺寸文案） |
| 退化与失效兜底 | 无（会贴左上角） | 保留原位 / 按选择器重绑 / 点击点兜底 |
| Toast 方位 | agent-top（设计页无该容器，实际看不到） | breadcrumb（由 HeaderSideBar 统一渲染） |

修复清单（均已含回归用例）：

1. 僵尸图层：`isAttached()` 只校验自身闭包文档，srcDoc 加载替换文档后仍判定可用 → 改为 `isAttachedTo(target)` 同时校验文档与挂载。
2. 标记不自适应：容器高度变化时标记不跟随 → ResizeObserver + body 重建重绑。
3. 浮层贴左上角：0×0 元素被按退化坐标定位 → 保留原位 + 点击点兜底。
4. 选中框消失 / 无法自由改选：单框切换语义 → 双框模型。
5. 像素主题不生效：计算样式读取时序错误（探针提前移除）→ 挂载期间读取。

## 13. 后续变更

**v1.2（front-design-iteration-toolkit 轮）**：设计系统令牌（D）已按产品决策整体移除 —— 令牌编辑面板、`designSystemStore` 持久化、design 消息 `<design_system>` 注入、相关 i18n 文案与测试全部删除；批注 / 体检链路不受影响。如需恢复可从 git 历史取回（实现提交见 `docs/feature/front-design-iteration-toolkit/task.md` 执行记录）。

**选中框生存期调整（同轮）**：批注确认提交后蓝色选中框随输入框一并解除（选中内容已被消费）；取消关闭（关闭按钮 / ESC）仍保留选中态。第 12 节「常驻」表述按此调整。


