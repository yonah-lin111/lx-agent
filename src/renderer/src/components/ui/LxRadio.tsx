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

// 单选项属性。
export interface LxRadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode
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
  onChange,
  ...inputProps
}: LxRadioProps): React.JSX.Element => {
  const radioGroup = useContext(LxRadioGroupContext)
  const isDisabled = disabled || radioGroup?.disabled === true
  const isChecked = radioGroup ? radioGroup.value === String(value) : checked

  return (
    <label
      className={`flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs text-white/65 transition-colors ${
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
        className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/25 transition-colors before:h-1.5 before:w-1.5 before:rounded-full before:bg-black before:opacity-0 before:transition-opacity peer-checked:border-white peer-checked:bg-white peer-checked:before:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-white/40"
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
