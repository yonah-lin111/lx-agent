# Front Design 画布对照与元素检查 任务拆解

> 设计：`docs/feature/front-design-iteration-toolkit/design.md`
> 工作区：`.worktrees/feat-front-design-iteration-toolkit`（分支 `feat/front-design-iteration-toolkit`，从 `dev` 切出）
> 说明：grill 6 项决策已确认（设计第 3 节）；执行期按产品决策回滚 C/D 与既有「设计系统令牌」，最终交付 **A 版本对照 + B 元素检查**。T0-T13 全部完成：已合并回 `dev`（`7e02ca93`），工作区与分支已清理。

## 阶段 0：工作区准备

### T0 创建 git 工作区

- **步骤**
  1. `git worktree add .worktrees/feat-front-design-iteration-toolkit -b feat/front-design-iteration-toolkit dev`
  2. 工作区内执行 `node scripts/setupWorktreeNodeModules.mjs`（链接主仓库 `node_modules`）。
- **期望**：工作区独立可跑测试与构建；设计 / 任务文档留在主工作区 `docs/feature/`，不随功能提交入库。

## 阶段 1：文档构建抽取（前置重构）

### T1 `buildPreviewDocument` 纯函数

- **步骤**
  1. 新建 `utils/previewDocument.ts`：迁入 `applyHtmlThemeClass`，实现 `buildPreviewDocument(html, { effectiveMode, compiledTailwindCss, withErrorGuard })`，逐字复刻现有拼接顺序。
  2. `useDesignPreview.ts` 删除内联构建，改调纯函数（`withErrorGuard: true`）。
- **期望**：主预览渲染结果零变化；既有 `useDesignPreview` 测试全绿。

## 阶段 2：A 版本对照

### T2 对照选择纯函数

- **步骤**
  1. 新建 `utils/compareSelection.ts`：`pickDefaultCompareDesign(versions, activeId)`（前一版 → 首版取后一版 → 无候选 null）。
- **期望**：边界（单版本 / 非法 id / 首版 / 中间版）行为确定且可测。

### T3 对照窗 Hook 与组件

- **步骤**
  1. 新建 `hooks/useComparePreview.ts`：按 `html + mode + effectiveMode` 防抖编译 Tailwind，输出静态 `srcDoc`。
  2. 新建 `components/FrontDesignComparePane.tsx`：头部（`对照版本` 标签 + 版本下拉 + 关闭）+ 只读 iframe。
- **期望**：切换对照版本即重建 iframe；无批注图层、无体检。

### T4 页面与工具栏装配

- **步骤**
  1. `FrontDesignToolbar` 新增 `Columns2` 对照开关（`availableVersions.length < 2` 禁用 + Tooltip 原因）。
  2. `FrontDesignPage`：`compareDesignId` 状态、默认选择、失效重选 / 关闭、左列横向分栏。
- **期望**：开 / 关 / 换版本 / 主版本切换后对照窗状态自洽；主画布交互不受影响。

## 阶段 3：B 元素检查器

### T5 样式摘要

- **步骤**
  1. `contrast.ts` 新增 `formatHexColor(RgbaColor)`。
  2. 新建 `utils/elementStyles.ts`：`summarizeElementStyles(element)` + 间距 shorthand 折叠 + 空值跳过规则。
  3. `annotationOverlay.ts`：编辑器挂载 `.lx-ann-styles` 摘要块；`positionEditor` 改用实测高度、回退常量；重定位时刷新摘要。
  4. 验收反馈修复：信息条 / 样式摘要 / 输入框统一 `.lx-ann-surface` 实心主题表面，修复半透明底被设计稿穿透。
- **期望**：点击元素 / 点气泡编辑都展示样式摘要；无值行不出现；默认与像素主题下均清晰可读。

## 阶段 4：令牌提取与快捷迭代（已按产品决策回滚）

### T6 令牌提取（曾实现，已回滚）

- **步骤（当时）**：`types.ts` 追加 `ExtractedDesignTokens`；新建 `utils/tokenExtraction.ts`；令牌面板新增「从画布提取」。
- **结果**：随 T7R 整体移除（`git log 97ecc26f` 可查实现）。

### T7 快捷迭代（曾实现，已回滚）

- **步骤（当时）**：`buildIterateMessage` + `FrontDesignIteratePanel` + 工具栏 Sparkles 下拉 + 页面处理器。
- **结果**：随 T7R 整体移除（`git log c770e4fc` 可查实现）。

## 阶段 5：执行期范围回滚

### T7R 移除快捷迭代与设计系统令牌

- **步骤**
  1. 删除 `FrontDesignIteratePanel.tsx`、`buildIterateMessage` / `DesignIterateActionId`、工具栏 Sparkles 下拉与页面处理器、相关 i18n 与测试。
  2. 整体移除上一轮「设计系统令牌」：`designSystemStore.ts`、`FrontDesignDesignSystemPanel.tsx`、`tokenExtraction.ts`、`<design_system>` 注入（`designReferenceInjection.ts` 的 `buildDesignSystemBlock` / `designTokens` 选项）、相关 i18n 与测试。
  3. 全仓检索确认无 `designSystem` / `iterate` / `tokenExtraction` 残留。
- **期望**：工具栏为 `[版本][刷新][对照][视口][Inspector][目录][主题][复制][清空]`；批注 / 体检 / 对照链路零影响。

## 阶段 6：文案

### T8 i18n

- **步骤**
  1. `i18n/locales/zh/frontDesign.ts` / `en/frontDesign.ts`：保留对照与元素检查文案；移除 iterate / designSystem 全部键。
- **期望**：zh / en 一一对应；无硬编码中文；无原生 `title`。

## 阶段 7：测试

### T9 纯函数与浮层测试

- **步骤**
  1. 新增 `previewDocument.test.ts`、`compareSelection.test.ts`、`elementStyles.test.ts`。
  2. 扩展 `annotationLayer.test.ts`（摘要块渲染 / 空值跳过 / 表面类归属 / 重定位刷新）。
- **期望**：覆盖设计第 10 节纯函数断言点。

### T10 组件与页面接线测试

- **步骤**
  1. 新增 `FrontDesignComparePane.test.tsx`、`FrontDesignPage.compare.test.tsx`（对照装配）。
  2. 回归 `FrontDesignPage.test.tsx`、`designReviewComposer.test.ts` 等既有测试。
- **期望**：对照主链路（开关 → 面板 → 回调）可断言；无既有测试回归。

## 阶段 8：校验

### T11 精确校验

- **步骤**
  1. `pnpm exec vitest run test/renderer/pages/front-design test/renderer/features/agent`
  2. `pnpm typecheck`
  3. `pnpm lint`（必要时 `pnpm format`）
- **期望**：全绿；front-design 字号预设测试保持通过。

## 阶段 9：交付

### T12 手工验收（由用户执行）

- **步骤**
  1. `pnpm dev`，进入前端设计看板（存在 ≥ 2 个版本）。
  2. 对照：开 / 关、换对照版本、切主版本、切主题与视口、流式生成时对照窗稳定性。
  3. 检查：批注模式点选元素，确认样式摘要数值与浏览器 DevTools 一致；默认与像素主题下核对信息条 / 摘要块可读性。
  4. 回归：批注发送、体检发送、复制代码、清空画布、打开工程目录。
- **期望**：主链路与观感符合设计第 6 节；无控制台异常。
- **结果**：用户完成两轮验收并反馈两项问题，均已修复（浮层可读性 `15fc311f`、确认后蓝色选中框残留 `632a6206`）；最终验收通过。

### T13 提交与合并确认

- **步骤**
  1. 工作区内 `git status` / `git diff` 复核，仅提交代码与测试。
  2. 分阶段提交（重构 / 对照 / 检查 / 回滚 / 验收修复）。
  3. 询问用户是否合并回 `dev`（`git merge --no-ff`），合并后移除工作区与分支。
  4. 在主工作区提交设计 / 任务文档（docs 提交，与实现分离）。
- **结果**
  1. 分支共 8 笔提交（见下表）。
  2. 合并：`git merge --no-ff feat/front-design-iteration-toolkit` → `7e02ca93 Merge branch 'feat/front-design-iteration-toolkit' into dev`。
  3. 清理：`git worktree remove .worktrees/feat-front-design-iteration-toolkit` + `git branch -d feat/front-design-iteration-toolkit`（分支当时指向 `632a6206`）。
  4. 合并后 `dev` 复跑目标套件：101 文件 / 759 用例全过。
  5. 本设计 / 任务文档随本轮 docs 提交入库。

## 执行记录（T0-T13）

### 提交（`dev..feat/front-design-iteration-toolkit`）

| 提交 | 内容 |
| :--- | :--- |
| `ef1efdc3` | refactor(front-design): 抽取预览文档构建纯函数（previewDocument.ts + 测试迁移） |
| `4f8ae67f` | feat(front-design): 版本对照双栏只读预览 |
| `8fef8afa` | feat(front-design): 批注编辑器元素样式摘要（formatHexColor / elementStyles） |
| `97ecc26f` | feat(front-design): 画布设计令牌一键提取（**已回滚**） |
| `c770e4fc` | feat(front-design): 快捷迭代指令下拉（**已回滚**） |
| `15fc311f` | fix(front-design): 批注浮层信息条与样式摘要改用实心主题表面（验收反馈） |
| `23707ac6` | revert(front-design): 移除设计系统令牌与快捷迭代（含原 C 提取入口） |
| `632a6206` | fix(front-design): 批注确认后解除蓝色选中框（验收反馈） |

合并提交：`7e02ca93 Merge branch 'feat/front-design-iteration-toolkit' into dev`。

### 验证结果

| 项 | 结果 |
| :--- | :--- |
| `vitest run test/renderer/pages/front-design test/renderer/features/agent` | 101 文件 / 759 用例全过（合并后 `dev` 复跑同样全过） |
| `vitest run test/preload` / `test/shared` | 16 文件 / 26 用例、11 文件 / 35 用例全过 |
| `vitest run test/renderer` | 除既有 `pixelNavLevels` 失败外全过（基座 `dev` 同样复现） |
| `vitest run test/main` | `capabilityService` / `db/index` / `jobRegistry` / `agentRunner` 失败，均在基座 `dev` 同样复现（既有失败，非本次回归） |
| `pnpm typecheck` | 通过（node + web） |
| `pnpm lint` | 通过（1375 文件） |

### 实现期修正（相对设计稿）

| 项 | 设计稿 | 实际 |
| :--- | :--- | :--- |
| 令牌提取「文字色」 | 直接统计计算色 | 增加父级比对，排除继承噪音（功能已回滚） |
| 字体提取 | body 字体栈首项 | 额外排除默认字体族（功能已回滚） |
| 浮层可读性（验收反馈） | 信息条蓝色半透明、样式摘要黑色半透明底 | 统一复用输入框实心主题表面 `lx-ann-surface`，标签与值改用主题前景色，长值省略号截断 |
| 选中框生存期（验收反馈） | 确认后选中框常驻，点击空白才解除 | 确认提交即解除（选中内容已被消费）；取消关闭（× / ESC）仍保留 |
| 范围（执行期） | A + B + C + D | 回滚为 A + B；移除 C/D 与上一轮令牌能力 |
