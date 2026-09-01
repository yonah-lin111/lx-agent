import { FitAddon } from "@xterm/addon-fit"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal } from "@xterm/xterm"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { DEFAULT_XTERM_OPTIONS } from "@/features/terminal/constants"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import { extractPathsFromDataTransfer, formatTerminalPaths } from "@/features/terminal/utils"
import { useTranslation } from "@/i18n"

/**
 * xterm 实例与宿主容器桥接管理对象。
 */
export interface TerminalSession {
  term: Terminal
  fitAddon: FitAddon
  webLinksAddon: WebLinksAddon
  unicode11Addon: Unicode11Addon
  webglAddon?: WebglAddon
  element: HTMLDivElement
  paneId: string
  isAttached: boolean
  dispose: () => void
}

const sessionRegistry = new Map<string, TerminalSession>()

/**
 * 获取或创建稳定持久的 TerminalSession（PTY 进程与 xterm 实例在此常驻，不受 React 重新挂载影响）。
 */
export const getOrCreateTerminalSession = (paneId: string, cwd?: string): TerminalSession => {
  const existing = sessionRegistry.get(paneId)
  if (existing) return existing

  const element = document.createElement("div")
  element.className =
    "terminal-session-element relative h-full w-full overflow-hidden bg-transparent cursor-text select-text"

  const term = new Terminal(DEFAULT_XTERM_OPTIONS)
  const fitAddon = new FitAddon()
  const webLinksAddon = new WebLinksAddon()
  const unicode11Addon = new Unicode11Addon()

  term.loadAddon(fitAddon)
  term.loadAddon(webLinksAddon)
  term.loadAddon(unicode11Addon)
  term.unicode.activeVersion = "11"
  term.open(element)

  // 启用 WebGL 硬件加速渲染，彻底杜绝 DOM 重绘抖动
  let webglAddon: WebglAddon | undefined
  try {
    webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => {
      webglAddon?.dispose()
      webglAddon = undefined
    })
    term.loadAddon(webglAddon)
  } catch {
    webglAddon = undefined
  }

  // 快捷键处理
  term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    if (event.shiftKey && event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      if (event.type === "keydown") {
        void terminalApi.write(paneId, "\x1b\r")
      }
      return false
    }

    if (event.type !== "keydown") return true

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    const isModifier = isMac ? event.metaKey : event.ctrlKey

    if (isModifier && event.key.toLowerCase() === "c" && term.hasSelection()) {
      event.preventDefault()
      event.stopPropagation()
      void navigator.clipboard.writeText(term.getSelection())
      return false
    }

    if (isModifier && event.key.toLowerCase() === "v") {
      // 允许浏览器原生 paste 事件触发，由 DOM 'paste' 监听器从 clipboardData 读取完整文件物理路径
      return false
    }

    if (isModifier && event.key.toLowerCase() === "k") {
      event.preventDefault()
      event.stopPropagation()
      term.clear()
      return false
    }

    if (isModifier && (event.key === "=" || event.key === "+")) {
      event.preventDefault()
      event.stopPropagation()
      const currentSize = term.options.fontSize || 13
      if (currentSize < 24) {
        term.options.fontSize = currentSize + 1
        fitAddon.fit()
      }
      return false
    }

    if (isModifier && event.key === "-") {
      event.preventDefault()
      event.stopPropagation()
      const currentSize = term.options.fontSize || 13
      if (currentSize > 9) {
        term.options.fontSize = currentSize - 1
        fitAddon.fit()
      }
      return false
    }

    if (isModifier && event.key === "0") {
      event.preventDefault()
      event.stopPropagation()
      term.options.fontSize = 13
      fitAddon.fit()
      return false
    }

    return true
  })

  // 粘贴与拖拽文件/文件夹绝对路径处理
  const handlePaste = (event: ClipboardEvent): void => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const paths = extractPathsFromDataTransfer(clipboardData)
    if (paths.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      const formatted = formatTerminalPaths(paths)
      if (formatted) {
        term.paste(formatted)
      }
      return
    }

    const text = clipboardData.getData("text/plain")
    if (text) {
      event.preventDefault()
      event.stopPropagation()
      term.paste(text)
    }
  }

  const handleDragOver = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy"
    }
  }

  const handleDrop = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const dataTransfer = event.dataTransfer
    if (!dataTransfer) return

    const paths = extractPathsFromDataTransfer(dataTransfer)
    if (paths.length > 0) {
      const formatted = formatTerminalPaths(paths)
      if (formatted) {
        term.paste(formatted)
        term.focus()
      }
      return
    }

    const text = dataTransfer.getData("text/plain")
    if (text) {
      term.paste(text)
      term.focus()
    }
  }

  element.addEventListener("paste", handlePaste, true)
  element.addEventListener("dragover", handleDragOver, false)
  element.addEventListener("drop", handleDrop, false)

  // 监听 xterm 视口行列变化并即时同步调整底层 PTY 尺寸
  const onResizeDisposable = term.onResize(({ cols, rows }) => {
    if (cols >= 10 && rows >= 2) {
      void terminalApi.resize(paneId, cols, rows)
    }
  })

  // 监听 xterm 标题变化事件（如 CLI 输出的 OSC 0 / OSC 2 动态标题）
  const onTitleChangeDisposable = term.onTitleChange((title: string) => {
    const cleanTitle = title.trim()
    if (cleanTitle) {
      useTerminalStore.getState().updatePaneTitle(paneId, cleanTitle)
    }
  })

  // 订阅后端 PTY
  const unsubscribeData = terminalApi.onData(paneId, (data) => {
    term.write(data)
    // 当终端有数据输出时（例如命令执行或进程退出打印 prompt），触发一次轻量防抖的 CLI 状态检测
    void useTerminalStore.getState().refreshRunningClis()
  })

  const unsubscribeExit = terminalApi.onExit(paneId, ({ exitCode }) => {
    const { t } = useTranslation()
    term.writeln(`\r\n\x1b[90m${t("terminal.processExited", { code: exitCode })}\x1b[0m`)
  })

  const onDataDisposable = term.onData((data) => {
    void terminalApi.write(paneId, data)
  })

  // 创建原生 PTY
  void terminalApi
    .create({
      id: paneId,
      cwd,
      cols: 80,
      rows: 24,
    })
    .then((res) => {
      if (!res.success && res.error) {
        const { t } = useTranslation()
        term.writeln(`\r\n\x1b[31m${t("terminal.createFailed", { error: res.error })}\x1b[0m`)
      }
    })

  const session: TerminalSession = {
    term,
    fitAddon,
    webLinksAddon,
    unicode11Addon,
    webglAddon,
    element,
    paneId,
    isAttached: false,
    dispose: () => {
      element.removeEventListener("paste", handlePaste, true)
      element.removeEventListener("dragover", handleDragOver, false)
      element.removeEventListener("drop", handleDrop, false)
      unsubscribeData()
      unsubscribeExit()
      onDataDisposable.dispose()
      onResizeDisposable.dispose()
      onTitleChangeDisposable.dispose()
      webglAddon?.dispose()
      unicode11Addon.dispose()
      webLinksAddon.dispose()
      fitAddon.dispose()
      term.dispose()
      sessionRegistry.delete(paneId)
    },
  }

  sessionRegistry.set(paneId, session)
  return session
}

/**
 * 销毁指定的 TerminalSession。
 */
export const disposeTerminalSession = (paneId: string): void => {
  const session = sessionRegistry.get(paneId)
  if (session) {
    session.dispose()
  }
}
