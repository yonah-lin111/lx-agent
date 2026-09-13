import type { CollaborationMode } from "@shared/contracts/agent"
import { Compass, Palette, ShieldAlert, Zap } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

interface CollaborationModeButtonProps {
  mode?: CollaborationMode
}

/**
 * Agent 状态栏协作模式指示（Build / Plan / Review / Design Mode 展示）
 */
export const CollaborationModeButton = ({
  mode = "build",
}: CollaborationModeButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isPlan = mode === "plan"
  const isReview = mode === "review"
  const isDesign = mode === "design"
  const displayName = isPlan ? "Plan" : isReview ? "Review" : isDesign ? "Design" : "Build"

  const title = isPlan
    ? t("agent.collaborationModePlan")
    : isReview
      ? t("agent.collaborationModeReview")
      : isDesign
        ? t("agent.collaborationModeDesign")
        : t("agent.collaborationModeBuild")

  const desc = isPlan
    ? t("agent.collaborationModePlanDesc")
    : isReview
      ? t("agent.collaborationModeReviewDesc")
      : isDesign
        ? t("agent.collaborationModeDesignDesc")
        : t("agent.collaborationModeBuildDesc")

  return (
    <LxTooltip
      placement="top"
      content={
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-white/90">{title}</span>
            <span className="text-white/60">{desc}</span>
          </div>
          <div className="border-t border-white/10 pt-1 text-[11px] text-white/45">
            {t("agent.collaborationModeShortcutHint")}
          </div>
        </div>
      }
    >
      <LxTag
        size="small"
        variant="ghost"
        color={isPlan ? "sky" : isReview ? "purple" : isDesign ? "pink" : "default"}
        className="shrink-0"
        prefix={
          isPlan ? (
            <Compass className="h-3.5 w-3.5 shrink-0" />
          ) : isReview ? (
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          ) : isDesign ? (
            <Palette className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Zap className="h-3.5 w-3.5 shrink-0" />
          )
        }
      >
        {displayName}
      </LxTag>
    </LxTooltip>
  )
}
