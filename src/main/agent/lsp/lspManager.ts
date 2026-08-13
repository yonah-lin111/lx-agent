import { spawn, spawnSync } from "node:child_process"
import { extname } from "node:path"
import { pathToFileURL } from "node:url"
import type { LspInstallResult, LspServerStatusItem } from "@shared/contracts/agent"
import { LspClient } from "./client"
import { LANGUAGE_EXTENSIONS } from "./language"
import { findWorkspaceRoot, type LspServerSpec, resolveServer } from "./server"

// server 命令 → 安装的 npm 包（懒安装与手动安装提示共用）。
const SERVER_PACKAGES: Record<string, string> = {
  "typescript-language-server": "typescript-language-server",
  "vscode-json-language-server": "vscode-langservers-extracted",
  "vscode-html-language-server": "vscode-langservers-extracted",
  "vscode-css-language-server": "vscode-langservers-extracted",
  "pyright-langserver": "pyright",
}

// 包 → PATH 检测 bin（npm 全局安装后 bin 进 PATH；状态栏据此判定安装与否）。
const PACKAGE_BINS: Record<string, string> = {
  "typescript-language-server": "typescript-language-server",
  "vscode-langservers-extracted": "vscode-json-language-server",
  pyright: "pyright-langserver",
}

// 检测 bin 是否在 PATH（which / where 按平台选择）。
const binOnPath = (bin: string): boolean => {
  const cmd = process.platform === "win32" ? "where" : "which"
  return spawnSync(cmd, [bin], { stdio: "ignore" }).status === 0
}

// 懒安装超时（npm install -g 可能拉取较大包）。
const LSP_INSTALL_TIMEOUT_MS = 120_000

// 判断是否为命令缺失（spawn ENOENT）——懒安装触发条件；其他启动失败不触发。
const isMissingCommandError = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT"

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
 * 会话级 LSP server 缓存（对齐 permissionManager 单例）：
 * sessionId → (language → LspClient)。首次调用 spawn + initialize 后缓存复用，
 * 切换会话/应用退出时 clearSession kill 全部进程。
 * 懒安装：命令缺失（ENOENT）时自动 npm 安装后重建 client 重试一次。
 */
export class LspManager {
  private readonly sessions = new Map<string, Map<string, LspClient>>()
  private readonly clientFactory: LspClientFactory
  private readonly installer: PackageInstaller
  // 并发安装去重：package → 进行中的安装 Promise。
  private readonly installsInFlight = new Map<string, Promise<boolean>>()

  constructor(
    clientFactory: LspClientFactory = (spec) => new LspClient(spec),
    installer: PackageInstaller = installWithNpm,
  ) {
    this.clientFactory = clientFactory
    this.installer = installer
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
    const spec = resolveServer(language)
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
      const result = await this.initClient(spec, root)
      if ("error" in result) return result
      client = result.client
      languageClients.set(language, client)
    }
    return { client }
  }

  // 首次 spawn + initialize；命令缺失（ENOENT）时懒安装后重建重试一次。
  private async initClient(spec: LspServerSpec, root: string): Promise<LspClientResult> {
    const rootUri = pathToFileURL(root).toString()
    let client = this.clientFactory(spec)
    try {
      await client.initialize(rootUri)
      return { client }
    } catch (error) {
      await client.shutdown()
      if (!isMissingCommandError(error)) {
        return { error: this.describeError(spec, error) }
      }
    }

    // 懒安装：命令缺失 → 安装 → 重建 client 重试；安装失败回退手动安装提示。
    const packageName = SERVER_PACKAGES[spec.command]
    if (!packageName || !(await this.ensureInstalled(packageName))) {
      return {
        error: `LSP server 未安装（${spec.command}）且自动安装失败。请手动执行：npm install -g ${packageName ?? spec.command}`,
      }
    }
    client = this.clientFactory(spec)
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

  // 各 LSP server 包安装状态（PATH 检测；状态栏指示）。
  getStatus(): LspServerStatusItem[] {
    return Object.entries(PACKAGE_BINS).map(([packageName, bin]) => ({
      packageName,
      installed: binOnPath(bin),
    }))
  }

  // 安装指定包（复用懒安装的并发去重与安装器）。
  installServer(packageName: string): Promise<boolean> {
    return this.ensureInstalled(packageName)
  }

  // 安装全部未安装的包（状态栏"一键安装"入口）。
  async installMissingServers(): Promise<LspInstallResult> {
    const installed: string[] = []
    const failed: string[] = []
    for (const { packageName, installed: isInstalled } of this.getStatus()) {
      if (isInstalled) continue
      ;(await this.installServer(packageName))
        ? installed.push(packageName)
        : failed.push(packageName)
    }
    return { installed, failed }
  }

  // 启动失败原因 + 手动安装提示。
  private describeError(spec: LspServerSpec, error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error)
    const packageName = SERVER_PACKAGES[spec.command]
    return packageName ? `${reason}。请安装：npm install -g ${packageName}` : reason
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
