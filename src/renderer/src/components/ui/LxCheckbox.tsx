import type React from "react"

// 复选框属性。
export interface LxCheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  onChange: (checked: boolean) => void
}

/**
 * 渲染黑色主题复选框。
 */
export const LxCheckbox = ({
  className = "",
  onChange,
  ...props
}: LxCheckboxProps): React.JSX.Element => (
  <span className={`relative inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer ${className}`}>
    <input
      {...props}
      type="checkbox"
      onChange={(event) => onChange(event.target.checked)}
      className="peer sr-only"
    />
    <span
      aria-hidden="true"
      className="absolute inset-0 rounded-[4px] border border-white/25 transition-colors before:absolute before:left-[5px] before:top-[3px] before:h-[7px] before:w-[4px] before:rotate-45 before:border-r-2 before:border-b-2 before:border-black before:opacity-0 before:transition-opacity peer-checked:border-white peer-checked:bg-white peer-checked:before:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-white/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-40"
    />
  </span>
)
