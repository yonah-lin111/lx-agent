import { Check, ChevronDown } from "lucide-react"
import type React from "react"
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { TooltipLayerContext } from "./LxTooltip"

// 下拉选项。
export interface LxSelectOption<T> {
  value: T
  label: string
}

// 下拉分组选项。
export interface LxSelectGroup<T> {
  label: string
  options: LxSelectOption<T>[]
}

// 下拉选择器属性。
export interface LxSelectProps<T> {
  value: T
  onChange: (value: T) => void
  options: (LxSelectOption<T> | LxSelectGroup<T>)[]
  className?: string
  // 下拉菜单弹出方向。默认为 "down"。
  position?: "up" | "down"
  // 下拉列表 z-index（portal 渲染到 body，嵌套于更高层浮层（如 Tooltip）时需传入更高值）。默认 50。
  zIndex?: number
  // 触发按钮尺寸。默认为 "medium"。
  size?: "small" | "medium"
  disabled?: boolean
  // 未选中任何选项（value 无匹配）时的占位提示。
  placeholder?: string
}

const SIZE_BUTTON_CLASSES: Record<NonNullable<LxSelectProps<string>["size"]>, string> = {
  small: "h-8 text-xs",
  medium: "h-9 text-sm",
}

const isGroup = <T,>(item: LxSelectOption<T> | LxSelectGroup<T>): item is LxSelectGroup<T> =>
  "options" in item

/**
 * 渲染黑色主题下拉选择器。
 */
export const LxSelect = <T extends string>({
  value,
  onChange,
  options,
  className = "",
  position = "down",
  zIndex = 50,
  size = "medium",
  disabled = false,
  placeholder,
}: LxSelectProps<T>): React.JSX.Element => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [shouldRender, setShouldRender] = useState<boolean>(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false)
  const [listboxStyle, setListboxStyle] = useState<{
    left: number
    top: number
    minWidth: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // 嵌套于 Tooltip 内时，将下拉列表注册为父级浮层的一部分，
  // 避免点击/滚动下拉被父 Tooltip 误判为外部而关闭。
  const tooltipLayer = useContext(TooltipLayerContext)
  const selectedOption = options
    .flatMap((item) => (isGroup(item) ? item.options : [item]))
    .find((item) => item.value === value)

  useEffect(() => {
    // 使用 pointerdown：避免被 preventDefault 抑制的兼容 mousedown 事件导致外部点击无法关闭。
    // 下拉经 portal 渲染到 body，需将列表自身视为容器内部。
    const handleClickOutside = (event: PointerEvent): void => {
      const target = event.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !listboxRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [])

  // 任意滚动条滚动时收起下拉，排除自身容器与下拉列表内滚动。
  useEffect(() => {
    if (!isOpen) return
    const handleScroll = (event: Event): void => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !listboxRef.current?.contains(target))
        setIsOpen(false)
    }
    document.addEventListener("scroll", handleScroll, true)
    return () => document.removeEventListener("scroll", handleScroll, true)
  }, [isOpen])

  // 下拉经 portal 渲染到 body：按触发按钮视口坐标定位，并随视口尺寸变化重算。
  useLayoutEffect(() => {
    if (!shouldRender) return
    const updatePosition = (): void => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const listbox = listboxRef.current
      // 首次测量时 minWidth 尚未生效，取按钮宽度作为列表宽度下限。
      const listboxWidth = Math.max(listbox?.offsetWidth ?? rect.width, rect.width)
      const listboxHeight = listbox?.offsetHeight ?? 0
      const margin = 4
      const left = Math.min(rect.left, Math.max(margin, window.innerWidth - margin - listboxWidth))
      const top =
        position === "up"
          ? Math.max(margin, rect.top - margin - listboxHeight)
          : Math.min(rect.bottom + margin, window.innerHeight - margin - listboxHeight)
      setListboxStyle({ left, top, minWidth: rect.width })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [shouldRender, position])

  // 展开时滚动到选中选项，使其位于下拉容器视口内。
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

  // 注册下拉列表到父级 Tooltip 浮层集合（列表经 portal 渲染到 body，位于父气泡 DOM 之外）。
  useEffect(() => {
    if (!tooltipLayer || !shouldRender) return
    const node = listboxRef.current
    if (!node) return
    tooltipLayer.register(node)
    return () => tooltipLayer.unregister(node)
  }, [tooltipLayer, shouldRender])

  const renderOption = (option: LxSelectOption<T>, isGrouped = false): React.JSX.Element => {
    const isSelected = option.value === value
    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors ${
          isSelected
            ? "bg-white/10 text-white font-medium shadow-xs"
            : "text-white/70 hover:bg-white/5 hover:text-white"
        } ${isGrouped ? "pl-5" : ""}`}
        onMouseDown={(event) => {
          event.preventDefault()
          setIsOpen(false)
          onChange(option.value)
        }}
      >
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {isSelected ? <Check className="ml-2 h-3 w-3 shrink-0" /> : null}
      </button>
    )
  }

  return (
    <>
      <div ref={containerRef} className={`relative w-full min-w-0 ${className}`}>
        <button
          ref={buttonRef}
          type="button"
          className={`flex w-full items-center justify-between rounded-[6px] border border-white/10 bg-[#212121] px-2.5 text-left text-white/80 transition-colors duration-150 hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_BUTTON_CLASSES[size]}`}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="min-w-0 flex-1 truncate">
            {selectedOption?.label ?? placeholder ?? value}
          </span>
          <ChevronDown
            className={`ml-2 h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {shouldRender &&
        createPortal(
          <div
            ref={listboxRef}
            className={`fixed flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
              isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
            }`}
            role="listbox"
            style={{ ...(listboxStyle ?? undefined), zIndex }}
          >
            {options.map((item) =>
              isGroup(item) ? (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <div className="px-2.5 py-1.5 text-xs text-white/35">{item.label}</div>
                  {item.options.map((option) => renderOption(option, true))}
                </div>
              ) : (
                renderOption(item)
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
