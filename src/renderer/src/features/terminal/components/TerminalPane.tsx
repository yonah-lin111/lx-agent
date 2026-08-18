import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal } from "@xterm/xterm"
import { useEffect, useRef } from "react"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { DEFAULT_XTERM_OPTIONS } from "@/features/terminal/constants"
import type { TerminalTabItem } from "@/features/terminal/types"

interface TerminalPaneProps {
  tab: TerminalTabItem
  isActive: boolean
  isExpanded: boolean
}

/**
 * 单个 xterm 终端画布组件：负责 PTY 连接、尺寸自适应与输入输出交互。
 */
export const TerminalPane = ({
  tab,
  isActive,
  isExpanded,
}: TerminalPaneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  // 1. 初始化 xterm 实例与 PTY 进程。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal(DEFAULT_XTERM_OPTIONS)
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(container)

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // 自定义按键处理：处理剪贴板复制/粘贴与快捷键穿透。
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const isMac = navigator.userAgent.includes("Mac")
      const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey

      // 复制：有选区时拦截为系统剪贴板复制。
      if (isCtrlOrCmd && event.key === "c" && term.hasSelection()) {
        if (event.type === "keydown") {
          const selection = term.getSelection()
          void navigator.clipboard.writeText(selection)
        }
        return false
      }

      // 粘贴：Ctrl+V 或 Cmd+V。
      if (isCtrlOrCmd && event.key === "v") {
        if (event.type === "keydown") {
          void navigator.clipboard.readText().then((text) => {
            if (text) void terminalApi.write(tab.id, text)
          })
        }
        return false
      }

      return true
    })

    // 首次计算视口列数与行数。
    try {
      fitAddon.fit()
    } catch {
      // 忽略初始尺寸不可用
    }

    const cols = term.cols > 0 ? term.cols : 80
    const rows = term.rows > 0 ? term.rows : 24

    // 先订阅后端 PTY 输出与退出事件（保证不丢失首包输出）。
    const unsubscribeData = terminalApi.onData(tab.id, (data) => {
      term.write(data)
    })

    const unsubscribeExit = terminalApi.onExit(tab.id, ({ exitCode }) => {
      term.writeln(`\r\n\x1b[90m[进程已退出，代码: ${exitCode}]\x1b[0m`)
    })

    // 监听前端用户键入输入并转发到后端 PTY。
    const onDataDisposable = term.onData((data) => {
      void terminalApi.write(tab.id, data)
    })

    // 创建后端 PTY 进程。
    void terminalApi
      .create({
        id: tab.id,
        cwd: tab.cwd,
        cols,
        rows,
      })
      .then((res) => {
        if (!res.success && res.error) {
          term.writeln(`\r\n\x1b[31m[创建终端失败: ${res.error}]\x1b[0m`)
        }
      })

    // 挂载后立即请求焦点。
    term.focus()

    return () => {
      unsubscribeData()
      unsubscribeExit()
      onDataDisposable.dispose()
      webLinksAddon.dispose()
      fitAddon.dispose()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [tab.id, tab.cwd])

  // 2. 监听容器尺寸与展开/激活状态变化，执行 fit 与 resize 广播。
  useEffect(() => {
    const container = containerRef.current
    const term = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!container || !term || !fitAddon || !isActive || !isExpanded) return

    const handleResize = (): void => {
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return
      try {
        fitAddon.fit()
        if (term.cols > 0 && term.rows > 0) {
          void terminalApi.resize(tab.id, term.cols, term.rows)
        }
      } catch {
        // 忽略动画过渡期的计算异常
      }
    }

    // 延迟以等待 DOM 展开过渡动画完成。
    const timer = window.setTimeout(handleResize, 100)
    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(container)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [tab.id, isActive, isExpanded])

  // 3. 激活或展开时自动聚焦到 xterm 输入光标。
  useEffect(() => {
    if (isActive && isExpanded && terminalRef.current) {
      const timer = window.setTimeout(() => {
        terminalRef.current?.focus()
      }, 50)
      return () => window.clearTimeout(timer)
    }
  }, [isActive, isExpanded])

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden bg-[#141414] p-1.5 cursor-text ${
        isActive ? "block" : "hidden"
      }`}
      onClick={() => terminalRef.current?.focus()}
      onMouseDown={() => terminalRef.current?.focus()}
    />
  )
}
