import { Check, ChevronDown, ChevronRight } from "lucide-react"
import type React from "react"
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxMenuItem } from "@/components/ui/LxMenu"
import type { LxSelectGroup, LxSelectOption } from "@/components/ui/LxSelect"
import { LxTooltip, TooltipLayerContext } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

// 模型选项扩展类型（携带可选思考等级）。
export interface AgentModelSelectOption extends LxSelectOption<string> {
  variants?: string[]
  defaultVariant?: string
}

// 模型分组选项。
export interface AgentModelSelectGroup {
  label: string
  options: AgentModelSelectOption[]
}

// 模型选择器属性。
export interface AgentModelSelectProps {
  // 当前选中的模型值（格式 "provider::model"）。
  value: string
  // 值改变回调，支持可选传入选中的思考等级。
  onChange: (value: string, variant?: string) => void
  // 可选模型列表（按 Provider 分组）。
  options: (
    | AgentModelSelectOption
    | AgentModelSelectGroup
    | LxSelectOption<string>
    | LxSelectGroup<string>
  )[]
  // 是否禁用选择器。
  disabled?: boolean
  // 当前选中的思考等级。
  variant?: string
  // 当前模型支持的思考等级列表。
  variants?: string[]
  // 思考等级改变回调。
  onVariantChange?: (variant: string) => void
  // 自定义容器类名。
  className?: string
}

const isGroup = (
  item:
    | AgentModelSelectOption
    | AgentModelSelectGroup
    | LxSelectOption<string>
    | LxSelectGroup<string>,
): item is AgentModelSelectGroup | LxSelectGroup<string> => "options" in item

/**
 * AgentModelSelect - Agent 输入栏的模型选择器，向上弹出并限制宽度。
 * 内部集成思考等级二级菜单（LxTooltip 悬停展示），主按钮展示当前模型及微型思考等级徽章。
 */
export const AgentModelSelect = ({
  value,
  onChange,
  options,
  disabled = false,
  variant,
  variants = [],
  onVariantChange,
  className = "",
}: AgentModelSelectProps): React.JSX.Element => {
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

  // 嵌套浮层上下文管理，使子级 LxTooltip 气泡不被误判为外部点击
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

  // 点击外部收起下拉
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

  // 滚动时收起下拉（排除自身与子菜单内滚动）
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
      setListboxStyle({ left, top, minWidth: Math.max(rect.width, 180) })
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

  // 展开时滚动到选中项
  useEffect(() => {
    if (!isOpen || !shouldRender || !listboxRef.current) return
    const selectedEl = listboxRef.current.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement | null
    if (!selectedEl) return
    const listbox = listboxRef.current
    listbox.scrollTop =
      selectedEl.offsetTop - listbox.clientHeight / 2 + selectedEl.clientHeight / 2
  }, [isOpen, shouldRender, value])

  const selectedOption = useMemo(() => {
    return options
      .flatMap((item) => (isGroup(item) ? item.options : [item]))
      .find((item) => item.value === value) as AgentModelSelectOption | undefined
  }, [options, value])

  const handleSelect = (modelVal: string, chosenVariant?: string): void => {
    setIsOpen(false)
    onChange(modelVal, chosenVariant)
    if (chosenVariant !== undefined) {
      onVariantChange?.(chosenVariant)
    }
  }

  const renderOption = (
    item: AgentModelSelectOption | LxSelectOption<string>,
    isGrouped = false,
  ): React.JSX.Element => {
    const isSelected = item.value === value
    const modelItem = item as AgentModelSelectOption
    // 优先使用选项自身携带的 variants，已选中的模型可兜底使用传入的 variants prop
    const itemVariants =
      modelItem.variants && modelItem.variants.length > 0
        ? modelItem.variants
        : isSelected && variants && variants.length > 0
          ? variants
          : undefined
    const defaultVar = modelItem.defaultVariant ?? (itemVariants ? itemVariants[0] : undefined)

    if (itemVariants && itemVariants.length > 0) {
      return (
        <LxTooltip
          key={item.value}
          placement="right"
          trigger="hover"
          contentClassName="!p-1"
          content={
            <div className="flex w-max min-w-32 flex-col gap-0.5" role="menu">
              <div className="agent-model-effort-header flex select-none items-center border-b border-white/10 px-2 py-1 text-[10px] font-medium text-white/40 uppercase tracking-wider">
                <span>{t("agent.thinkingEffort")}</span>
              </div>
              {itemVariants.map((v) => {
                const isVariantActive =
                  isSelected && (variant === v || (!variant && v === defaultVar))
                return (
                  <LxMenuItem
                    key={v}
                    active={isVariantActive}
                    className={isVariantActive ? "!bg-white/10 !text-white font-medium" : ""}
                    trailing={isVariantActive ? <Check className="h-3 w-3 text-sky-400" /> : null}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSelect(item.value, v)
                    }}
                  >
                    <span className="font-mono text-xs">{v}</span>
                  </LxMenuItem>
                )
              })}
            </div>
          }
        >
          <button
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`group flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-xs transition-colors ${
              isSelected
                ? "bg-white/10 text-white font-medium shadow-xs"
                : "text-white/70 hover:bg-white/5 hover:text-white"
            } ${isGrouped ? "pl-4" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault()
              const chosenVar = isSelected ? (variant ?? defaultVar) : defaultVar
              handleSelect(item.value, chosenVar)
            }}
          >
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <div className="ml-2 flex shrink-0 items-center gap-1">
              {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
              <ChevronRight className="h-3 w-3 text-white/35 transition-colors group-hover:text-white/70" />
            </div>
          </button>
        </LxTooltip>
      )
    }

    return (
      <button
        key={item.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        className={`flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-xs transition-colors ${
          isSelected
            ? "bg-white/10 text-white font-medium shadow-xs"
            : "text-white/70 hover:bg-white/5 hover:text-white"
        } ${isGrouped ? "pl-4" : ""}`}
        onMouseDown={(event) => {
          event.preventDefault()
          handleSelect(item.value, undefined)
        }}
      >
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {isSelected ? <Check className="ml-2 h-3 w-3 shrink-0" /> : null}
      </button>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`agent-model-select relative !w-fit max-w-[240px] min-w-0 ${className}`}
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
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption?.label ?? value}
          </span>
          {variant ? (
            <span className="agent-model-variant-badge inline-flex shrink-0 items-center rounded bg-white/10 px-1 py-0.5 font-mono text-[10px] leading-none text-sky-300/90 shadow-xs">
              <span>{variant}</span>
            </span>
          ) : null}
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
              {options.map((item) =>
                isGroup(item) ? (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <div className="px-2.5 py-1 text-[11px] font-medium text-white/35">
                      {item.label}
                    </div>
                    {item.options.map((option) => renderOption(option, true))}
                  </div>
                ) : (
                  renderOption(item)
                ),
              )}
            </div>
          </TooltipLayerContext.Provider>,
          document.body,
        )}
    </>
  )
}
