import { ChevronDown, CornerDownRight } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { AgentDiff, AgentDiffLine } from "@/features/agent/types"
import { highlightCode, languageFromFileName } from "@/lib/codeHighlight"

// diff 展示块属性。
interface AgentDiffBlockProps {
  diff: AgentDiff
  // 流式输出中默认展开（AI 实时输出可见变更），历史回看默认折叠。
  defaultExpanded?: boolean
}

// 展开态内容最大高度（超出内部滚动，与折叠动画的目标高度）。
const MAX_CONTENT_HEIGHT = 320

// 行首符号配色（新增 + / 删除 − / 上下文空白）。
const SIGN_COLORS: Record<AgentDiffLine["type"], string> = {
  add: "text-emerald-300",
  del: "text-red-300",
  context: "text-white/30",
}

// 增删行极浅背景（仅弱化区分变更行，不覆盖语法高亮）。
const ROW_BACKGROUND: Record<AgentDiffLine["type"], string> = {
  add: "bg-emerald-500/5",
  del: "bg-red-500/5",
  context: "",
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

/**
 * 渲染结构化 diff 块（add/del/context 行 + 行号 + 语法高亮 + 截断/统计）。
 * 变更行仅以行首 + / − 符号区分，内容按文件语言语法高亮（与 markdown 代码块一致）。
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

  // 按文件后缀推断语言并逐行生成语法高亮 HTML。
  const language = useMemo(() => languageFromFileName(diff.fileName ?? ""), [diff.fileName])
  const highlightedLines = useMemo(
    () => lines.map((line) => highlightCode(line.text, language)),
    [lines, language],
  )

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
    <div className="flex min-w-0 items-start gap-1 pl-1">
      <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/40" />
      <div className="agent-diff-block min-w-0 flex-1 overflow-hidden">
        {hasChanges && (
          <button
            type="button"
            aria-label="Diff 内容"
            aria-expanded={isExpanded}
            className="flex h-5 w-fit max-w-full min-w-0 items-center gap-1 rounded-[6px] bg-[#212121] pr-2 text-[12px] text-white/50 transition-all duration-200 hover:bg-[#212121]/80 hover:text-white/70 focus:outline-none"
            onClick={() => setIsExpanded((previous) => !previous)}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {diff.fileName !== undefined && <span className="text-sky-400">diff: </span>}
              {diff.fileName}
            </span>
            <span className="shrink-0 text-[11px]">
              <span className="text-emerald-400">+{stats.added}</span>
              <span className="ml-2 text-red-400">−{stats.removed}</span>
              {truncated && <span className="ml-2 text-white/25">已截断，仅显示部分变更</span>}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
            />
          </button>
        )}
        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
          style={{ maxHeight: isExpanded ? `${contentHeight ?? 0}px` : "0px" }}
        >
          <div
            ref={innerRef}
            className="custom-scrollbar max-h-[320px] overflow-y-auto rounded-[6px] bg-[#2a2a2a] py-1"
          >
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
              return (
                <div
                  key={index}
                  className={`flex min-w-0 items-start px-1 font-mono text-[12px] leading-[1.7] ${ROW_BACKGROUND[line.type]}`}
                >
                  <span className="w-9 shrink-0 select-none pr-2 text-right text-white/30">
                    {getLineNumber(line)}
                  </span>
                  <span className={`w-3 shrink-0 select-none ${SIGN_COLORS[line.type]}`}>
                    {getSign(line)}
                  </span>
                  <span
                    className="min-w-0 whitespace-pre-wrap break-all"
                    dangerouslySetInnerHTML={{ __html: highlightedLines[index] }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
