import { ChevronDown, ChevronUp } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import type { AgentDiff, AgentDiffLine, DiffLinePart } from "@/features/agent/types"

// diff 展示块属性。
interface AgentDiffBlockProps {
  diff: AgentDiff
  // 流式输出中默认展开（AI 实时输出可见变更），历史回看默认折叠。
  defaultExpanded?: boolean
}

// 展开态内容最大高度（超出内部滚动，与折叠动画的目标高度）。
const MAX_CONTENT_HEIGHT = 320

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
 * 标题栏右侧带折叠/展开按钮，动画与 markdown 代码块一致（300ms 高度过渡）。
 */
export const AgentDiffBlock = ({
  diff,
  defaultExpanded = false,
}: AgentDiffBlockProps): React.JSX.Element => {
  const { lines, truncated, stats } = diff
  const hasChanges = lines.some((line) => line.type !== "context")
  const innerRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [contentHeight, setContentHeight] = useState<number | null>(null)

  // 展开态测量内容高度（受最大高度约束），diff 更新时保持折叠动画精确。
  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element || !isExpanded) {
      setContentHeight(null)
      return undefined
    }
    const updateHeight = (): void =>
      setContentHeight(Math.min(element.scrollHeight, MAX_CONTENT_HEIGHT))
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [lines, isExpanded])

  return (
    <div className="min-w-0 overflow-hidden rounded-[6px] bg-[#1c1c1c]">
      {hasChanges && (
        <div className="flex items-center gap-2 bg-black/30 py-1 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/40">
            {diff.fileName}
          </span>
          <span className="shrink-0 text-[11px] text-white/40">
            <span className="text-emerald-400">+{stats.added}</span>
            <span className="ml-2 text-red-400">−{stats.removed}</span>
            {truncated && <span className="ml-2 text-white/25">已截断，仅显示部分变更</span>}
          </span>
          <LxIconButton
            aria-label={isExpanded ? "折叠内容" : "展开内容"}
            aria-expanded={isExpanded}
            size="small"
            title={{ content: isExpanded ? "折叠内容" : "展开内容", placement: "bottom" }}
            onClick={() => setIsExpanded((previous) => !previous)}
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </LxIconButton>
        </div>
      )}
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? `${contentHeight ?? 0}px` : "0px" }}
      >
        <div ref={innerRef} className="custom-scrollbar max-h-[320px] overflow-y-auto py-1">
          {lines.map((line, index) => {
            // 省略占位行（长上下文段，无行号）。
            if (
              line.type === "context" &&
              line.newLine === undefined &&
              line.oldLine === undefined
            ) {
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
      </div>
    </div>
  )
}
