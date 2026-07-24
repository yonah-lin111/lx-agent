import type React from "react"
import { createContext, useCallback, useContext, useState } from "react"

// 消息提示类型。
export type LxToastType = "success" | "error" | "info" | "warning"

// 单条消息提示数据。
export interface LxToastItem {
  // 唯一标识。
  id: string
  // 展示文本。
  message: string
  // 提示类型。
  type: LxToastType
  // 退出动画状态。
  isExiting?: boolean
}

// 消息提示上下文。
interface LxToastContextType {
  // 当前展示的消息列表，仅包含一条。
  toasts: LxToastItem[]
  // 显示任意类型的消息。
  show: (message: string, type?: LxToastType, duration?: number) => void
  // 显示成功消息。
  success: (message: string, duration?: number) => void
  // 显示错误消息。
  error: (message: string, duration?: number) => void
  // 显示信息消息。
  info: (message: string, duration?: number) => void
  // 显示警告消息。
  warning: (message: string, duration?: number) => void
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
 * 为应用提供全局单条消息提示。
 */
export const LxToastProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  // 当前活动消息。
  const [activeToast, setActiveToast] = useState<LxToastItem | null>(null)

  /**
   * 播放退出动画后移除指定消息。
   */
  const removeToast = useCallback((id: string): void => {
    setActiveToast((currentToast) => {
      if (currentToast?.id === id) {
        return { ...currentToast, isExiting: true }
      }
      return currentToast
    })

    setTimeout(() => {
      setActiveToast((currentToast) => (currentToast?.id === id ? null : currentToast))
    }, 300)
  }, [])

  /**
   * 显示一条新消息，并替换当前消息。
   */
  const show = useCallback(
    (message: string, type: LxToastType = "info", duration = 3000): void => {
      const id = Math.random().toString(36).slice(2, 9)

      setActiveToast({ id, message, type })
      setTimeout(() => removeToast(id), duration)
    },
    [removeToast],
  )

  /**
   * 显示成功消息。
   */
  const success = useCallback(
    (message: string, duration = 3000): void => show(message, "success", duration),
    [show],
  )

  /**
   * 显示错误消息。
   */
  const error = useCallback(
    (message: string, duration = 3000): void => show(message, "error", duration),
    [show],
  )

  /**
   * 显示信息消息。
   */
  const info = useCallback(
    (message: string, duration = 3000): void => show(message, "info", duration),
    [show],
  )

  /**
   * 显示警告消息。
   */
  const warning = useCallback(
    (message: string, duration = 3000): void => show(message, "warning", duration),
    [show],
  )

  // 保持参考项目的数组接口，同时限制最多展示一条。
  const toasts = activeToast ? [activeToast] : []

  return (
    <LxToastContext.Provider value={{ toasts, show, success, error, info, warning }}>
      {children}
      <div className="sr-only" aria-live="assertive">
        {toasts.map((toast) => (
          <div key={toast.id} role="alert">
            {toast.message}
          </div>
        ))}
      </div>
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
