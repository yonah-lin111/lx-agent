import { ChevronDown } from "lucide-react"
import type React from "react"
import { useEffect, useRef } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

// 主体内容区域属性。
interface PageContentProps {
  children: React.ReactNode
  isCollapsed?: boolean
  onExpand?: () => void
  onAutoCollapse?: () => void
}

/**
 * 渲染主体内容区域，支持在可用高度低于阈值时自动折叠并提供展开操作。
 */
export const PageContent = ({
  children,
  isCollapsed = false,
  onExpand,
  onAutoCollapse,
}: PageContentProps): React.JSX.Element => {
  const containerRef = useRef<HTMLElement>(null)

  // 监听容器实际渲染高度，当未处于折叠态且高度低于 120px 时触发自动折叠
  useEffect(() => {
    const el = containerRef.current
    if (!el || isCollapsed || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const measuredHeight = entry.contentRect.height
        if (measuredHeight > 0 && measuredHeight <= 120) {
          onAutoCollapse?.()
        }
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [isCollapsed, onAutoCollapse])

  if (isCollapsed) {
    return (
      <main className="h-8 min-h-[32px] max-h-[32px] w-full flex shrink-0 items-center justify-between rounded-[6px] border border-white/5 bg-[#212121] px-2.5 text-xs text-white/50 select-none">
        <span className="truncate text-white/40">页面内容已折叠</span>
        <div className="flex shrink-0 items-center">
          <LxIconButton
            aria-label="展开页面内容"
            size="small"
            title={{ content: "展开页面内容", placement: "left" }}
            onClick={onExpand}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      </main>
    )
  }

  return (
    <main ref={containerRef} className="min-h-0 flex flex-1 gap-3 overflow-hidden">
      {children}
    </main>
  )
}
