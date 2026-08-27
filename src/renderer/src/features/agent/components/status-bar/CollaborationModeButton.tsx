import type { CollaborationMode } from "@shared/contracts/agent"
import { Compass, Zap } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

interface CollaborationModeButtonProps {
  mode?: CollaborationMode
}

/**
 * Agent 状态栏协作模式指示（Default / Plan Mode 只读展示）
 */
export const CollaborationModeButton = ({
  mode = "default",
}: CollaborationModeButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isPlan = mode === "plan"

  return (
    <LxTooltip
      placement="top"
      content={
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-semibold text-white/90">
            {isPlan ? t("agent.collaborationModePlan") : t("agent.collaborationModeDefault")}
          </span>
          <span className="text-white/60">
            {isPlan
              ? t("agent.collaborationModePlanDesc")
              : t("agent.collaborationModeDefaultDesc")}
          </span>
        </div>
      }
    >
      <span
        className={`flex shrink-0 cursor-default items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs transition-colors ${
          isPlan ? "text-sky-400 font-medium" : "text-white/60"
        }`}
      >
        {isPlan ? <Compass className="h-3.5 w-3.5 shrink-0" /> : <Zap className="h-3.5 w-3.5 shrink-0" />}
        <span className="capitalize">{mode}</span>
      </span>
    </LxTooltip>
  )
}
