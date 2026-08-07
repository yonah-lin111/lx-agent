import type React from "react"

import { AgentWebSearchBlock, type ChatBlock } from "@/features/agent"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 正常执行与部分失败的联网搜索调用。
const SEARCH_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "search-1",
    toolName: "web_search",
    args: { query: "lucide-react icon list" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "search-2",
    toolName: "web_search",
    args: { query: "electron-vite main process" },
    status: "done",
  },
]

// 全部失败的联网搜索调用。
const FAILED_SEARCH_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "search-3",
    toolName: "web_search",
    args: { query: "unknown query" },
    status: "error",
  },
]

/**
 * 预览 AgentWebSearchBlock 组件。
 */
export const AgentWebSearchDemo = (): React.JSX.Element => (
  <div className="flex w-full flex-col gap-4">
    <UiPreviewSection title="联网搜索" description="仅展示搜索条件，多个条件以逗号分隔">
      <div className="flex max-w-lg flex-col">
        <AgentWebSearchBlock toolCalls={SEARCH_CALLS} />
      </div>
    </UiPreviewSection>
    <UiPreviewSection title="全部失败" description="所有调用均失败时标注 Web search failed">
      <div className="flex max-w-lg flex-col">
        <AgentWebSearchBlock toolCalls={FAILED_SEARCH_CALLS} />
      </div>
    </UiPreviewSection>
  </div>
)
