import { ArrowRightLeft, Check, X } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { agentApi } from "@/features/agent/api/agentApi"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"

export interface FlowItemModeExitContentProps {
  content: ExecutionToolContent
}

/**
 * 执行流程内的模式退出审批：switch_mode 退出只读有效模式时展示内联确认（与消息流
 * AgentModeExitBlock 同语义）。流程视图下同样提供确认入口，避免工具挂起而当前视图无按钮可点。
 */
export const FlowItemModeExitContent = ({
  content,
}: FlowItemModeExitContentProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const pending = content.modeExit
  const [decision, setDecision] = useState<"allow" | "deny" | null>(null)

  if (!pending) return null

  const fromMeta = COLLABORATION_MODE_META[pending.fromMode]

  const respond = (next: "allow" | "deny"): void => {
    if (decision !== null) return
    setDecision(next)
    void agentApi.modeExitRespond({ requestId: pending.requestId, decision: next })
  }

  return (
    <div className="agent-flow-mode-exit flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-xs text-white/45">
        <ArrowRightLeft className="h-3 w-3 shrink-0 text-amber-300" />
        <span className="font-mono font-bold text-amber-300">{t("agent.modeExitTitle")}</span>
      </div>
      <div className="agent-flow-mode-exit-prompt text-xs leading-relaxed text-white/85">
        {t("agent.modeExitPrompt", { mode: t(fromMeta.labelKey) })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <LxIconButton
          variant="ghost"
          iconOnly={false}
          size="small"
          disabled={decision !== null}
          onClick={() => respond("deny")}
          textClass="text-white/75"
          className="agent-flow-mode-exit-reject"
          icon={<X className="shrink-0" />}
        >
          <span>{t("agent.modeExitReject")}</span>
        </LxIconButton>
        <LxIconButton
          variant="ghost"
          iconOnly={false}
          size="small"
          disabled={decision !== null}
          onClick={() => respond("allow")}
          textClass="text-emerald-300"
          className="agent-flow-mode-exit-confirm"
          icon={<Check className="shrink-0" />}
        >
          <span>{t("agent.modeExitConfirm")}</span>
        </LxIconButton>
      </div>
    </div>
  )
}
