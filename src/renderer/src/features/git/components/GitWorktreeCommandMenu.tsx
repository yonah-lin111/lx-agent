import { GitBranch } from "lucide-react"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import type { GitWorktreeOption } from "@/features/git"

// git 工作区选择面板属性。
interface GitWorktreeCommandMenuProps {
  options?: GitWorktreeOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

/**
 * 渲染紧贴编辑器光标的 git 工作区选择面板（/gitWorktree 二级面板）。
 * 顶部为默认工作区，其后为其余工作区；当前绑定项带高亮标记。
 */
export const GitWorktreeCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
}: GitWorktreeCommandMenuProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    options: GitWorktreeOption[]
    activeIndex: number
    position: CSSProperties
  } | null>(null)

  if (visible && options && position) {
    lastDataRef.current = { options, activeIndex, position }
  }

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [visible, shouldRender])

  if (!shouldRender) return null

  const displayData =
    visible && options && position ? { options, activeIndex, position } : lastDataRef.current
  if (!displayData) return null

  const {
    options: displayOptions,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  return (
    <div
      aria-label="git 工作区选择"
      className={`markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayOptions.map((option, index) => {
        const isActive = index === displayActiveIndex
        const isCurrent = option.isCurrent

        return (
          <div
            key={`${option.isDefault ? "default" : option.path}`}
            aria-selected={isActive}
            className={`flex min-h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75"
            }`}
            role="option"
          >
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-[4px] ${
                isCurrent ? "bg-white/10 text-white" : "bg-white/5 text-white/70"
              }`}
            >
              <GitBranch className="h-3 w-3" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[13px] leading-none text-white">{option.name}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-none text-white/45">
                {option.isDefault ? "默认工作区" : option.path}
              </span>
              {isCurrent && (
                <span className="shrink-0 text-[11px] leading-none text-emerald-400">当前</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
