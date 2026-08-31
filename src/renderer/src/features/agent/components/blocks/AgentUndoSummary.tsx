import { ChevronDown, FileCode, FileText, Terminal, Undo2, User } from "lucide-react"
import type React from "react"
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { AgentDiff, AgentDiffLine, AgentUndoSummaryPayload } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { highlightCode, languageFromFileName } from "@/lib/codeHighlight"

// 行首符号配色（新增 + / 删除 − / 上下文空白）。
const SIGN_COLORS: Record<AgentDiffLine["type"], string> = {
  add: "text-emerald-300",
  del: "text-red-300",
  context: "text-white/30",
}

// 增删行背景（弱化区分变更行）。
const ROW_BACKGROUND: Record<AgentDiffLine["type"], string> = {
  add: "bg-emerald-500/5",
  del: "bg-red-500/5",
  context: "",
}

// 行首符号。
const getSign = (line: AgentDiffLine): string => {
  if (line.type === "add") return "+"
  if (line.type === "del") return "−"
  return " "
}

// 展示行号。
const getLineNumber = (line: AgentDiffLine): string => {
  if (line.type === "add") return line.newLine !== undefined ? String(line.newLine) : ""
  if (line.type === "del") return line.oldLine !== undefined ? String(line.oldLine) : ""
  return line.newLine !== undefined ? String(line.newLine) : ""
}

// 格式化时间戳为时分秒。
const formatTimestampTime = (timestamp?: number): string => {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  return date.toTimeString().split(" ")[0] || ""
}

export interface AgentUndoSummaryProps {
  payload?: AgentUndoSummaryPayload
}

/**
 * 渲染可折叠的撤销/删除摘要卡片，默认折叠展示。
 */
export const AgentUndoSummary = ({ payload }: AgentUndoSummaryProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element || !isExpanded) {
      setContentHeight(null)
      return undefined
    }

    const updateHeight = (): void => setContentHeight(element.scrollHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [payload, isExpanded])

  const titleText = t("agent.turnUndoneSummary")

  // 指标行片段（时间 / 工具调用数 / 文件变更数 / 模型名）。
  const metricSegments: React.ReactNode[] = useMemo(() => {
    const segments: React.ReactNode[] = []
    if (payload?.undoneAt) {
      segments.push(<span key="time">{formatTimestampTime(payload.undoneAt)}</span>)
    }
    if (payload?.modelName) {
      segments.push(<span key="model">MODEL {payload.modelName}</span>)
    }
    if (payload?.toolCallCount !== undefined && payload.toolCallCount > 0) {
      segments.push(
        <span key="tools">{t("agent.undoToolCount", { count: payload.toolCallCount })}</span>,
      )
    }
    if (payload?.fileChangeCount !== undefined && payload.fileChangeCount > 0) {
      segments.push(
        <span key="files">{t("agent.undoFileCount", { count: payload.fileChangeCount })}</span>,
      )
    }
    return segments
  }, [payload, t])

  const renderDiffSnippet = (diff: AgentDiff, filePath: string): React.JSX.Element => {
    const language = languageFromFileName(filePath)
    const highlightedCodeLines = diff.lines.map((line) => highlightCode(line.content, language))

    return (
      <div className="custom-scrollbar max-h-[220px] overflow-y-auto rounded bg-black/60 py-1 font-mono text-[11px] select-text">
        {diff.lines.map((line, idx) => {
          const sign = getSign(line)
          const signColor = SIGN_COLORS[line.type]
          const bg = ROW_BACKGROUND[line.type]
          const lineNumber = getLineNumber(line)
          const highlighted = highlightedCodeLines[idx] ?? line.content

          return (
            <div
              key={idx}
              className={`flex items-start leading-5 ${bg} hover:bg-white/[0.03] transition-colors`}
            >
              <span className="w-10 shrink-0 pr-2 text-right text-[10px] text-white/20 select-none">
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

  const hasDiffs = Boolean(payload?.diffs && payload.diffs.length > 0)
  const hasToolCalls = Boolean(payload?.toolCalls && payload.toolCalls.length > 0)
  const hasPrompt = Boolean(payload?.userPrompt?.trim())
  const hasAssistant = Boolean(payload?.assistantSnippet?.trim())

  return (
    <div className="agent-undo-summary my-1.5 w-full max-w-full select-none">
      <button
        type="button"
        aria-label={titleText}
        aria-expanded={isExpanded}
        className="agent-undo-toggle-btn mb-1 flex h-5 w-full items-center gap-1.5 text-[11px] font-medium text-white/35 transition-colors hover:text-white/55 focus:outline-none"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <Undo2 className="h-3.5 w-3.5 text-rose-400/80 shrink-0" />
        <span className="agent-undo-title italic">{titleText}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
      </button>

      {metricSegments.length > 0 && (
        <div className="agent-message-usage mb-1 flex items-center gap-1 text-[10px] leading-none text-white/35 select-text tabular-nums whitespace-nowrap">
          {metricSegments.map((segment, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <span aria-hidden="true" className="agent-message-usage-separator">
                  ·
                </span>
              )}
              <span className="agent-message-usage-item">{segment}</span>
            </Fragment>
          ))}
        </div>
      )}

      <div
        style={{
          maxHeight: isExpanded
            ? contentHeight !== null
              ? `${contentHeight}px`
              : `${innerRef.current?.scrollHeight ?? 0}px`
            : "0px",
          opacity: isExpanded ? 1 : 0,
          transition:
            "max-height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)",
        }}
        className="overflow-hidden"
      >
        <div ref={innerRef} className="w-full">
          <div className="agent-undo-bubble rounded-[18px] rounded-bl-[4px] bg-[#303030] px-3.5 py-3 text-[12px] text-white/70 flex flex-col gap-3 border border-white/5 shadow-sm">
            {/* 1. 被撤销的用户提示词 */}
            {hasPrompt && payload?.userPrompt && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300/80">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("agent.undoUndonePrompt")}</span>
                </div>
                <div className="rounded-[10px] bg-black/30 px-3 py-2 text-[12px] text-white/80">
                  <LxMarkdownPreview
                    html={markdownRenderer.render(payload.userPrompt)}
                    previewMode="preview"
                    previewRef={previewRef}
                    className="px-0"
                    contentClassName="py-0 [&_*]:!text-white/80"
                  />
                </div>
                {payload.files && payload.files.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {payload.files.map((file, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/60"
                      >
                        <FileText className="h-3 w-3" />
                        <span className="truncate max-w-[180px]">{file.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. 被撤销的代码变更 Diff */}
            {hasDiffs && payload?.diffs && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-rose-300/90">
                  <span className="flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5 shrink-0" />
                    <span>{t("agent.undoRevokedChanges")}</span>
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">
                    {t("agent.undoFileCount", { count: payload.diffs.length })}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {payload.diffs.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-[10px] border border-white/5 bg-black/30 p-2.5 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate text-[11px] font-mono text-white/85">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span className="truncate">{item.filePath}</span>
                        </div>
                        {item.diff?.stats && (
                          <div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
                            <span className="text-emerald-400">+{item.diff.stats.added}</span>
                            <span className="text-white/20">/</span>
                            <span className="text-rose-400">−{item.diff.stats.removed}</span>
                          </div>
                        )}
                      </div>
                      {item.diff &&
                        item.diff.lines &&
                        item.diff.lines.length > 0 &&
                        renderDiffSnippet(item.diff, item.filePath)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. 被撤销的工具调用 */}
            {hasToolCalls && payload?.toolCalls && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50">
                  <Terminal className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span>{t("agent.undoRevokedTools")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {payload.toolCalls.map((tc, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-[6px] bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-white/70 border border-white/5"
                    >
                      <span className="font-semibold text-amber-300/90">{tc.toolName}</span>
                      {tc.summary && (
                        <span className="text-white/40 truncate max-w-[220px]">{tc.summary}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 4. 助手回复摘要（若存在且未含 diff） */}
            {!hasDiffs && hasAssistant && payload?.assistantSnippet && (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold text-white/40">
                  {t("agent.undoAssistantPreview")}
                </div>
                <div className="rounded-[10px] bg-black/20 p-2 text-[11px] text-white/60 line-clamp-3">
                  {payload.assistantSnippet}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
