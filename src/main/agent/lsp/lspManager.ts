import { extname } from "node:path"
import { pathToFileURL } from "node:url"
import { LspClient } from "./client"
import { LANGUAGE_EXTENSIONS } from "./language"
import { findWorkspaceRoot, type LspServerSpec, resolveServer } from "./server"

// server 命令 → 安装提示（spawn 失败回灌给模型）。
const INSTALL_HINTS: Record<string, string> = {
  "typescript-language-server": "npm install -g typescript-language-server",
  "vscode-json-language-server": "npm install -g vscode-langservers-extracted",
  "vscode-html-language-server": "npm install -g vscode-langservers-extracted",
  "vscode-css-language-server": "npm install -g vscode-langservers-extracted",
  "pyright-langserver": "npm install -g pyright",
}

// getClient 结果：可用 client 或错误信息（不支持语言/无启动器/启动失败）。
export type LspClientResult = { client: LspClient } | { error: string }

// client 工厂（测试注入桩替换真实 spawn）。
export type LspClientFactory = (spec: LspServerSpec) => LspClient

/**
 * 会话级 LSP server 缓存（对齐 permissionManager 单例）：
 * sessionId → (language → LspClient)。首次调用 spawn + initialize 后缓存复用，
 * 切换会话/应用退出时 clearSession kill 全部进程。
 */
export class LspManager {
  private readonly sessions = new Map<string, Map<string, LspClient>>()
  private readonly clientFactory: LspClientFactory

  constructor(clientFactory: LspClientFactory = (spec) => new LspClient(spec)) {
    this.clientFactory = clientFactory
  }

  // 获取会话内指定文件的 LSP client；首次调用时按语言解析 server 并 spawn。
  async getClient(sessionId: string, filePath: string, cwd: string): Promise<LspClientResult> {
    const extension = extname(filePath).toLowerCase()
    const language = LANGUAGE_EXTENSIONS[extension]
    if (!language) {
      return {
        error: extension ? `不支持的文件类型：${extension}` : `无法识别文件类型：${filePath}`,
      }
    }
    const spec = resolveServer(language, cwd)
    if (!spec) {
      return {
        error: `语言 ${language} 仅有扩展名映射，未提供 LSP server 启动器（当前仅支持 TS/JS/JSON/HTML/CSS/Python）`,
      }
    }

    let languageClients = this.sessions.get(sessionId)
    if (!languageClients) {
      languageClients = new Map()
      this.sessions.set(sessionId, languageClients)
    }
    let client = languageClients.get(language)
    if (!client) {
      const root = findWorkspaceRoot(filePath, spec.rootMarkers, cwd)
      client = this.clientFactory(spec)
      try {
        await client.initialize(pathToFileURL(root).toString())
      } catch (error) {
        await client.shutdown()
        const reason = error instanceof Error ? error.message : String(error)
        const hint = INSTALL_HINTS[spec.command]
        return { error: hint ? `${reason}。请安装：${hint}` : reason }
      }
      languageClients.set(language, client)
    }
    return { client }
  }

  // 清空会话缓存并回收进程（会话切换/关闭/删除时调用）。
  clearSession(sessionId: string): void {
    const languageClients = this.sessions.get(sessionId)
    if (!languageClients) return
    this.sessions.delete(sessionId)
    for (const client of languageClients.values()) {
      void client.shutdown()
    }
  }

  // 应用退出：回收全部进程。
  async dispose(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      this.clearSession(sessionId)
    }
  }
}

// LspManager 单例。
export const lspManager = new LspManager()
