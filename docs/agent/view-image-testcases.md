# `view_image 图片查看` 测试用例

**前置说明：**

- 环境/配置：在 `.worktrees/view-image` 下执行 `pnpm dev` 启动应用（predev 会自动重编 electron 原生模块）；`设置 → 模型服务 → 展开模型 → Modalities (In)` 填 `text, image`（或使用模型名含 `gpt-4o` / `claude-3` / `gemini` 的模型）；测试素材已生成在 `~/Desktop/view-image-fixtures/`。
- 生效时机：工具随会话装配；模型切换后下一轮自动重建生效（非视觉模型不注入）；无需重启应用。
- 观察位置：Agent 消息流（图片缩略图 / 悬浮大图 / 尺寸与精度标签）、执行流程面板（`view_image` 步骤与结果摘要）、模型回复内容、状态栏上下文容量指示（`AgentContextUsagePill`）；`view_image` 为豁免工具，不应出现权限审批弹窗。

```bash
# 素材已生成（macOS）：~/Desktop/view-image-fixtures/
# 复制到项目内使用（view_image 同时支持绝对路径，可直接指定桌面路径）：
mkdir -p artifacts
cp -R ~/Desktop/view-image-fixtures/* artifacts/

# 素材清单：
# small-shot.png   800×600     直传路径
# small-shot.jpg   800×600     JPEG 直传路径
# big-4000.png     4000×4000   high 缩放路径
# text-shot.png    1200×800    original 文字精度验证
# heavy-noise.png  1500×1500   6.4MiB，超 4MiB 重编码路径（尺寸未超限）
# unsupported.gif / unsupported.bmp / icon.svg   不支持格式
# huge.png         21MiB       超硬上限
```

---

## 组 1：`基本查看（直传路径）`

- **提示词**：`查看 artifacts/small-shot.png，描述画面内容`
- **验证步骤**：选择视觉模型 → 新建会话 → 发送提示词 → 观察消息流工具块与执行流程。

- **期望**：模型调用 `view_image` 后能准确描述图中内容；工具块渲染缩略图，悬浮显示大图；元信息为 `800×600` 且**无**“原图 …”后缀（未重编码）；无权限弹窗。

## 组 2：`大图缩放（high 上限 2048）`

- **提示词**：`查看 artifacts/big-4000.png`
- **验证步骤**：同组 1；重点观察图片块元信息与执行流程结果摘要。

- **期望**：元信息显示发送尺寸长边 `2048`，并带“原图 4000×4000”后缀；结果摘要含 `sent 2048x... as image/png`；模型描述与图片一致。

## 组 3：`original 精度（长边上限 6000）`

- **提示词**：`用 view_image 的 original 精度查看 artifacts/text-shot.png，逐字读出图中文字`
- **验证步骤**：确认模型在调用参数中带 `detail: "original"` → 观察标签与模型输出。

- **期望**：详情标签显示“原图精度”；模型能读出小字号文字；元信息无缩放后缀（长边 ≤6000 时原字节直传）。

## 组 4：`超 4MiB 重编码（尺寸未超限）`

- **提示词**：`查看 artifacts/heavy-noise.png`
- **验证步骤**：观察元信息与结果摘要。

- **期望**：发送尺寸仍为 `1500×1500`，但带“原图 …”后缀且摘要为 `sent 1500x1500 as image/png`（超过 4MiB 直传上限触发重编码，尺寸未变）；模型可正常描述。

## 组 5：`错误分支（缺文件 / 目录 / 非法格式 / 超大文件）`

- **提示词**：依次发送 `查看 artifacts/missing.png`、`查看 artifacts/`、`查看 artifacts/icon.svg`、`查看 artifacts/unsupported.gif`、`查看 artifacts/huge.png`
- **验证步骤**：逐条观察工具结果与 UI 渲染。

- **期望**：工具结果标记为 error 且消息为英文明确原因（`file not found` / `is not a file` / `unsupported or invalid image format (supported: PNG, JPEG)` / `20MiB limit`）；UI 回退文本渲染、不崩溃；应用可继续对话。

## 组 6：`非视觉模型门控`

- **提示词**：`查看 artifacts/small-shot.png`
- **验证步骤**：`设置 → 模型服务` 新增/编辑一个 `Modalities (In) = text` 的模型 → 当前会话切换到该模型 → 发送提示词。

- **期望**：模型不再调用 `view_image`（工具未注入本会话）；模型应说明当前模型不支持图片输入或给出替代方案；切回视觉模型后下一轮恢复可用。

## 组 7：`多图与双视图渲染`

- **提示词**：`同时查看 artifacts/small-shot.png 和 artifacts/big-4000.png，对比差异`
- **验证步骤**：观察是否有两条 `view_image` 步骤，消息流与执行流程各自渲染情况，以及上下文容量指示变化。

- **期望**：两张图片各自渲染图片块、参数不串位；消息流与执行流程均展示缩略图与悬浮预览；上下文容量指示存在与图片数量量级相符的上涨（约 1500 tokens/张）。

## 组 8：`历史图片修剪（间接验证）`

- **提示词**：先完成组 1，再连续进行 3 轮以上与图片无关的问答，最后发送：`刚才那张 small-shot.png 里有什么？`
- **验证步骤**：观察模型回答方式与消息流中历史图片块。

- **期望**：模型不再凭记忆描述像素细节，而是重新调用 `view_image`（历史图片已超出尾部 6 条消息豁免窗口，被文本占位替换）；消息流中历史缩略图仍正常可见（修剪仅作用于投喂模型的内存副本）。

## 组 9：`会话恢复`

- **提示词**：无需新提示词
- **验证步骤**：关闭并重启应用 → 打开含 `view_image` 调用的历史会话 → 滚动到图片块。

- **期望**：缩略图、文件名、尺寸与精度元信息完整重建（`image` 结构随 entry 落库）；悬浮预览正常。删除源图片后预览加载失败但布局不崩（已知限制）。

## 组 10：`i18n 文案`

- **提示词**：`查看 artifacts/big-4000.png`
- **验证步骤**：`设置 → 界面语言` 在中文/英文间切换 → 观察图片块与执行流程标签。

- **期望**：中文显示“高精度/原图精度”，英文显示 `High detail / Original detail`；切换即时生效，无中文硬编码。

---

## 附：`补充说明`

- 已知限制：仅支持 PNG / JPEG（`nativeImage` 解码边界，GIF/BMP/WebP/AVIF/SVG 直接报错）；UI 预览依赖本地文件路径，源文件删除/移动后失效；多模态 tool result 在 `openai-compatible` 端点可能不被支持（错误回灌模型）；图片 base64 与会话一并落库，会话体积随图片数量增长。
- 自动化覆盖与回归命令：

  ```bash
  pnpm exec vitest run test/main/agent/tools/viewImage.test.ts test/main/agent/tools/viewImageGating.test.ts test/main/agent/modelCapabilities.test.ts test/main/agent/toModelMessages.test.ts test/main/agent/compaction/contextPruner.test.ts test/main/agent/compaction.test.ts test/main/agent/agentRunner.test.ts test/renderer/features/agent/AgentViewImageBlock.test.tsx
  ```

- 说明：项目为 Electron 页面，无法由 Agent 直接做页面调试，需按上述用例人工启动验证。
