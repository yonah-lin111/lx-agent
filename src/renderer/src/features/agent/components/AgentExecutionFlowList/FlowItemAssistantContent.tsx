import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionAssistantContent } from "@/features/agent/types"

export interface FlowItemAssistantContentProps {
  content: ExecutionAssistantContent
  previewRef: React.RefObject<HTMLDivElement | null>
  // 流式生成中：未闭合代码块延迟语法高亮。
  isStreaming?: boolean
}

export const FlowItemAssistantContent = ({
  content,
  previewRef,
  isStreaming = false,
}: FlowItemAssistantContentProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-assistant-content flex flex-col font-sans text-white/90">
      <LxMarkdownPreview
        html={renderMarkdown(content.text, { streaming: isStreaming })}
        previewMode="preview"
        previewRef={previewRef}
        disableStickyBlockHeaders={isStreaming}
        className="px-0"
        contentClassName="py-0 leading-relaxed text-white/90"
        sanitizeCopy
      />
    </div>
  )
}
