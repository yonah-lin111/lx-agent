import { Check, ChevronDown, Users } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  TooltipLayerContext,
  useFloatingLayer,
  useLayerPresence,
} from "@/components/ui/useFloatingLayer"
import { useTranslation } from "@/i18n"

export interface OpenClawTargetAgent {
  id: string
  name: string
}

export interface OpenClawTargetSelectProps {
  agents: OpenClawTargetAgent[]
  selectedAgentIds: string[]
  onToggleAgent: (agentId: string) => void
  disabled?: boolean
  className?: string
}

/**
 * OpenClawTargetSelect - 结构、类名及动效完全对齐 AgentModelSelect / LxSelect 的复合选择组件。
 * 仅选择当前办公区（由调用方传入）的员工，办公区切换由左栏与 `/office` 面板负责。
 * 默认向上弹出并挂载于 document.body，采用 CSS Token 适配全套主题（包括像素主题）。
 */
export const OpenClawTargetSelect = ({
  agents,
  selectedAgentIds,
  onToggleAgent,
  disabled = false,
  className = "",
}: OpenClawTargetSelectProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [listboxStyle, setListboxStyle] = useState<{
    left: number
    top: number
    minWidth: number
  } | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // 挂载 / 退场状态机。
  const { shouldRender, isAnimatingOut } = useLayerPresence(isOpen)

  // 通用浮层关闭逻辑：外部 pointerdown、Esc 与锚点作用域滚动关闭。
  const { layerContextValue } = useFloatingLayer({
    isOpen,
    active: shouldRender,
    rootRef: listboxRef,
    insideRefs: [containerRef],
    anchorRef: containerRef,
    onClose: () => setIsOpen(false),
  })

  // 定位计算（默认向上弹出，对齐 AgentModelSelect）
  useLayoutEffect(() => {
    if (!shouldRender) return
    const updatePosition = (): void => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const listbox = listboxRef.current
      const listboxWidth = Math.max(listbox?.offsetWidth ?? rect.width, rect.width)
      const listboxHeight = listbox?.offsetHeight ?? 0
      const margin = 4
      const left = Math.min(rect.left, Math.max(margin, window.innerWidth - margin - listboxWidth))
      const top = Math.max(margin, rect.top - margin - listboxHeight)
      setListboxStyle({ left, top, minWidth: Math.max(rect.width, 220) })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [shouldRender])

  // 按钮文案：未选中显示占位标题，单个显示名称，多个显示数量。
  const buttonLabel = useMemo(() => {
    const selectedAgents = agents.filter((agent) => selectedAgentIds.includes(agent.id))
    if (selectedAgents.length === 0) return t("openclaw.agentPickerTitle")
    if (selectedAgents.length === 1) return selectedAgents[0].name
    return t("openclaw.agentCountLabel", { count: selectedAgents.length })
  }, [agents, selectedAgentIds, t])

  return (
    <>
      <div
        ref={containerRef}
        className={`openclaw-target-select relative !w-fit max-w-[240px] min-w-0 ${className}`}
      >
        <button
          ref={buttonRef}
          type="button"
          className="lx-select-trigger flex h-7 w-full items-center justify-between gap-1.5 rounded-[var(--theme-radius-base,6px)] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.1))] bg-[var(--color-theme-surface,#212121)] px-2 text-xs text-[var(--color-theme-text,#ffffff)]/80 transition-colors duration-150 hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.2))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <Users className="h-3 w-3 shrink-0 text-white/50" />
          <span className="min-w-0 flex-1 truncate text-left">{buttonLabel}</span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 text-white/50 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {shouldRender &&
        createPortal(
          <TooltipLayerContext.Provider value={layerContextValue}>
            <div
              ref={listboxRef}
              className={`fixed flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-[var(--theme-radius-base,6px)] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.1))] bg-[var(--color-theme-surface-hover,#303030)] p-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
                isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
              }`}
              role="listbox"
              style={{ ...(listboxStyle ?? undefined), zIndex: 50 }}
            >
              {/* 员工多选分组 */}
              <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-white/40">
                {t("openclaw.agentPickerTitle")}
              </div>
              <div className="flex flex-col gap-0.5">
                {agents.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-xs text-white/40">
                    {t("openclaw.noAgents")}
                  </div>
                ) : (
                  agents.map((agent) => {
                    const isChecked = selectedAgentIds.includes(agent.id)
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        role="option"
                        aria-selected={isChecked}
                        onClick={() => {
                          onToggleAgent(agent.id)
                        }}
                        className={`flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-xs transition-colors ${
                          isChecked
                            ? "bg-sky-500/15 font-medium text-sky-200"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate pl-1">{agent.name}</span>
                        {isChecked && <Check className="ml-2 h-3 w-3 text-sky-400 shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </TooltipLayerContext.Provider>,
          document.body,
        )}
    </>
  )
}
