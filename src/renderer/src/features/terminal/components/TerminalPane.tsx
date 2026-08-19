import "@xterm/xterm/css/xterm.css"
import type React from "react"
import { useEffect, useRef } from "react"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { getOrCreateTerminalSession } from "@/features/terminal/terminalSessionRegistry"
import type { TerminalPaneItem } from "@/features/terminal/types"

interface TerminalPaneProps {
  pane: TerminalPaneItem
  isActive: boolean
  isFocused: boolean
  isExpanded: boolean
  onFocus: () => void
}

/**
 * 单个 xterm 终端视口宿主组件：从单例注册表中挂载稳定的 xterm DOM 元素。
 * 当分屏树重排时，由于底层 DOM 与 xterm 实例稳定常驻，历史输出与交互状态绝不丢失。
 */
export const TerminalPane = ({
  pane,
  isActive,
  isFocused,
  isExpanded,
  onFocus,
}: TerminalPaneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)

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
  }, [pane.id, pane.cwd])

  // 2. 监听容器尺寸与展开/激活状态变化，执行 fit 与 resize 广播
  useEffect(() => {
    const container = containerRef.current
    if (!container || !isActive || !isExpanded) return

    const session = getOrCreateTerminalSession(pane.id, pane.cwd)

    const handleResize = (): void => {
      if (container.clientWidth < 20 || container.clientHeight < 20) return
      try {
        session.fitAddon.fit()
        if (session.term.cols >= 10 && session.term.rows >= 2) {
          void terminalApi.resize(pane.id, session.term.cols, session.term.rows)
        }
      } catch {
        // 忽略动画过渡期异常
      }
    }

    const t1 = window.setTimeout(handleResize, 50)
    const t2 = window.setTimeout(handleResize, 150)
    const t3 = window.setTimeout(handleResize, 350)

    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(container)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      observer.disconnect()
    }
  }, [pane.id, pane.cwd, isActive, isExpanded])

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

  return (
    <div
      ref={containerRef}
      className={`relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#111116] cursor-text transition-all duration-150 ${
        isFocused ? "ring-1 ring-white/20 z-10" : "opacity-85 hover:opacity-100"
      }`}
      onClick={handleFocus}
      onMouseDown={handleFocus}
    />
  )
}
