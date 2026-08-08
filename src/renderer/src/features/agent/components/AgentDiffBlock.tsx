import type React from "react"
import type { AgentDiff, AgentDiffLine, DiffLinePart } from "@/features/agent/types"

// diff 展示块属性。
interface AgentDiffBlockProps {
  diff: AgentDiff
}

// 行类型对应的整行配色。
const LINE_COLORS: Record<AgentDiffLine["type"], { row: string; sign: string }> = {
  add: { row: "bg-emerald-500/10 text-emerald-300", sign: "text-emerald-300" },
  del: { row: "bg-red-500/10 text-red-300", sign: "text-red-300" },
  context: { row: "text-white/45", sign: "text-white/30" },
}

// 词级变更片段的逆色高亮配色。
const PART_HIGHLIGHT: Record<"add" | "del", string> = {
  add: "bg-emerald-400/30 text-white",
  del: "bg-red-400/30 text-white",
}

// 行首符号（新增 + / 删除 − / 上下文空白）。
const getSign = (line: AgentDiffLine): string => {
  if (line.type === "add") return "+"
  if (line.type === "del") return "−"
  return " "
}

// 展示行号：新增用新文件行号，删除用旧文件行号，上下文优先新文件行号。
const getLineNumber = (line: AgentDiffLine): string => {
  if (line.type === "add") return line.newLine !== undefined ? String(line.newLine) : ""
  if (line.type === "del") return line.oldLine !== undefined ? String(line.oldLine) : ""
  return line.newLine !== undefined ? String(line.newLine) : ""
}

// 渲染行内容（有词级片段时高亮变更 token）。
const renderLineContent = (line: AgentDiffLine): React.ReactNode => {
  if (!line.parts || line.parts.length === 0) return line.text
  const highlight = PART_HIGHLIGHT[line.type as "add" | "del"]
  return line.parts.map((part: DiffLinePart, index) => (
    <span key={index} className={part.changed ? highlight : ""}>
      {part.text}
    </span>
  ))
}

/**
 * 渲染结构化 diff 块（add/del/context 行 + 行号 + 词级变更高亮 + 截断/统计）。
 */
export const AgentDiffBlock = ({ diff }: AgentDiffBlockProps): React.JSX.Element => {
  const { lines, truncated, stats } = diff
  const hasChanges = lines.some((line) => line.type !== "context")

  return (
    <div className="min-w-0 overflow-hidden rounded-[6px] border border-white/10 bg-[#1c1c1c]">
      <div className="custom-scrollbar max-h-[320px] overflow-y-auto py-1">
        {lines.map((line, index) => {
          // 省略占位行（长上下文段，无行号）。
          if (line.type === "context" && line.newLine === undefined && line.oldLine === undefined) {
            return (
              <div
                key={index}
                className="select-none px-3 py-px text-[11px] leading-[1.8] text-white/25"
              >
                …
              </div>
            )
          }
          const colors = LINE_COLORS[line.type]
          return (
            <div
              key={index}
              className={`flex min-w-0 items-start px-1 font-mono text-[12px] leading-[1.7] ${colors.row}`}
            >
              <span className="w-9 shrink-0 select-none pr-2 text-right text-white/30">
                {getLineNumber(line)}
              </span>
              <span className={`w-3 shrink-0 select-none ${colors.sign}`}>{getSign(line)}</span>
              <span className="min-w-0 whitespace-pre-wrap break-all">
                {renderLineContent(line)}
              </span>
            </div>
          )
        })}
      </div>
      {hasChanges && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/40">
          <span className="text-emerald-400">+{stats.added}</span>
          <span className="text-red-400">−{stats.removed}</span>
          {truncated && <span>已截断，仅显示部分变更</span>}
        </div>
      )}
    </div>
  )
}
