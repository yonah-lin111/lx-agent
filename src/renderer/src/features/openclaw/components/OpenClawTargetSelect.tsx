import { Check, ChevronDown, Users } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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

  const currentOffice = useMemo(
    () => offices.find((o) => o.id === selectedOfficeId),
    [offices, selectedOfficeId],
  )

  const currentOfficeAgents = useMemo(() => currentOffice?.agents ?? [], [currentOffice])

  // 点击外部收起
  useEffect(() => {
    const handleClickOutside = (event: PointerEvent): void => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || listboxRef.current?.contains(target)) {
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
      if (!containerRef.current?.contains(target) && !listboxRef.current?.contains(target)) {
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

  // 定位计算（默认向上弹出）
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
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-6 max-w-[240px] items-center gap-1.5 rounded-[4px] border border-white/10 bg-white/[0.04] px-2 text-[12px] text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.08] focus:outline-none disabled:pointer-events-none disabled:opacity-40"
      >
        <Users className="h-3 w-3 shrink-0 text-white/50" />
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-white/40" />
      </button>

      {shouldRender && listboxStyle && (
        <div
          ref={listboxRef}
          style={{
            position: "fixed",
            left: `${listboxStyle.left}px`,
            top: `${listboxStyle.top}px`,
            minWidth: `${listboxStyle.minWidth}px`,
            maxHeight: "360px",
            zIndex: 9999,
          }}
          className={`custom-scrollbar flex flex-col overflow-y-auto rounded-[6px] border border-white/10 bg-[#282828] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition-all duration-120 ${
            isAnimatingOut ? "opacity-0 scale-95" : "opacity-100 scale-100"
          }`}
        >
          {/* 办公区/实例切换 */}
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-white/40 uppercase">
            {t("openclaw.officePickerTitle")}
          </div>
          <div className="mb-1.5 flex flex-col gap-0.5">
            {offices.map((office) => {
              const isSelected = office.id === selectedOfficeId
              return (
                <button
                  key={office.id}
                  type="button"
                  onClick={() => {
                    onSelectOffice(office.id)
                  }}
                  className={`flex items-center justify-between rounded-[4px] px-2 py-1 text-left text-[12px] transition-colors ${
                    isSelected
                      ? "bg-white/10 font-medium text-white"
                      : "text-white/70 hover:bg-white/[0.06] hover:text-white/90"
                  }`}
                >
                  <span className="truncate">{office.name}</span>
                  {isSelected && <Check className="h-3 w-3 text-sky-400" />}
                </button>
              )
            })}
          </div>

          {/* 员工多选切换 */}
          <div className="border-t border-white/10 pt-1.5 px-2 py-1 text-[10px] font-semibold tracking-wider text-white/40 uppercase">
            {t("openclaw.agentPickerTitle")}
          </div>
          <div className="flex flex-col gap-0.5">
            {currentOfficeAgents.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-white/40">{t("openclaw.noAgents")}</div>
            ) : (
              currentOfficeAgents.map((agent) => {
                const isChecked = selectedAgentIds.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      onToggleAgent(agent.id)
                    }}
                    className={`flex items-center justify-between rounded-[4px] px-2 py-1 text-left text-[12px] transition-colors ${
                      isChecked
                        ? "bg-sky-500/15 font-medium text-sky-200"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white/90"
                    }`}
                  >
                    <span className="truncate">{agent.name}</span>
                    {isChecked && <Check className="h-3 w-3 text-sky-400" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
