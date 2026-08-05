import { ChevronDown, ChevronUp, Eye, EyeOff, X } from "lucide-react"
import type React from "react"
import { forwardRef, useEffect, useRef, useState } from "react"

// 输入框尺寸。
export type LxInputSize = "xs" | "sm" | "lg"

// 输入框样式。
export type LxInputVariant = "default" | "simple"

// 输入框属性。
export interface LxInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    | "onBlur"
    | "onChange"
    | "onClick"
    | "onCompositionEnd"
    | "onCompositionStart"
    | "onFocus"
    | "onInput"
    | "onKeyDown"
    | "onKeyPress"
    | "onKeyUp"
    | "onMouseDown"
    | "onMouseUp"
    | "onPaste"
    | "onSelect"
    | "prefix"
    | "size"
    | "suffix"
  > {
  // 多行输入（textarea）。
  multiline?: boolean
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  size?: LxInputSize
  variant?: LxInputVariant
  clear?: boolean
  onClear?: () => void
  onBlur?(event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onClick?(event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onCompositionEnd?(event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onCompositionStart?(event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onFocus?(event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onInput?(event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onKeyDown?(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onKeyPress?(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onKeyUp?(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onMouseDown?(event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onMouseUp?(event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onPaste?(event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>): void
  onSelect?(event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>): void
}

/**
 * 提供深色主题样式以及前后缀插槽的单行输入框，multiline 时渲染多行 textarea。
 */
export const LxInput = forwardRef<HTMLInputElement, LxInputProps>(
  (
    {
      className = "",
      multiline = false,
      prefix,
      suffix,
      size = "sm",
      variant = "default",
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
    const [showPassword, setShowPassword] = useState<boolean>(false)
    const textSizeClass = size === "lg" ? "text-sm" : "text-xs"
    const sizeClass = size === "xs" ? "gap-1.5 px-2 py-1" : "gap-1.5 px-2.5 py-1.5"
    const variantClass =
      variant === "simple"
        ? "border-transparent bg-transparent hover:border-transparent focus-within:border-transparent"
        : "border-white/10 bg-[#212121] hover:border-white/20 focus-within:border-white/25"
    const placeholderClass =
      variant === "simple" ? "placeholder:text-white/35" : "placeholder:text-white/20"
    const inputType = props.type === "password" ? (showPassword ? "text" : "password") : props.type
    const { type: _fieldType, ...fieldProps } = props
    const fieldClass = `min-w-0 flex-1 bg-transparent py-0 pr-0 ${textSizeClass} ${placeholderClass} text-white outline-none disabled:cursor-not-allowed ${
      multiline
        ? "resize-none leading-snug"
        : "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
    }`

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
    const handleChange = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      setHasValue(event.target.value.length > 0)
      onChange?.(event)
    }

    /**
     * 通过原生输入事件同步受控值，并在清除后保留焦点。
     */
    const handleClear = (): void => {
      const input = inputRef.current
      if (!input) return

      const proto =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
      const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set
      valueSetter?.call(input, "")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      setHasValue(false)
      onClear?.()
      input.focus()
    }

    /**
     * 调整数字输入框的数值。
     */
    const handleStep = (direction: "up" | "down"): void => {
      const input = inputRef.current
      if (!input || disabled) return

      try {
        if (direction === "up") {
          input.stepUp()
        } else {
          input.stepDown()
        }
      } catch {
        const step = Number.parseFloat(String(props.step ?? 1)) || 1
        const current = Number.parseFloat(input.value) || 0
        const next = direction === "up" ? current + step : current - step
        input.value = String(next)
      }

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(input, input.value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      setHasValue(input.value.length > 0)
    }

    return (
      <div
        className={`flex w-full min-w-0 items-center rounded-[6px] border text-white/80 transition-colors duration-150 ${sizeClass} ${variantClass} ${
          disabled ? "cursor-not-allowed opacity-40" : ""
        } ${className}`}
      >
        {prefix}
        {multiline ? (
          <textarea
            ref={(node) => assignRef(node as HTMLInputElement | null)}
            className={fieldClass}
            disabled={disabled}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            {...fieldProps}
          />
        ) : (
          <input
            ref={assignRef}
            className={fieldClass}
            disabled={disabled}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            {...props}
            type={inputType}
          />
        )}
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
        {props.type === "password" && !disabled ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-white/45 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            onClick={() => setShowPassword((prev) => !prev)}
          >
            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {props.type === "number" && !disabled ? (
          <div className="flex shrink-0 flex-col justify-center -my-1 text-white/40">
            <button
              type="button"
              tabIndex={-1}
              className="flex h-3 w-4 items-center justify-center rounded-[2px] transition-colors hover:bg-white/10 hover:text-white focus:outline-none"
              aria-label="增加数值"
              onClick={() => handleStep("up")}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="flex h-3 w-4 items-center justify-center rounded-[2px] transition-colors hover:bg-white/10 hover:text-white focus:outline-none"
              aria-label="减少数值"
              onClick={() => handleStep("down")}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        {suffix}
      </div>
    )
  },
)

LxInput.displayName = "LxInput"
