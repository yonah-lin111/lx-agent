import { createRoot } from "react-dom/client"
import {
  getMarkdownReferenceIconSvg,
  type MarkdownReferenceType,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import { MarkdownReferenceImageTooltip } from "@/components/ui/LxMarkdown/components/MarkdownReferenceImageTooltip"
import { LxTooltip } from "@/components/ui/LxTooltip"

// 编辑器 widget 挂载结果：container 交由 CodeMirror 插入，destroy 用于卸载 React 树。
interface EditorWidgetMount {
  container: HTMLElement
  destroy: () => void
}

/**
 * 挂载 @文件提及 widget：hover 显示完整提及路径。
 */
export const mountFileMentionWidget = (
  displayLabel: string,
  fullMention: string,
  isReferenced: boolean,
): EditorWidgetMount => {
  const container = document.createElement("span")
  const root = createRoot(container)
  const nodeClassName = `markdown-file-mention-node ${
    isReferenced ? "markdown-file-mention-node--referenced" : ""
  }`
  root.render(
    <LxTooltip content={fullMention} placement="top">
      <span className={`${nodeClassName} cm-md-file-mention-widget inline-block cursor-pointer`}>
        {displayLabel}
      </span>
    </LxTooltip>,
  )
  return { container, destroy: () => root.unmount() }
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
