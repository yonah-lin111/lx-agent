import type React from "react"
import { useEffect, useRef, useState } from "react"

// 默认最短展示时间（与页面加载过渡一致，避免恢复过快导致闪烁）。
const DEFAULT_MIN_DISPLAY_DURATION = 300
// 默认淡出时长。
const DEFAULT_FADE_OUT_DURATION = 300

// 消息列表骨架屏属性。
interface AgentMessageListSkeletonProps {
  // 会话恢复是否进行中。
  isLoading: boolean
  // 骨架屏最短展示时间。
  minDisplayDuration?: number
  // 淡出动画时长。
  fadeOutDuration?: number
}

// 骨架占位块：统一圆角，脉冲闪烁。
const SkeletonBlock = ({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}): React.JSX.Element => (
  <div className={`animate-pulse rounded-[6px] bg-white/[0.08] ${className ?? ""}`}>{children}</div>
)

/**
 * 会话恢复加载期间展示的 QA 对话骨架屏。
 * 只做淡出不淡入，隐藏后整体卸载。
 */
export const AgentMessageListSkeleton = ({
  isLoading,
  minDisplayDuration = DEFAULT_MIN_DISPLAY_DURATION,
  fadeOutDuration = DEFAULT_FADE_OUT_DURATION,
}: AgentMessageListSkeletonProps): React.JSX.Element | null => {
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
      }, fadeOutDuration)
    }, remainingDuration)

    return () => {
      window.clearTimeout(displayTimer)
      if (fadeOutTimer !== null) window.clearTimeout(fadeOutTimer)
    }
  }, [isLoading, minDisplayDuration, fadeOutDuration])

  if (!isVisible) return null

  return (
    <div
      aria-hidden="true"
      className={`agent-message-list-skeleton pointer-events-auto absolute inset-0 z-20 select-none overflow-hidden bg-[#212121] p-1 ${
        isFadingOut ? "opacity-0" : "opacity-100"
      }`}
      style={isFadingOut ? { transition: `opacity ${fadeOutDuration}ms ease-out` } : undefined}
    >
      <div className="flex flex-col gap-5">
        {/* 用户问题气泡 */}
        <div className="flex justify-end">
          <SkeletonBlock className="agent-skeleton-user flex w-[52%] flex-col gap-1.5 p-3">
            <div className="agent-skeleton-bar h-3 w-3/4 rounded-[4px] bg-white/[0.14]" />
            <div className="agent-skeleton-bar h-3 w-1/2 rounded-[4px] bg-white/[0.14]" />
          </SkeletonBlock>
        </div>

        {/* AI 回答文本 */}
        <SkeletonBlock className="agent-skeleton-ai-text h-3.5 w-full" />
        <SkeletonBlock className="agent-skeleton-ai-text h-3.5 w-[92%]" />
        <SkeletonBlock className="agent-skeleton-ai-text h-3.5 w-[84%]" />

        {/* 代码块 */}
        <SkeletonBlock className="agent-skeleton-code flex h-16 flex-col gap-1.5 p-2.5">
          <div className="agent-skeleton-bar h-3 w-1/3 rounded-[4px] bg-white/[0.14]" />
          <div className="agent-skeleton-bar h-3 w-4/5 rounded-[4px] bg-white/[0.08]" />
          <div className="agent-skeleton-bar h-3 w-3/5 rounded-[4px] bg-white/[0.08]" />
        </SkeletonBlock>

        {/* 第二轮用户问题气泡 */}
        <div className="flex justify-end">
          <SkeletonBlock className="agent-skeleton-user flex w-[40%] flex-col gap-1.5 p-3">
            <div className="agent-skeleton-bar h-3 w-2/3 rounded-[4px] bg-white/[0.14]" />
          </SkeletonBlock>
        </div>

        {/* 第二轮 AI 回答文本 */}
        <SkeletonBlock className="agent-skeleton-ai-text h-3.5 w-full" />
        <SkeletonBlock className="agent-skeleton-ai-text h-3.5 w-[88%]" />
        <SkeletonBlock className="agent-skeleton-ai-text h-3.5 w-[70%]" />
      </div>
    </div>
  )
}
