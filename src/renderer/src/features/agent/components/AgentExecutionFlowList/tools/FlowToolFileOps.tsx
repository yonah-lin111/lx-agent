import { Code2, ExternalLink, FileCode } from "lucide-react"
import type React from "react"
import { useCallback } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { agentApi } from "@/features/agent/api/agentApi"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatDurationMs } from "../types"
import { FlowToolRawSection } from "./FlowToolRawSection"

export interface FlowToolFileOpsProps {
  content: ExecutionToolContent
}

export const FlowToolFileOps = ({ content }: FlowToolFileOpsProps): React.JSX.Element => {
  const { t } = useTranslation()
  const filePath =
    typeof content.args?.filePath === "string"
      ? content.args.filePath
      : typeof content.args?.path === "string"
        ? content.args.path
        : ""
  const offset = typeof content.args?.offset === "number" ? content.args.offset : undefined
  const limit = typeof content.args?.limit === "number" ? content.args.limit : undefined

  const handleOpenFile = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (filePath) {
        await agentApi.openFileAt(filePath, offset ?? 1)
      }
    },
    [filePath, offset],
  )

  return (
    <div className="agent-execution-flow-tool-file-ops flex flex-col gap-2 font-mono text-xs">
      {/* 路径与徽标 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded bg-black/40 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <FileCode className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate text-white/85 select-all">{filePath || "(unknown file)"}</span>
        </div>
        {filePath && (
          <LxIconButton
            size="small"
            aria-label="Open File"
            title={{ content: "Open File", placement: "left" }}
            onClick={handleOpenFile}
            className="text-white/40 hover:text-white/80"
          >
            <ExternalLink />
          </LxIconButton>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {content.durationMs !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
          </LxTag>
        )}
        {offset !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">offset: {offset}</span>
          </LxTag>
        )}
        {limit !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">limit: {limit}</span>
          </LxTag>
        )}
        {content.diff?.stats && (
          <LxTag size="small" color="emerald">
            <span className="text-emerald-400">+{content.diff.stats.added}</span>
            <span className="mx-0.5 text-white/20">/</span>
            <span className="text-rose-400">-{content.diff.stats.removed}</span>
          </LxTag>
        )}
      </div>

      {/* 结构化 Diff (针对 write/edit 工具) */}
      {content.diff && content.diff.lines && content.diff.lines.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-white/45">
            <span className="flex items-center gap-1">
              <Code2 className="h-3 w-3" /> {t("agent.lineDiff")}
            </span>
          </div>
          <div className="custom-scrollbar max-h-56 overflow-y-auto rounded bg-black/50 p-2">
            <div className="flex flex-col">
              {content.diff.lines.map((line, lIdx) => (
                <div
                  key={lIdx}
                  className={`flex items-start gap-2 px-1 ${
                    line.type === "add"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : line.type === "del"
                        ? "bg-rose-500/15 text-rose-300"
                        : "text-white/60"
                  }`}
                >
                  <span className="w-4 shrink-0 select-none text-right text-xs opacity-40">
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                  </span>
                  <span className="whitespace-pre-wrap">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 原始参数与执行结果（默认折叠在底部） */}
      <FlowToolRawSection
        args={content.args}
        result={content.result}
        isError={content.isError}
        toolCallId={content.toolCallId}
      />
    </div>
  )
}
