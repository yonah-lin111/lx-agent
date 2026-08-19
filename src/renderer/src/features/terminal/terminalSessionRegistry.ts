import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal } from "@xterm/xterm"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { DEFAULT_XTERM_OPTIONS } from "@/features/terminal/constants"

/**
 * xterm 实例与宿主容器桥接管理对象。
 */
export interface TerminalSession {
  term: Terminal
  fitAddon: FitAddon
  webLinksAddon: WebLinksAddon
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
    "relative h-full w-full overflow-hidden bg-[#111116] px-3 py-2 cursor-text select-text"

  const term = new Terminal(DEFAULT_XTERM_OPTIONS)
  const fitAddon = new FitAddon()
  const webLinksAddon = new WebLinksAddon()

  term.loadAddon(fitAddon)
  term.loadAddon(webLinksAddon)
  term.open(element)

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
      event.preventDefault()
      event.stopPropagation()
      void navigator.clipboard.readText().then((text) => {
        if (text) term.paste(text)
      })
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
      const currentSize = term.options.fontSize || 12.5
      if (currentSize < 24) {
        term.options.fontSize = currentSize + 1
        fitAddon.fit()
      }
      return false
    }

    if (isModifier && event.key === "-") {
      event.preventDefault()
      event.stopPropagation()
      const currentSize = term.options.fontSize || 12.5
      if (currentSize > 9) {
        term.options.fontSize = currentSize - 1
        fitAddon.fit()
      }
      return false
    }

    if (isModifier && event.key === "0") {
      event.preventDefault()
      event.stopPropagation()
      term.options.fontSize = 12.5
      fitAddon.fit()
      return false
    }

    return true
  })

  // 订阅后端 PTY
  const unsubscribeData = terminalApi.onData(paneId, (data) => {
    term.write(data)
  })

  const unsubscribeExit = terminalApi.onExit(paneId, ({ exitCode }) => {
    term.writeln(`\r\n\x1b[90m[进程已退出，代码: ${exitCode}]\x1b[0m`)
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
        term.writeln(`\r\n\x1b[31m[创建终端失败: ${res.error}]\x1b[0m`)
      }
    })

  const session: TerminalSession = {
    term,
    fitAddon,
    webLinksAddon,
    element,
    paneId,
    isAttached: false,
    dispose: () => {
      unsubscribeData()
      unsubscribeExit()
      onDataDisposable.dispose()
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
