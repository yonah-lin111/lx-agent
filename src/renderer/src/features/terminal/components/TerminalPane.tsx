import "@xterm/xterm/css/xterm.css"
import { Terminal as TerminalIcon, X } from "lucide-react"
import type React from "react"
import { useEffect, useRef } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { getOrCreateTerminalSession } from "@/features/terminal/terminalSessionRegistry"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import type { TerminalPaneItem } from "@/features/terminal/types"
import { resolveCwdDisplayName } from "@/features/terminal/utils"

interface TerminalPaneProps {
  pane: TerminalPaneItem
  tabId?: string
  isActive: boolean
  isFocused: boolean
  isExpanded: boolean
  showHeader?: boolean
  onFocus: () => void
  onClose?: () => void
}

/**
 * 单个 xterm 终端视口宿主组件：从单例注册表中挂载稳定的 xterm DOM 元素。
 * 当分屏树重排时，由于底层 DOM 与 xterm 实例稳定常驻，历史输出与交互状态绝不丢失。
 */
export const TerminalPane = ({
  pane,
  tabId,
  isActive,
  isFocused,
  isExpanded,
  showHeader = false,
  onFocus,
  onClose,
}: TerminalPaneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingClosePaneId = useTerminalStore((state) => state.pendingClosePaneId)
  const setPendingClosePaneId = useTerminalStore((state) => state.setPendingClosePaneId)
  const removePane = useTerminalStore((state) => state.removePane)

  const isConfirming = pendingClosePaneId === pane.id

  // 1. 将常驻的 TerminalSession DOM 元素挂载到当前容器节点下
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const session = getOrCreateTerminalSession(pane.id, pane.cwd)

    // 将持久化的终端 DOM 移动挂载至当前容器中
    if (session.element.parentElement !== container) {
      container.appendChild(session.element)
      session.isAttached = true
    }

    // 初始适配尺寸
    try {
      if (container.clientWidth >= 20 && container.clientHeight >= 20) {
        session.fitAddon.fit()
      }
    } catch {
      // 忽略
    }

    if (isFocused) {
      session.term.focus()
    }
  }, [pane.id, pane.cwd, isFocused])

  // 2. 监听容器尺寸与展开/激活状态变化，执行 fit 与 resize 广播
  useEffect(() => {
    const container = containerRef.current
    if (!container || !isActive || !isExpanded) return

    const session = getOrCreateTerminalSession(pane.id, pane.cwd)
    let rafId: number | null = null

    const handleResize = (): void => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        if (!container || container.clientWidth < 20 || container.clientHeight < 20) return
        try {
          session.fitAddon.fit()
        } catch {
          // 忽略动画过渡期异常
        }
      })
    }

    handleResize()
    const t1 = window.setTimeout(handleResize, 50)
    const t2 = window.setTimeout(handleResize, 150)
    const t3 = window.setTimeout(handleResize, 350)

    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(container)

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      observer.disconnect()
    }
  }, [pane.id, pane.cwd, isActive, isExpanded, showHeader])

  // 3. 激活或聚焦时自动获得焦点
  useEffect(() => {
    if (!isActive || !isFocused || !isExpanded) return

    const session = getOrCreateTerminalSession(pane.id, pane.cwd)

    const timer1 = window.setTimeout(() => {
      session.term.focus()
    }, 60)
    const timer2 = window.setTimeout(() => {
      session.term.focus()
    }, 360)

    return () => {
      window.clearTimeout(timer1)
      window.clearTimeout(timer2)
    }
  }, [pane.id, pane.cwd, isActive, isFocused, isExpanded])

  const handleFocus = (): void => {
    onFocus()
    const session = getOrCreateTerminalSession(pane.id, pane.cwd)
    session.term.focus()
  }

  const handleConfirmClose = (): void => {
    if (tabId) {
      removePane(tabId, pane.id)
    }
    setPendingClosePaneId(null)
  }

  return (
    <div
      className={`terminal-pane-container group relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#111116] cursor-text transition-opacity duration-150 ${
        isFocused ? "z-10" : "opacity-85 hover:opacity-100"
      }`}
      onClick={handleFocus}
      onMouseDown={handleFocus}
    >
      {showHeader && (
        <div
          className={`terminal-pane-header flex h-6 shrink-0 items-center justify-between border-b px-2 select-none text-xs transition-colors ${
            isFocused
              ? "border-white/10 bg-white/[0.04] text-white/90"
              : "border-white/5 bg-white/[0.01] text-white/40 hover:text-white/60"
          }`}
        >
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <TerminalIcon
              className={`h-3 w-3 shrink-0 ${isFocused ? "text-white/70" : "text-white/30"}`}
            />
            <span className="truncate font-mono text-[11px] leading-none">
              {pane.title || resolveCwdDisplayName(pane.cwd)}
            </span>
          </div>
          {onClose && (
            <LxTooltip
              closeOnOutsideClick
              content={isConfirming ? "当前分屏有任务正在运行，确定关闭吗？" : "关闭分屏"}
              open={isConfirming ? true : undefined}
              placement="top"
              title={isConfirming ? "确认关闭分屏" : undefined}
              onCancel={() => setPendingClosePaneId(null)}
              onConfirm={isConfirming ? handleConfirmClose : undefined}
              onOpenChange={(open) => {
                if (!open && isConfirming) setPendingClosePaneId(null)
              }}
            >
              <button
                aria-label="关闭分屏"
                className="flex h-4 w-4 items-center justify-center rounded-[3px] text-white/40 hover:bg-white/10 hover:text-white"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </LxTooltip>
          )}
        </div>
      )}
      <div ref={containerRef} className="relative min-h-0 flex-1 w-full overflow-hidden" />
    </div>
  )
}
