import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { AgentMessage } from "../types"

interface AgentMessageItemProps {
  message: AgentMessage
}

/**
 * 渲染单条 Agent 或用户消息气泡（隐藏气泡顶部头像与名字，无边框与左右内边距，底部悬浮显示复制按钮，Agent 消息靠左对齐，用户消息靠右对齐）。
 */
export const AgentMessageItem = ({ message }: AgentMessageItemProps): React.JSX.Element => {
  const isUser = message.role === "user"
  const previewRef = useRef<HTMLDivElement>(null)
  const userContentRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCollapsible, setIsCollapsible] = useState(false)
  const [isClamped, setIsClamped] = useState(false)

  // 渲染 Markdown 为 HTML。
  const renderedHtml = useMemo(() => {
    if (isUser) return ""
    return markdownRenderer.render(message.content)
  }, [message.content, isUser])

  // 检测用户消息是否超过3行。
  useLayoutEffect(() => {
    if (!isUser) return
    const content = userContentRef.current
    if (!content) return

    // 临时移除 line-clamp 以准确测量完整高度
    const wasClamped = content.classList.contains("line-clamp-3")
    if (wasClamped) {
      content.classList.remove("line-clamp-3")
    }

    const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 20
    const collapsedHeight = lineHeight * 3
    const fullHeight = content.scrollHeight

    if (wasClamped && !isExpanded) {
      content.classList.add("line-clamp-3")
    }

    if (fullHeight > collapsedHeight + 1) {
      setIsCollapsible(true)
      if (!isExpanded) {
        content.style.height = `${collapsedHeight}px`
        setIsClamped(true)
      }
    } else {
      setIsCollapsible(false)
      setIsClamped(false)
      content.style.height = ""
    }
  }, [message.content, isUser, isExpanded])

  const toggleExpand = (): void => {
    const content = userContentRef.current
    if (!content) return

    const nextIsExpanded = !isExpanded
    const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 20
    const collapsedHeight = lineHeight * 3

    if (nextIsExpanded) {
      setIsClamped(false)
      content.style.height = `${collapsedHeight}px`

      requestAnimationFrame(() => {
        content.style.height = `${content.scrollHeight}px`
      })

      content.addEventListener(
        "transitionend",
        () => {
          if (content.dataset.expanded === "true") {
            content.style.height = ""
          }
        },
        { once: true },
      )
    } else {
      content.style.height = `${content.scrollHeight}px`

      requestAnimationFrame(() => {
        content.style.height = `${collapsedHeight}px`
      })

      content.addEventListener(
        "transitionend",
        () => {
          if (content.dataset.expanded === "false") {
            setIsClamped(true)
          }
        },
        { once: true },
      )
    }

    content.dataset.expanded = nextIsExpanded ? "true" : "false"
    setIsExpanded(nextIsExpanded)
  }

  const copyMessageContent = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  if (isUser) {
    return (
      <div className="group flex flex-col items-end px-0">
        <div className="max-w-[88%] rounded-[6px] bg-white/10 px-3 py-2 text-[13px] text-white/90 transition-all hover:bg-white/12 whitespace-pre-wrap break-words">
          <div
            ref={userContentRef}
            className={`overflow-hidden transition-[height] duration-300 ease-in-out ${
              isClamped ? "line-clamp-3" : ""
            }`}
          >
            {message.content}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1 justify-end opacity-0 transition-opacity group-hover:opacity-100">
          {isCollapsible && (
            <LxIconButton
              size="small"
              aria-label={isExpanded ? "折叠内容" : "展开内容"}
              title={{ content: isExpanded ? "折叠内容" : "展开内容", placement: "top" }}
              onClick={toggleExpand}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </LxIconButton>
          )}
          <LxIconButton
            size="small"
            aria-label="复制消息"
            title={{ content: copied ? "已复制" : "复制消息", placement: "top" }}
            onClick={copyMessageContent}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </LxIconButton>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col gap-1 px-0">
      {message.isStreaming && (
        <div className="flex items-center gap-1.5 px-0 text-[10px] text-emerald-400/80">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
          <span>思考中...</span>
        </div>
      )}

      <div className="relative rounded-[6px] bg-transparent p-0 text-[13px] text-white/90">
        <LxMarkdownPreview
          html={renderedHtml}
          previewMode="preview"
          previewRef={previewRef}
          className="px-0"
          contentClassName="py-1"
        />
        <div className="mt-1 flex items-center justify-start opacity-0 transition-opacity group-hover:opacity-100">
          <LxIconButton
            size="small"
            aria-label="复制消息"
            title={{ content: copied ? "已复制" : "复制消息", placement: "top" }}
            onClick={copyMessageContent}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </LxIconButton>
        </div>
      </div>
    </div>
  )
}
