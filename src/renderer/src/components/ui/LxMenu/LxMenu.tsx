import type React from "react"
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

import { TooltipLayerContext } from "@/components/ui/LxTooltip"

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
  width = "auto",
  minWidth = 140,
  maxWidth = 280,
}: LxMenuProps): React.JSX.Element | null => {
  const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false)
  const [shouldRender, setShouldRender] = useState<boolean>(false)
  const [position, setPosition] = useState<LxMenuPosition>({ left: x, top: y })
  const menuRef = useRef<HTMLDivElement>(null)
  // 父级浮层集合（菜单嵌套在 Tooltip 等浮层内时注册自身，避免被父级误判为外部点击）。
  const parentLayer = useContext(TooltipLayerContext)
  // 嵌套浮层节点集合（如菜单内的二级子菜单 portal），外部点击判定需放行。
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

  // 菜单根节点注册到父级浮层集合。
  useEffect(() => {
    if (!parentLayer || !shouldRender || !menuRef.current) return
    const node = menuRef.current
    parentLayer.register(node)
    return () => parentLayer.unregister(node)
  }, [parentLayer, shouldRender])

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

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      for (const node of layerNodesRef.current) {
        if (node.contains(target)) return
      }
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

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
    <span className="min-w-0 flex-1 truncate whitespace-nowrap">{children}</span>
    {trailing ? (
      <span className="ml-auto flex shrink-0 items-center pl-2 text-[11px] font-mono text-white/40">
        {trailing}
      </span>
    ) : null}
  </button>
)

/**
 * 渲染菜单项之间的视觉分割线。
 */
export const LxMenuSeparator = (): React.JSX.Element => (
  <div className="my-1 border-t border-white/8" />
)
