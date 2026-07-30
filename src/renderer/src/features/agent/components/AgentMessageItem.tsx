import { Check, Copy } from "lucide-react"
import type React from "react"
import { useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { AgentMessage } from "../types"

interface AgentMessageItemProps {
  message: AgentMessage
}

/**
 * 渲染单条 Agent 消息气泡（隐藏气泡顶部头像与名字，无边框与左右内边距，复制按钮置于底部左侧）。
 */
export const AgentMessageItem = ({ message }: AgentMessageItemProps): React.JSX.Element => {
  const isUser = message.role === "user"
  const previewRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // 渲染 Markdown 为 HTML。
  const renderedHtml = useMemo(() => {
    if (isUser) return ""
    return markdownRenderer.render(message.content)
  }, [message.content, isUser])

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
      <div className="flex flex-col items-end px-1">
        <div className="max-w-[88%] rounded-[6px] bg-white/10 px-3 py-2 text-[13px] text-white/90 transition-all hover:bg-white/12 whitespace-pre-wrap break-words">
          {message.content}
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
