import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { MermaidDiagram } from "@/components/ui/LxMarkdown/components/MermaidDiagram"
import type { MarkdownPreviewMode } from "@/components/ui/LxMarkdown/types"
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
  const { t } = useTranslation()

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
  const [isExpanded, setIsExpanded] = useState(true)
  const { t } = useTranslation()

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
      aria-label={isExpanded ? t("markdown.collapseContent") : t("markdown.expandContent")}
      aria-expanded={isExpanded}
      size="small"
      title={{
        content: isExpanded ? t("markdown.collapseContent") : t("markdown.expandContent"),
        placement: "bottom",
      }}
      onClick={toggleContent}
    >
      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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
  sanitizeCopy = false,
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
        previewContent.querySelectorAll<HTMLElement>(".markdown-mermaid"),
        (container) => {
          const encodedSource = container.dataset.mermaidSource
          const source = encodedSource ? decodeURIComponent(encodedSource) : ""
          return { container, content: <MermaidDiagram source={source} /> }
        },
      ),
    ]
    nextMounts.forEach(({ container }) => container.replaceChildren())
    setMounts(nextMounts)
  }, [html])

  return (
    <article
      ref={previewRef}
      className={`markdown-preview min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto text-sm ${className} ${
        previewMode === "split" ? "border-l border-white/5" : ""
      }`}
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
