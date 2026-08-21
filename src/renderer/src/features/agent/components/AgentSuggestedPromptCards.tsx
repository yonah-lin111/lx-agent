import type React from "react"
import { DEFAULT_PROMPT_CARDS } from "@/features/agent/constants"
import { useTranslation } from "@/i18n"

// 推荐预设提示词卡片组件属性。
export interface AgentSuggestedPromptCardsProps {
  // 点击预设提示词回调。
  onSelectPrompt: (prompt: string) => void
  // 自定义根容器类名。
  className?: string
}

/**
 * AgentSuggestedPromptCards - 推荐预设提示词卡片列表组件。
 */
export const AgentSuggestedPromptCards = ({
  onSelectPrompt,
  className,
}: AgentSuggestedPromptCardsProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className={`agent-empty-prompts flex flex-col gap-2 ${className ?? ""}`}>
      <span className="agent-empty-prompts-title px-1 text-[11px] font-medium text-white/35">
        {t("agent.suggestedPrompts")}
      </span>
      {DEFAULT_PROMPT_CARDS.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelectPrompt(card.prompt)}
          className="agent-empty-prompt-card flex flex-col items-start rounded-[6px] bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/10"
        >
          <span className="agent-empty-prompt-title text-[12px] font-medium text-white/80">
            {card.title}
          </span>
          <span className="agent-empty-prompt-desc mt-0.5 text-[11px] text-white/40">
            {card.description}
          </span>
        </button>
      ))}
    </div>
  )
}
