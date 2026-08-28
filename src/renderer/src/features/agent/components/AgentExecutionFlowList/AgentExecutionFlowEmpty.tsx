import { Brain, Code2, FileCode, Layers, Sparkles, Terminal, Workflow } from "lucide-react"
import type React from "react"
import { DEFAULT_PROMPT_CARDS } from "@/features/agent/constants"
import { useTranslation } from "@/i18n"
import logoImg from "../../../../../../../resources/icons/lx-op-logo.png"

export interface AgentExecutionFlowEmptyProps {
  onSelectPrompt?: (prompt: string) => void
  className?: string
}

export const AgentExecutionFlowEmpty = ({
  onSelectPrompt,
  className,
}: AgentExecutionFlowEmptyProps): React.JSX.Element => {
  const { t } = useTranslation()

  const pipelineSteps = [
    {
      icon: Layers,
      title: t("agent.emptyFlowStepPrompt"),
      desc: t("agent.emptyFlowStepPromptDesc"),
      badge: "STEP 1",
      accent:
        "text-amber-400 border-amber-500/20 bg-[var(--color-theme-surface,#212121)] hover:border-amber-500/35",
      badgeClass:
        "agent-flow-badge agent-flow-badge--amber text-amber-400/80 bg-amber-500/10 border-amber-500/20",
    },
    {
      icon: Brain,
      title: t("agent.emptyFlowStepThinking"),
      desc: t("agent.emptyFlowStepThinkingDesc"),
      badge: "STEP 2",
      accent:
        "text-purple-400 border-purple-500/20 bg-[var(--color-theme-surface,#212121)] hover:border-purple-500/35",
      badgeClass:
        "agent-flow-badge agent-flow-badge--purple text-purple-400/80 bg-purple-500/10 border-purple-500/20",
    },
    {
      icon: Terminal,
      title: t("agent.emptyFlowStepExecution"),
      desc: t("agent.emptyFlowStepExecutionDesc"),
      badge: "STEP 3",
      accent:
        "text-sky-400 border-sky-500/20 bg-[var(--color-theme-surface,#212121)] hover:border-sky-500/35",
      badgeClass:
        "agent-flow-badge agent-flow-badge--sky text-sky-400/80 bg-sky-500/10 border-sky-500/20",
    },
    {
      icon: Sparkles,
      title: t("agent.emptyFlowStepResult"),
      desc: t("agent.emptyFlowStepResultDesc"),
      badge: "STEP 4",
      accent:
        "text-emerald-400 border-emerald-500/20 bg-[var(--color-theme-surface,#212121)] hover:border-emerald-500/35",
      badgeClass:
        "agent-flow-badge agent-flow-badge--emerald text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20",
    },
  ]

  return (
    <div
      className={`agent-flow-empty flex h-full flex-col justify-between gap-4 p-1 select-none ${
        className ?? ""
      }`}
    >
      {/* 顶部左对齐流程模式卡片（适配主题 token 与边框） */}
      <div className="flex flex-col gap-3">
        <div className="agent-flow-empty-header flex items-center justify-between gap-3 rounded-lg border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,#212121)] p-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoImg}
              alt="LX Agent"
              className="agent-empty-logo h-10 w-10 shrink-0 rounded-xl object-contain drop-shadow-sm select-none pointer-events-none"
            />
            <div className="flex flex-col text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <Workflow className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="agent-flow-empty-title text-[13px] font-semibold text-[var(--color-theme-text,#ffffff)] truncate">
                  {t("agent.emptyTitle")} · {t("agent.executionFlowView")}
                </span>
              </div>
              <p className="agent-flow-empty-desc mt-0.5 text-[11px] leading-relaxed text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] line-clamp-1">
                {t("agent.emptyFlowModeDesc")}
              </p>
            </div>
          </div>
          <span className="agent-flow-ready-badge shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
            READY
          </span>
        </div>

        {/* 流程管道预览视图（平铺 Step 列表，移除嵌套外框） */}
        <div className="agent-flow-empty-pipeline flex flex-col gap-2 text-left">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold tracking-wider text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] uppercase">
              {t("agent.emptyFlowPipelineTitle")}
            </span>
            <span className="agent-flow-stages-badge font-mono text-[10px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.3))]">
              4 STAGES
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {pipelineSteps.map((step, idx) => {
              const Icon = step.icon
              return (
                <div
                  key={idx}
                  className={`agent-flow-empty-step group relative flex items-start gap-3 rounded-lg border p-2.5 text-left transition-all ${step.accent}`}
                >
                  <div className="agent-flow-step-icon-box mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/25">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[12px] font-medium text-[var(--color-theme-text,#ffffff)] truncate">
                        {step.title}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.2 font-mono text-[9px] font-semibold ${step.badgeClass}`}
                      >
                        {step.badge}
                      </span>
                    </div>
                    <span className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] line-clamp-1">
                      {step.desc}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 底部推荐问题（卡片化，带不同图标与完整对齐） */}
      {onSelectPrompt && (
        <div className="agent-flow-empty-prompts mt-2 flex flex-col gap-1.5 text-left">
          <span className="px-1 text-[11px] font-medium text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
            {t("agent.suggestedPrompts")}
          </span>
          <div className="flex flex-col gap-1.5">
            {DEFAULT_PROMPT_CARDS.map((card, idx) => {
              const PromptIcon = idx === 0 ? Code2 : idx === 1 ? FileCode : Workflow
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectPrompt(card.prompt)}
                  className="agent-flow-empty-prompt-card group flex w-full items-start gap-2.5 rounded-lg border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,#212121)] p-2.5 text-left transition-all hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.15))] hover:bg-[var(--color-theme-surface-hover,#303030)]"
                >
                  <div className="agent-flow-prompt-icon-box mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/5 group-hover:bg-emerald-500/10">
                    <PromptIcon className="h-3 w-3 text-white/40 transition-colors group-hover:text-emerald-400" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12px] font-medium text-[var(--color-theme-text,#ffffff)] transition-colors group-hover:text-white truncate">
                      {card.title}
                    </span>
                    <span className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] group-hover:text-white/70">
                      {card.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
