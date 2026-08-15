import { X } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"

// LxTag 组件尺寸类型。
export type LxTagSize = "small" | "default" | "large"

// Tag 组件颜色类型。
export type LxTagColor =
  | "default"
  | "pink"
  | "amber"
  | "blue"
  | "teal"
  | "emerald"
  | "rose"
  | "gray"
  | "purple"
  | "indigo"
  | "sky"
  | "orange"

// Tag 组件属性。
export interface LxTagProps {
  children: React.ReactNode
  size?: LxTagSize
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  highlighted?: boolean
  onClick?: (event: React.MouseEvent<HTMLSpanElement>) => void
  onClose?: () => void
  confirmClose?: boolean
  closeTooltipContent?: React.ReactNode
  color?: LxTagColor
  bgClass?: string
  highlightBgClass?: string
  hoverClass?: string
  className?: string
}

const colorStyles: Record<LxTagColor, { bg: string; highlightBg: string; hover: string }> = {
  default: {
    bg: "border-white/5 bg-white/[0.03] text-white/45",
    highlightBg: "border-white/15 bg-white/10 text-white/90",
    hover: "hover:border-white/20 hover:text-white/80",
  },
  pink: {
    bg: "border-pink-500/10 bg-pink-500/[0.03] text-pink-400/80",
    highlightBg: "border-pink-500/20 bg-pink-500/10 text-pink-400",
    hover: "hover:border-pink-500/30 hover:text-pink-300",
  },
  amber: {
    bg: "border-amber-500/10 bg-amber-500/[0.03] text-amber-400/80",
    highlightBg: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    hover: "hover:border-amber-500/30 hover:text-amber-300",
  },
  blue: {
    bg: "border-blue-500/10 bg-blue-500/[0.03] text-blue-400/80",
    highlightBg: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    hover: "hover:border-blue-500/30 hover:text-blue-300",
  },
  teal: {
    bg: "border-teal-500/10 bg-teal-500/[0.03] text-teal-400/80",
    highlightBg: "border-teal-500/20 bg-teal-500/10 text-teal-400",
    hover: "hover:border-teal-500/30 hover:text-teal-300",
  },
  emerald: {
    bg: "border-emerald-500/10 bg-emerald-500/[0.03] text-emerald-400/80",
    highlightBg: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    hover: "hover:border-emerald-500/30 hover:text-emerald-300",
  },
  rose: {
    bg: "border-rose-500/10 bg-rose-500/[0.03] text-rose-400/80",
    highlightBg: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    hover: "hover:border-rose-500/30 hover:text-rose-300",
  },
  gray: {
    bg: "border-neutral-500/10 bg-neutral-500/[0.03] text-neutral-400/80",
    highlightBg: "border-neutral-500/20 bg-neutral-500/10 text-neutral-400",
    hover: "hover:border-neutral-500/30 hover:text-neutral-300",
  },
  purple: {
    bg: "border-purple-500/10 bg-purple-500/[0.03] text-purple-400/80",
    highlightBg: "border-purple-500/20 bg-purple-500/10 text-purple-400",
    hover: "hover:border-purple-500/30 hover:text-purple-300",
  },
  indigo: {
    bg: "border-indigo-500/10 bg-indigo-500/[0.03] text-indigo-400/80",
    highlightBg: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
    hover: "hover:border-indigo-500/30 hover:text-indigo-300",
  },
  sky: {
    bg: "border-sky-500/10 bg-sky-500/[0.03] text-sky-400/80",
    highlightBg: "border-sky-500/20 bg-sky-500/10 text-sky-400",
    hover: "hover:border-sky-500/30 hover:text-sky-300",
  },
  orange: {
    bg: "border-orange-500/10 bg-orange-500/[0.03] text-orange-400/80",
    highlightBg: "border-orange-500/20 bg-orange-500/10 text-orange-400",
    hover: "hover:border-orange-500/30 hover:text-orange-300",
  },
}

const sizeStyles: Record<LxTagSize, { container: string; closeIconSize: string }> = {
  small: {
    container: "gap-0.5 rounded-[4px] px-1.5 py-0.5 text-[10px]",
    closeIconSize: "h-2 w-2",
  },
  default: {
    container: "gap-1 rounded-[6px] px-2 py-1 text-xs",
    closeIconSize: "h-2.5 w-2.5",
  },
  large: {
    container: "gap-1.5 rounded-[6px] px-2.5 py-1.5 text-sm",
    closeIconSize: "h-3 w-3",
  },
}

/**
 * 渲染可配置颜色、尺寸和交互的通用标签。
 */
export const LxTag = ({
  children,
  size = "default",
  prefix,
  suffix,
  highlighted = false,
  onClick,
  onClose,
  confirmClose = true,
  closeTooltipContent = "确认删除此标签？",
  color = "default",
  bgClass,
  highlightBgClass,
  hoverClass,
  className = "",
}: LxTagProps): React.JSX.Element => {
  const currentStyles = sizeStyles[size]
  const isClickable = typeof onClick === "function"
  const isInteractive = isClickable || typeof onClose === "function"
  const defaultBg = bgClass ?? colorStyles[color].bg
  const defaultHighlightBg = highlightBgClass ?? colorStyles[color].highlightBg
  const defaultHover = hoverClass ?? colorStyles[color].hover

  return (
    <span
      aria-label={isClickable && typeof children === "string" ? children : undefined}
      className={`inline-flex select-none items-center justify-center border font-semibold transition-all duration-150 ${
        currentStyles.container
      } ${
        highlighted ? defaultHighlightBg : `${defaultBg} ${isInteractive ? defaultHover : ""}`
      } ${isInteractive ? "cursor-pointer" : "cursor-default"} ${className}`}
      role={isClickable ? "button" : undefined}
      onClick={onClick}
    >
      {prefix && (
        <span className="flex shrink-0 items-center justify-center text-current/60">{prefix}</span>
      )}
      <span className="truncate leading-none">{children}</span>
      {(suffix || onClose) && (
        <span className="flex shrink-0 items-center gap-0.5">
          {suffix}
          {onClose && (
            confirmClose ? (
              <LxTooltip content={closeTooltipContent} onConfirm={onClose} placement="top">
                <span
                  aria-label="删除标签"
                  className="flex cursor-pointer items-center justify-center text-current opacity-60 transition-all hover:text-rose-400 hover:opacity-100"
                  role="button"
                  onClick={(event) => event.stopPropagation()}
                >
                  <X className={currentStyles.closeIconSize} />
                </span>
              </LxTooltip>
            ) : (
              <LxTooltip content={closeTooltipContent} placement="top">
                <span
                  aria-label="删除标签"
                  className="flex cursor-pointer items-center justify-center text-current opacity-60 transition-all hover:text-rose-400 hover:opacity-100"
                  role="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose()
                  }}
                >
                  <X className={currentStyles.closeIconSize} />
                </span>
              </LxTooltip>
            )
          )}
        </span>
      )}
    </span>
  )
}
