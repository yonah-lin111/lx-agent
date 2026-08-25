import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionThinkingContent } from "@/features/agent/types"

export interface FlowItemThinkingContentProps {
  content: ExecutionThinkingContent
  previewRef: React.RefObject<HTMLDivElement | null>
}

export const FlowItemThinkingContent = ({
  content,
  previewRef,
}: FlowItemThinkingContentProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-thinking-content flex flex-col">
      <LxMarkdownPreview
        html={markdownRenderer.render(content.text)}
        previewMode="preview"
        previewRef={previewRef}
        className="px-0"
        contentClassName="py-0 leading-relaxed text-purple-200/90 [&_*]:!text-purple-200/90"
        sanitizeCopy
      />
    </div>
  )
}
