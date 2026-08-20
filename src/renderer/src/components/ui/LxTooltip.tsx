import { Check, Minus, X } from "lucide-react"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "@/i18n"

// Tooltip 弹出位置。
export type LxTooltipPlacement = "top" | "bottom" | "left" | "right"

// Tooltip 触发方式。
export type LxTooltipTrigger = "hover" | "click" | "both"

// Tooltip 组件属性。
export interface LxTooltipProps {
  children: React.ReactNode
  title?: React.ReactNode
  content?: React.ReactNode
  placement?: LxTooltipPlacement
  trigger?: LxTooltipTrigger
  delay?: number
  contentClassName?: string
  className?: string
  // 内容允许多行/列表展示：宽度随内容自适应，超出视口时受限并可换行。
  multiline?: boolean
  // 是否支持最小化：右上角展示 [-] 按钮，点击关闭/最小化气泡（默认 false）。
  minimizable?: boolean
  // 滚动条滚动时是否关闭（默认 true；常驻浮层如权限面板设为 false）。
  closeOnScroll?: boolean
  // 点击气泡外区域是否关闭（默认 true；常驻浮层如权限面板设为 false）。
  closeOnOutsideClick?: boolean
  // 点击气泡内容后自动关闭。
  closeOnContentClick?: boolean
  // 受控显隐。
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onConfirm?: () => void
  onCancel?: () => void
}

// 嵌套浮层注册上下文：portal 渲染到 body 的嵌套组件（LxSelect 下拉、嵌套 Tooltip 气泡等）
// 通过注册自身根元素，避免被父级 Tooltip 的「点击外部 / 滚动」逻辑误判为外部而关闭。
interface TooltipLayerContextValue {
  register: (node: HTMLElement) => void
  unregister: (node: HTMLElement) => void
}
export const TooltipLayerContext = createContext<TooltipLayerContextValue | null>(null)

/**
 * 将节点同时写入 Tooltip 与触发元素原有的 ref。
 */
const assignRef = (ref: React.Ref<HTMLElement> | undefined, node: HTMLElement | null): void => {
  if (typeof ref === "function") {
    ref(node)
  } else if (ref) {
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = node
  }
}

/**
 * Tooltip - 通过 Portal 渲染的统一提示与二次确认气泡。
 * 自动根据可用视口空间调整方向，并避免被父级 overflow 裁剪。
 */
export const LxTooltip = ({
  children,
  title,
  content,
  placement = "top",
  trigger = "hover",
  delay = 150,
  contentClassName = "",
  className = "",
  multiline = false,
  minimizable = false,
  closeOnScroll = true,
  closeOnOutsideClick = true,
  closeOnContentClick = false,
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: LxTooltipProps): React.JSX.Element => {
  const [isVisible, setIsVisible] = useState(open ?? false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [activePlacement, setActivePlacement] = useState<LxTooltipPlacement>(placement)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const [arrowOffset, setArrowOffset] = useState(0)
  const containerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isConfirming = typeof onConfirm === "function"
  const activeTrigger = isConfirming ? "click" : trigger
  const activeDelay = isConfirming ? 0 : delay
  const { t } = useTranslation()

  // 嵌套浮层注册：维护属于本气泡的 portal 节点集合，并向上传播到父级 Tooltip，
  // 使深层嵌套（下拉、嵌套气泡）的点击/滚动都不会关闭任意祖先气泡。
  const parentLayer = useContext(TooltipLayerContext)
  const layerNodesRef = useRef<Set<HTMLElement>>(new Set())
  const registerLayer = useCallback(
    (node: HTMLElement): void => {
      layerNodesRef.current.add(node)
      parentLayer?.register(node)
    },
    [parentLayer],
  )
  const unregisterLayer = useCallback(
    (node: HTMLElement): void => {
      layerNodesRef.current.delete(node)
      parentLayer?.unregister(node)
    },
    [parentLayer],
  )
  const layerContextValue = useMemo(
    () => ({ register: registerLayer, unregister: unregisterLayer }),
    [registerLayer, unregisterLayer],
  )

  // 本 Tooltip 自身的气泡作为嵌套浮层注册到父级 Tooltip。
  useEffect(() => {
    if (!parentLayer || !shouldRender || !tooltipRef.current) return
    const node = tooltipRef.current
    parentLayer.register(node)
    return () => parentLayer.unregister(node)
  }, [parentLayer, shouldRender])

  // 目标节点是否属于本气泡范围：触发元素、气泡本身，或已注册的嵌套浮层。
  const isInsideTooltip = useCallback((target: Node): boolean => {
    if (containerRef.current?.contains(target) || tooltipRef.current?.contains(target)) return true
    for (const node of layerNodesRef.current) {
      if (node.contains(target)) return true
    }
    return false
  }, [])

  /**
   * 更新显隐状态并同步受控父组件。
   */
  const syncVisible = (visible: boolean): void => {
    setIsVisible(visible)
    onOpenChange?.(visible)
  }

  /**
   * 清理待执行的显示或隐藏计时器。
   */
  const clearTimers = (): void => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    showTimeoutRef.current = null
    hideTimeoutRef.current = null
  }

  /**
   * 根据触发元素和视口尺寸计算气泡位置。
   */
  const updatePosition = (): void => {
    if (!containerRef.current || !tooltipRef.current) return

    const triggerRect = containerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const tooltipWidth = tooltipRef.current.offsetWidth || tooltipRect.width
    const tooltipHeight = tooltipRef.current.offsetHeight || tooltipRect.height
    const padding = 8
    const gap = 12
    const spaces = {
      top: triggerRect.top - padding,
      bottom: window.innerHeight - padding - triggerRect.bottom,
      left: triggerRect.left - padding,
      right: window.innerWidth - padding - triggerRect.right,
    }

    let resolvedPlacement = placement
    if (placement === "top" && spaces.top < tooltipHeight + gap && spaces.bottom > spaces.top) {
      resolvedPlacement = "bottom"
    } else if (
      placement === "bottom" &&
      spaces.bottom < tooltipHeight + gap &&
      spaces.top > spaces.bottom
    ) {
      resolvedPlacement = "top"
    } else if (
      placement === "left" &&
      spaces.left < tooltipWidth + gap &&
      spaces.right > spaces.left
    ) {
      resolvedPlacement = "right"
    } else if (
      placement === "right" &&
      spaces.right < tooltipWidth + gap &&
      spaces.left > spaces.right
    ) {
      resolvedPlacement = "left"
    }

    let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2
    let top = triggerRect.top - tooltipHeight - gap
    if (resolvedPlacement === "bottom") top = triggerRect.bottom + gap
    if (resolvedPlacement === "left") {
      left = triggerRect.left - tooltipWidth - gap
      top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2
    }
    if (resolvedPlacement === "right") {
      left = triggerRect.right + gap
      top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2
    }

    left = Math.max(padding, Math.min(window.innerWidth - padding - tooltipWidth, left))
    top = Math.max(padding, Math.min(window.innerHeight - padding - tooltipHeight, top))
    const triggerCenter =
      resolvedPlacement === "top" || resolvedPlacement === "bottom"
        ? triggerRect.left + triggerRect.width / 2
        : triggerRect.top + triggerRect.height / 2
    const bubbleStart = resolvedPlacement === "top" || resolvedPlacement === "bottom" ? left : top
    const bubbleSize =
      resolvedPlacement === "top" || resolvedPlacement === "bottom" ? tooltipWidth : tooltipHeight

    setActivePlacement(resolvedPlacement)
    setCoords({ left, top })
    setArrowOffset(Math.max(12, Math.min(bubbleSize - 12, triggerCenter - bubbleStart)))
  }

  useEffect(() => {
    if (open === undefined) return
    if (open !== isVisible) syncVisible(open)
  }, [open])

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
      setCoords(null)
    }, 120)
    return () => clearTimeout(timer)
  }, [isVisible, shouldRender])

  useEffect(() => {
    if (!shouldRender) return
    const frame = requestAnimationFrame(updatePosition)
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition)
    if (tooltipRef.current) resizeObserver?.observe(tooltipRef.current)
    window.addEventListener("resize", updatePosition)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updatePosition)
    }
  }, [shouldRender, placement])

  useEffect(() => {
    if (!isVisible || !closeOnScroll) return
    // 任意滚动条滚动时关闭气泡，排除本气泡范围（含已注册的嵌套浮层）内滚动。
    const handleScroll = (event: Event): void => {
      const target = event.target as Node
      if (!isInsideTooltip(target)) {
        clearTimers()
        syncVisible(false)
      }
    }
    document.addEventListener("scroll", handleScroll, true)
    return () => document.removeEventListener("scroll", handleScroll, true)
  }, [isVisible, closeOnScroll, isInsideTooltip])

  useEffect(() => {
    if (!isVisible) return
    // 点击本气泡范围（含已注册的嵌套浮层）外时关闭。
    const handleOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!isInsideTooltip(target)) {
        syncVisible(false)
      }
    }
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        syncVisible(false)
      }
    }
    if (closeOnOutsideClick) document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("keydown", handleEscape)
    return () => {
      if (closeOnOutsideClick) document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isVisible, closeOnOutsideClick])

  useEffect(() => () => clearTimers(), [])

  /**
   * 按触发模式延迟显示气泡。
   */
  const showTooltip = (): void => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    if (isVisible) return
    if (activeDelay === 0) {
      syncVisible(true)
      return
    }
    showTimeoutRef.current = setTimeout(() => syncVisible(true), activeDelay)
  }

  /**
   * 为悬停触发保留进入气泡的缓冲时间。
   */
  const hideTooltip = (): void => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    if (activeTrigger === "hover" || activeTrigger === "both") {
      if (!hideTimeoutRef.current) {
        hideTimeoutRef.current = setTimeout(() => {
          hideTimeoutRef.current = null
          syncVisible(false)
        }, 200)
      }
      return
    }
    syncVisible(false)
  }

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    width: "20px",
    height: "20px",
    pointerEvents: "none",
  }
  if (activePlacement === "top") {
    arrowStyle.bottom = "-14px"
    arrowStyle.left = `${arrowOffset}px`
    arrowStyle.transform = "translateX(-50%) rotate(180deg)"
  } else if (activePlacement === "bottom") {
    arrowStyle.top = "-14px"
    arrowStyle.left = `${arrowOffset}px`
    arrowStyle.transform = "translateX(-50%)"
  } else if (activePlacement === "left") {
    arrowStyle.right = "-14px"
    arrowStyle.top = `${arrowOffset}px`
    arrowStyle.transform = "translateY(-50%) rotate(90deg)"
  } else {
    arrowStyle.left = "-14px"
    arrowStyle.top = `${arrowOffset}px`
    arrowStyle.transform = "translateY(-50%) rotate(270deg)"
  }
  const cardClassName = isConfirming
    ? "w-48 bg-[#303030] p-2.5 text-white"
    : `bg-[#303030] px-2.5 py-1.5 text-xs font-semibold text-white ${
        multiline ? "whitespace-normal max-w-[min(420px,80vw)]" : "whitespace-nowrap"
      }`
  let triggerElement: React.ReactNode = children
  if (React.isValidElement(children)) {
    const child = children as React.ReactElement<
      React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
    >

    triggerElement = React.cloneElement(child, {
      ref: (node: HTMLElement | null) => {
        containerRef.current = node
        assignRef(child.props.ref, node)
      },
      className: `${child.props.className ?? ""} ${className}`.trim(),
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
        if (activeTrigger === "hover" || activeTrigger === "both") showTooltip()
        child.props.onMouseEnter?.(event)
      },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
        if (activeTrigger === "hover" || activeTrigger === "both") hideTooltip()
        child.props.onMouseLeave?.(event)
      },
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (activeTrigger === "click" || activeTrigger === "both") {
          event.stopPropagation()
          syncVisible(!isVisible)
        } else {
          clearTimers()
          syncVisible(false)
        }
        child.props.onClick?.(event)
      },
    })
  } else {
    triggerElement = (
      <span ref={containerRef} className={className}>
        {children}
      </span>
    )
  }

  return (
    <>
      {triggerElement}
      {shouldRender &&
        createPortal(
          <TooltipLayerContext.Provider value={layerContextValue}>
            <div
              ref={tooltipRef}
              role="tooltip"
              className={`fixed z-[999999] rounded-[6px] select-text drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${cardClassName} ${minimizable ? "flex flex-col" : ""} ${isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"} ${contentClassName}`}
              style={{ left: coords?.left ?? 0, top: coords?.top ?? 0 }}
              onMouseEnter={() => {
                if (hideTimeoutRef.current) {
                  clearTimeout(hideTimeoutRef.current)
                  hideTimeoutRef.current = null
                }
              }}
              onMouseLeave={() => {
                if (activeTrigger === "hover" || activeTrigger === "both") hideTooltip()
              }}
              onClick={(event) => {
                event.stopPropagation()
                if (closeOnContentClick) syncVisible(false)
              }}
            >
              {minimizable && (
                <div className="mb-1 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-1 pb-1">
                  {title && (
                    <div className="min-w-0 truncate text-[13px] font-semibold text-white/80">
                      {title}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={t("common.collapse")}
                    onClick={() => syncVisible(false)}
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {isConfirming ? (
                <div className="flex flex-col gap-1.5">
                  {title && (
                    <div className="b pb-1 text-sm font-semibold text-white/80">{title}</div>
                  )}
                  <div className="text-sm leading-snug">{content}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <button
                      aria-label={t("common.cancel")}
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[6px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                      type="button"
                      onClick={() => {
                        syncVisible(false)
                        onCancel?.()
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      aria-label={t("common.confirm")}
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[6px] text-emerald-400/80 transition-colors hover:bg-emerald-400/10 hover:text-emerald-400"
                      type="button"
                      onClick={() => {
                        syncVisible(false)
                        onConfirm()
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : title && !minimizable ? (
                <div className="flex flex-col gap-1">
                  <div className="border-b border-white/10 pb-1 text-xs font-semibold text-white/80">
                    {title}
                  </div>
                  {content}
                </div>
              ) : (
                <div
                  className={minimizable ? "max-h-[min(60vh,480px)] overflow-y-auto" : undefined}
                >
                  {content}
                </div>
              )}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                style={arrowStyle}
                className="lx-tooltip-arrow pointer-events-none text-[#303030]"
              >
                <path
                  d="M 5,14 L 15,14 Q 17,14 16,12 L 11.5,4 Q 10,1 8.5,4 L 4,12 Q 3,14 5,14 Z"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </div>
          </TooltipLayerContext.Provider>,
          document.body,
        )}
    </>
  )
}
