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
