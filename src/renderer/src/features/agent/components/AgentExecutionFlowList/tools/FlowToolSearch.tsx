import { ExternalLink, FileText, Search } from "lucide-react"
import type React from "react"
import { useCallback } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { agentApi } from "@/features/agent/api/agentApi"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatDurationMs } from "../types"

export interface FlowToolSearchProps {
  content: ExecutionToolContent
}

export const FlowToolSearch = ({ content }: FlowToolSearchProps): React.JSX.Element => {
  const { t } = useTranslation()
  const pattern =
    typeof content.args?.pattern === "string"
      ? content.args.pattern
      : typeof content.args?.query === "string"
        ? content.args.query
        : ""
  const path = typeof content.args?.path === "string" ? content.args.path : ""
  const include = typeof content.args?.include === "string" ? content.args.include : ""

  const handleOpenLspLocation = useCallback(
    async (filePath: string, line: number) => {
      await agentApi.openFileAt(filePath, line)
    },
    [],
  )

  return (
    <div className="agent-execution-flow-tool-search flex flex-col gap-2 font-mono text-[11px]">
      {/* 搜索查询条件 */}
      <div className="flex flex-col gap-1.5 rounded border border-white/5 bg-black/40 p-2">
        <div className="flex items-center gap-1.5 text-sky-300">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <span className="font-semibold text-white/40">Query:</span>
          <span className="text-white/85 select-all">"{pattern || "(all)"}"</span>
        </div>
        {(path || include) && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/45">
            {path && <span>Scope: {path}</span>}
            {include && <span>Include: {include}</span>}
          </div>
        )}
      </div>

      {/* 耗时与状态 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {content.durationMs !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
          </LxTag>
        )}
        {content.isError && (
          <LxTag size="small" color="rose">
            <span className="text-rose-300">failed</span>
          </LxTag>
        )}
      </div>

      {/* 结构化 LSP 结果条目 */}
      {content.lsp && content.lsp.results && content.lsp.results.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-white/40">LSP References ({content.lsp.results.length})</div>
          <div className="custom-scrollbar max-h-48 overflow-y-auto rounded bg-black/50 p-1.5 flex flex-col gap-1">
            {content.lsp.results.map((loc, idx) => (
              <div
                key={idx}
                onClick={() => void handleOpenLspLocation(loc.filePath, loc.line)}
                className="flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-white/5"
              >
                <span className="truncate text-white/80">
                  {loc.filePath}:{loc.line}
                </span>
                <LxIconButton size="small" aria-label="Open" className="text-white/30 hover:text-white/70">
                  <ExternalLink className="h-3 w-3" />
                </LxIconButton>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 搜索纯文本输出 */}
      {content.result !== undefined && !content.lsp && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-white/45">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
          </div>
          <div
            className={`custom-scrollbar max-h-60 overflow-y-auto rounded p-2 leading-relaxed break-all whitespace-pre-wrap ${
              content.isError
                ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            {content.result || <span className="text-white/30">(no matches)</span>}
          </div>
        </div>
      )}
    </div>
  )
}
