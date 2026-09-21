import { Eye } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { ViewImagePreview } from "@/features/agent/components/blocks/AgentViewImageBlock"
import type { ExecutionToolContent } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"
import { formatDurationMs } from "../types"
import { FlowToolRawSection } from "./FlowToolRawSection"

export interface FlowToolViewImageProps {
  content: ExecutionToolContent
}

// view_image 执行流程内容：元信息行 + 缩略图预览 + 底部折叠的输入参数与结果。
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
    <div className="agent-execution-flow-tool-view-image flex flex-col gap-2 font-mono text-xs">
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
          <span className="text-xs text-white/30">ID: {content.toolCallId}</span>
        )}
      </div>

      {/* 缩略图 + 悬浮大图 */}
      <ViewImagePreview details={details} thumbnailClassName="h-32 w-48" />

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
