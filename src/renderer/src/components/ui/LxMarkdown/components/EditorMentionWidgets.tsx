import { createRoot } from "react-dom/client"
import {
  getMarkdownReferenceIconSvg,
  type MarkdownReferenceType,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import { MarkdownReferenceImageTooltip } from "@/components/ui/LxMarkdown/components/MarkdownReferenceImageTooltip"
import type { MarkdownTableAlignment, MarkdownTableRowKind } from "@/components/ui/LxMarkdown/types"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"

// 编辑器 widget 挂载结果：container 交由 CodeMirror 插入，destroy 用于释放挂载资源。
interface EditorWidgetMount {
  container: HTMLElement
  destroy: () => void
}

/**
 * 挂载表格行 widget：每行独立替换，避免跨换行的 CodeMirror replace decoration。
 */
export const mountMarkdownTableRowWidget = (
  cells: string[],
  alignments: MarkdownTableAlignment[],
  rowKind: MarkdownTableRowKind,
  columnCount: number,
): EditorWidgetMount => {
  const container = document.createElement("span")
  container.className = "cm-md-table-row-widget-container"

  const row = document.createElement("span")
  row.className = `cm-md-table-row-widget cm-md-table-row-widget--${rowKind}`
  row.style.setProperty("--cm-md-table-column-count", String(columnCount))

  cells.forEach((cell, columnIndex) => {
    const cellElement = document.createElement("span")
    cellElement.className = "cm-md-table-cell"
    cellElement.style.textAlign = alignments[columnIndex] ?? "left"
    cellElement.innerHTML = markdownRenderer.renderInline(cell)
    row.appendChild(cellElement)
  })

  container.appendChild(row)
  return { container, destroy: () => {} }
}

/**
 * 挂载文件/文件夹/图片/项目引用 widget：hover 显示路径或图片预览。
 */
export const mountMarkdownReferenceWidget = (
  path: string,
  type: MarkdownReferenceType,
  label: string,
  name: string,
): EditorWidgetMount => {
  const container = document.createElement("span")
  const root = createRoot(container)
  root.render(
    <LxTooltip
      content={type === "image" ? <MarkdownReferenceImageTooltip path={path} /> : path}
      placement="top"
    >
      <span className={`markdown-reference markdown-reference-${type} cursor-pointer`}>
        <span
          className="markdown-reference-icon"
          dangerouslySetInnerHTML={{ __html: getMarkdownReferenceIconSvg(type) }}
        />
        <span className="markdown-reference-label">{label}</span>
        <span className="markdown-reference-name">{name}</span>
      </span>
    </LxTooltip>,
  )
  return { container, destroy: () => root.unmount() }
}
