import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { MermaidDiagram } from "@/components/ui/LxMarkdown/components/MermaidDiagram"
import type { MarkdownPreviewMode } from "@/components/ui/LxMarkdown/types"

// Markdown 预览属性。
interface LxMarkdownPreviewProps {
  html: string
  previewMode: MarkdownPreviewMode
  previewRef: React.RefObject<HTMLElement | null>
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

  const copyTemplate = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    const template = event.currentTarget.closest<HTMLElement>(".markdown-template-block")
    const encodedContent = template?.dataset.templateContent
    if (!encodedContent) return

    try {
      await copyToClipboard(decodeURIComponent(encodedContent))
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1500)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <LxIconButton
      aria-label="复制模板内容"
      size="small"
      title={{ content: isCopied ? "已复制" : "复制模板内容", placement: "bottom" }}
      onClick={copyTemplate}
    >
      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
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

/**
 * 渲染 Markdown 内容，并为代码块挂载复制按钮。
 */
export const LxMarkdownPreview = ({
  html,
  previewMode,
  previewRef,
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
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-code-collapse") ?? [],
        (container) => mountButton(container, <CodeBlockCollapseButton />),
      ),
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-template-copy") ?? [],
        (container) => mountButton(container, <MarkdownTemplateCopyButton />),
      ),
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-template-collapse") ?? [],
        (container) => mountButton(container, <MarkdownTemplateCollapseButton />),
      ),
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-mermaid") ?? [],
        (container) => {
          const encodedSource = container.dataset.mermaidSource
          const source = encodedSource ? decodeURIComponent(encodedSource) : ""
          return mountButton(container, <MermaidDiagram source={source} />)
        },
      ),
      ...Array.from(
        previewElement?.querySelectorAll<HTMLElement>(".markdown-file-mention") ?? [],
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
          return mountButton(
            container,
            <LxTooltip content={fullMention} placement="top">
              <span className={nodeClassName}>{displayLabel}</span>
            </LxTooltip>,
          )
        },
      ),
    ]

    return () => {
      // root.unmount() 不能在 React 渲染过程中同步执行，否则会触发
      // "Attempted to synchronously unmount a root while React was already
      // rendering" 警告，并导致部分 root 未完成卸载、新 root 挂载失败，
      // 表现为代码块按钮和文件提及提示消失。延迟到当前渲染结束后再卸载。
      queueMicrotask(() => roots.forEach((root) => root.unmount()))
    }
  }, [html, previewMode, previewRef])

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
