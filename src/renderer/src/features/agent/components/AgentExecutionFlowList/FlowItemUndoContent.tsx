import { FileCode, FileText, Terminal, User } from "lucide-react"
import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { AgentDiff, AgentDiffLine, ExecutionUndoContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { highlightCode, languageFromFileName } from "@/lib/codeHighlight"

// 行首符号配色（新增 + / 删除 − / 上下文空白）。
const SIGN_COLORS: Record<AgentDiffLine["type"], string> = {
  add: "text-emerald-300",
  del: "text-red-300",
  context: "text-white/30",
}

// 增删行背景。
const ROW_BACKGROUND: Record<AgentDiffLine["type"], string> = {
  add: "bg-emerald-500/5",
  del: "bg-red-500/5",
  context: "",
}

const getSign = (line: AgentDiffLine): string => {
  if (line.type === "add") return "+"
  if (line.type === "del") return "−"
  return " "
}

const getLineNumber = (line: AgentDiffLine): string => {
  if (line.type === "add") return line.newLine !== undefined ? String(line.newLine) : ""
  if (line.type === "del") return line.oldLine !== undefined ? String(line.oldLine) : ""
  return line.newLine !== undefined ? String(line.newLine) : ""
}

export interface FlowItemUndoContentProps {
  content: ExecutionUndoContent
  previewRef: React.RefObject<HTMLDivElement | null>
}

export const FlowItemUndoContent = ({
  content,
  previewRef,
}: FlowItemUndoContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  const renderDiffSnippet = (diff: AgentDiff, filePath: string): React.JSX.Element => {
    const language = languageFromFileName(filePath)
    const highlightedCodeLines = diff.lines.map((line) => {
      const lineText = line.text ?? (line as unknown as { content?: string }).content ?? ""
      return highlightCode(lineText, language)
    })

    return (
      <div className="custom-scrollbar max-h-[220px] overflow-y-auto rounded bg-black/60 py-1 font-mono text-[11px] select-text">
        {diff.lines.map((line, idx) => {
          const sign = getSign(line)
          const signColor = SIGN_COLORS[line.type]
          const bg = ROW_BACKGROUND[line.type]
          const lineNumber = getLineNumber(line)
          const lineText = line.text ?? (line as unknown as { content?: string }).content ?? ""
          const highlighted = highlightedCodeLines[idx] || lineText

          return (
            <div
              key={idx}
              className={`flex items-start leading-5 ${bg} hover:bg-white/[0.03] transition-colors`}
            >
              <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-white/20 select-none">
                {lineNumber}
              </span>
              <span className={`w-4 shrink-0 text-center font-bold select-none ${signColor}`}>
                {sign}
              </span>
              <span
                className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2 text-white/80"
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </div>
          )
        })}
      </div>
    )
  }

  const items = useMemo(() => {
    if (content.items && content.items.length > 0) {
      return content.items
    }
    return [content]
  }, [content])

  const isMultiple = items.length > 1

  return (
    <div className="agent-execution-flow-undo-content flex flex-col gap-3 font-mono text-[11px] text-white/70">
      {items.map((item, itemIdx) => {
        const hasDiffs = Boolean(item.diffs && item.diffs.length > 0)
        const hasToolCalls = Boolean(item.toolCalls && item.toolCalls.length > 0)
        const hasPrompt = Boolean(item.userPrompt?.trim())
        const hasAssistant = Boolean(item.assistantSnippet?.trim())

        return (
          <div
            key={itemIdx}
            className={`flex flex-col gap-2.5 ${
              itemIdx > 0 ? "border-t border-white/10 pt-2.5" : ""
            }`}
          >
            {isMultiple && (
              <div className="flex items-center justify-between text-rose-300/80 font-sans font-semibold">
                <span>#{itemIdx + 1}</span>
                {item.modelName && (
                  <span className="text-[10px] text-white/40">{item.modelName}</span>
                )}
              </div>
            )}

            {/* 1. 被撤销的用户提示词 */}
            {hasPrompt && item.userPrompt && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-amber-300/80 font-sans font-semibold">
                  <User className="h-3.5 w-3.5" />
                  <span>{t("agent.undoUndonePrompt")}</span>
                </div>
                <div className="rounded bg-black/40 p-2 text-white/80">
                  <LxMarkdownPreview
                    html={markdownRenderer.render(item.userPrompt)}
                    previewMode="preview"
                    previewRef={previewRef}
                    className="px-0"
                    contentClassName="py-0 text-white/80 [&_*]:!text-white/80"
                    sanitizeCopy
                  />
                </div>
              </div>
            )}

            {/* 2. 被撤销的代码变更 */}
            {hasDiffs && item.diffs && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-rose-300/90 font-sans font-semibold">
                  <span className="flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5" />
                    <span>{t("agent.undoRevokedChanges")}</span>
                  </span>
                  <span className="text-[10px] text-white/40">
                    {t("agent.undoFileCount", { count: item.diffs.length })}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {item.diffs.map((diffItem, idx) => (
                    <div
                      key={idx}
                      className="rounded border border-white/5 bg-black/40 p-2 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate text-white/85">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span className="truncate">{diffItem.filePath}</span>
                        </div>
                        {diffItem.diff?.stats && (
                          <div className="flex items-center gap-1 text-[10px] shrink-0">
                            <span className="text-emerald-400">+{diffItem.diff.stats.added}</span>
                            <span className="text-white/20">/</span>
                            <span className="text-rose-400">−{diffItem.diff.stats.removed}</span>
                          </div>
                        )}
                      </div>
                      {diffItem.diff &&
                        diffItem.diff.lines &&
                        diffItem.diff.lines.length > 0 &&
                        renderDiffSnippet(diffItem.diff, diffItem.filePath)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. 被撤销的工具调用 */}
            {hasToolCalls && item.toolCalls && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-white/50 font-sans font-semibold">
                  <Terminal className="h-3.5 w-3.5 text-amber-300/80" />
                  <span>{t("agent.undoRevokedTools")}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.toolCalls.map((tc, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/70"
                    >
                      <span className="text-amber-300/90">{tc.toolName}</span>
                      {tc.summary && (
                        <span className="text-white/40 truncate max-w-[200px]">{tc.summary}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 4. 助手回复摘要 */}
            {!hasDiffs && hasAssistant && item.assistantSnippet && (
              <div className="flex flex-col gap-1">
                <div className="text-white/40 font-sans font-semibold">
                  {t("agent.undoAssistantPreview")}
                </div>
                <div className="rounded bg-black/40 p-2 text-white/60">{item.assistantSnippet}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
