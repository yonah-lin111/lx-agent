import { Check, ChevronDown, ChevronRight, Search } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import type { LxSelectGroup, LxSelectOption } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  TooltipLayerContext,
  useFloatingLayer,
  useLayerPresence,
} from "@/components/ui/useFloatingLayer"
import { isFuzzyMatch } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
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

const flattenOptions = (
  options: AgentModelSelectProps["options"],
): (AgentModelSelectOption | LxSelectOption<string>)[] =>
  options.flatMap((item) => (isGroup(item) ? item.options : [item]))

/**
 * AgentModelSelect - Agent 输入栏的模型选择器，向上弹出并限制宽度。
 * 触发按钮右侧内联展示当前思考等级（纯文本，无边框）；下拉顶部提供模型名模糊搜索，
 * 并集成思考等级二级菜单（LxTooltip 悬停展示）。
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
  const [listboxStyle, setListboxStyle] = useState<{
    left: number
    top: number
    minWidth: number
  } | null>(null)
  // 搜索关键词（仅按模型名过滤）。
  const [query, setQuery] = useState("")

  const containerRef = useRef<HTMLDivElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const optionsRef = useRef<HTMLDivElement | null>(null)
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

  // 展开时滚动到选中项
  useEffect(() => {
    if (!isOpen || !shouldRender) return
    const container = optionsRef.current
    if (!container) return
    const selectedEl = container.querySelector('[aria-selected="true"]') as HTMLElement | null
    if (!selectedEl) return
    container.scrollTop =
      selectedEl.offsetTop - container.clientHeight / 2 + selectedEl.clientHeight / 2
  }, [isOpen, shouldRender, value])

  // 关闭后清空搜索词，下次展开回到全量列表。
  useEffect(() => {
    if (isOpen) return
    setQuery("")
  }, [isOpen])

  const selectedOption = useMemo(() => {
    return flattenOptions(options).find((item) => item.value === value) as
      | AgentModelSelectOption
      | undefined
  }, [options, value])

  // 关键词过滤（仅模型名，大小写不敏感）；分组内无命中则整组隐藏。
  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return options
    return options
      .map((item) =>
        isGroup(item)
          ? {
              ...item,
              options: item.options.filter((option) =>
                isFuzzyMatch(keyword, option.label.toLocaleLowerCase()),
              ),
            }
          : item,
      )
      .filter((item) =>
        isGroup(item)
          ? item.options.length > 0
          : isFuzzyMatch(keyword, item.label.toLocaleLowerCase()),
      )
  }, [options, query])

  const handleSelect = (modelVal: string, chosenVariant?: string): void => {
    setIsOpen(false)
    // 选中后焦点回到触发按钮，保持键盘流可继续。
    buttonRef.current?.focus()
    // 换模型：variant 随 onChange 一次性提交，避免二次触发回调导致重复切换。
    if (modelVal !== value) {
      onChange(modelVal, chosenVariant)
      return
    }
    // 同模型：仅思考等级变化。
    if (chosenVariant !== undefined) {
      onVariantChange?.(chosenVariant)
    }
  }

  // 计算某选项被选中时应提交的思考等级（与鼠标点击行语义一致）。
  const resolveChosenVariant = (
    item: AgentModelSelectOption | LxSelectOption<string>,
  ): string | undefined => {
    const defaultVar = (item as AgentModelSelectOption).defaultVariant
    return item.value === value ? (variant ?? defaultVar) : defaultVar
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
    const defaultVar = modelItem.defaultVariant
    // 未选中显式等级时 default 项高亮（模型未配置默认等级也始终展示 default 项）。
    const isDefaultActive = isSelected && !variant

    if (itemVariants && itemVariants.length > 0) {
      return (
        <LxTooltip
          key={item.value}
          placement="right"
          trigger="hover"
          contentClassName="!p-1"
          content={
            <div className="flex w-max min-w-32 flex-col gap-0.5" role="menu">
              <div className="agent-model-effort-header flex select-none items-center justify-center border-b border-white/10 px-2 py-1 text-center text-xs font-medium uppercase tracking-wider text-white/40">
                <span>{t("agent.thinkingEffort")}</span>
              </div>
              <LxMenuItem
                key="__default__"
                active={isDefaultActive}
                trailing={isDefaultActive ? <Check className="h-3 w-3 text-sky-400" /> : null}
                onClick={(event) => {
                  event.stopPropagation()
                  setIsOpen(false)
                  // 选择 default：回落模型配置的默认等级；未配置时不带任何等级。
                  onChange(item.value, defaultVar)
                }}
              >
                <span className="font-mono text-xs">{t("agent.thinkingDefault")}</span>
              </LxMenuItem>
              {itemVariants.map((v) => {
                const isVariantActive = isSelected && variant === v
                return (
                  <LxMenuItem
                    key={v}
                    active={isVariantActive}
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
          <LxMenuItem
            active={isSelected}
            className={`group ${isGrouped ? "pl-5" : ""}`}
            menuRole="option"
            trailing={
              <>
                {isSelected ? <Check className="text-white" /> : null}
                <ChevronRight className="text-white/35 transition-colors group-hover:text-white/70" />
              </>
            }
            onMouseDown={(event) => {
              event.preventDefault()
              const chosenVar = resolveChosenVariant(item)
              handleSelect(item.value, chosenVar)
            }}
          >
            {item.label}
          </LxMenuItem>
        </LxTooltip>
      )
    }

    return (
      <LxMenuItem
        key={item.value}
        active={isSelected}
        className={isGrouped ? "pl-5" : ""}
        menuRole="option"
        trailing={isSelected ? <Check className="text-white" /> : null}
        onMouseDown={(event) => {
          event.preventDefault()
          handleSelect(item.value, resolveChosenVariant(item))
        }}
      >
        {item.label}
      </LxMenuItem>
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
          className="lx-select-trigger flex h-7 w-full items-center justify-between gap-1.5 rounded-[var(--theme-radius-base,6px)] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.1))] bg-[var(--color-theme-surface,#212121)] px-2 text-xs text-[var(--color-theme-text,#ffffff)]/80 transition-colors duration-150 hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.2))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption?.label ?? value}
          </span>
          {variant ? (
            <span className="agent-model-variant shrink-0 font-mono text-sky-400/80">
              {variant}
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
              className={`fixed flex max-h-60 flex-col overflow-hidden rounded-[var(--theme-radius-base,6px)] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.1))] bg-[var(--color-theme-surface-hover,#303030)] p-1 shadow-lg ${
                isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
              }`}
              role="listbox"
              style={{ ...(listboxStyle ?? undefined), zIndex: 50 }}
            >
              <div className="shrink-0 pb-1">
                <LxInput
                  aria-label={t("agent.searchModel")}
                  placeholder={t("agent.searchModel")}
                  prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
                  size="small"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div
                ref={optionsRef}
                className="relative flex min-h-0 flex-auto flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-2.5 py-2 text-xs text-white/35">
                    {t("agent.noMatchingModels")}
                  </div>
                ) : (
                  filteredOptions.map((item) =>
                    isGroup(item) ? (
                      <div key={item.label} className="flex flex-col gap-0.5">
                        <div className="flex h-7 items-center px-2.5 text-sm font-medium text-white/35">
                          {item.label}
                        </div>
                        {item.options.map((option) => renderOption(option, true))}
                      </div>
                    ) : (
                      renderOption(item)
                    ),
                  )
                )}
              </div>
            </div>
          </TooltipLayerContext.Provider>,
          document.body,
        )}
    </>
  )
}
