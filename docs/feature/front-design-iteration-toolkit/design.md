# Front Design 画布对照与元素检查 设计

> 范围说明：本设计最初规划四项能力（A 版本对照 / B 元素检查 / C 令牌提取 / D 快捷迭代）。执行期按产品决策移除 C、D，并整体回滚上一轮评审闭环的「设计系统令牌」能力；**最终交付仅 A + B**。变更记录见第 12 节。

在既有「评审闭环」（批注 / 体检）之上补齐两个画布能力：**版本对照**与**元素检查**。主题是「看决策、写精确批注」：对照解决选版依据，检查解决批注精度。

## 1. 目标

- **A 版本对照**：同一版本族内任选两个版本左右并排预览，主画布保持可交互（批注 / 体检），对照窗只读。
- **B 元素检查器**：批注编辑器打开时展示选中元素的计算样式摘要（间距 / 字体 / 颜色 / 圆角 / 边框），让批注有具体数值依据。

## 2. 非目标

- 不做令牌面板与 `<design_system>` 注入：上一轮评审闭环的令牌能力已按产品决策整体移除（C 随之移除）。
- 不做快捷迭代动作下拉（原 D 已移除），不新增任何消息模板协议。
- 不做像素级 diff / 叠图对比 / 差异高亮。
- 不做元素直接编辑（Figma 式改属性、拖拽、就地改文案），一切修改仍由 Agent 执行。
- 不做导出 HTML / 截图 / 分享（需要新增 IPC）。
- 不做画布缩放、多屏总览看板、动效时间线。
- 对照窗不接受批注 / 体检；对照选择与开关不持久化（页面会话内存态）。
- 不新增 IPC channel、不改 preload / shared / 数据库 / main 与 main-agent 提示词；不动 `@design` mention 协议语义（只复用）。

## 3. 决策记录（grill 结论）

| # | 决策 | 结论 |
| :- | :--- | :--- |
| 1 | 范围（初版） | A + B + C + D 全做；E 导出不做（需新 IPC） |
| 2 | 对照语义 | 主画布可交互 + 对照窗只读；对照对象为同族另一版本（默认前一版，首版取后一版）；两窗共用主题与视口；单版本禁用并 Tooltip 说明 |
| 3 | 提取合并语义（随 C 移除作废） | 色板整体替换；圆角 / 字体有值才替换；半透明不进色板；前 8 色 |
| 4 | 快捷迭代交互（随 D 移除作废） | 工具栏下拉 5 动作；只插入输入框不自动发送 |
| 5 | 测试深度 | 纯函数全覆盖 + 组件测试 + 批注图层扩展 + 页面接线测试；不建 iframe e2e |
| 6 | 工作区与提交 | 工作区 `.worktrees/feat-front-design-iteration-toolkit`；功能提交按阶段拆分；校验通过后询问用户再合并回 dev |
| 7 | 范围回滚（执行期） | 移除 C（令牌提取）与 D（快捷迭代），并整体回滚上一轮「设计系统令牌」：面板 / 存储 / 注入 / 文案 / 测试全删；最终交付 A + B |

## 4. 现状约束（已核查）

- 页面装配：`FrontDesignPage.tsx` 左列 = `FrontDesignCanvas` + `FrontDesignIssuesPanel`，右列 = 批注坞；对照窗在左列内再切一个横向 flex 行。
- 预览文档构建：`useDesignPreview.ts:112-147` 内联生成 sanitized doc（Tailwind 编译样式 + 主题覆盖 + 沙箱守卫 + 错误守卫 + dark 类）；A 需要复用，已抽成 `buildPreviewDocument` 纯函数。
- Tailwind 编译：`agentApi.compileTailwind(html): Promise<string>`，主预览 150ms 防抖；对照窗按同一策略编译自己那份 HTML。
- 版本族：`frontDesignStore.getDesignVersions(id)` 返回按 `version` 升序的整族；`FrontDesignItem` 含 `html / mode / version / title / updatedAt`。
- 批注编辑器：`annotationOverlay.ts:435-548` 挂载 DOM（meta 行 = 描述 + 实时尺寸；box = textarea + hint + 动作行）；浮层样式表由 `buildEditorStyle(theme)` 生成；文案经 `AnnotationLayerLabels` 由父层 `t()` 注入；`EDITOR_ESTIMATED_HEIGHT = 168` 仅作翻转定位兜底。
- 字号约束：`test/renderer/pages/front-design/frontDesignFontPresets.test.ts` 禁止 front-design 目录出现 `font-size: Npx`（CSS）与 `fontSize: N`（对象字面量），允许 `el.style.fontSize = "11px"` 赋值形式。
- 回流通道：`agentApi.setCollaborationMode("design", sessionId, tabId)`（失败不阻断）+ `agentTabStore.insertPromptToActiveTab(message)`；mention 消息由 `designReviewComposer.ts` 纯函数生成（选择器不能含空格/括号）。
- 颜色工具：`contrast.ts` 提供 `parseColor` 与新增 `formatHexColor`（rgb → hex）。
- 主题与文案：组件样式走 `--color-theme-*` Token；全部 UI 文案必须 i18n；禁止原生 `title`，统一 `LxTooltip`。

## 5. 数据结构

### 5.1 元素样式摘要（`pages/front-design/utils/elementStyles.ts`）

```ts
export type ElementStyleKey =
  | "padding"
  | "margin"
  | "font"
  | "color"
  | "background"
  | "radius"
  | "border"

// 元素计算样式摘要：无意义字段为 null，由渲染层跳过。
export interface ElementStyleSummary {
  padding: string | null   // 折叠 shorthand，如 "8px 16px"
  margin: string | null
  font: string | null      // "14px/20px 600"
  color: string | null     // hex；半透明保留 rgba 原值
  background: string | null
  radius: string | null
  border: string | null    // "1px solid #e5e7eb"
}
```

## 6. 交互设计

### 6.1 布局

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Toolbar [css|v3] [刷新] [对照]   [桌面|平板|移动]   [批注] [目录] [主题] [复制] [清空] │
├──────────────────────────────────────┬────────────────────────────────────┤
│ 主画布（可交互）                       │ 对照窗（只读）                      │
│   批注 / 体检都作用于这里              │ ┌ 对照版本 [v2 ▾]           [×] ┐  │
│                                      │ │                              │  │
│                                      │ │        静态 iframe            │  │
├──────────────────────────────────────┤ │                              │  │
│ 体检条                                │ └──────────────────────────────┘  │
└──────────────────────────────────────┴────────────────────────────────────┘
```

- 工具栏新增 `Columns2` 对照开关（紧跟刷新按钮）；对照窗固定占左列宽度的 50%（`flex-1` 双栏 + 竖向分隔边框）。
- 布局尺寸稳定：只有对照开关切换才改变分栏，不因内容或 hover 抖动。

### 6.2 A 版本对照

1. 对照按钮在 `availableVersions.length < 2` 或无 HTML 时禁用 / 隐藏，Tooltip 说明原因（`需要至少两个版本才能对照`）。
2. 开启时取默认对照版本：`pickDefaultCompareDesign(versions, activeDesignId)` —— 优先取版本号紧邻的前一版；当前是首版时取下一版；无候选返回 `null`。
3. 对照窗头部：`对照版本` 标签 + 版本下拉（复用工具栏版本菜单的 `LxTooltip click` + 按钮模式，排除当前主画布版本）+ 关闭按钮。
4. 对照窗 iframe 为静态 `srcDoc`：仅在选中版本 / 主题变化时重建；流式生成期间主画布实时刷新，对照窗保持稳定参照。
5. 主题与视口：两窗共用 `effectiveMode` 与 `viewportWidthClass`；对照窗不挂批注图层、不参与体检。
6. 主画布切换版本导致对照目标失效（不在族内或等于主版本）时，自动重选默认对照版本；无候选则关闭对照。

### 6.3 B 元素检查器

1. 批注编辑器打开时（点击元素或点气泡编辑），读取锚点元素计算样式，在 meta 行与输入框之间渲染 `.lx-ann-styles` 摘要块。
2. 摘要行（按此顺序，空值跳过）：`内边距 / 外边距 / 字体 / 文字色 / 背景色 / 圆角 / 边框`；颜色行带 9px 色块。
3. 折叠规则：间距全 0 跳过；字体显示 `字号/行高`，字重 < 600 省略；背景透明跳过；边框宽度 0 跳过；颜色归一化为 hex，半透明保留 rgba 原值。
4. **浮层表面统一**：信息条、样式摘要与输入框共用 `.lx-ann-surface`（实心主题底色 / 描边 / 圆角 / 底纹 / 阴影 / 字体），避免半透明底色被设计稿内容穿透；像素主题自动获得直角 / 2px 描边 / 马赛克底纹。
5. 只读展示，不做复制按钮；样式块高度计入浮层翻转定位（实测高度，常量仅兜底）；锚点被 body 重建替换时按选择器重绑并刷新摘要。

## 7. 消息协议

本轮不新增任何消息协议：批注与体检继续复用既有 `@design` mention 与回流链路。

## 8. 文件清单

**新增（renderer）**

| 文件 | 职责 |
| :--- | :--- |
| `pages/front-design/utils/previewDocument.ts` | `buildPreviewDocument`：从 `useDesignPreview` 抽出的纯函数文档构建（主题覆盖 / 沙箱守卫 / 可选错误守卫 / Tailwind 样式注入 / dark 类） |
| `pages/front-design/utils/compareSelection.ts` | `pickDefaultCompareDesign` 默认对照版本选择 |
| `pages/front-design/utils/elementStyles.ts` | `summarizeElementStyles` + 间距 shorthand 折叠 |
| `pages/front-design/hooks/useComparePreview.ts` | 对照窗文档：Tailwind 编译防抖 + 静态 srcDoc |
| `pages/front-design/components/FrontDesignComparePane.tsx` | 对照窗：头部版本下拉 + 只读 iframe |

**修改**

| 文件 | 变更 |
| :--- | :--- |
| `pages/front-design/FrontDesignPage.tsx` | 对照状态与分栏装配 |
| `pages/front-design/components/FrontDesignToolbar.tsx` | 对照开关按钮 |
| `pages/front-design/hooks/useDesignPreview.ts` | 改用 `buildPreviewDocument`，删除内联文档构建 |
| `pages/front-design/utils/annotationOverlay.ts` | 编辑器样式摘要块与统一实体表面；翻转定位改用实测高度 |
| `pages/front-design/utils/contrast.ts` | 新增 `formatHexColor(RgbaColor)` |
| `i18n/locales/{zh,en}/frontDesign.ts` | 新增对照 / 检查文案键 |

**移除（执行期回滚）**

| 文件 | 原因 |
| :--- | :--- |
| `features/agent/hooks/designSystemStore.ts` | 设计系统令牌能力整体移除 |
| `pages/front-design/components/FrontDesignDesignSystemPanel.tsx` | 令牌编辑面板移除 |
| `pages/front-design/components/FrontDesignIteratePanel.tsx` | 快捷迭代下拉移除 |
| `pages/front-design/utils/tokenExtraction.ts` | 画布令牌提取移除 |
| `features/agent/utils/designReferenceInjection.ts` 中的 `buildDesignSystemBlock` / `designTokens` 选项 / `<design_system>` 注入 | 令牌注入移除（文件保留其余设计引用注入逻辑） |
| `test/renderer/features/agent/designSystemInjection.test.ts`、`test/renderer/pages/front-design/tokenExtraction.test.ts`、`test/renderer/pages/front-design/FrontDesignIteratePanel.test.tsx` | 对应测试随功能移除 |
| `designReviewComposer.ts` 中的 `DesignIterateActionId` / `buildIterateMessage` | 快捷迭代消息编译移除 |

## 9. 实现要点

1. **文档构建抽取零行为变化**：`buildPreviewDocument` 逐字复刻现有拼接顺序（sandbox guard → error guard → theme override → tailwind），主预览保持 `withErrorGuard: true`；对照窗传 `false`。
2. **对照窗静态化**：对照 iframe 不做增量 body 替换，仅按 `designId + effectiveMode` 重建，规避双份增量逻辑与批注图层保留问题。
3. **jsdom 限制**：`getComputedStyle` 不解析样式表，B 的单测使用内联样式与假视图驱动（与既有 `a11yAudit` 测试同一策略）。
4. **字号预设**：浮层新增字号一律用 `style.fontSize = "11px"` 赋值形式，CSS 表内不写 font-size，保持 `frontDesignFontPresets` 测试通过。
5. **翻转定位**：`positionEditor` 用 `editorElement.offsetHeight` 实测高度，取不到（jsdom = 0）时回退 `EDITOR_ESTIMATED_HEIGHT`。
6. **像素主题**：`.lx-ann-surface` 的全部取值来自 `AnnotationEditorTheme`（由 `readAnnotationEditorTheme` 从 `.agent-input-container` 探针读取），主题切换时经 `applyTheme` 重建样式表。
7. **巡检**：删除功能后全仓检索无 `designSystem` / `iterate` / `tokenExtraction` 残留（仅剩无关的 `frontDesign.iterateAction` 卡片按钮文案与 main 提示词）。

## 10. 测试策略

| 测试 | 覆盖 |
| :--- | :--- |
| `test/renderer/pages/front-design/previewDocument.test.ts` | 主题覆盖 / 沙箱守卫 / 错误守卫开关 / Tailwind 样式注入 / dark 类增删 / 片段输入 |
| `test/renderer/pages/front-design/compareSelection.test.ts` | 默认对照：取前一版 / 首版取后一版 / 单版本 null / 非法 id 兜底 |
| `test/renderer/pages/front-design/elementStyles.test.ts` | 间距 shorthand 折叠（1/2/3/4 值与全 0）、字号 / 行高 / 字重折叠、hex 归一化、半透明保留、边框格式化、合成文档返回空 |
| `test/renderer/pages/front-design/annotationLayer.test.ts`（扩展） | 样式摘要块渲染（标签 + 值 + 色块）、空值行跳过、表面类归属、重定位刷新 |
| `test/renderer/pages/front-design/FrontDesignComparePane.test.tsx` | 版本下拉列出候选、选择与关闭回调、iframe srcDoc 含选中版本 HTML |
| `test/renderer/features/agent/FrontDesignPage.compare.test.tsx` | 页面接线：开启出现第二个 iframe（默认前一版）、关闭移除、单版本禁用 |
| `test/renderer/features/agent/designReviewComposer.test.ts` | 既有批注 / 体检消息编译回归 |

- 验证命令：`pnpm exec vitest run test/renderer/pages/front-design test/renderer/features/agent` → `pnpm typecheck` → `pnpm lint`。
- 不引入 iframe 端到端脚手架；对照窗真实渲染与浮层观感由手工验收确认。

## 11. 风险与取舍

| 风险 | 说明 | 处置 |
| :--- | :--- | :--- |
| 对照窗双 iframe 开销 | 两个沙箱文档各自跑脚本与 Tailwind 编译 | 对照窗静态化 + 仅在开启时挂载；编译按 html 防抖；单版本时按钮禁用 |
| 对照窗与主画布版本混淆 | 两窗显示不同版本，用户可能改错对象 | 对照窗头部常显版本号 + 只读标识；批注 / 体检只作用主画布 |
| 样式摘要加高浮层 | 编辑器变高可能超出视口 | 翻转定位改用实测高度；退化时保留原位（既有兜底逻辑） |
| jsdom 与真实浏览器差异 | 计算样式、offsetHeight 在 jsdom 行为受限 | 纯函数覆盖核心逻辑；真实观感走手工验收 |
| 令牌能力回滚影响面 | 上一轮评审闭环的令牌注入被移除，相关文案与测试删除 | 已全仓检索确认无残留；`front-design-review-loop` 文档补记移除说明；如需恢复可从 git 历史取回 |
| 浮层与设计稿的可读性 | 半透明表面曾被设计稿内容穿透（验收发现） | 统一 `.lx-ann-surface` 实心表面，默认主题与像素主题均已覆盖 |

## 12. 变更记录（执行期）

| 提交 | 变更 |
| :--- | :--- |
| `15fc311f` | 验收反馈：批注信息条与样式摘要改用实心主题表面 `lx-ann-surface`，标签 / 数值改用主题前景色，长值省略号截断，像素主题自动适配 |
| `23707ac6` | 范围回滚：移除 C 令牌提取与 D 快捷迭代，并整体移除上一轮「设计系统令牌」（面板 / 存储 / 注入 / i18n / 测试），最终交付 A 版本对照 + B 元素检查 |
| `632a6206` | 验收反馈：批注确认提交后解除蓝色选中框（选中内容已被消费）；取消关闭（关闭按钮 / ESC）仍保留选中态 |

交付：`7e02ca93 Merge branch 'feat/front-design-iteration-toolkit' into dev`（`--no-ff`），合并后工作区与分支已清理，`dev` 复跑目标套件全过。

## 13. 调研来源（2026-09）

| 平台 | 借鉴点 |
| :--- | :--- |
| Figma (Config 2026) | 多方向并排对照、Dev Mode 元素检查 |
| v0 (Vercel) | Design Mode 可视化微调、版本历史 |
| Lovable | Visual Edits、版本回滚 |
| Bolt | 设计系统约束生成（本轮未引入） |
