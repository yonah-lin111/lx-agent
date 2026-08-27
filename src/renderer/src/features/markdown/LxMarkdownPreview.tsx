import { Check, CheckCircle2, ChevronDown, ChevronUp, Circle, CircleDot, Copy } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { MarkdownTemplateStatus } from "@/features/markdown/commands/markdownBlockCommands"
import { MarkdownReferenceImageTooltip } from "@/features/markdown/components/MarkdownReferenceImageTooltip"
import { MermaidDiagram } from "@/features/markdown/components/MermaidDiagram"
import type { MarkdownPreviewMode } from "@/features/markdown/types"
import { useTranslation } from "@/i18n"
import { sanitizeSelectionTrailingNewlines } from "@/lib/clipboard"

// Markdown 预览属性。
interface LxMarkdownPreviewProps {
  html: string
  previewMode: MarkdownPreviewMode
  previewRef: React.RefObject<HTMLElement | null>
  className?: string
  contentClassName?: string
  // 复制选中文本时剥离选区末尾的块边界换行伪影。
  sanitizeCopy?: boolean
  // 循环切换模板块状态（line 为源码结束行，0 起）。
  onTemplateStatusToggle?: (line: number) => void
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
  const { t } = useTranslation()
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
      aria-label={t("markdown.copyCode")}
      preset={isCopied ? "confirm" : undefined}
      size="small"
      title={{
        content: isCopied ? t("markdown.copiedCode") : t("markdown.copyCode"),
        placement: "bottom",
      }}
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
  const { t } = useTranslation()
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
      aria-label={isExpanded ? t("markdown.foldCode") : t("markdown.unfoldCode")}
      aria-expanded={isExpanded}
      size="small"
      title={{
        content: isExpanded ? t("markdown.foldCode") : t("markdown.unfoldCode"),
        placement: "bottom",
      }}
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
  const { t } = useTranslation()
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
      aria-label={t("markdown.copyTemplate")}
      preset={isCopied ? "confirm" : undefined}
      size="small"
      title={{
        content: isCopied ? t("markdown.copiedCode") : t("markdown.copyTemplate"),
        placement: "bottom",
      }}
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
  const { t } = useTranslation()
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
      aria-label={isExpanded ? t("markdown.foldTemplate") : t("markdown.unfoldTemplate")}
      aria-expanded={isExpanded}
      size="small"
      title={{
        content: isExpanded ? t("markdown.foldTemplate") : t("markdown.unfoldTemplate"),
        placement: "bottom",
      }}
      onClick={toggleContent}
    >
      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </LxIconButton>
  )
}

// 模板块状态按钮属性。
interface MarkdownTemplateStatusButtonProps {
  line: number
  status: MarkdownTemplateStatus
  onToggle: (line: number) => void
}

/**
 * 渲染模板块状态图标按钮，点击后循环切换源码结束行的状态标记。
 */
const MarkdownTemplateStatusButton = ({
  line,
  status,
  onToggle,
}: MarkdownTemplateStatusButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const actionLabel =
    status === "done"
      ? t("markdown.markTodo")
      : status === "in_progress"
        ? t("markdown.markCompleted")
        : t("markdown.markInProgress")

  return (
    <LxIconButton
      aria-label={actionLabel}
      aria-pressed={status === "done"}
      preset={status === "done" ? "confirm" : undefined}
      size="small"
      title={{ content: actionLabel, placement: "bottom" }}
      onClick={() => onToggle(line)}
    >
      {status === "done" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : status === "in_progress" ? (
        <CircleDot className="h-3 w-3 text-amber-400" />
      ) : (
        <Circle className="h-3 w-3" />
      )}
    </LxIconButton>
  )
}

/**
 * 渲染 Markdown 内容，并为代码块挂载复制按钮。
 */
export const LxMarkdownPreview = ({
  html,
  previewMode: _previewMode,
  previewRef,
  className = "px-5",
  contentClassName = "py-4",
  sanitizeCopy = false,
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

  /**
   * 复制选中文本时剥离选区末尾的块边界换行伪影。
   */
  const handleContentCopy = (event: React.ClipboardEvent<HTMLDivElement>): void => {
    const selection = window.getSelection()
    const content = contentRef.current
    if (!selection || !content || !event.clipboardData) return
    const cleaned = sanitizeSelectionTrailingNewlines(selection, content)
    if (cleaned === null) return
    event.preventDefault()
    event.clipboardData.setData("text/plain", cleaned)
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
          const status =
            (templateBlock?.dataset.templateStatus as MarkdownTemplateStatus | undefined) ?? "todo"
          return {
            container,
            content: (
              <MarkdownTemplateStatusButton
                line={line}
                status={status}
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
        previewContent.querySelectorAll<HTMLElement>(".markdown-memory-citation"),
        (container) => {
          const path = container.dataset.memoryPath
            ? decodeURIComponent(container.dataset.memoryPath)
            : ""
          const range = container.dataset.memoryRange
            ? decodeURIComponent(container.dataset.memoryRange)
            : ""
          const note = container.dataset.memoryNote
            ? decodeURIComponent(container.dataset.memoryNote)
            : ""
          const innerHtml = container.innerHTML

          const tooltipContent = (
            <div className="flex flex-col gap-1 text-xs max-w-[20rem]">
              <div className="font-semibold text-theme-foreground flex items-center gap-1.5">
                <span>{path}</span>
                {range ? (
                  <span className="text-theme-muted font-mono text-[11px]">{range}</span>
                ) : null}
              </div>
              {note ? (
                <div className="text-theme-muted leading-relaxed text-[11px]">{note}</div>
              ) : null}
            </div>
          )

          const chipNode = (
            <span
              className="inline-flex max-w-full items-center"
              dangerouslySetInnerHTML={{ __html: innerHtml }}
            />
          )

          return {
            container,
            content: (
              <LxTooltip
                content={tooltipContent}
                placement="top"
                contentClassName="whitespace-normal max-w-[22rem]"
              >
                {chipNode}
              </LxTooltip>
            ),
          }
        },
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-file-mention"),
        (container) => {
          const displayLabel = container.dataset.displayLabel
            ? decodeURIComponent(container.dataset.displayLabel)
            : ""
          const isReferenced = container.dataset.isReferenced === "true"
          const nodeClassName = `markdown-file-mention-node ${
            isReferenced ? "markdown-file-mention-node--referenced" : ""
          }`
          return {
            container,
            content: <span className={nodeClassName}>{displayLabel}</span>,
          }
        },
      ),
      ...Array.from(
        previewContent.querySelectorAll<HTMLElement>(".markdown-reference"),
        (container) => {
          const referencePath = container.dataset.referencePath ?? ""
          const isImageReference = container.classList.contains("markdown-reference-image")
          const isPathReference =
            container.classList.contains("markdown-reference-file") ||
            container.classList.contains("markdown-reference-folder")
          const innerHtml = container.innerHTML
          const reference = (
            <span
              className="inline-flex max-w-full items-center gap-1"
              dangerouslySetInnerHTML={{ __html: innerHtml }}
            />
          )
          const tooltip =
            isImageReference && referencePath ? (
              <MarkdownReferenceImageTooltip path={referencePath} />
            ) : isPathReference && referencePath ? (
              <span className="block max-w-[24rem] break-all leading-snug">{referencePath}</span>
            ) : null
          return {
            container,
            content: tooltip ? (
              <LxTooltip
                content={tooltip}
                placement="top"
                contentClassName="whitespace-normal max-w-[24rem]"
              >
                {reference}
              </LxTooltip>
            ) : (
              reference
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
      className={`markdown-preview min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto text-sm ${className}`}
    >
      <div
        ref={contentRef}
        className={`markdown-preview-content ${contentClassName}`}
        onClick={handlePreviewLinkClick}
        onCopy={sanitizeCopy ? handleContentCopy : undefined}
      />
      {mounts.map(({ container, content }, index) => createPortal(content, container, index))}
    </article>
  )
}
