import type React from "react"

// 导航行尺寸类型。
export type LxNavItemSize = "small" | "default" | "large"

// 导航行属性。
export interface LxNavItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "prefix"> {
  children: React.ReactNode
  size?: LxNavItemSize
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  // 嵌套层级缩进，0 或负值不缩进。
  depth?: number
  // 是否启用基础 hover 背景，特殊行可关闭后自管。
  hoverable?: boolean
  className?: string
}

// 尺寸阶梯：高度与内部尺度对齐 LxTag 的容器度量。
const sizeStyles: Record<LxNavItemSize, string> = {
  small: "h-6 gap-0.5 px-2 text-xs",
  default: "h-7 gap-1 px-2.5 text-xs",
  large: "h-8 gap-1.5 px-3 text-sm",
}

/**
 * 渲染树形列表的通用行，支持前后缀插槽、尺寸档位、嵌套缩进与键盘可达。
 */
export const LxNavItem = ({
  children,
  size = "default",
  prefix,
  suffix,
  depth = 0,
  hoverable = true,
  className = "",
  style,
  onClick,
  onKeyDown,
  ...restProps
}: LxNavItemProps): React.JSX.Element => {
  const indent = depth > 0 ? 10 + (depth - 1) * 12 : 0

  return (
    <div
      role="button"
      tabIndex={0}
      style={indent > 0 ? { marginLeft: `${indent}px`, ...style } : style}
      className={`lx-nav-item group flex items-center rounded-[6px] text-left transition-colors data-[menu-open=true]:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
        sizeStyles[size]
      } ${hoverable ? "hover:bg-white/10" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          event.currentTarget.click()
        }
        onKeyDown?.(event)
      }}
      {...restProps}
    >
      {prefix}
      {children}
      {suffix}
    </div>
  )
}
