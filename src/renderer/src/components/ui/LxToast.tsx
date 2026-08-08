import type React from "react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

// 消息提示类型。
export type LxToastType = "success" | "error" | "info" | "warning"

// 消息展示方位。
export type LxToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

// 各方位对应的容器定位样式。
const POSITION_CLASS: Record<LxToastPosition, string> = {
  "top-left": "top-4 left-4 items-start",
  "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
  "top-right": "top-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "bottom-right": "bottom-4 right-4 items-end",
}

// 单条消息提示数据。
export interface LxToastItem {
  // 唯一标识。
  id: string
  // 展示文本。
  message: string
  // 提示类型。
  type: LxToastType
  // 展示方位，缺省时使用全局默认方位。
  position?: LxToastPosition
  // 退出动画状态。
  isExiting?: boolean
}

// 消息提示上下文。
interface LxToastContextType {
  // 当前展示的消息列表。
  toasts: LxToastItem[]
  // 显示任意类型的消息。
  show: (message: string, type?: LxToastType, duration?: number, position?: LxToastPosition) => void
  // 显示成功消息。
  success: (message: string, duration?: number, position?: LxToastPosition) => void
  // 显示错误消息。
  error: (message: string, duration?: number, position?: LxToastPosition) => void
  // 显示信息消息。
  info: (message: string, duration?: number, position?: LxToastPosition) => void
  // 显示警告消息。
  warning: (message: string, duration?: number, position?: LxToastPosition) => void
}

// 消息提示上下文实例。
const LxToastContext = createContext<LxToastContextType | undefined>(undefined)

/**
 * 返回提示类型对应的文字颜色。
 */
export const getLxToastColorClass = (type: LxToastType): string => {
  switch (type) {
    case "success":
      return "text-emerald-400"
    case "error":
      return "text-rose-400"
    case "warning":
      return "text-amber-400"
    case "info":
    default:
      return "text-blue-400"
  }
}

/**
 * 返回方位对应的滑入/滑出方向。
 */
const getSlideStyle = (position: LxToastPosition): React.CSSProperties => {
  if (position === "top-center") {
    return { "--toast-slide-x": "0px", "--toast-slide-y": "-8px" } as React.CSSProperties
  }
  if (position.endsWith("left")) {
    return { "--toast-slide-x": "-8px", "--toast-slide-y": "0px" } as React.CSSProperties
  }
  return { "--toast-slide-x": "8px", "--toast-slide-y": "0px" } as React.CSSProperties
}

/**
 * 为应用提供全局消息提示。
 */
export const LxToastProvider = ({
  children,
  position = "top-center",
}: {
  children: React.ReactNode
  // 消息默认展示方位。
  position?: LxToastPosition
}): React.JSX.Element => {
  // 当前展示的消息列表，新消息追加到末尾，同方位下向上堆叠。
  const [toasts, setToasts] = useState<LxToastItem[]>([])

  /**
   * 播放退出动画后移除指定消息。
   */
  const removeToast = useCallback((id: string): void => {
    setToasts((currentToasts) =>
      currentToasts.map((toast) => (toast.id === id ? { ...toast, isExiting: true } : toast)),
    )

    setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id))
    }, 300)
  }, [])

  /**
   * 显示一条新消息，并追加到消息列表末尾。
   */
  const show = useCallback(
    (
      message: string,
      type: LxToastType = "info",
      duration = 3000,
      toastPosition?: LxToastPosition,
    ): void => {
      const id = Math.random().toString(36).slice(2, 9)

      setToasts((currentToasts) => [
        ...currentToasts,
        { id, message, type, position: toastPosition },
      ])
      setTimeout(() => removeToast(id), duration)
    },
    [removeToast],
  )

  /**
   * 显示成功消息。
   */
  const success = useCallback(
    (message: string, duration = 3000, toastPosition?: LxToastPosition): void =>
      show(message, "success", duration, toastPosition),
    [show],
  )

  /**
   * 显示错误消息。
   */
  const error = useCallback(
    (message: string, duration = 3000, toastPosition?: LxToastPosition): void =>
      show(message, "error", duration, toastPosition),
    [show],
  )

  /**
   * 显示信息消息。
   */
  const info = useCallback(
    (message: string, duration = 3000, toastPosition?: LxToastPosition): void =>
      show(message, "info", duration, toastPosition),
    [show],
  )

  /**
   * 显示警告消息。
   */
  const warning = useCallback(
    (message: string, duration = 3000, toastPosition?: LxToastPosition): void =>
      show(message, "warning", duration, toastPosition),
    [show],
  )

  // 按方位分组，便于按方位渲染独立容器。
  const groupedToasts = useMemo(() => {
    const groups = new Map<LxToastPosition, LxToastItem[]>()
    for (const toast of toasts) {
      const toastPosition = toast.position ?? position
      const group = groups.get(toastPosition)
      if (group) {
        group.push(toast)
      } else {
        groups.set(toastPosition, [toast])
      }
    }
    return groups
  }, [position, toasts])

  return (
    <LxToastContext.Provider value={{ toasts, show, success, error, info, warning }}>
      {children}
      {[...groupedToasts.entries()].map(([toastPosition, positionToasts]) => (
        <div
          key={toastPosition}
          role="status"
          aria-live="assertive"
          className={`pointer-events-none fixed z-[999999] flex flex-col ${POSITION_CLASS[toastPosition]}`}
        >
          {positionToasts.map((toast) => (
            <div
              key={toast.id}
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                toast.isExiting ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <span
                  className={`mb-2 block max-w-[min(80vw,24rem)] truncate rounded-[6px] border border-white/10 bg-[#303030] px-2.5 py-1.5 text-xs font-medium tracking-wide shadow-[0_10px_28px_rgba(0,0,0,0.45)] select-none ${getLxToastColorClass(toast.type)} ${
                    toast.isExiting ? "animate-toast-out" : "animate-toast-in"
                  }`}
                  style={getSlideStyle(toastPosition)}
                >
                  {toast.message}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </LxToastContext.Provider>
  )
}

/**
 * 获取全局消息提示接口。
 */
export const useLxToast = (): LxToastContextType => {
  const context = useContext(LxToastContext)

  if (context) {
    return context
  }

  return {
    toasts: [],
    show: () => {},
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  }
}
