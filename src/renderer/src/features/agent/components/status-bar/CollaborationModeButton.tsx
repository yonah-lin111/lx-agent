import type { CollaborationMode } from "@shared/contracts/agent"
import { Compass, ShieldAlert, Zap } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

interface CollaborationModeButtonProps {
  mode?: CollaborationMode
}

/**
 * Agent 状态栏协作模式指示（Build / Plan / Review Mode 展示）
 */
export const CollaborationModeButton = ({
  mode = "build",
}: CollaborationModeButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isPlan = mode === "plan"
  const isReview = mode === "review"
  const displayName = isPlan ? "Plan" : isReview ? "Review" : "Build"

  const title = isPlan
    ? t("agent.collaborationModePlan")
    : isReview
      ? t("agent.collaborationModeReview")
      : t("agent.collaborationModeBuild")

  const desc = isPlan
    ? t("agent.collaborationModePlanDesc")
    : isReview
      ? t("agent.collaborationModeReviewDesc")
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
      <span
        className={`flex shrink-0 cursor-default items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs transition-colors ${
          isPlan
            ? "text-sky-400 font-medium"
            : isReview
              ? "text-violet-400 font-medium"
              : "text-white/60"
        }`}
      >
        {isPlan ? (
          <Compass className="h-3.5 w-3.5 shrink-0" />
        ) : isReview ? (
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Zap className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{displayName}</span>
      </span>
    </LxTooltip>
  )
}
