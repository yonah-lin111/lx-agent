import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// Tooltip 弹出位置。
export type LxTooltipPlacement = "top" | "bottom" | "left" | "right"

// Tooltip 触发方式。
export type LxTooltipTrigger = "hover" | "click" | "both"

// Tooltip 组件属性。
export interface LxTooltipProps {
  children: React.ReactNode
  content?: React.ReactNode
  placement?: LxTooltipPlacement
  trigger?: LxTooltipTrigger
  delay?: number
  contentClassName?: string
  className?: string
}

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
  content,
  placement = "top",
  trigger = "hover",
  delay = 150,
  contentClassName = "",
  className = "",
}: LxTooltipProps): React.JSX.Element => {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [activePlacement, setActivePlacement] = useState<LxTooltipPlacement>(placement)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const [arrowOffset, setArrowOffset] = useState(0)
  const containerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTrigger = trigger
  const activeDelay = delay

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
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [shouldRender, placement])

  useEffect(() => {
    if (!isVisible) return
    const handleOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setIsVisible(false)
      }
    }
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsVisible(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isVisible])

  useEffect(() => () => clearTimers(), [])

  /**
   * 按触发模式延迟显示气泡。
   */
  const showTooltip = (): void => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
    if (activeDelay === 0) {
      setIsVisible(true)
      return
    }
    showTimeoutRef.current = setTimeout(() => setIsVisible(true), activeDelay)
  }

  /**
   * 为悬停触发保留进入气泡的缓冲时间。
   */
  const hideTooltip = (): void => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
    if (activeTrigger === "hover" || activeTrigger === "both") {
      hideTimeoutRef.current = setTimeout(() => setIsVisible(false), 150)
      return
    }
    setIsVisible(false)
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
  const cardClassName =
    "bg-[#303030] px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
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
          setIsVisible((visible) => !visible)
        } else {
          clearTimers()
          setIsVisible(false)
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
          <div
            ref={tooltipRef}
            role="tooltip"
            className={`fixed z-[999999] rounded-[6px] select-text drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${cardClassName} ${isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"} ${contentClassName}`}
            style={{ left: coords?.left ?? 0, top: coords?.top ?? 0 }}
            onMouseEnter={() => hideTimeoutRef.current && clearTimeout(hideTimeoutRef.current)}
            onMouseLeave={hideTooltip}
            onClick={(event) => event.stopPropagation()}
          >
            {content}
            <svg aria-hidden="true" viewBox="0 0 20 20" style={arrowStyle}>
              <path
                d="M 5,14 L 15,14 Q 17,14 16,12 L 11.5,4 Q 10,1 8.5,4 L 4,12 Q 3,14 5,14 Z"
                fill="#303030"
                stroke="none"
              />
            </svg>
          </div>,
          document.body,
        )}
    </>
  )
}
