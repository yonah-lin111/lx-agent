import type React from "react"
import { useRef } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ConversationAgent } from "./types"

export interface OpenClawAssistantMessageProps {
  agentId: string
  content: string
  error?: string
  agent?: ConversationAgent
  isStreaming?: boolean
}

export const OpenClawAssistantMessage = ({
  agentId,
  content,
  error,
  agent,
  isStreaming = false,
}: OpenClawAssistantMessageProps): React.JSX.Element => {
  const previewRef = useRef<HTMLElement | null>(null)

  return (
    <div className="group flex min-w-0 w-full flex-col gap-1.5 px-0">
      <div className="flex w-fit items-center gap-1.5 px-1 leading-none">
        <span
          className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-semibold text-black/90 shadow-sm"
          style={{ backgroundColor: agent?.accent ?? "#4ecdc4" }}
        >
          {(agent?.name ?? agentId).slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[12px] font-medium text-white/70">{agent?.name ?? agentId}</span>
      </div>

      <div className="relative min-w-0 max-w-full rounded-[18px] rounded-bl-[4px] border border-white/5 bg-[#2a2a2a] px-3.5 py-2.5 text-[13px] text-white/90 shadow-sm">
        {content ? (
          <LxMarkdownPreview
            html={markdownRenderer.render(content)}
            previewMode="preview"
            previewRef={previewRef}
            className="px-0"
            contentClassName="py-0"
            sanitizeCopy
          />
        ) : isStreaming ? (
          <div className="flex items-center gap-1.5 py-1 text-white/40">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          </div>
        ) : null}

        {isStreaming && content ? (
          <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-sky-400/80 ml-1" />
        ) : null}

        {error ? <div className="mt-1 text-xs text-rose-300">{error}</div> : null}
      </div>
    </div>
  )
}
