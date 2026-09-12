import { CornerDownRight, Eye, Loader2 } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { ViewImageDetails } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"

// 图片缩略图尺寸类（消息流默认尺寸，执行流程等场景可覆盖）。
const DEFAULT_THUMBNAIL_CLASS = "h-20 w-32"

export interface ViewImagePreviewProps {
  details: ViewImageDetails
  thumbnailClassName?: string
}

/**
 * 图片预览：缩略图 + 悬浮大图。
 * 图片经 lx-image://local 协议直接读取本地文件，不传输 base64。
 */
export const ViewImagePreview = ({
  details,
  thumbnailClassName = DEFAULT_THUMBNAIL_CLASS,
}: ViewImagePreviewProps): React.JSX.Element => {
  const [loading, setLoading] = useState(true)
  const imageSrc = `lx-image://local${details.path}`
  const fileName = details.path.split("/").pop() || details.path

  return (
    <LxTooltip
      multiline
      placement="top"
      content={
        <div className="flex max-h-[min(420px,80vh)] max-w-[min(420px,80vw)] items-center justify-center overflow-hidden p-1">
          <img
            src={imageSrc}
            alt={fileName}
            className="max-h-full max-w-full rounded-[4px] object-contain"
          />
        </div>
      }
    >
      <div
        className={`agent-view-image-thumbnail relative flex items-center justify-center overflow-hidden rounded-[8px] border border-white/10 bg-white/5 cursor-pointer ${thumbnailClassName}`}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#252525]">
            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
          </div>
        )}
        <img
          src={imageSrc}
          alt={fileName}
          className={`h-full w-full object-cover transition-opacity duration-200 ${
            loading ? "opacity-0" : "opacity-100"
          }`}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
    </LxTooltip>
  )
}

export interface AgentViewImageBlockProps {
  // 图片查看结果（view_image 工具产物）。
  details: ViewImageDetails
}

/**
 * view_image 结果块：与其他工具一致的「直角 icon + 参数」摘要行，图片缩进在摘要下方。
 */
export const AgentViewImageBlock = ({ details }: AgentViewImageBlockProps): React.JSX.Element => {
  const { t } = useTranslation()
  const fileName = details.path.split("/").pop() || details.path
  const detailKey: TranslationKey =
    details.detail === "original" ? "agent.viewImageDetailOriginal" : "agent.viewImageDetailHigh"

  return (
    <div className="agent-view-image-block my-0.5 min-w-0">
      <div className="agent-view-image-header flex items-center gap-1">
        <Eye className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        <span className="agent-view-image-name font-mono text-[12px] font-bold text-amber-300">
          view_image
        </span>
      </div>
      <div className="agent-tool-call-summary mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
        <CornerDownRight className="agent-tool-corner mt-[2px] h-3 w-3 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="agent-view-image-meta flex min-w-0 flex-wrap items-center gap-1.5">
            <LxTooltip content={details.path}>
              <span className="min-w-0 truncate text-white/70">{fileName}</span>
            </LxTooltip>
            <span className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[10px] text-white/50">
              {t(detailKey)}
            </span>
            <span className="shrink-0 text-[10px] text-white/40">
              {details.width}×{details.height}
              {details.resized
                ? ` · ${t("agent.viewImageSourceSize", {
                    width: details.sourceWidth,
                    height: details.sourceHeight,
                  })}`
                : ""}
            </span>
          </div>
          <ViewImagePreview details={details} />
        </div>
      </div>
    </div>
  )
}
