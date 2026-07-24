import { Check, Copy } from "lucide-react"
import { createRoot } from "react-dom/client"
import { useLayoutEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import type { MarkdownPreviewMode } from "@/components/ui/LxMarkdownEditor/types"

// Markdown 预览属性。
interface MarkdownPreviewProps {
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
      title={{ content: isCopied ? "已复制" : "复制代码", placement: "left" }}
      onClick={copyCode}
    >
      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </LxIconButton>
  )
}

/**
 * 渲染 Markdown 内容，并为代码块挂载复制按钮。
 */
export const MarkdownPreview = ({
  html,
  previewMode,
  previewRef,
}: MarkdownPreviewProps): React.JSX.Element => {
  useLayoutEffect(() => {
    const roots = Array.from(
      previewRef.current?.querySelectorAll<HTMLElement>(".markdown-code-copy") ?? [],
      (container) => {
        const root = createRoot(container)
        root.render(<CodeBlockCopyButton />)
        return root
      },
    )

    return () => roots.forEach((root) => root.unmount())
  }, [html, previewRef])

  return (
    <article
      ref={previewRef}
      className={`markdown-preview min-h-0 min-w-0 flex-1 overflow-auto px-5 py-4 ${
        previewMode === "split" ? "border-l border-white/5" : ""
      }`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
