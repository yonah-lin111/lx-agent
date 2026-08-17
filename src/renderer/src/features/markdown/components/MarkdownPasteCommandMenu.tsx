import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"

export interface MarkdownPasteReferenceOption {
  id: "reference" | "path"
  label: "引用内容" | "原地址"
}

interface MarkdownPasteCommandMenuProps {
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

const options: MarkdownPasteReferenceOption[] = [
  { id: "reference", label: "引用内容" },
  { id: "path", label: "原地址" },
]

/**
 * 渲染文件粘贴后的引用方式选择面板。
 */
export const MarkdownPasteCommandMenu = ({
  activeIndex = 0,
  position,
  visible = false,
}: MarkdownPasteCommandMenuProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const lastDataRef = useRef<{ activeIndex: number; position: CSSProperties } | null>(null)

  if (visible && position) lastDataRef.current = { activeIndex, position }

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
  const displayData = visible && position ? { activeIndex, position } : lastDataRef.current
  if (!displayData) return null

  return (
    <div
      aria-label="粘贴引用方式"
      className={`markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayData.position}
    >
      {options.map((option, index) => (
        <div
          key={option.id}
          aria-selected={index === displayData.activeIndex}
          className={`flex h-11 w-full items-center rounded-[4px] px-3 text-left text-xs transition-colors ${
            index === displayData.activeIndex ? "bg-white/8 text-white" : "text-white/75"
          }`}
          role="option"
        >
          {option.label}
        </div>
      ))}
    </div>
  )
}

export const markdownPasteReferenceOptions = options
