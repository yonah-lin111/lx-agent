import { Check, CheckCircle2, ChevronDown, ChevronUp, Circle, Copy } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { MarkdownReferenceImageTooltip } from "@/components/ui/LxMarkdown/components/MarkdownReferenceImageTooltip"
import { MermaidDiagram } from "@/components/ui/LxMarkdown/components/MermaidDiagram"
import type { MarkdownPreviewMode } from "@/components/ui/LxMarkdown/types"
import { LxTooltip } from "@/components/ui/LxTooltip"

// Markdown 预览属性。
interface LxMarkdownPreviewProps {
  html: string
  previewMode: MarkdownPreviewMode
  previewRef: React.RefObject<HTMLElement | null>
  className?: string
  contentClassName?: string
  // 切换模板块完成状态（line 为源码起始行，0 起）。
  onTemplateStatusToggle?: (line: number, done: boolean) => void
}

// 预览 HTML 中可交互节点的挂载配置。
interface MarkdownPreviewMount {
  container: HTMLElement
  content: React.ReactNode
}

/**
 * 将文本写入系统剪贴板，并兼容不支持 Clipboard API 的环境。
 */
const copyToClipboard = async (content: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = content
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  textarea.remove()

  if (!copied) throw new Error("Clipboard copy failed")
}

/**
 * 渲染代码块复制按钮及其短暂成功反馈。
 */
const CodeBlockCopyButton = (): React.JSX.Element => {
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const copyCode = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    const code = event.currentTarget
      .closest(".markdown-code-block")
      ?.querySelector("pre code")?.textContent
    if (code === undefined) return

    try {
      await copyToClipboard(code)
      setIsCopied(true)
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => {
        setIsCopied(false)
        resetTimerRef.current = null
      }, 1500)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <LxIconButton
      aria-label="复制代码"
      preset={isCopied ? "confirm" : undefined}
      size="small"
      title={{ content: isCopied ? "已复制" : "复制代码", placement: "bottom" }}
      onClick={copyCode}
    >
      {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </LxIconButton>
  )
}

/**
 * 渲染代码块折叠按钮，并同步内容容器的动画状态。
 */
const CodeBlockCollapseButton = (): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(true)

  const toggleContent = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const codeBlock = event.currentTarget.closest<HTMLElement>(".markdown-code-block")
    const content = codeBlock?.querySelector<HTMLElement>(".markdown-code-content")
    if (!codeBlock || !content) return

    const nextIsExpanded = !isExpanded
    content.style.height = `${content.scrollHeight}px`
    codeBlock.classList.toggle("is-collapsed", !nextIsExpanded)

    requestAnimationFrame(() => {
      content.style.height = nextIsExpanded ? `${content.scrollHeight}px` : "0px"
    })

    if (nextIsExpanded) {
      content.addEventListener(
        "transitionend",
        () => {
          if (!codeBlock.classList.contains("is-collapsed")) content.style.height = ""
        },
        { once: true },
      )
    }

    setIsExpanded(nextIsExpanded)
  }

  return (
    <LxIconButton
      aria-label={isExpanded ? "折叠内容" : "展开内容"}
      aria-expanded={isExpanded}
      size="small"
      title={{ content: isExpanded ? "折叠内容" : "展开内容", placement: "bottom" }}
      onClick={toggleContent}
    >
      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </LxIconButton>
  )
}

/**
 * 渲染模板块复制按钮及其短暂成功反馈。
 */
const MarkdownTemplateCopyButton = (): React.JSX.Element => {
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const copyTemplate = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    const template = event.currentTarget.closest<HTMLElement>(".markdown-template-block")
    const encodedContent = template?.dataset.templateContent
    if (!encodedContent) return

    try {
      await copyToClipboard(decodeURIComponent(encodedContent))
      setIsCopied(true)
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => {
        setIsCopied(false)
        resetTimerRef.current = null
      }, 1500)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <LxIconButton
      aria-label="复制模板内容"
      preset={isCopied ? "confirm" : undefined}
      size="small"
      title={{ content: isCopied ? "已复制" : "复制模板内容", placement: "bottom" }}
      onClick={copyTemplate}
    >
      {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </LxIconButton>
  )
}

/**
 * 渲染模板块折叠按钮，并保持顶部工具栏可见。
 */
const MarkdownTemplateCollapseButton = (): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(true)

  const toggleContent = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const templateBlock = event.currentTarget.closest<HTMLElement>(".markdown-template-block")
    const content = templateBlock?.querySelector<HTMLElement>(".markdown-template-content")
    if (!templateBlock || !content) return

    const nextIsExpanded = !isExpanded
    content.style.height = `${content.scrollHeight}px`
    templateBlock.classList.toggle("is-collapsed", !nextIsExpanded)
    requestAnimationFrame(() => {
      content.style.height = nextIsExpanded ? `${content.scrollHeight}px` : "0px"
    })

    if (nextIsExpanded) {
      content.addEventListener(
        "transitionend",
        () => {
          if (!templateBlock.classList.contains("is-collapsed")) content.style.height = ""
        },
        { once: true },
      )
    }

    setIsExpanded(nextIsExpanded)
  }

  return (
    <LxIconButton
      aria-label={isExpanded ? "折叠内容" : "展开内容"}
      aria-expanded={isExpanded}
      size="small"
      title={{ content: isExpanded ? "折叠内容" : "展开内容", placement: "bottom" }}
      onClick={toggleContent}
    >
      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </LxIconButton>
  )
}

// 模板块完成状态按钮属性。
interface MarkdownTemplateStatusButtonProps {
  line: number
  isDone: boolean
  onToggle: (line: number, done: boolean) => void
}

/**
 * 渲染模板块完成状态图标按钮，点击后切换源码结束行的 done 标记。
 */
const MarkdownTemplateStatusButton = ({
  line,
  isDone,
  onToggle,
}: MarkdownTemplateStatusButtonProps): React.JSX.Element => {
  const actionLabel = isDone ? "标记为未完成" : "标记为已完成"

  return (
    <LxIconButton
      aria-label={actionLabel}
      aria-pressed={isDone}
      preset={isDone ? "confirm" : undefined}
      size="small"
      title={{ content: actionLabel, placement: "bottom" }}
      onClick={() => onToggle(line, !isDone)}
    >
      {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
    </LxIconButton>
  )
}

/**
 * 渲染 Markdown 内容，并为代码块挂载复制按钮。
 */
export const LxMarkdownPreview = ({
  html,
  previewMode,
  previewRef,
  className = "px-5",
  contentClassName = "py-4",
  onTemplateStatusToggle,
}: LxMarkdownPreviewProps): React.JSX.Element => {
  const contentRef = useRef<HTMLDivElement>(null)
  const [mounts, setMounts] = useState<MarkdownPreviewMount[]>([])

  /**
   * 禁止 Markdown 预览中的超链接触发页面跳转。
   */
  const handlePreviewLinkClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault()
  }

  useLayoutEffect(() => {
    const previewContent = contentRef.current
    if (!previewContent) return

    previewContent.innerHTML = html
    const nextMounts = [
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-code-copy"),
        (container) => ({ container, content: <CodeBlockCopyButton /> }),
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-code-collapse"),
        (container) => ({ container, content: <CodeBlockCollapseButton /> }),
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-template-status"),
        (container) => {
          const templateBlock = container.closest<HTMLElement>(".markdown-template-block")
          const line = templateBlock ? Number(templateBlock.dataset.endLine) : NaN
          const isDone = templateBlock?.dataset.templateStatus === "done"
          return {
            container,
            content: (
              <MarkdownTemplateStatusButton
                line={line}
                isDone={isDone}
                onToggle={onTemplateStatusToggle ?? (() => undefined)}
              />
            ),
          }
        },
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-template-copy"),
        (container) => ({ container, content: <MarkdownTemplateCopyButton /> }),
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-template-collapse"),
        (container) => ({ container, content: <MarkdownTemplateCollapseButton /> }),
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-mermaid"),
        (container) => {
          const encodedSource = container.dataset.mermaidSource
          const source = encodedSource ? decodeURIComponent(encodedSource) : ""
          return { container, content: <MermaidDiagram source={source} /> }
        },
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-file-mention"),
        (container) => {
          const fullMention = container.dataset.fullMention
            ? decodeURIComponent(container.dataset.fullMention)
            : ""
          const displayLabel = container.dataset.displayLabel
            ? decodeURIComponent(container.dataset.displayLabel)
            : fullMention
          const isReferenced = container.dataset.isReferenced === "true"
          const nodeClassName = `markdown-file-mention-node ${
            isReferenced ? "markdown-file-mention-node--referenced" : ""
          }`
          return {
            container,
            content: (
              <LxTooltip content={fullMention} placement="top">
                <span className={nodeClassName}>{displayLabel}</span>
              </LxTooltip>
            ),
          }
        },
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-reference"),
        (container) => {
          const referencePath = container.dataset.referencePath ?? ""
          const isImageReference = container.classList.contains("markdown-reference-image")
          const innerHtml = container.innerHTML
          return {
            container,
            content: (
              <LxTooltip
                content={
                  isImageReference ? (
                    <MarkdownReferenceImageTooltip path={referencePath} />
                  ) : (
                    referencePath
                  )
                }
                placement="top"
              >
                <span
                  className="inline-flex max-w-full items-center gap-1"
                  dangerouslySetInnerHTML={{ __html: innerHtml }}
                />
              </LxTooltip>
            ),
          }
        },
      ),
    ]
    nextMounts.forEach(({ container }) => container.replaceChildren())
    setMounts(nextMounts)
  }, [html])

  return (
    <article
      ref={previewRef}
      className={`markdown-preview min-h-0 min-w-0 flex-1 overflow-auto text-sm ${className} ${
        previewMode === "split" ? "border-l border-white/5" : ""
      }`}
    >
      <div
        ref={contentRef}
        className={`markdown-preview-content ${contentClassName}`}
        onClick={handlePreviewLinkClick}
      />
      {mounts.map(({ container, content }, index) => createPortal(content, container, index))}
    </article>
  )
}
