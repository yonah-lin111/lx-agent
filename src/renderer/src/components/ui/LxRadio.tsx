import type React from "react"
import { createContext, useContext } from "react"

// 单选组上下文。
interface LxRadioGroupContextValue {
  name: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

const LxRadioGroupContext = createContext<LxRadioGroupContextValue | null>(null)

// 单选组属性。
export interface LxRadioGroupProps {
  name: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}

// 单选项尺寸类型。
export type LxRadioSize = "small" | "medium" | "large"

// 单选项属性。
export interface LxRadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: React.ReactNode
  size?: LxRadioSize
}

// 尺寸档位：行高与字号对齐控件阶梯，圆框与内点逐档等比放大。
const SIZE_STYLES: Record<LxRadioSize, { row: string; box: string; marker: string }> = {
  small: { row: "h-6 text-xs", box: "h-3.5 w-3.5", marker: "before:h-1.5 before:w-1.5" },
  medium: { row: "h-7 text-sm", box: "h-4 w-4", marker: "before:h-2 before:w-2" },
  large: { row: "h-8 text-sm", box: "h-[18px] w-[18px]", marker: "before:h-2.5 before:w-2.5" },
}

/**
 * 渲染黑色主题单选项。
 */
export const LxRadio = ({
  label,
  className = "",
  disabled = false,
  name,
  checked,
  value,
  size = "medium",
  onChange,
  ...inputProps
}: LxRadioProps): React.JSX.Element => {
  const radioGroup = useContext(LxRadioGroupContext)
  const isDisabled = disabled || radioGroup?.disabled === true
  const isChecked = radioGroup ? radioGroup.value === String(value) : checked
  const styles = SIZE_STYLES[size]

  return (
    <label
      data-size={size}
      className={`lx-radio flex items-center gap-2 rounded-[6px] px-2 text-white/65 transition-colors ${styles.row} ${
        isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-white/[0.04]"
      } ${className}`}
    >
      <input
        {...inputProps}
        checked={isChecked}
        className="peer sr-only"
        disabled={isDisabled}
        name={radioGroup?.name ?? name}
        onChange={(event) => {
          onChange?.(event)
          if (event.target.checked) radioGroup?.onChange(event.target.value)
        }}
        type="radio"
        value={value}
      />
      <span
        aria-hidden="true"
        className={`lx-radio-dot relative flex ${styles.box} items-center justify-center rounded-full border border-white/25 transition-colors before:rounded-full before:bg-black before:opacity-0 before:transition-opacity ${styles.marker} peer-checked:border-white peer-checked:bg-white peer-checked:before:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-white/40`}
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * 为单选项提供统一受控状态。
 */
export const LxRadioGroup = ({
  name,
  value,
  onChange,
  children,
  disabled = false,
  className = "",
}: LxRadioGroupProps): React.JSX.Element => (
  <LxRadioGroupContext.Provider value={{ name, value, onChange, disabled }}>
    <div className={className} role="radiogroup">
      {children}
    </div>
  </LxRadioGroupContext.Provider>
)
