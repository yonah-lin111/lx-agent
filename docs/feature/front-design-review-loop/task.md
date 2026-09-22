# Front Design 评审闭环 任务拆解

> 设计：`docs/feature/front-design-review-loop/design.md`
> 工作区：`.worktrees/feat-front-design-review-loop`（分支 `feat/front-design-review-loop`，从 `dev` 切出）
> 交付：完成后提交，再询问用户是否合并回 `dev`

## 阶段 0：工作区准备

### T0 创建 git 工作区

- **步骤**
  1. `git worktree add .worktrees/feat-front-design-review-loop -b feat/front-design-review-loop dev`
  2. 确认工作区内依赖可用（必要时 `pnpm install` / `node scripts/setupWorktreeNodeModules.mjs`）。
- **期望**：工作区独立可构建，主工作区 `dev` 不产生任何改动。

## 阶段 1：设计系统令牌（D）

### T1 `designSystemStore`

- **步骤**
  1. 新建 `src/renderer/src/features/agent/hooks/designSystemStore.ts`：`DesignSystemTokens`、`EMPTY_DESIGN_SYSTEM`、localStorage 读写（key `lx-agent-design-system-v1`，坏 JSON 容错）、`setTokens` / `reset` / `isEmpty`、`subscribe` + `useDesignSystem`。
  2. 长度钳制：colors ≤ 12（单值 ≤ 32 字符）、radius ≤ 24、fontFamily ≤ 120、notes ≤ 2000。
- **期望**：写入后刷新仍可读；非法 localStorage 内容不抛异常且退化为空令牌。

### T2 `<design_system>` 注入

- **步骤**
  1. 修改 `src/renderer/src/features/agent/utils/designReferenceInjection.ts`：`collaborationMode === "design"` 且令牌非空时，把 `<design_system>` 块插到返回数组首位（mentions 分支与 current_design 分支都要覆盖）。
  2. 块内固定英文引导句 + 逐字段行（空字段省略），notes 保留换行。
- **期望**：design 模式下每条消息头部都有令牌块；非 design 模式、空令牌时无任何新增内容（现有注入行为完全不变）。

### T3 令牌编辑面板

- **步骤**
  1. 新建 `src/renderer/src/pages/front-design/components/FrontDesignDesignSystemPanel.tsx`：色板 chips（添加 / 删除）、圆角、字体、风格约定 textarea、清空按钮。
  2. `FrontDesignToolbar.tsx` 增加 `SwatchBook` 按钮 + 下拉面板（沿用主题菜单的 Tooltip click 模式），文案全部 `t()`。
- **期望**：面板可增删色值 / 编辑字段 / 清空，改动即时落 localStorage；不出现原生 `title` 属性；配色全部走 `--color-theme-*`。

## 阶段 2：画布体检（B + C）

### T4 错误采集守卫 + 去重

- **步骤**
  1. 新建 `src/renderer/src/pages/front-design/utils/previewGuard.ts`：守卫脚本字符串（`onerror` / `unhandledrejection` / `console.error` → `window.__lxPreviewErrors`，上限 50 条，资源加载错误过滤）、`readPreviewErrors(doc)`、`mergePreviewErrors(raw, t)`（去重 key `message|source`，`count` 取分组长度，最多 10 条）。
  2. `useDesignPreview.ts` 的 `injectedHead` 追加守卫脚本（与现有 `lx-sandbox-guard` 同级注入）。
- **期望**：预览内主动抛错 → 缓冲出现 1 条；同错重复出现只增 `count`；刷新 / 切换设计后缓冲清零；资源加载失败不进缓冲。

### T5 可用性审计（6 条规则）

- **步骤**
  1. 新建 `src/renderer/src/pages/front-design/utils/contrast.ts`：颜色解析（hex/rgb/rgba）、alpha 合成、相对亮度、对比度比值。
  2. 新建 `src/renderer/src/pages/front-design/utils/a11yAudit.ts`：6 条规则（alt / 可访问名称 / 对比度 / 点击区 24×24 / 表单 label / html lang）+ `buildElementPathSelector`（无变异、无空格）+ 单规则 5 条 / 总计 20 条截断 + 跳过 `#lx-*` 注入节点。
  3. 新建 `src/renderer/src/pages/front-design/utils/issueFormat.ts`：`A11yFinding` → `PreviewIssue`（`message` + `instruction`，i18n）。
- **期望**：每类问题都能产出带可 `querySelector` 命中的无空格 selector；不修改设计 DOM；流式期间不运行。

### T6 体检面板与回流

- **步骤**
  1. 新建 `hooks/useDesignChecks.ts`：`onLoad` 首次读取 + 1s 轮询、审计触发（load / 手动 / 设计切换）、勾选集合、`errorCount` / `a11yCount`、`isStreaming` 时挂起。
  2. 新建 `components/FrontDesignIssuesPanel.tsx`：底部状态条（计数 + 重新检测 + 展开）+ 展开面板（运行时报错 / 可用性两组、全选、逐条修复、批量发送）。
  3. 发送动作：组装 mention 消息 → 确保 design 协作模式 → 写入聊天输入框 → 清空勾选。
- **期望**：0 问题时状态条中性可折叠；有堆栈可折叠查看；勾选 n 项后按钮显示 `发给 Agent 修复 (n)` 并生成合法的 `@design:` mention 列表（无选择器条目走降级格式）。

## 阶段 3：批注评审（A）

### T7 批注浮层与 pin

- **步骤**
  1. 新建 `utils/annotationOverlay.ts`：iframe 内高亮浮层（沿用现有实现）、pin 气泡（编号）、批注输入浮层（Enter 确认 / Esc 取消 / 空白取消 / 编辑态含删除）的注入、更新与清理；文案由父层 `t()` 传入。
  2. 由 `hooks/useDesignInspector.ts` 重命名升级为 `hooks/useDesignAnnotations.ts`，承载批注模式状态、快捷键（Shift+Alt 开、Esc 关）、`generateElementSelector` + `data-design-id` 刷回 store 的既有行为。
- **期望**：点选元素 → 输入批注 → 元素出现编号 pin；滚动画布 pin 跟随（document 坐标）；重复点选互不干扰；删除设计或流式开始时批注模式自动退出。

### T8 批注坞与发送

- **步骤**
  1. 新建 `components/FrontDesignAnnotationsPanel.tsx`：清单（编号 + selector + 描述 + 批注文本）、条目编辑 / 删除 / 单条发送、`发送全部 (n)`、清空；条目 hover 高亮画布对应元素（复用 overlay）。
  2. `FrontDesignPage.tsx` 装配：批注模式下或清单非空时显示右侧坞（280px 固定宽）；发送走 T6 的同一发送通道；发送后仅清空已发送条目。
- **期望**：批量发送生成 design 模式消息且聊天输入框被填充；坞宽不因内容变化；无硬编码中文；空清单显示空态文案。

## 阶段 4：装配与文案

### T9 页面装配与 i18n

- **步骤**
  1. `types.ts` 追加 `DesignAnnotation` / `PreviewIssue` / `A11yRuleId` / `A11yFinding`。
  2. `FrontDesignToolbar.tsx` 批注按钮 Tooltip 更新（批注模式说明），新增令牌按钮；页面布局改为「画布 + 右坞 / 底部体检条」两列结构。
  3. `i18n/locales/zh/frontDesign.ts` 与 `en/frontDesign.ts` 同步新增全部键（面板标题、空态、按钮、规则文案、指令模板、头行模板）。
- **期望**：`zh` / `en` 键一一对应无缺键；页面无新增原生 `title`；所有新增视觉元素使用 CSS Token。

## 阶段 5：测试

### T10 单元测试

- **步骤**
  1. `test/renderer/pages/front-design/contrast.test.ts`
  2. `test/renderer/pages/front-design/a11yAudit.test.ts`
  3. `test/renderer/pages/front-design/previewIssues.test.ts`
  4. `test/renderer/pages/front-design/issueFormat.test.ts`
  5. `test/renderer/features/agent/designReviewComposer.test.ts`
  6. `test/renderer/features/agent/designSystemInjection.test.ts`
- **期望**：覆盖设计文档第 10 节列出的断言点，全部通过。

### T11 精确校验

- **步骤**
  1. 运行受影响测试：`pnpm test -- test/renderer/pages/front-design test/renderer/features/agent/designReviewComposer.test.ts test/renderer/features/agent/designSystemInjection.test.ts`
  2. `pnpm typecheck`
  3. `pnpm lint`（受影响文件）+ 必要时 `pnpm format`
- **期望**：三项全绿；无遗留旧导入（`useDesignInspector` 已删除且无引用）。

### T12 手工验收（由用户执行）

- **步骤**
  1. `pnpm dev`，design 模式生成一个带 JS 的原型。
  2. 批注模式：标注 2-3 处 → 批量发送 → 检查聊天消息与新版设计。
  3. 制造一个 `console.error` / 一个缺 alt 图片 / 一对低对比度文本 → 体检面板勾选后发送 → 检查修复结果。
  4. 配置令牌（色板 + 圆角 + notes）→ 新开一条 design 消息 → 确认 Agent 遵循令牌。
- **期望**：主链路（标注 / 体检 / 令牌 → Agent → 新版本）完整可用；无控制台异常。

## 阶段 6：交付

### T13 提交与合并确认

- **步骤**
  1. 工作区内 `git status` / `git diff` 复核，仅提交本任务相关文件。
  2. 提交信息按仓库风格（`feat: ...`）。
  3. 询问用户是否合并回 `dev`（未获确认前不执行合并）。
- **期望**：提交干净、无主工作区改动混入；合并决策交由用户。
