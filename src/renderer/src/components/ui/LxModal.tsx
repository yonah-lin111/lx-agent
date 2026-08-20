import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"

// 弹窗属性。
interface LxModalProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  // 弹窗宽度，默认 320px；数字按 px，字符串按原样支持任意 CSS 单位。
  width?: number | string
  // 弹窗高度，默认由内容决定；数字按 px，字符串按原样支持任意 CSS 单位。
  height?: number | string
  // 弹窗最小宽度，默认不设。
  minWidth?: number | string
  // 弹窗最大宽度，默认 90vw。
  maxWidth?: number | string
  // 弹窗最小高度，默认不设。
  minHeight?: number | string
  // 弹窗最大高度，默认视口高度减 32px（calc(100vh - 32px)）。
  maxHeight?: number | string
  // 标题行右侧、关闭按钮左侧的操作插槽。
  headerActions?: React.ReactNode
}

/**
 * 提供黑色主题、遮罩关闭和键盘关闭能力的通用弹窗容器。
 */
export const LxModal = ({
  isOpen,
  onClose,
  title,
  children,
  width = "400px",
  height,
  minWidth,
  maxWidth = "90vw",
  minHeight,
  maxHeight = "calc(100vh - 32px)",
  headerActions,
}: LxModalProps): React.JSX.Element | null => {
  const { t } = useTranslation()
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
        className={`relative z-[999999] flex flex-col overflow-hidden rounded-[6px] bg-[#303030] p-4 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] select-text ${animationClass}`}
        style={{ width, height, minWidth, maxWidth, minHeight, maxHeight }}
      >
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <h2 id="lx-modal-title" className="text-sm font-semibold text-white/90">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
            <LxIconButton
              aria-label={t("agent.modalCloseAria")}
              preset="close"
              size="small"
              onClick={handleClose}
            />
          </div>
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
