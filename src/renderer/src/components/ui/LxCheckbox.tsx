import type React from "react"

// 复选框尺寸类型。
export type LxCheckboxSize = "small" | "medium" | "large"

// 复选框属性。
export interface LxCheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "size"> {
  onChange: (checked: boolean) => void
  size?: LxCheckboxSize
}

// 尺寸档位：方框、勾选标记（before 伪元素）与圆角逐档等比放大，对齐 LxIconButton 的图标档位。
const SIZE_STYLES: Record<LxCheckboxSize, { box: string; check: string; radius: string }> = {
  small: {
    box: "h-3.5 w-3.5",
    check: "before:left-[5px] before:top-[3px] before:h-[7px] before:w-[4px]",
    radius: "rounded-[4px]",
  },
  medium: {
    box: "h-4 w-4",
    check: "before:left-[5.5px] before:top-[3px] before:h-[8px] before:w-[4.5px]",
    radius: "rounded-[5px]",
  },
  large: {
    box: "h-[18px] w-[18px]",
    check: "before:left-[6.5px] before:top-[4px] before:h-[9px] before:w-[5px]",
    radius: "rounded-[6px]",
  },
}

/**
 * 渲染黑色主题复选框。
 */
export const LxCheckbox = ({
  className = "",
  onChange,
  size = "medium",
  ...props
}: LxCheckboxProps): React.JSX.Element => {
  const styles = SIZE_STYLES[size]

  return (
    <span
      data-size={size}
      className={`lx-checkbox relative inline-flex shrink-0 cursor-pointer ${styles.box} ${className}`}
    >
      <input
        {...props}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={`lx-checkbox-box pointer-events-none absolute inset-0 ${styles.radius} border border-white/25 transition-colors before:absolute ${styles.check} before:rotate-45 before:border-r-2 before:border-b-2 before:border-black before:opacity-0 before:transition-opacity peer-checked:border-white peer-checked:bg-white peer-checked:before:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-white/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-40`}
      />
    </span>
  )
}
