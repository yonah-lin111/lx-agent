import type React from "react"
import { useEffect, useRef, useState } from "react"

// 默认最短展示时间。
const DEFAULT_MIN_DISPLAY_DURATION = 300
const FADE_OUT_DURATION = 300

// 加载遮罩属性。
interface LxLoadingOverlayProps {
  isLoading: boolean
  text?: string
  rounded?: string
  minDisplayDuration?: number
}

/**
 * 在定位容器内展示通用加载遮罩。
 */
export const LxLoadingOverlay = ({
  isLoading,
  text = "Loading...",
  rounded = "rounded-[6px]",
  minDisplayDuration = DEFAULT_MIN_DISPLAY_DURATION,
}: LxLoadingOverlayProps): React.JSX.Element => {
  const [isVisible, setIsVisible] = useState(isLoading)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const shownAtRef = useRef<number | null>(isLoading ? Date.now() : null)

  useEffect(() => {
    if (isLoading) {
      shownAtRef.current = Date.now()
      setIsFadingOut(false)
      setIsVisible(true)
      return
    }

    const shownAt = shownAtRef.current
    if (shownAt === null) return

    const remainingDuration = Math.max(0, minDisplayDuration - (Date.now() - shownAt))
    let fadeOutTimer: number | null = null
    const displayTimer = window.setTimeout(() => {
      setIsFadingOut(true)
      fadeOutTimer = window.setTimeout(() => {
        shownAtRef.current = null
        setIsVisible(false)
        setIsFadingOut(false)
      }, FADE_OUT_DURATION)
    }, remainingDuration)

    return () => {
      window.clearTimeout(displayTimer)
      if (fadeOutTimer !== null) window.clearTimeout(fadeOutTimer)
    }
  }, [isLoading, minDisplayDuration])

  return (
    <div
      aria-live="polite"
      aria-label={text}
      className={`absolute inset-0 z-50 flex select-none flex-col items-center justify-center bg-[#212121] ${rounded} ${
        isVisible
          ? isFadingOut
            ? "pointer-events-auto opacity-0 transition-opacity duration-300 ease-out"
            : "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      role="status"
    >
      <style>{`
      @keyframes lx-loading-dot {
        0%, 100% { transform: translateY(0); opacity: 0.35; }
        50% { transform: translateY(-4px); opacity: 0.95; }
      }
    `}</style>
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-6 items-center gap-1.5" aria-hidden="true">
          {[0, 200, 400].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1 rounded-full bg-white"
              style={{
                animation: "lx-loading-dot 1.2s ease-in-out infinite",
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-white/40">{text}</span>
      </div>
    </div>
  )
}
