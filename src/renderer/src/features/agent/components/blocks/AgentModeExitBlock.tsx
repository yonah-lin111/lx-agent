import type { CollaborationMode } from "@shared/contracts/agent"
import { ArrowRightLeft, Check, CornerDownRight, X } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { agentApi } from "@/features/agent/api/agentApi"
import type { ChatBlock } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 单个模式退出确认块组件属性类型。
interface AgentModeExitBlockProps {
  toolCall: ToolCallBlock
}

/**
 * AgentModeExitBlock - 渲染 switch_mode 工具调用：auto 编排下退出只读有效模式（plan / review / design）
 * 回 build 时必须经用户批准，在消息流内直接展示内联确认（退出并执行 / 留在当前模式）。
 * 审批完成后挂起请求由工具结束事件清除，块退回只读摘要。
 */
export const AgentModeExitBlock = ({ toolCall }: AgentModeExitBlockProps): React.JSX.Element => {
  const { t } = useTranslation()
  const pending = toolCall.modeExit
  const [decision, setDecision] = useState<"allow" | "deny" | null>(null)

  const respond = (next: "allow" | "deny"): void => {
    if (!pending || decision !== null) return
    setDecision(next)
    void agentApi.modeExitRespond({ requestId: pending.requestId, decision: next })
  }

  const pendingMeta = pending ? COLLABORATION_MODE_META[pending.fromMode] : undefined
  // 历史回放（无挂起请求）：以 args.mode 的目标模式做只读摘要。
  const targetMode =
    typeof toolCall.args.mode === "string" ? (toolCall.args.mode as CollaborationMode) : undefined
  const targetMeta =
    targetMode && targetMode in COLLABORATION_MODE_META
      ? COLLABORATION_MODE_META[targetMode]
      : undefined

  const resolveSummary = (): string => {
    if (decision === "allow" && pendingMeta) {
      return t("agent.modeExitAllowed", { mode: t(pendingMeta.labelKey) })
    }
    if (decision === "deny" && pendingMeta) {
      return t("agent.modeExitDenied", { mode: t(pendingMeta.labelKey) })
    }
    return targetMeta
      ? `${t("agent.modeExitResolved")} · ${t(targetMeta.labelKey)}`
      : t("agent.modeExitResolved")
  }

  return (
    <div className="agent-mode-exit-block my-0.5 min-w-0">
      <div className="agent-mode-exit-header flex items-center gap-1">
        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        <span className="agent-mode-exit-name font-mono text-xs font-bold text-amber-300">
          {t("agent.modeExitTitle")}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-start gap-1 pl-1">
        <CornerDownRight className="agent-mode-exit-corner mt-[2px] h-3 w-3 shrink-0 text-white/45" />
        <div className="min-w-0 flex-1">
          {pending && pendingMeta ? (
            <>
              <div className="agent-mode-exit-prompt text-xs leading-relaxed text-white/85">
                {t("agent.modeExitPrompt", { mode: t(pendingMeta.labelKey) })}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                <LxIconButton
                  variant="ghost"
                  iconOnly={false}
                  size="small"
                  disabled={decision !== null}
                  onClick={() => respond("deny")}
                  textClass="text-white/75"
                  className="agent-mode-exit-reject"
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
                  className="agent-mode-exit-confirm"
                  icon={<Check className="shrink-0" />}
                >
                  <span>{t("agent.modeExitConfirm")}</span>
                </LxIconButton>
              </div>
            </>
          ) : (
            <div className="agent-mode-exit-summary text-xs text-white/55">{resolveSummary()}</div>
          )}
        </div>
      </div>
    </div>
  )
}
