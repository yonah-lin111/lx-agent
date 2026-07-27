import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { MermaidDiagram } from "@/components/ui/LxMarkdown/components/MermaidDiagram"
import type { MarkdownPreviewMode } from "@/components/ui/LxMarkdown/types"

// Markdown 预览属性。
interface LxMarkdownPreviewProps {
  html: string
  previewMode: MarkdownPreviewMode
  previewRef: React.RefObject<HTMLElement | null>
  showLineNumbers?: boolean
  showFolding?: boolean
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
      size="small"
      title={{ content: isCopied ? "已复制" : "复制代码", placement: "bottom" }}
      onClick={copyCode}
    >
      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
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
      aria-label={isExpanded ? "折叠代码块" : "展开代码块"}
      aria-expanded={isExpanded}
      size="small"
      title={{ content: isExpanded ? "折叠代码块" : "展开代码块", placement: "bottom" }}
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
  showLineNumbers = false,
  showFolding = false,
}: LxMarkdownPreviewProps): React.JSX.Element => {
  useLayoutEffect(() => {
    const mountButton = (container: HTMLElement, button: React.JSX.Element) => {
      const root = createRoot(container)
      root.render(button)
      return root
    }
    const previewElement = previewRef.current
    const roots = [
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-code-copy") ?? [],
        (container) => mountButton(container, <CodeBlockCopyButton />),
      ),
      ...(!showFolding
        ? Array.from(
            previewElement?.querySelectorAll<HTMLElement>(".markdown-code-collapse") ?? [],
            (container) => mountButton(container, <CodeBlockCollapseButton />),
          )
        : []),
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-mermaid") ?? [],
        (container) => {
          const encodedSource = container.dataset.mermaidSource
          const source = encodedSource ? decodeURIComponent(encodedSource) : ""
          return mountButton(container, <MermaidDiagram source={source} />)
        },
      ),
    ]

    return () => roots.forEach((root) => root.unmount())
  }, [html, previewMode, previewRef, showFolding, showLineNumbers])

  return (
    <article
      ref={previewRef}
      className={`markdown-preview min-h-0 min-w-0 flex-1 overflow-auto px-5 text-sm ${
        previewMode === "split" ? "border-l border-white/5" : ""
      }`}
    >
      <div className="markdown-preview-content py-4" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
