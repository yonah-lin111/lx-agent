import { CornerDownRight, Search } from "lucide-react"
import type React from "react"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 联网搜索展示组件属性类型。
type AgentWebSearchBlockProps = {
  // 同一轮连续执行的联网搜索调用。
  toolCalls: ToolCallBlock[]
}

// 提取搜索关键词（缺失或非法时忽略该次调用）。
const getSearchQueries = (toolCalls: ToolCallBlock[]): string[] =>
  toolCalls
    .map((call) => call.args.query)
    .filter((query): query is string => typeof query === "string" && query.trim() !== "")
    .map((query) => query.trim())

/**
 * AgentWebSearchBlock - 渲染联网搜索调用，仅展示搜索条件（`[条件1], [条件2]`），
 * 不展示搜索内容，不参与普通工具折叠。所有调用均失败时标注英文失败提示。
 */
export const AgentWebSearchBlock = ({
  toolCalls,
}: AgentWebSearchBlockProps): React.JSX.Element | null => {
  if (toolCalls.length === 0) return null

  const queries = getSearchQueries(toolCalls)
  const allFailed = toolCalls.every((call) => call.status === "error")

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <Search className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="font-mono text-[12px] font-bold text-emerald-300">Web Search</span>
        {allFailed && <span className="text-[12px] text-red-400">· Web search failed</span>}
      </div>
      {queries.length > 0 && (
        <div className="mt-1 flex min-w-0 items-start gap-1 pl-1">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
          <span className="min-w-0 break-all font-mono text-[12px] leading-relaxed text-white/45">
            {queries.map((query) => `[${query}]`).join(", ")}
          </span>
        </div>
      )}
    </div>
  )
}
