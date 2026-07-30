import { Check, ChevronDown } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"

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
  disabled?: boolean
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
  disabled = false,
}: LxSelectProps<T>): React.JSX.Element => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [shouldRender, setShouldRender] = useState<boolean>(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = options
    .flatMap((item) => (isGroup(item) ? item.options : [item]))
    .find((item) => item.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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

  const renderOption = (option: LxSelectOption<T>, isGrouped = false): React.JSX.Element => {
    const isSelected = option.value === value
    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
          isSelected ? "bg-white/5 text-white" : "text-white/70"
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
    <div ref={containerRef} className={`relative w-full min-w-0 ${className}`}>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-[6px] border border-white/10 bg-[#212121] px-2.5 text-left text-sm text-white/80 transition-colors duration-150 hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown
          className={`ml-2 h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {shouldRender ? (
        <div
          className={`absolute top-full z-50 mt-1 flex max-h-60 min-w-full flex-col gap-0.5 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
            isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
          }`}
          role="listbox"
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
        </div>
      ) : null}
    </div>
  )
}
