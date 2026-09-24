import type React from "react"
import { forwardRef, useRef, useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"

// 导航行尺寸类型。
export type LxNavItemSize = "small" | "medium" | "large"

// 导航行层级：1 = 根容器，2 = 中间容器，3 = 叶子。
export type LxNavItemLevel = 1 | 2 | 3

// 导航行属性。
export interface LxNavItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "prefix"> {
  children?: React.ReactNode
  // 截断标签：以单行省略号渲染并占满剩余宽度；实际被截断时 hover 展示完整内容的右侧 Tooltip。
  label?: React.ReactNode
  // 追加到自动渲染的截断标签上的样式类（状态/字体等修饰）。
  labelClassName?: string
  size?: LxNavItemSize
  level?: LxNavItemLevel
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  // 嵌套层级缩进，0 或负值不缩进。
  depth?: number
  // 是否启用基础 hover 背景，特殊行可关闭后自管。
  hoverable?: boolean
  className?: string
}

// 尺寸阶梯：高度与内部尺度对齐 LxTag 的容器度量；字号 small=xs，default/large=sm。
const sizeStyles: Record<LxNavItemSize, string> = {
  small: "h-6 gap-1.5 px-2 text-xs",
  medium: "h-7 gap-1.5 px-2.5 text-sm",
  large: "h-8 gap-1.5 px-3 text-sm",
}

/**
 * 渲染树形列表的通用行，支持前后缀插槽、尺寸档位、嵌套缩进与键盘可达。
 */
export const LxNavItem = forwardRef<HTMLDivElement, LxNavItemProps>(function LxNavItem(
  {
    children,
    label,
    labelClassName = "",
    size = "medium",
    level = 1,
    prefix,
    suffix,
    depth = 0,
    hoverable = true,
    className = "",
    style,
    onClick,
    onMouseEnter,
    onKeyDown,
    ...restProps
  },
  ref,
): React.JSX.Element {
  const indent = depth > 0 ? 10 + (depth - 1) * 12 : 0
  const labelRef = useRef<HTMLSpanElement>(null)
  const [isLabelTruncated, setIsLabelTruncated] = useState(false)

  const row = (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      style={indent > 0 ? { marginLeft: `${indent}px`, ...style } : style}
      className={`lx-nav-item group flex items-center rounded-[6px] text-left transition-colors data-[menu-open=true]:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
        sizeStyles[size]
      } ${hoverable ? "hover:bg-white/10" : ""} ${className}`}
      onClick={onClick}
      onMouseEnter={(event) => {
        if (label != null) {
          const element = labelRef.current
          setIsLabelTruncated(Boolean(element && element.scrollWidth > element.clientWidth + 1))
        }
        onMouseEnter?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          event.currentTarget.click()
        }
        onKeyDown?.(event)
      }}
      {...restProps}
      data-item-level={String(level)}
    >
      {prefix}
      {label != null ? (
        <span ref={labelRef} className={`min-w-0 flex-1 truncate ${labelClassName}`}>
          {label}
        </span>
      ) : null}
      {children}
      {suffix}
    </div>
  )

  if (label == null) return row

  // 未截断时不渲染气泡内容（content 为空时 LxTooltip 不出现）。
  return (
    <LxTooltip content={isLabelTruncated ? label : undefined} placement="right">
      {row}
    </LxTooltip>
  )
})
