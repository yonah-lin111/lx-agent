import type React from "react"
import { forwardRef } from "react"

// 预览触发按钮属性。
interface UiActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

/**
 * 渲染预览页面专用的演示触发按钮，支持作为 Tooltip 等需要 ref 的触发元素。
 */
export const UiActionButton = forwardRef<HTMLButtonElement, UiActionButtonProps>(
  ({ children, className = "", ...props }, ref): React.JSX.Element => (
    <button
      ref={ref}
      type="button"
      className={`flex h-7 items-center gap-1.5 rounded-[6px] border border-white/10 bg-[#212121] px-2.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${className}`}
      {...props}
    >
      {children}
    </button>
  ),
)

UiActionButton.displayName = "UiActionButton"
