import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionAssistantContent, ExecutionCompactionContent } from "@/features/agent/types"

export interface FlowItemCompactionContentProps {
  content: ExecutionCompactionContent
  assistantContent?: ExecutionAssistantContent
  previewRef: React.RefObject<HTMLDivElement | null>
}

export const FlowItemCompactionContent = ({
  content,
  assistantContent,
  previewRef,
}: FlowItemCompactionContentProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-compaction-content flex flex-col gap-1.5 font-mono text-[11px] text-white/70">
      <div className="flex items-center gap-2">
        <span className="text-white/40">Mode:</span>
        <span className="text-indigo-300 font-semibold">
          {content.isManual ? "Manual (/compact)" : "Automatic"}
        </span>
      </div>
      {content.summaryTokens && (
        <div className="flex items-center gap-2">
          <span className="text-white/40">Summary:</span>
          <span className="text-indigo-300">{content.summaryTokens} tokens</span>
        </div>
      )}
      {content.compactionUsage && (
        <div className="flex gap-3 text-white/40">
          <span>Input: {content.compactionUsage.input}</span>
          <span>Output: {content.compactionUsage.output}</span>
        </div>
      )}
      {assistantContent?.text && (
        <div className="mt-1 rounded bg-black/40 p-2">
          <LxMarkdownPreview
            html={markdownRenderer.render(assistantContent.text)}
            previewMode="preview"
            previewRef={previewRef}
            className="px-0"
            contentClassName="py-0 text-white/70 [&_*]:!text-white/70"
            sanitizeCopy
          />
        </div>
      )}
    </div>
  )
}
