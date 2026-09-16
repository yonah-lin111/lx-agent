import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  TooltipLayerContext,
  useFloatingLayer,
  useLayerPresence,
} from "@/components/ui/useFloatingLayer"

// 菜单定位坐标。
type LxMenuPosition = {
  left: number
  top: number
}

// 菜单容器属性。
interface LxMenuProps {
  isOpen: boolean
  x: number
  y: number
  ariaLabel: string
  children: React.ReactNode
  onClose: () => void
  width?: number | "auto"
  minWidth?: number
  maxWidth?: number
  // 滚动关闭锚点（右键点击的目标元素）：滚动容器包含它或页面级滚动时关闭菜单。
  anchor?: HTMLElement | null
}

// 菜单边缘留白。
const VIEWPORT_PADDING = 8

/**
 * 提供定位、关闭和过渡动画能力的通用菜单容器。
 */
export const LxMenu = ({
  isOpen,
  x,
  y,
  ariaLabel,
  children,
  onClose,
  width = "auto",
  minWidth = 140,
  maxWidth = 280,
  anchor,
}: LxMenuProps): React.JSX.Element | null => {
  const [position, setPosition] = useState<LxMenuPosition>({ left: x, top: y })
  const menuRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    anchorRef.current = anchor ?? null
  }, [anchor])

  const { shouldRender, isAnimatingOut } = useLayerPresence(isOpen)

  // 通用浮层关闭逻辑：外部 pointerdown、Esc 与锚点作用域滚动关闭。
  const { layerContextValue } = useFloatingLayer({
    isOpen,
    active: shouldRender,
    rootRef: menuRef,
    anchorRef,
    onClose,
  })

  useLayoutEffect(() => {
    if (!isOpen) return

    const updatePosition = (): void => {
      const menuWidth =
        menuRef.current?.offsetWidth || (typeof width === "number" ? width : minWidth)
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - menuWidth - VIEWPORT_PADDING)
      const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - menuHeight - VIEWPORT_PADDING)
      setPosition({
        left: Math.min(Math.max(x, VIEWPORT_PADDING), maxLeft),
        top: Math.min(Math.max(y, VIEWPORT_PADDING), maxTop),
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("resize", updatePosition)
    }
  }, [isOpen, shouldRender, width, minWidth, maxWidth, x, y])

  if (!shouldRender) return null

  return createPortal(
    <div
      ref={menuRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      className={`fixed z-[9999] box-border rounded-[6px] border border-white/10 bg-[#303030] p-1 shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      } ${isOpen ? "" : "pointer-events-none"}`}
      role="menu"
      style={{
        ...position,
        ...(typeof width === "number"
          ? { width }
          : {
              width: "max-content",
              minWidth,
              maxWidth,
            }),
      }}
    >
      <TooltipLayerContext.Provider value={layerContextValue}>
        {children}
      </TooltipLayerContext.Provider>
    </div>,
    document.body,
  )
}

/**
 * 渲染菜单项之间的视觉分割线。
 */
export const LxMenuSeparator = (): React.JSX.Element => (
  <div className="my-1 border-t border-white/8" />
)
