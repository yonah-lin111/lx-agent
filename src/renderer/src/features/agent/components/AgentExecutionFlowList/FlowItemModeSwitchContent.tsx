import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionModeSwitchContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"

export interface FlowItemModeSwitchContentProps {
  content: ExecutionModeSwitchContent
}

/**
 * 协作模式切换详情：展示当前模式与模式职责（模式提示词由系统提示词模式段注入，此处不重复展开）。
 */
export const FlowItemModeSwitchContent = ({
  content,
}: FlowItemModeSwitchContentProps): React.JSX.Element => {
  const { t } = useTranslation()
  const meta = COLLABORATION_MODE_META[content.mode]

  return (
    <div className="agent-execution-flow-mode-switch-content flex flex-col gap-2 font-mono text-xs text-white/70">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">{t("agent.modeLabel")}</span>
          <LxTag size="small" color={meta.color}>
            {t(meta.labelKey)}
          </LxTag>
          {content.viaAuto && (
            <LxTag size="small" color="indigo">
              {t("agent.modeSwitchViaAuto")}
            </LxTag>
          )}
        </div>
      </div>
      <div className="text-white/45">{t(meta.descKey)}</div>
    </div>
  )
}
