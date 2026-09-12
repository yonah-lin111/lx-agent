import { Eye, FileText, Terminal } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { ViewImagePreview } from "@/features/agent/components/blocks/AgentViewImageBlock"
import type { ExecutionToolContent } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatDurationMs, formatJsonString } from "../types"

export interface FlowToolViewImageProps {
  content: ExecutionToolContent
}

// view_image 执行流程内容：元信息行 + 缩略图预览 + 输入参数 + 结果。
export const FlowToolViewImage = ({
  content,
}: FlowToolViewImageProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const details = content.image
  if (!details) return null

  const fileName = details.path.split("/").pop() || details.path
  const detailKey: TranslationKey =
    details.detail === "original" ? "agent.viewImageDetailOriginal" : "agent.viewImageDetailHigh"

  return (
    <div className="agent-execution-flow-tool-view-image flex flex-col gap-2 font-mono text-[11px]">
      {/* 元信息行 */}
      <div className="flex flex-wrap items-center gap-2 leading-none">
        <span className="flex shrink-0 items-center gap-1 text-amber-300">
          <Eye className="h-3 w-3" /> view_image
        </span>
        <LxTooltip content={details.path}>
          <span className="min-w-0 max-w-[280px] truncate text-white/70">{fileName}</span>
        </LxTooltip>
        <span className="text-white/40">{t(detailKey)}</span>
        <span className="text-white/40">
          {details.width}×{details.height}
          {details.resized
            ? ` · ${t("agent.viewImageSourceSize", {
                width: details.sourceWidth,
                height: details.sourceHeight,
              })}`
            : ""}
        </span>
        {content.durationMs !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
          </LxTag>
        )}
        {content.toolCallId && (
          <span className="text-[10px] text-white/30">ID: {content.toolCallId}</span>
        )}
      </div>

      {/* 缩略图 + 悬浮大图 */}
      <ViewImagePreview details={details} thumbnailClassName="h-32 w-48" />

      {/* 输入参数 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-white/45">
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
          </span>
        </div>
        <div className="rounded bg-black/40 p-2 text-sky-200/90">
          <FlowItemExpandableText content={formatJsonString(content.args)} maxLines={3} />
        </div>
      </div>

      {/* 执行结果 */}
      {content.result !== undefined && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-white/45">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
            {content.isError && (
              <span className="text-[10px] font-medium text-rose-400">ERROR</span>
            )}
          </div>
          <div
            className={`rounded p-2 ${
              content.isError
                ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            <FlowItemExpandableText content={content.result} fallbackText="-" maxLines={3} />
          </div>
        </div>
      )}
    </div>
  )
}
