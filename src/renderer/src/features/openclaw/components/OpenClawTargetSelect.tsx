import { Check, ChevronDown, Users } from "lucide-react"
import type React from "react"
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { LxSelectGroup, LxSelectOption } from "@/components/ui/LxSelect"
import { TooltipLayerContext } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

export interface OpenClawTargetOffice {
  id: string
  name: string
  agents: { id: string; name: string }[]
}

export interface OpenClawTargetSelectProps {
  offices: OpenClawTargetOffice[]
  selectedOfficeId: string | null
  selectedAgentIds: string[]
  onSelectOffice: (officeId: string) => void
  onToggleAgent: (agentId: string) => void
  disabled?: boolean
  className?: string
}

/**
 * OpenClawTargetSelect - 结构、类名及动效完全对齐 AgentModelSelect / LxSelect 的复合选择组件。
 * 默认向上弹出并挂载于 document.body，采用 CSS Token 适配全套主题（包括 Minecraft 像素主题）。
 */
export const OpenClawTargetSelect = ({
  offices,
  selectedOfficeId,
  selectedAgentIds,
  onSelectOffice,
  onToggleAgent,
  disabled = false,
  className = "",
}: OpenClawTargetSelectProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [listboxStyle, setListboxStyle] = useState<{
    left: number
    top: number
    minWidth: number
  } | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const parentTooltipLayer = useContext(TooltipLayerContext)
  const layerNodesRef = useRef<Set<HTMLElement>>(new Set())

  const registerLayer = (node: HTMLElement): void => {
    layerNodesRef.current.add(node)
    parentTooltipLayer?.register(node)
  }

  const unregisterLayer = (node: HTMLElement): void => {
    layerNodesRef.current.delete(node)
    parentTooltipLayer?.unregister(node)
  }

  const layerContextValue = useMemo(
    () => ({ register: registerLayer, unregister: unregisterLayer }),
    [parentTooltipLayer],
  )

  useEffect(() => {
    if (!parentTooltipLayer || !shouldRender) return
    const node = listboxRef.current
    if (!node) return
    parentTooltipLayer.register(node)
    return () => parentTooltipLayer.unregister(node)
  }, [parentTooltipLayer, shouldRender])

  // 点击外部收起
  useEffect(() => {
    const handleClickOutside = (event: PointerEvent): void => {
      const target = event.target as Node
      if (
        containerRef.current?.contains(target) ||
        listboxRef.current?.contains(target) ||
        Array.from(layerNodesRef.current).some((node) => node.contains(target))
      ) {
        return
      }
      setIsOpen(false)
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [])

  // 滚动时收起
  useEffect(() => {
    if (!isOpen) return
    const handleScroll = (event: Event): void => {
      const target = event.target as Node
      if (
        !containerRef.current?.contains(target) &&
        !listboxRef.current?.contains(target) &&
        !Array.from(layerNodesRef.current).some((node) => node.contains(target))
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("scroll", handleScroll, true)
    return () => document.removeEventListener("scroll", handleScroll, true)
  }, [isOpen])

  // Esc 键关闭
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

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

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = window.setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [isOpen, shouldRender])

  const currentOffice = useMemo(
    () => offices.find((o) => o.id === selectedOfficeId),
    [offices, selectedOfficeId],
  )

  const currentOfficeAgents = useMemo(() => currentOffice?.agents ?? [], [currentOffice])

  // 按钮文案展示：实例 · 选中的员工数 / 名字
  const buttonLabel = useMemo(() => {
    if (!currentOffice) return t("openclaw.noInstances")
    const activeAgents = currentOfficeAgents.filter((a) => selectedAgentIds.includes(a.id))
    if (activeAgents.length === 0) {
      return `${currentOffice.name} · ${t("openclaw.noAgents")}`
    }
    if (activeAgents.length === 1) {
      return `${currentOffice.name} · ${activeAgents[0].name}`
    }
    return `${currentOffice.name} · ${activeAgents.length} Agents`
  }, [currentOffice, currentOfficeAgents, selectedAgentIds, t])

  return (
    <>
      <div
        ref={containerRef}
        className={`openclaw-target-select relative !w-fit max-w-[240px] min-w-0 ${className}`}
      >
        <button
          ref={buttonRef}
          type="button"
          className="lx-select-trigger flex h-6 w-full items-center justify-between gap-1.5 rounded-[var(--theme-radius-base,6px)] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.1))] bg-[var(--color-theme-surface,#212121)] px-2 text-xs text-[var(--color-theme-text,#ffffff)]/80 transition-colors duration-150 hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.2))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-40"
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
              {/* 办公区/实例分组 */}
              <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-white/40">
                {t("openclaw.officePickerTitle")}
              </div>
              <div className="mb-1 flex flex-col gap-0.5">
                {offices.map((office) => {
                  const isSelected = office.id === selectedOfficeId
                  return (
                    <button
                      key={office.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectOffice(office.id)
                      }}
                      className={`flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isSelected
                          ? "bg-white/10 font-medium text-white shadow-xs"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{office.name}</span>
                      {isSelected && <Check className="ml-2 h-3 w-3 text-sky-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>

              {/* 员工多选分组 */}
              <div className="border-t border-white/10 pt-1 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-white/40">
                {t("openclaw.agentPickerTitle")}
              </div>
              <div className="flex flex-col gap-0.5">
                {currentOfficeAgents.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-xs text-white/40">
                    {t("openclaw.noAgents")}
                  </div>
                ) : (
                  currentOfficeAgents.map((agent) => {
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
