import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { SplitDirection } from "@/features/terminal/types"

interface SplitDividerProps {
  direction: SplitDirection
  containerRef: React.RefObject<HTMLDivElement | null>
  onResize: (ratio: number) => void
  onDoubleClick?: () => void
}

/**
 * Ghostty 风格分屏分割线：
 * 1. 细致且高灵敏的拖拽热区与视觉高亮；
 * 2. 拖拽时启用全局遮罩防止 xterm canvas 吞噬光标事件；
 * 3. 边界最小保护（单边 80px）与双击重置 50/50 均分。
 */
export const SplitDivider = ({
  direction,
  containerRef,
  onResize,
  onDoubleClick,
}: SplitDividerProps): React.JSX.Element => {
  const [isDragging, setIsDragging] = useState(false)
  const isHorizontal = direction === "horizontal"

  // 保持 onResize 引用最新以避免频繁重建监听
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 仅响应鼠标左键
      if (e.button !== 0) return

      e.preventDefault()
      e.stopPropagation()

      const container = containerRef.current
      if (!container) return

      setIsDragging(true)

      const handleMouseMove = (event: MouseEvent): void => {
        event.preventDefault()
        const rect = container.getBoundingClientRect()

        if (isHorizontal) {
          if (rect.width <= 0) return
          const minRatio = rect.width > 160 ? 80 / rect.width : 0.05
          const maxRatio = rect.width > 160 ? (rect.width - 80) / rect.width : 0.95
          const rawRatio = (event.clientX - rect.left) / rect.width
          const clamped = Math.max(minRatio, Math.min(maxRatio, rawRatio))
          onResizeRef.current(clamped)
        } else {
          if (rect.height <= 0) return
          const minRatio = rect.height > 160 ? 80 / rect.height : 0.05
          const maxRatio = rect.height > 160 ? (rect.height - 80) / rect.height : 0.95
          const rawRatio = (event.clientY - rect.top) / rect.height
          const clamped = Math.max(minRatio, Math.min(maxRatio, rawRatio))
          onResizeRef.current(clamped)
        }
      }

      const handleMouseUp = (): void => {
        setIsDragging(false)
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    },
    [containerRef, isHorizontal],
  )

  // 组件卸载时若正在拖拽，确保清理状态
  useEffect(() => {
    return () => {
      setIsDragging(false)
    }
  }, [])

  return (
    <>
      <div
        className={`terminal-split-divider group relative z-20 shrink-0 select-none ${
          isHorizontal
            ? "flex h-full w-2 -mx-1 cursor-col-resize items-center justify-center"
            : "flex w-full h-2 -my-1 cursor-row-resize items-center justify-center"
        }`}
        onDoubleClick={onDoubleClick}
        onMouseDown={handleMouseDown}
      >
        <div
          className={`transition-colors duration-150 ${
            isHorizontal ? "h-full w-[1px]" : "w-full h-[1px]"
          } ${isDragging ? "bg-white/60" : "bg-white/10 group-hover:bg-white/40"}`}
        />
      </div>

      {/* 拖拽中全屏透明遮罩：防止 xterm canvas 捕获光标事件，确保拖拽丝滑且光标样式一致 */}
      {isDragging && (
        <div
          className={`fixed inset-0 z-50 select-none ${
            isHorizontal ? "cursor-col-resize" : "cursor-row-resize"
          }`}
        />
      )}
    </>
  )
}
