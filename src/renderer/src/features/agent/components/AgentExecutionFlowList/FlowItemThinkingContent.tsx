import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionThinkingContent } from "@/features/agent/types"

export interface FlowItemThinkingContentProps {
  content: ExecutionThinkingContent
  previewRef: React.RefObject<HTMLDivElement | null>
  // 流式生成中：未闭合代码块延迟语法高亮。
  isStreaming?: boolean
}

export const FlowItemThinkingContent = ({
  content,
  previewRef,
  isStreaming = false,
}: FlowItemThinkingContentProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-thinking-content flex flex-col">
      <LxMarkdownPreview
        html={renderMarkdown(content.text, { streaming: isStreaming })}
        previewMode="preview"
        previewRef={previewRef}
        disableStickyBlockHeaders={isStreaming}
        className="px-0"
        contentClassName="py-0 leading-relaxed text-purple-200/90 [&_*]:!text-purple-200/90"
        sanitizeCopy
      />
    </div>
  )
}
