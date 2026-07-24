import { X } from "lucide-react"
import type React from "react"
import { forwardRef, useEffect, useRef, useState } from "react"

// 输入框尺寸。
export type LxInputSize = "xs" | "sm"

// 输入框属性。
export interface LxInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix" | "size" | "suffix"> {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  size?: LxInputSize
  clear?: boolean
  onClear?: () => void
}

/**
 * 提供深色主题样式以及前后缀插槽的单行输入框。
 */
export const LxInput = forwardRef<HTMLInputElement, LxInputProps>(
  (
    {
      className = "",
      prefix,
      suffix,
      size = "sm",
      clear = false,
      disabled,
      value,
      defaultValue,
      onChange,
      onClear,
      ...props
    },
    ref,
  ): React.JSX.Element => {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [hasValue, setHasValue] = useState<boolean>(() => Boolean(value ?? defaultValue))
    const textSizeClass = size === "xs" ? "text-xs" : "text-sm"

    useEffect(() => {
      if (value !== undefined) {
        setHasValue(String(value).length > 0)
      }
    }, [value])

    /**
     * 同步内部引用与外部转发引用。
     */
    const assignRef = (node: HTMLInputElement | null): void => {
      inputRef.current = node
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    }

    /**
     * 同步输入状态，确保非受控输入也能显示清除按钮。
     */
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
      setHasValue(event.target.value.length > 0)
      onChange?.(event)
    }

    /**
     * 通过原生输入事件同步受控值，并在清除后保留焦点。
     */
    const handleClear = (): void => {
      const input = inputRef.current
      if (!input) return

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(input, "")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      setHasValue(false)
      onClear?.()
      input.focus()
    }

    return (
      <div
        className={`flex w-full items-center gap-1.5 rounded-[6px] border border-white/10 bg-[#212121] px-2.5 py-1.5 text-white/80 transition-colors duration-150 hover:border-white/20 focus-within:border-white/25 ${
          disabled ? "cursor-not-allowed opacity-40" : ""
        } ${className}`}
      >
        {prefix}
        <input
          ref={assignRef}
          className={`min-w-0 flex-1 bg-transparent py-0 pr-0 ${textSizeClass} text-white outline-none placeholder:text-white/20 disabled:cursor-not-allowed`}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          {...props}
        />
        {clear && hasValue && !disabled ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-white/45 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
            aria-label="清除输入内容"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {suffix}
      </div>
    )
  },
)

LxInput.displayName = "LxInput"
