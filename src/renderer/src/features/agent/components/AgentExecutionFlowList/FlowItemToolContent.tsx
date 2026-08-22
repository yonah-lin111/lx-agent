import { Code2, FileText, Terminal } from "lucide-react"
import type React from "react"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatJsonString } from "./types"

export interface FlowItemToolContentProps {
  content: ExecutionToolContent
}

export const FlowItemToolContent = ({ content }: FlowItemToolContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-tool-content flex flex-col gap-2">
      {/* 参数 */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
          <span className="flex items-center gap-1 font-mono">
            <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
          </span>
          {content.toolCallId && (
            <span className="font-mono text-[10px] text-white/30">ID: {content.toolCallId}</span>
          )}
        </div>
        <div className="custom-scrollbar max-h-48 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px] text-sky-200/90">
          {formatJsonString(content.args)}
        </div>
      </div>

      {/* 结构化 Diff (针对 write/edit 工具) */}
      {content.diff && (
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-white/45">
            <span className="flex items-center gap-1">
              <Code2 className="h-3 w-3" /> {t("agent.lineDiff")}
            </span>
            {content.diff.stats && (
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="text-emerald-400">+{content.diff.stats.added}</span>
                <span className="text-red-400">-{content.diff.stats.removed}</span>
              </span>
            )}
          </div>
          <div className="custom-scrollbar max-h-48 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px]">
            {content.diff.fileName && (
              <div className="text-white/60 mb-1">{content.diff.fileName}</div>
            )}
            {content.diff.lines && content.diff.lines.length > 0 && (
              <div className="flex flex-col">
                {content.diff.lines.map((line, lIdx) => (
                  <div
                    key={lIdx}
                    className={`flex items-start gap-2 px-1 ${
                      line.type === "add"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : line.type === "del"
                          ? "bg-red-500/15 text-red-300"
                          : "text-white/60"
                    }`}
                  >
                    <span className="w-4 shrink-0 select-none text-right text-[10px] opacity-40">
                      {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                    </span>
                    <span className="whitespace-pre-wrap">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 结果 */}
      {content.result !== undefined && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
            <span className="flex items-center gap-1 font-mono">
              <FileText className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
            {content.isError && <span className="text-[10px] text-red-400 font-medium">ERROR</span>}
          </div>
          <div
            className={`custom-scrollbar max-h-60 overflow-y-auto rounded p-2 font-mono text-[11px] leading-relaxed ${
              content.isError
                ? "border border-red-500/20 bg-red-950/20 text-red-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            {content.result || <span className="text-white/30">-</span>}
          </div>
        </div>
      )}
    </div>
  )
}
