import { MessageSquare, Workflow } from "lucide-react"
import type React from "react"
import { useTranslation } from "@/i18n"
import logoImg from "../../../../../../resources/icons/lx-op-logo.png"

// 空状态英雄区域组件属性。
export interface AgentEmptyHeroProps {
  // 当前视图模式（qa 为问答模式，flow 为执行流程模式）。
  mode?: "qa" | "flow"
  // 自定义容器类名。
  className?: string
}

/**
 * AgentEmptyHero - 空状态品牌展示与当前模式功能说明组件（主要用于问答对话视图）。
 */
export const AgentEmptyHero = ({
  mode = "qa",
  className,
}: AgentEmptyHeroProps): React.JSX.Element => {
  const { t } = useTranslation()

  const isFlow = mode === "flow"
  const IconComponent = isFlow ? Workflow : MessageSquare
  const modeDesc = isFlow ? t("agent.emptyFlowModeDesc") : t("agent.emptyQaModeDesc")
  const iconColor = isFlow ? "text-emerald-400" : "text-sky-400"

  return (
    <div
      className={`agent-empty-hero flex flex-col items-center justify-center px-4 text-center select-none ${
        className ?? ""
      }`}
    >
      <img
        src={logoImg}
        alt="LX Agent"
        className="agent-empty-logo mb-3.5 h-16 w-16 rounded-2xl object-contain drop-shadow-md select-none pointer-events-none"
      />
      <h3 className="agent-empty-title text-[15px] font-semibold text-white/90">
        {t("agent.emptyTitle")}
      </h3>
      <p className="agent-empty-description mt-1 max-w-[340px] text-[12px] leading-relaxed text-white/45">
        {t("agent.emptyDescription")}
      </p>

      {/* 当前模式指引卡片 */}
      <div className="agent-empty-modes mt-4 flex max-w-[360px] flex-col gap-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left text-[11px]">
        <div className="flex items-center gap-2 text-white/70">
          <IconComponent className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
          <span className="font-medium text-white/85">{modeDesc}</span>
        </div>
        <div className="border-t border-white/5 pt-1 text-center text-[10px] text-white/35">
          {t("agent.emptySwitchHint")}
        </div>
      </div>
    </div>
  )
}
