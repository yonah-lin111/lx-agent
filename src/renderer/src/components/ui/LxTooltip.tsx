import { Check, Minus, X } from "lucide-react"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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

// Tooltip 独立配置项（用于 hover/click 分别配置）。
export interface LxTooltipConfig {
  title?: React.ReactNode
  content?: React.ReactNode
  placement?: LxTooltipPlacement
  delay?: number
  contentClassName?: string
  multiline?: boolean
  minimizable?: boolean
  closeOnScroll?: boolean
  closeOnOutsideClick?: boolean
  closeOnContentClick?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onConfirm?: () => void
  onCancel?: () => void
}

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
  // 独立悬停配置（存在时优先生效）
  hover?: LxTooltipConfig | React.ReactNode
  // 独立点击配置（存在时优先生效）
  click?: LxTooltipConfig | React.ReactNode
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
 * 单个气泡浮层内部渲染组件（复用相同的 Portal、布局计算、动画及事件监听机制）。
 */
interface TooltipBubbleProps {
  isOpen: boolean
  onClose: () => void
  containerRef: React.RefObject<HTMLElement | null>
  title?: React.ReactNode
  content?: React.ReactNode
  placement: LxTooltipPlacement
  contentClassName?: string
  multiline?: boolean
  minimizable?: boolean
  closeOnScroll?: boolean
  closeOnOutsideClick?: boolean
  closeOnContentClick?: boolean
  onConfirm?: () => void
  onCancel?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

const TooltipBubble = ({
  isOpen,
  onClose,
  containerRef,
  title,
  content,
  placement,
  contentClassName = "",
  multiline = false,
  minimizable = false,
  closeOnScroll = true,
  closeOnOutsideClick = true,
  closeOnContentClick = false,
  onConfirm,
  onCancel,
  onMouseEnter,
  onMouseLeave,
}: TooltipBubbleProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [activePlacement, setActivePlacement] = useState<LxTooltipPlacement>(placement)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const [arrowOffset, setArrowOffset] = useState(0)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const isConfirming = typeof onConfirm === "function"
  const { t } = useTranslation()

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

  useEffect(() => {
    if (!parentLayer || !shouldRender || !tooltipRef.current) return
    const node = tooltipRef.current
    parentLayer.register(node)
    return () => parentLayer.unregister(node)
  }, [parentLayer, shouldRender])

  const isInsideTooltip = useCallback(
    (target: Node): boolean => {
      if (containerRef.current?.contains(target) || tooltipRef.current?.contains(target))
        return true
      for (const node of layerNodesRef.current) {
        if (node.contains(target)) return true
      }
      return false
    },
    [containerRef],
  )

  const calculatePosition = useCallback((): {
    resolvedPlacement: LxTooltipPlacement
    left: number
    top: number
    arrowOffset: number
  } | null => {
    if (!containerRef.current) return null

    const triggerRect = containerRef.current.getBoundingClientRect()
    if (
      triggerRect.width === 0 &&
      triggerRect.height === 0 &&
      triggerRect.top === 0 &&
      triggerRect.left === 0
    ) {
      return null
    }

    const tooltipRect = tooltipRef.current?.getBoundingClientRect()
    const tooltipWidth = tooltipRef.current?.offsetWidth || tooltipRect?.width || 0
    const tooltipHeight = tooltipRef.current?.offsetHeight || tooltipRect?.height || 0
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

    return {
      resolvedPlacement,
      left,
      top,
      arrowOffset: Math.max(12, Math.min(bubbleSize - 12, triggerCenter - bubbleStart)),
    }
  }, [containerRef, placement])

  const updatePosition = useCallback((): void => {
    const pos = calculatePosition()
    if (!pos) return
    setActivePlacement((prev) => (prev !== pos.resolvedPlacement ? pos.resolvedPlacement : prev))
    setCoords((prev) => {
      if (prev && Math.abs(prev.left - pos.left) < 0.5 && Math.abs(prev.top - pos.top) < 0.5) {
        return prev
      }
      return { left: pos.left, top: pos.top }
    })
    setArrowOffset((prev) => (Math.abs(prev - pos.arrowOffset) < 0.5 ? prev : pos.arrowOffset))
  }, [calculatePosition])

  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen])

  useLayoutEffect(() => {
    if (!shouldRender) return
    updatePosition()
  }, [shouldRender, updatePosition])

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
  }, [shouldRender, updatePosition])

  useEffect(() => {
    if (!isOpen || !closeOnScroll) return
    const handleScroll = (event: Event): void => {
      const target = event.target as Node
      if (isInsideTooltip(target)) return

      const triggerNode = containerRef.current
      if (
        triggerNode &&
        target instanceof Element &&
        (target.contains(triggerNode) || target === document.documentElement)
      ) {
        onClose()
      }
    }
    document.addEventListener("scroll", handleScroll, true)
    return () => document.removeEventListener("scroll", handleScroll, true)
  }, [isOpen, closeOnScroll, isInsideTooltip, containerRef, onClose])

  useEffect(() => {
    if (!isOpen) return
    const handleOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!isInsideTooltip(target)) {
        onClose()
      }
    }
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    if (closeOnOutsideClick) document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("keydown", handleEscape)
    return () => {
      if (closeOnOutsideClick) document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, closeOnOutsideClick, isInsideTooltip, onClose])

  if (!shouldRender || (!content && !title)) return null

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
    ? "w-fit min-w-[192px] max-w-[min(320px,80vw)] bg-[#303030] p-2.5 text-white break-words"
    : multiline
      ? "w-max max-w-[min(90vw,680px)] bg-[#303030] px-2.5 py-1.5 text-xs text-white"
      : "w-fit max-w-[min(420px,80vw)] bg-[#303030] px-2.5 py-1.5 text-xs font-semibold text-white whitespace-normal break-words"

  return createPortal(
    <TooltipLayerContext.Provider value={layerContextValue}>
      <div
        ref={tooltipRef}
        role="tooltip"
        className={`fixed z-[999999] rounded-[6px] select-text drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${cardClassName} ${minimizable ? "flex flex-col" : ""} ${
          !coords
            ? "invisible pointer-events-none"
            : isAnimatingOut
              ? "animate-tooltip-out"
              : "animate-tooltip-in"
        } ${contentClassName}`}
        style={{
          left: coords?.left ?? -9999,
          top: coords?.top ?? -9999,
          visibility: coords ? "visible" : "hidden",
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(event) => {
          event.stopPropagation()
          if (closeOnContentClick) onClose()
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
              onClick={onClose}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {isConfirming ? (
          <div className="flex flex-col gap-1.5">
            {title && <div className="b pb-1 text-sm font-semibold text-white/80">{title}</div>}
            <div className="text-sm leading-snug">{content}</div>
            <div className="mt-0.5 flex items-center justify-end gap-1">
              <button
                aria-label={t("common.cancel")}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[6px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                type="button"
                onClick={() => {
                  onClose()
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
                  onClose()
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
          <div className={minimizable ? "max-h-[min(60vh,480px)] overflow-y-auto" : "h-full"}>
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
  )
}

/**
 * 判断配置是否为 LxTooltipConfig 对象。
 */
const isConfigObject = (value?: LxTooltipConfig | React.ReactNode): value is LxTooltipConfig => {
  return (
    typeof value === "object" &&
    value !== null &&
    !React.isValidElement(value) &&
    ("content" in value ||
      "title" in value ||
      "placement" in value ||
      "delay" in value ||
      "open" in value ||
      "onConfirm" in value)
  )
}

/**
 * Tooltip - 通过 Portal 渲染的统一提示与二次确认气泡。
 * 自动根据可用视口空间调整方向，并避免被父级 overflow 裁剪。
 * 支持单模式以及同一个触发器上同时配置独立的 hover 与 click 内容。
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
  hover,
  click,
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
  // 解析 hover 与 click 的独立配置
  const hoverConfig = useMemo<LxTooltipConfig | null>(() => {
    if (hover !== undefined) {
      if (isConfigObject(hover)) return hover
      return { content: hover }
    }
    if (trigger === "hover" || trigger === "both") {
      return {
        title,
        content,
        placement,
        delay,
        contentClassName,
        multiline,
        minimizable,
        closeOnScroll,
        closeOnOutsideClick,
        closeOnContentClick,
      }
    }
    return null
  }, [
    hover,
    trigger,
    title,
    content,
    placement,
    delay,
    contentClassName,
    multiline,
    minimizable,
    closeOnScroll,
    closeOnOutsideClick,
    closeOnContentClick,
  ])

  const clickConfig = useMemo<LxTooltipConfig | null>(() => {
    if (click !== undefined) {
      if (isConfigObject(click)) return click
      return { content: click }
    }
    if (trigger === "click" || trigger === "both" || typeof onConfirm === "function") {
      return {
        title,
        content,
        placement,
        delay: delay ?? 0,
        contentClassName,
        multiline,
        minimizable,
        closeOnScroll,
        closeOnOutsideClick,
        closeOnContentClick,
        open,
        onOpenChange,
        onConfirm,
        onCancel,
      }
    }
    return null
  }, [
    click,
    trigger,
    onConfirm,
    title,
    content,
    placement,
    delay,
    contentClassName,
    multiline,
    minimizable,
    closeOnScroll,
    closeOnOutsideClick,
    closeOnContentClick,
    open,
    onOpenChange,
    onCancel,
  ])

  const [hoverVisible, setHoverVisible] = useState(false)
  const [clickVisible, setClickVisible] = useState(clickConfig?.open ?? open ?? false)

  const containerRef = useRef<HTMLElement>(null)
  const showHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 同步受控 click open 状态
  const targetClickOpen = clickConfig?.open ?? (clickConfig ? open : undefined)
  useEffect(() => {
    if (targetClickOpen === undefined) return
    if (targetClickOpen !== clickVisible) {
      setClickVisible(targetClickOpen)
      if (targetClickOpen) {
        setHoverVisible(false)
      }
    }
  }, [targetClickOpen, clickVisible])

  const clearHoverTimers = (): void => {
    if (showHoverTimeoutRef.current) clearTimeout(showHoverTimeoutRef.current)
    if (hideHoverTimeoutRef.current) clearTimeout(hideHoverTimeoutRef.current)
    showHoverTimeoutRef.current = null
    hideHoverTimeoutRef.current = null
  }

  useEffect(() => () => clearHoverTimers(), [])

  const syncClickVisible = useCallback(
    (visible: boolean): void => {
      setClickVisible(visible)
      clickConfig?.onOpenChange?.(visible)
      if (clickConfig?.open === undefined && open !== undefined) {
        onOpenChange?.(visible)
      }
      if (visible) {
        clearHoverTimers()
        setHoverVisible(false)
      }
    },
    [clickConfig, open, onOpenChange],
  )

  const showHoverTooltip = (): void => {
    if (clickVisible || !hoverConfig) return
    if (hideHoverTimeoutRef.current) {
      clearTimeout(hideHoverTimeoutRef.current)
      hideHoverTimeoutRef.current = null
    }
    if (showHoverTimeoutRef.current) {
      clearTimeout(showHoverTimeoutRef.current)
      showHoverTimeoutRef.current = null
    }
    if (hoverVisible) return
    const hoverDelay = hoverConfig.delay ?? delay ?? 150
    if (hoverDelay === 0) {
      setHoverVisible(true)
      return
    }
    showHoverTimeoutRef.current = setTimeout(() => {
      setHoverVisible(true)
    }, hoverDelay)
  }

  const hideHoverTooltip = (): void => {
    if (showHoverTimeoutRef.current) {
      clearTimeout(showHoverTimeoutRef.current)
      showHoverTimeoutRef.current = null
    }
    if (!hideHoverTimeoutRef.current) {
      hideHoverTimeoutRef.current = setTimeout(() => {
        hideHoverTimeoutRef.current = null
        setHoverVisible(false)
      }, 200)
    }
  }

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
        if (hoverConfig) showHoverTooltip()
        child.props.onMouseEnter?.(event)
      },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
        if (hoverConfig) hideHoverTooltip()
        child.props.onMouseLeave?.(event)
      },
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (clickConfig) {
          event.stopPropagation()
          syncClickVisible(!clickVisible)
        } else {
          clearHoverTimers()
          setHoverVisible(false)
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
      {/* 悬停气泡：当点击浮层未打开且存在 hover 配置时展示 */}
      {hoverConfig && !clickVisible && (
        <TooltipBubble
          isOpen={hoverVisible}
          onClose={() => setHoverVisible(false)}
          containerRef={containerRef}
          title={hoverConfig.title}
          content={hoverConfig.content}
          placement={hoverConfig.placement ?? placement}
          contentClassName={hoverConfig.contentClassName ?? contentClassName}
          multiline={hoverConfig.multiline ?? multiline}
          minimizable={hoverConfig.minimizable ?? minimizable}
          closeOnScroll={hoverConfig.closeOnScroll ?? closeOnScroll}
          closeOnOutsideClick={hoverConfig.closeOnOutsideClick ?? closeOnOutsideClick}
          closeOnContentClick={hoverConfig.closeOnContentClick ?? closeOnContentClick}
          onMouseEnter={() => {
            if (hideHoverTimeoutRef.current) {
              clearTimeout(hideHoverTimeoutRef.current)
              hideHoverTimeoutRef.current = null
            }
          }}
          onMouseLeave={hideHoverTooltip}
        />
      )}
      {/* 点击气泡 */}
      {clickConfig && (
        <TooltipBubble
          isOpen={clickVisible}
          onClose={() => syncClickVisible(false)}
          containerRef={containerRef}
          title={clickConfig.title ?? title}
          content={clickConfig.content ?? content}
          placement={clickConfig.placement ?? placement}
          contentClassName={clickConfig.contentClassName ?? contentClassName}
          multiline={clickConfig.multiline ?? multiline}
          minimizable={clickConfig.minimizable ?? minimizable}
          closeOnScroll={clickConfig.closeOnScroll ?? closeOnScroll}
          closeOnOutsideClick={clickConfig.closeOnOutsideClick ?? closeOnOutsideClick}
          closeOnContentClick={clickConfig.closeOnContentClick ?? closeOnContentClick}
          onConfirm={clickConfig.onConfirm ?? onConfirm}
          onCancel={clickConfig.onCancel ?? onCancel}
        />
      )}
    </>
  )
}
