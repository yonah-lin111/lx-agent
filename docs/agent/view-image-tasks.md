# View Image 实施任务清单

设计依据：[view-image.md](./view-image.md)。本清单在 worktree 内逐项执行，全部完成后提交并汇报。

- **执行工作区**：`.worktrees/view-image`
- **分支**：`feat/view-image`（从 `dev` 切出；本文档与设计文档先行提交在 dev）
- **约束**：不新增第三方依赖；工具描述与错误消息一律英文；UI 文案一律走 i18n（`useTranslation` / `t`）；禁止 HTML 原生 `title` 提示

---

## 1. 契约扩展

- [ ] `src/shared/contracts/agent.ts`
  - 新增 `ViewImageDetails`（字段见设计 §3）
  - `ToolResultMessage` 新增 `image?: ViewImageDetails`

## 2. 工具实现

- [ ] `src/main/agent/tools/viewImage.ts`
  - `const viewImageSchema = z.object({ path: z.string(), detail: z.enum(["high","original"]).optional() })`
  - 魔数探测（仅 PNG/JPEG 受支持，nativeImage 解码边界）；GIF/BMP/WebP/AVIF/SVG 与未知格式抛错并列出支持格式
  - 双路径预处理（直传 / `nativeImage` 缩放重编码），常量与编码策略见设计 §5
  - 返回 `content`（英文摘要 + `ImageContent`）与 `details.image`
  - `executionMode: "parallel"`；`supportsImages` 依赖注入，`false` 时抛错
- [ ] `test/main/agent/tools/viewImage.test.ts`（`vi.mock("electron")`，参考 `test/main/agent/toModelMessages.test.ts`）
  - 直传：小 PNG 字节 → `data` 等于原 base64、`resized=false`、`mimeType=image/png`
  - 重编码：超限尺寸 → `resize` 被调用；PNG 源 → PNG、JPEG 源 → JPEG q85；`resized=true`
  - `detail=original` 使用 6000 上限；`detail=high` 使用 2048 上限
  - 错误分支：不存在 / 非文件 / SVG / 解码失败 / >20MiB / 非视觉模型
  - 输出契约：content 首块文本摘要、第二块图片；details 字段完整

## 3. 能力判定与装配

- [ ] `src/main/agent/stream/modelCapabilities.ts`：`modelSupportsImageInput(provider, modelId)`（settings `modalities.input` 优先，关键词兜底）
- [ ] `src/main/agent/assembly.ts`：注册 `createViewImageTool`；`ALL_TOOL_NAMES` 与 `SessionToolDeps` 增加门控入参
- [ ] `src/main/agent/sessionRunner.ts`：`ensureReady` 传入 `supportsImages`
- [ ] `src/services/capabilityService.ts`：`DEFAULT_TOOLS` 增加 `view_image`
- [ ] `src/main/agent/permissions/rule.ts`：`EXEMPT_TOOLS` 增加 `view_image`
- [ ] 门控测试：不支持图片的模型注册表中不包含 `view_image`；执行兜底抛错（可并入 §2 测试文件）

## 4. 消息管道

- [ ] `src/main/agent/core/agent-loop.ts`：`createToolResultMessage` 提取 `details.image`
- [ ] `src/main/agent/stream/toModelMessages.ts`：toolResult 含图片块时输出 `output: { type: "content", value: [text, file-data] }`
- [ ] `test/main/agent/toModelMessages.test.ts` 增补：图片工具结果 → content parts；纯文本结果保持 `type: "text"`

## 5. 上下文治理

- [ ] `src/main/agent/compaction/contextPruner.ts`：`view_image` 入 prunable 集合；图片块在豁免窗口外替换为 `[Image omitted from historical context: <path>]`
- [ ] `test/main/agent/compaction/contextPruner.test.ts` 增补：窗口外图片被占位、窗口内保留、非 prunable 工具不受影响
- [ ] `src/main/agent/compaction.ts`：图片块 token 估计按 6000 等价字符（1500 tokens）计入
- [ ] `test/main/agent/compaction.test.ts` 增补：含图片消息的估计值上升

## 6. Renderer

- [ ] `src/renderer/src/features/agent/types.ts`：`ChatBlock.toolResult` 增加 `image?: ViewImageDetails`
- [ ] `src/renderer/src/features/agent/utils.ts`：两处消息映射透传 `image`
- [ ] `src/renderer/src/features/agent/executionFlow.ts`：flow item 透传 `image`
- [ ] `src/renderer/src/features/agent/components/blocks/AgentViewImageBlock.tsx`（新）：缩略图 + 悬浮预览 + 元信息
- [ ] `src/renderer/src/features/agent/components/blocks/AgentToolCallBlock.tsx`：`view_image` 分派分支
- [ ] `src/renderer/src/features/agent/components/blocks/index.ts`：导出新组件
- [ ] `src/renderer/src/features/agent/components/AgentExecutionFlowList/tools/FlowToolViewImage.tsx`（新）
- [ ] `.../AgentExecutionFlowList/FlowItemToolContent.tsx`：`view_image` 分派
- [ ] `src/renderer/src/i18n/locales/zh.ts` / `en.ts`：新增文案键
- [ ] `test/renderer/features/agent/AgentViewImageBlock.test.tsx`：缩略图 src、元信息与文案渲染

## 7. 测试与验证

- [ ] 定向测试：
  - `pnpm exec vitest run test/main/agent/tools/viewImage.test.ts test/main/agent/toModelMessages.test.ts test/main/agent/compaction/contextPruner.test.ts test/main/agent/compaction.test.ts test/main/agent/renderToolsRemovalRegression.test.ts`
  - `pnpm exec vitest run test/renderer/features/agent/AgentViewImageBlock.test.tsx`
- [ ] 类型检查：`pnpm typecheck`
- [ ] 受影响文件格式化：`pnpm exec biome check <涉及文件/目录>`

## 8. 文档同步（与代码同提交）

- [ ] `docs/agent/tools.md`：内置工具矩阵新增 `view_image` 行；§1.1/装配说明如涉及同步
- [ ] `docs/agent/runtime.md`：§4.2 修剪工具清单加入 `view_image` 并说明图片占位
- [ ] `docs/agent/permissions.md`：§5.2 豁免工具清单加入 `view_image`

## 9. 提交与汇报

- [ ] worktree 内提交（`feat: add view_image ...`，含测试与文档同步）
- [ ] 汇报：修改内容 / 验证结果 / 风险与未验证部分
- [ ] 询问用户是否合并回 dev，用户确认前不执行合并

---

## 验收标准

1. 视觉模型调用 `view_image` 能获得真实图片；非视觉模型工具不可见且执行兜底报错；
2. 直传与重编码路径、`high` / `original` 上限行为与设计一致；
3. 历史图片按窗口被占位修剪（UI 仍可见原图），token 估计包含图片成本；
4. 消息流与执行流程均能渲染图片缩略图与预览，全部文案走 i18n；
5. 定向测试与 `pnpm typecheck` 全绿；
6. worktree 内已有提交，且未擅自合并。
