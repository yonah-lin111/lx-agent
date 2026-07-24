import type React from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
  width?: number
}

// 菜单项属性。
interface LxMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  active?: boolean
  danger?: boolean
  menuRole?: "menuitem" | "menuitemradio"
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
  width = 156,
}: LxMenuProps): React.JSX.Element | null => {
  const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false)
  const [shouldRender, setShouldRender] = useState<boolean>(false)
  const [position, setPosition] = useState<LxMenuPosition>({ left: x, top: y })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let animationTimeout: ReturnType<typeof setTimeout> | undefined
    if (isOpen) {
      setShouldRender(true)
      setIsAnimatingOut(false)
    } else if (shouldRender) {
      setIsAnimatingOut(true)
      animationTimeout = setTimeout(() => {
        setShouldRender(false)
        setIsAnimatingOut(false)
      }, 120)
    }

    return () => {
      if (animationTimeout) clearTimeout(animationTimeout)
    }
  }, [isOpen, shouldRender])

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = (): void => {
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING)
      const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - menuHeight - VIEWPORT_PADDING)
      setPosition({
        left: Math.min(Math.max(x, VIEWPORT_PADDING), maxLeft),
        top: Math.min(Math.max(y, VIEWPORT_PADDING), maxTop),
      })
    }
    const handlePointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("resize", updatePosition)
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose, shouldRender, width, x, y])

  if (!shouldRender) return null

  return createPortal(
    <div
      ref={menuRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      className={`fixed z-[9999] rounded-[6px] border border-white/10 bg-[#303030] p-1 shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      } ${isOpen ? "" : "pointer-events-none"}`}
      role="menu"
      style={{ ...position, width }}
    >
      {children}
    </div>,
    document.body,
  )
}

/**
 * 渲染带可选前后内容及危险态的通用菜单项。
 */
export const LxMenuItem = ({
  children,
  leading,
  trailing,
  active = false,
  danger = false,
  menuRole = "menuitem",
  className = "",
  ...props
}: LxMenuItemProps): React.JSX.Element => (
  <button
    className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 ${
      danger
        ? active
          ? "bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-400/45"
          : "text-rose-400/80 hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-rose-400/45"
        : "text-white/75 hover:bg-white/8 hover:text-white focus-visible:outline-white/45"
    } ${className}`}
    role={menuRole}
    type="button"
    {...props}
  >
    {leading ? (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{leading}</span>
    ) : null}
    <span className="min-w-0 flex-1">{children}</span>
    {trailing ? (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{trailing}</span>
    ) : null}
  </button>
)

/**
 * 渲染菜单项之间的视觉分割线。
 */
export const LxMenuSeparator = (): React.JSX.Element => (
  <div className="my-1 border-t border-white/8" />
)
