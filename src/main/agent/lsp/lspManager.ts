import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { extname } from "node:path"
import { pathToFileURL } from "node:url"
import type { LspInstallResult, LspServerStatusItem } from "@shared/contracts/agent"
import {
  ALL_LSP_LANGUAGE_IDS,
  type LspLanguageId,
  type LspServerDetailInfo,
  type LspSettings,
} from "@shared/settings"
import type { Diagnostic } from "vscode-languageserver-types"
import { getLspSettings } from "@/services/settingsService"
import { LspClient } from "./client"
import { LANGUAGE_EXTENSIONS } from "./language"
import { findWorkspaceRoot, type LspServerSpec, resolveServer } from "./server"

// 各语言 LSP 基础规格与包信息。
export const LSP_LANGUAGE_SPECS: Record<
  LspLanguageId,
  {
    name: string
    packageName: string
    defaultBin: string
    command: string
    args: string[]
    installCommand: string
  }
> = {
  typescript: {
    name: "TypeScript / JavaScript",
    packageName: "typescript-language-server",
    defaultBin: "typescript-language-server",
    command: "typescript-language-server",
    args: ["--stdio"],
    installCommand: "npm install -g typescript-language-server typescript",
  },
  python: {
    name: "Python",
    packageName: "pyright",
    defaultBin: "pyright-langserver",
    command: "pyright-langserver",
    args: ["--stdio"],
    installCommand: "npm install -g pyright",
  },
  json: {
    name: "JSON",
    packageName: "vscode-langservers-extracted",
    defaultBin: "vscode-json-language-server",
    command: "vscode-json-language-server",
    args: ["--stdio"],
    installCommand: "npm install -g vscode-langservers-extracted",
  },
  html: {
    name: "HTML",
    packageName: "vscode-langservers-extracted",
    defaultBin: "vscode-html-language-server",
    command: "vscode-html-language-server",
    args: ["--stdio"],
    installCommand: "npm install -g vscode-langservers-extracted",
  },
  css: {
    name: "CSS / SCSS / LESS",
    packageName: "vscode-langservers-extracted",
    defaultBin: "vscode-css-language-server",
    command: "vscode-css-language-server",
    args: ["--stdio"],
    installCommand: "npm install -g vscode-langservers-extracted",
  },
}

// 语言类别到规范 ID 的映射。
const LANGUAGE_ID_MAP: Record<string, LspLanguageId> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "typescript",
  javascriptreact: "typescript",
  json: "json",
  html: "html",
  css: "css",
  scss: "css",
  less: "css",
  python: "python",
}

// 检测 bin 是否在 PATH 或为有效文件路径，并返回绝对路径/命令名。
export const resolveBinPath = (bin: string): string | null => {
  if (!bin) return null
  if (bin.includes("/") || bin.includes("\\")) {
    return existsSync(bin) ? bin : null
  }
  const cmd = process.platform === "win32" ? "where" : "which"
  try {
    const res = spawnSync(cmd, [bin], { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" })
    if (res.status === 0 && res.stdout) {
      const firstLine = res.stdout.split(/\r?\n/)[0]?.trim()
      return firstLine || bin
    }
  } catch {
    // ignore
  }
  return null
}

// 手动安装超时（npm install -g 可能拉取较大包）。
const LSP_INSTALL_TIMEOUT_MS = 120_000

// 包安装器（测试注入桩替换真实 npm）。
export type PackageInstaller = (packageName: string) => Promise<boolean>

// 默认安装器：npm install -g <package>；成功返回 true，失败/超时返回 false。
const installWithNpm: PackageInstaller = async (packageName) => {
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("npm", ["install", "-g", packageName], { stdio: "ignore" })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error("安装超时"))
      }, LSP_INSTALL_TIMEOUT_MS)
      child.on("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on("exit", (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`npm install 退出码 ${code}`))
      })
    })
    return true
  } catch {
    return false
  }
}

// getClient 结果：可用 client 或错误信息（不支持语言/无启动器/启动失败）。
export type LspClientResult = { client: LspClient } | { error: string }

// client 工厂（测试注入桩替换真实 spawn）。
export type LspClientFactory = (spec: LspServerSpec) => LspClient

/**
 * 会话级 LSP server 缓存：
 * sessionId → (language → LspClient)。首次调用 spawn + initialize 后缓存复用，
 * 切换会话/应用退出时 clearSession kill 全部进程。
 * 支持手动配置路径与参数，禁用隐式自动安装。
 */
export class LspManager {
  private readonly sessions = new Map<string, Map<string, LspClient>>()
  private readonly clientFactory: LspClientFactory
  private readonly installer: PackageInstaller
  // 并发安装去重：package → 进行中的安装 Promise。
  private readonly installsInFlight = new Map<string, Promise<boolean>>()
  private readonly getSettings: () => LspSettings

  constructor(
    clientFactory: LspClientFactory = (spec) => new LspClient(spec),
    installer: PackageInstaller = installWithNpm,
    getSettings: () => LspSettings = getLspSettings,
  ) {
    this.clientFactory = clientFactory
    this.installer = installer
    this.getSettings = getSettings
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
    const baseSpec = resolveServer(language)
    if (!baseSpec) {
      return {
        error: `语言 ${language} 仅有扩展名映射，未提供 LSP server 启动器（当前支持 TS/JS/JSON/HTML/CSS/Python）`,
      }
    }

    const languageId = LANGUAGE_ID_MAP[language]
    const settings = this.getSettings()
    const langConfig = languageId ? settings.languages?.[languageId] : undefined

    // 若被用户显式禁用，则不启动
    if (langConfig && langConfig.enabled === false) {
      return {
        error: `LSP server for ${language} 已在设置中禁用`,
      }
    }

    const spec: LspServerSpec = {
      ...baseSpec,
      command: langConfig?.customPath?.trim() || baseSpec.command,
      args: langConfig?.args && langConfig.args.length > 0 ? langConfig.args : baseSpec.args,
    }

    let languageClients = this.sessions.get(sessionId)
    if (!languageClients) {
      languageClients = new Map()
      this.sessions.set(sessionId, languageClients)
    }
    let client = languageClients.get(language)
    if (!client) {
      const root = findWorkspaceRoot(filePath, spec.rootMarkers, cwd)
      const result = await this.initClient(spec, root)
      if ("error" in result) return result
      client = result.client
      languageClients.set(language, client)
    }
    return { client }
  }

  // 首次 spawn + initialize；若命令缺失直接返回明确错误，不再自动 npm 安装。
  private async initClient(spec: LspServerSpec, root: string): Promise<LspClientResult> {
    const rootUri = pathToFileURL(root).toString()
    const client = this.clientFactory(spec)
    try {
      await client.initialize(rootUri)
      return { client }
    } catch (error) {
      await client.shutdown()
      return { error: this.describeError(spec, error) }
    }
  }

  // 并发去重安装：同一包只发起一次安装（其余调用复用进行中的 Promise）。
  private ensureInstalled(packageName: string): Promise<boolean> {
    let install = this.installsInFlight.get(packageName)
    if (!install) {
      install = this.installer(packageName).finally(() => this.installsInFlight.delete(packageName))
      this.installsInFlight.set(packageName, install)
    }
    return install
  }

  // 各 LSP server 详细检测状态（供设置页面使用）。
  getDetailedStatus(): LspServerDetailInfo[] {
    const settings = this.getSettings()
    return ALL_LSP_LANGUAGE_IDS.map((id) => {
      const spec = LSP_LANGUAGE_SPECS[id]
      const langConfig = settings.languages?.[id]
      const customPath = langConfig?.customPath?.trim() || ""
      const targetBin = customPath || spec.defaultBin
      const detectedPath = resolveBinPath(targetBin)
      const installed = detectedPath !== null
      const enabled = langConfig?.enabled !== false

      return {
        id,
        name: spec.name,
        packageName: spec.packageName,
        defaultBin: spec.defaultBin,
        installed,
        detectedPath,
        customPath,
        enabled,
      }
    })
  }

  // 各 LSP server 包安装状态（兼容原有接口）。
  getStatus(): LspServerStatusItem[] {
    return this.getDetailedStatus().map((item) => ({
      packageName: item.packageName,
      installed: item.installed,
    }))
  }

  // 手动安装指定包。
  installServer(packageName: string): Promise<boolean> {
    return this.ensureInstalled(packageName)
  }

  // 安装全部未安装的包。
  async installMissingServers(): Promise<LspInstallResult> {
    const installed: string[] = []
    const failed: string[] = []
    for (const item of this.getDetailedStatus()) {
      if (item.installed) continue
      ;(await this.installServer(item.packageName))
        ? installed.push(item.packageName)
        : failed.push(item.packageName)
    }
    return { installed, failed }
  }

  // 获取文件的 LSP 诊断信息；超时或未启动时静默降级为空数组。
  async getDiagnostics(
    sessionId: string | null | undefined,
    filePath: string,
    cwd: string,
    timeoutMs: number = 2000,
  ): Promise<Diagnostic[]> {
    if (!sessionId) return []
    try {
      const clientResult = await this.getClient(sessionId, filePath, cwd)
      if ("error" in clientResult) return []
      return await clientResult.client.touchAndGetDiagnostics(filePath, timeoutMs)
    } catch {
      return []
    }
  }

  // 启动失败原因 + 手动配置/安装提示。
  private describeError(spec: LspServerSpec, error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error)
    return `LSP 服务 (${spec.command}) 启动失败: ${reason}。请在设置中配置自定义路径或手动安装对应服务。`
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
