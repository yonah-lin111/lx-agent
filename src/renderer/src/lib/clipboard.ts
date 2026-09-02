/**
 * 从剪贴板事件中提取文件或截图路径。
 * 支持磁盘文件路径（含拖拽/复制文件）以及纯内存截图（通过 IPC 保存至本地目录）。
 */
export const getClipboardFilesAsync = async (
  event: ClipboardEvent,
): Promise<{ path: string; type: "folder" | "file" | "image" }[]> => {
  const clipboardData = event.clipboardData
  if (!clipboardData) return []

  const files = Array.from(clipboardData.files)
  const items = Array.from(clipboardData.items)

  // 1. 处理磁盘文件
  const entries = items.filter((clipboardItem) => clipboardItem.kind === "file")
  const clipboardFiles = files.flatMap((file, index) => {
    try {
      const path = window.api.getPathForFile(file)
      if (!path) return []
      const entry = (
        entries[index] as
          | (DataTransferItem & { webkitGetAsEntry?: () => { isDirectory: boolean } | null })
          | undefined
      )?.webkitGetAsEntry?.()
      const isImage =
        file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path)
      const fileType: "image" | "file" | "folder" = entry?.isDirectory
        ? "folder"
        : isImage
          ? "image"
          : "file"
      return [{ path, type: fileType }]
    } catch {
      return []
    }
  })
  if (clipboardFiles.length > 0) return clipboardFiles

  // 2. 检查纯剪贴板图片（截图无物理路径）
  const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"))
  if (imageItem) {
    const blob = imageItem.getAsFile()
    if (blob) {
      try {
        const buffer = await blob.arrayBuffer()
        const savedPath = await window.api.saveClipboardImage(buffer, blob.type || "image/png")
        if (savedPath) {
          return [{ path: savedPath, type: "image" }]
        }
      } catch (err) {
        console.error("Failed to save clipboard image:", err)
      }
    }
  }

  // 3. 处理纯文本路径
  const plainText = clipboardData.getData("text/plain").trim()
  if (plainText.startsWith("/")) {
    return [
      {
        path: plainText,
        type: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(plainText) ? "image" : "file",
      },
    ]
  }

  // 4. 处理 file:// URI
  const fileUri = clipboardData
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((value) => value.trim() && !value.trim().startsWith("#"))
  if (!fileUri?.startsWith("file://")) return []

  try {
    const path = decodeURIComponent(new URL(fileUri.trim()).pathname)
    return [
      {
        path,
        type: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path) ? "image" : "file",
      },
    ]
  } catch {
    return []
  }
}

/**
 * 剥离选区因结束于块级元素末尾而产生的换行伪影。
 * 浏览器序列化选区时，会在选区结束处的块边界追加换行（嵌套块越多换行越多），
 * 该换行属于渲染伪影而非内容本身。仅当选区结束于容器内容末尾（或之后）时剥离；
 * 选区未覆盖到内容末尾（部分选中）时返回 null，交由默认复制行为。
 */
export const sanitizeSelectionTrailingNewlines = (
  selection: Selection,
  container: HTMLElement,
): string | null => {
  if (selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const contentRange = document.createRange()
  contentRange.selectNodeContents(container)

  // 内容末尾定位到最后一个非空白文本节点（innerHTML 尾随换行会产生空白文本节点，需跳过）。
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let lastText: Text | null = null
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.textContent?.trim() !== "") lastText = node as Text
  }
  if (lastText) contentRange.setEnd(lastText, lastText.length)

  // 选区结束位置早于内容末尾：不存在块边界伪影。
  if (range.compareBoundaryPoints(Range.END_TO_END, contentRange) < 0) return null

  const selectedText = selection.toString()
  const cleaned = selectedText.replace(/\n+$/, "")
  return cleaned.length === selectedText.length ? null : cleaned
}
