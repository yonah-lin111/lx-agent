import { X } from "lucide-react"
import React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

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
export interface LxTagProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "prefix"> {
  children?: React.ReactNode
  size?: LxTagSize
  // 外观变体：solid = 带边框与底色（默认）；ghost = 无边框无底色，仅有文字/图标。
  variant?: "solid" | "ghost"
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
  // 覆盖默认文字色；使用 bgClass 时若已含 text-* 请勿再传，避免同类冲突。
  textClass?: string
  className?: string
}

// 颜色档位：边框、底色、文字色各自独立，供 solid/ghost 与 textClass 精确组合。
const colorStyles: Record<
  LxTagColor,
  {
    border: string
    bg: string
    text: string
    activeBorder: string
    activeBg: string
    activeText: string
  }
> = {
  default: {
    border: "border-white/5",
    bg: "bg-white/[0.03]",
    text: "text-white/45",
    activeBorder: "border-white/15",
    activeBg: "bg-white/10",
    activeText: "text-white/90",
  },
  pink: {
    border: "border-pink-500/10",
    bg: "bg-pink-500/[0.03]",
    text: "text-pink-400/80",
    activeBorder: "border-pink-500/20",
    activeBg: "bg-pink-500/10",
    activeText: "text-pink-400",
  },
  amber: {
    border: "border-amber-500/10",
    bg: "bg-amber-500/[0.03]",
    text: "text-amber-400/80",
    activeBorder: "border-amber-500/20",
    activeBg: "bg-amber-500/10",
    activeText: "text-amber-400",
  },
  blue: {
    border: "border-blue-500/10",
    bg: "bg-blue-500/[0.03]",
    text: "text-blue-400/80",
    activeBorder: "border-blue-500/20",
    activeBg: "bg-blue-500/10",
    activeText: "text-blue-400",
  },
  teal: {
    border: "border-teal-500/10",
    bg: "bg-teal-500/[0.03]",
    text: "text-teal-400/80",
    activeBorder: "border-teal-500/20",
    activeBg: "bg-teal-500/10",
    activeText: "text-teal-400",
  },
  emerald: {
    border: "border-emerald-500/10",
    bg: "bg-emerald-500/[0.03]",
    text: "text-emerald-400/80",
    activeBorder: "border-emerald-500/20",
    activeBg: "bg-emerald-500/10",
    activeText: "text-emerald-400",
  },
  rose: {
    border: "border-rose-500/10",
    bg: "bg-rose-500/[0.03]",
    text: "text-rose-400/80",
    activeBorder: "border-rose-500/20",
    activeBg: "bg-rose-500/10",
    activeText: "text-rose-400",
  },
  gray: {
    border: "border-neutral-500/10",
    bg: "bg-neutral-500/[0.03]",
    text: "text-neutral-400/80",
    activeBorder: "border-neutral-500/20",
    activeBg: "bg-neutral-500/10",
    activeText: "text-neutral-400",
  },
  purple: {
    border: "border-purple-500/10",
    bg: "bg-purple-500/[0.03]",
    text: "text-purple-400/80",
    activeBorder: "border-purple-500/20",
    activeBg: "bg-purple-500/10",
    activeText: "text-purple-400",
  },
  indigo: {
    border: "border-indigo-500/10",
    bg: "bg-indigo-500/[0.03]",
    text: "text-indigo-400/80",
    activeBorder: "border-indigo-500/20",
    activeBg: "bg-indigo-500/10",
    activeText: "text-indigo-400",
  },
  sky: {
    border: "border-sky-500/10",
    bg: "bg-sky-500/[0.03]",
    text: "text-sky-400/80",
    activeBorder: "border-sky-500/20",
    activeBg: "bg-sky-500/10",
    activeText: "text-sky-400",
  },
  orange: {
    border: "border-orange-500/10",
    bg: "bg-orange-500/[0.03]",
    text: "text-orange-400/80",
    activeBorder: "border-orange-500/20",
    activeBg: "bg-orange-500/10",
    activeText: "text-orange-400",
  },
}

// 标签高度与内部尺度：对齐 LxIconButton / LxSelect / LxInput 的尺寸阶梯。
const sizeStyles: Record<LxTagSize, { container: string; closeIconSize: string }> = {
  small: {
    container: "h-6 gap-1.5 rounded-[6px] px-2 text-xs",
    closeIconSize: "h-3 w-3",
  },
  default: {
    container: "h-7 gap-1.5 rounded-[6px] px-2.5 text-xs",
    closeIconSize: "h-3 w-3",
  },
  large: {
    container: "h-8 gap-1.5 rounded-[6px] px-3 text-sm",
    closeIconSize: "h-3.5 w-3.5",
  },
}

/**
 * 渲染可配置颜色、尺寸和交互的通用标签。
 */
export const LxTag = React.forwardRef<HTMLSpanElement, LxTagProps>(function LxTag(
  {
    children,
    size = "default",
    variant = "solid",
    prefix,
    suffix,
    highlighted = false,
    onClick,
    onClose,
    confirmClose = true,
    closeTooltipContent,
    color = "default",
    bgClass,
    highlightBgClass,
    textClass,
    className = "",
    ...restProps
  },
  ref,
): React.JSX.Element {
  const { t } = useTranslation()
  const currentStyles = sizeStyles[size]
  const isClickable = typeof onClick === "function"
  const isInteractive = isClickable || typeof onClose === "function"
  const isGhost = variant === "ghost"
  const activeColorStyle = colorStyles[color] ?? colorStyles.default
  const defaultChrome = isGhost
    ? ""
    : (bgClass ?? `${activeColorStyle.border} ${activeColorStyle.bg}`)
  // 自定义背景（bgClass）已自带文字色时不再注入色板文字色，避免同类冲突。
  const defaultText = textClass ?? (!isGhost && bgClass ? "" : activeColorStyle.text)
  const activeChrome = isGhost
    ? ""
    : (highlightBgClass ?? `${activeColorStyle.activeBorder} ${activeColorStyle.activeBg}`)
  const activeText = textClass ?? (!isGhost && highlightBgClass ? "" : activeColorStyle.activeText)
  const resolvedCloseTooltip = closeTooltipContent ?? t("common.confirmDelete")

  return (
    <span
      ref={ref}
      aria-label={isClickable && typeof children === "string" ? children : undefined}
      data-color={color}
      data-variant={variant}
      data-highlighted={highlighted ? "true" : undefined}
      className={`lx-tag inline-flex select-none items-center justify-center font-semibold transition-all duration-150 ${
        isGhost ? "" : "border"
      } ${currentStyles.container} ${
        highlighted ? `${activeChrome} ${activeText}` : `${defaultChrome} ${defaultText}`
      } ${isInteractive ? "cursor-pointer" : "cursor-default"} ${className}`}
      role={isClickable ? "button" : undefined}
      onClick={onClick}
      {...restProps}
    >
      {prefix && (
        <span
          className={`flex shrink-0 items-center justify-center ${isGhost ? "text-current" : "text-current/60"}`}
        >
          {prefix}
        </span>
      )}
      {children != null && <span className="truncate leading-none">{children}</span>}
      {(suffix || onClose) && (
        <span className="flex shrink-0 items-center gap-0.5">
          {suffix}
          {onClose &&
            (confirmClose ? (
              <LxTooltip
                hover={{
                  content: t("common.delete"),
                  placement: "top",
                }}
                click={{
                  content: resolvedCloseTooltip,
                  placement: "top",
                  onConfirm: onClose,
                }}
              >
                <span
                  aria-label={t("common.delete")}
                  className="flex cursor-pointer items-center justify-center text-current opacity-60 transition-all hover:text-rose-400 hover:opacity-100"
                  role="button"
                  onClick={(event) => event.stopPropagation()}
                >
                  <X className={currentStyles.closeIconSize} />
                </span>
              </LxTooltip>
            ) : (
              <LxTooltip
                hover={{
                  content: resolvedCloseTooltip,
                  placement: "top",
                }}
              >
                <span
                  aria-label={t("common.delete")}
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
            ))}
        </span>
      )}
    </span>
  )
})
