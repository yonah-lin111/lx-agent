import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"

// 弹窗属性。
interface LxModalProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  // 弹窗内容宽度，默认 320px。
  width?: number
}

/**
 * 提供黑色主题、遮罩关闭和键盘关闭能力的通用弹窗容器。
 */
export const LxModal = ({
  isOpen,
  title,
  children,
  onClose,
  width = 320,
}: LxModalProps): React.JSX.Element | null => {
  const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false)
  const [shouldRender, setShouldRender] = useState<boolean>(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const isMouseDownOnBackdrop = useRef<boolean>(false)

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

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  /**
   * 记录鼠标是否从遮罩开始按下。
   */
  const handleBackdropMouseDown = (event: React.MouseEvent): void => {
    isMouseDownOnBackdrop.current = event.target === backdropRef.current
  }

  /**
   * 仅在按下和松开都位于遮罩时关闭弹窗。
   */
  const handleBackdropClick = (event: React.MouseEvent): void => {
    if (isMouseDownOnBackdrop.current && event.target === backdropRef.current) onClose()
    isMouseDownOnBackdrop.current = false
  }

  /**
   * 统一处理关闭按钮事件。
   */
  const handleClose = useCallback((): void => {
    onClose()
  }, [onClose])

  if (!shouldRender) return null

  const animationClass = isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"

  return createPortal(
    <div
      ref={backdropRef}
      aria-modal={isOpen ? "true" : undefined}
      className="fixed inset-0 z-[999998] flex items-center justify-center"
      inert={!isOpen}
      role="dialog"
      onClick={handleBackdropClick}
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        aria-labelledby="lx-modal-title"
        className={`relative z-[999999] rounded-[6px] bg-[#303030] p-4 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] select-text ${animationClass}`}
        style={{ width, maxWidth: "90vw" }}
      >
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 id="lx-modal-title" className="text-sm font-semibold text-white/90">
            {title}
          </h2>
          <LxIconButton aria-label="关闭弹窗" preset="close" size="small" onClick={handleClose} />
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}
