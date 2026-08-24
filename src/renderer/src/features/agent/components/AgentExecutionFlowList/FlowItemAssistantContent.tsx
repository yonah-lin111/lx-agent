import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionAssistantContent } from "@/features/agent/types"

export interface FlowItemAssistantContentProps {
  content: ExecutionAssistantContent
  previewRef: React.RefObject<HTMLDivElement | null>
}

export const FlowItemAssistantContent = ({
  content,
  previewRef,
}: FlowItemAssistantContentProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-assistant-content flex flex-col font-sans text-white/90">
      <LxMarkdownPreview
        html={markdownRenderer.render(content.text)}
        previewMode="preview"
        previewRef={previewRef}
        className="px-0"
        contentClassName="py-0 leading-relaxed text-white/90"
        sanitizeCopy
      />
    </div>
  )
}
