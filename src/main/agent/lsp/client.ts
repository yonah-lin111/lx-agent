import { type ChildProcess, spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import {
  createMessageConnection,
  type MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node"
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  SymbolInformation,
} from "vscode-languageserver-types"
import type { LspServerSpec } from "./server"

// 初始化握手超时（spawn + initialize 完成）。
export const LSP_INIT_TIMEOUT_MS = 45_000
// 单请求超时。
export const LSP_REQUEST_TIMEOUT_MS = 30_000

// LspClient 构造选项（测试注入短超时；默认走模块常量）。
export interface LspClientOptions {
  initTimeoutMs?: number
  requestTimeoutMs?: number
}

// 包装请求超时：超时 reject，避免请求挂死。
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 请求超时（${ms}ms）`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

// "No Project" 错误重试上限（tsserver 首连项目加载竞态，重试即可成功）。
// 大项目首次加载可能数秒，线性退避窗口不足，改指数退避覆盖。
const MAX_NO_PROJECT_RETRIES = 5
// 重试间隔基数（ms），指数退避放大：150 → 300 → 600 → 1200 → 2400（累计 ~4.6s）。
const NO_PROJECT_RETRY_BASE_MS = 150

// 判断是否为 tsserver 项目未就绪错误（首连并行时偶发）。
const isNoProjectError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("No Project")

// 延时。
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 单个 LSP server 客户端：spawn 子进程 + vscode-jsonrpc 连接 + 9 操作请求封装。
 * 位置参数按 LSP 约定为 0-based；调用方（工具层）负责从 1-based 转换。
 * 生命周期由 lspManager 管理：会话内缓存复用，会话切换/应用退出时 shutdown。
 * 可靠性：首连项目就绪前请求串行化（避免并行触发 "No Project" 竞态），就绪后并行。
 */
// 关闭流程中等待子进程自然退出的上限（exit 通知后）。
const LSP_EXIT_WAIT_MS = 1_000

export class LspClient {
  private readonly child: ChildProcess
  private readonly connection: MessageConnection
  // server 就绪（initialize 完成）Promise；spawn 失败/进程提前退出时 reject。
  private readonly ready: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private readonly stderrTail: string[] = []
  private startupError: Error | null = null
  private crashed = false
  private disposed = false
  private readyOk = false
  private readonly initTimeoutMs: number
  private readonly requestTimeoutMs: number
  // spawn 成败（命令缺失等立即失败）；initialize 前先等它，避免向已销毁的流写请求。
  private readonly spawnResult: Promise<void>
  // 语言 id（didOpen 用；随 server spec 语言名，兼容 LSP languageId）。
  private readonly languageId: string
  // 文件 → didOpen 版本号（每次打开自增，保证 server 视图新鲜）。
  private readonly openVersions = new Map<string, number>()
  // 项目是否就绪（首个成功请求置位）；就绪前请求串行化，规避 tsserver "No Project" 竞态。
  private projectReady = false
  // 首连串行链：项目就绪前新请求排队等前一个完成。
  private startupChain: Promise<void> = Promise.resolve()

  constructor(spec: LspServerSpec, options: LspClientOptions = {}) {
    this.languageId = spec.language
    this.initTimeoutMs = options.initTimeoutMs ?? LSP_INIT_TIMEOUT_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? LSP_REQUEST_TIMEOUT_MS
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    // ready 可能永远不被 await（spawn 失败时 initialize 提前抛错），预挂 catch 消费 rejection。
    void this.ready.catch(() => {})
    this.child = spawn(spec.command, spec.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })
    this.connection = createMessageConnection(
      new StreamMessageReader(this.child.stdout!),
      new StreamMessageWriter(this.child.stdin!),
    )
    this.spawnResult = new Promise<void>((resolve, reject) => {
      this.child.once("spawn", () => resolve())
      this.child.once("error", (error) => reject(error))
    })
    this.connection.onError(([error]) => {
      this.crashed = true
      this.markStartupFailed(error)
    })
    this.connection.onClose(() => {
      this.crashed = true
      this.markStartupFailed(new Error("LSP server 进程已退出"))
    })
    // spawn 失败（命令不存在等）：立即标记启动失败，不等初始化请求超时。
    this.child.on("error", (error) => {
      this.crashed = true
      this.markStartupFailed(error)
    })
    this.child.stderr!.on("data", (chunk: Buffer) => {
      this.stderrTail.push(chunk.toString())
      if (this.stderrTail.length > 20) this.stderrTail.shift()
    })
    this.connection.listen()
  }

  // 记录启动失败原因（ready 已 resolve 后再次触发视为运行中崩溃，忽略 reject）。
  private markStartupFailed(error: Error): void {
    this.startupError = error
    this.rejectReady(error)
  }

  // 服务器已崩溃（运行中断连）。
  get isCrashed(): boolean {
    return this.crashed
  }

  // 收集启动失败/stderr 摘要（错误回灌用；limit 截断）。
  getStartupError(): string | null {
    if (!this.startupError) return null
    const detail = this.startupError.message
    const stderr = this.stderrTail.join("").trim()
    return stderr ? `${detail}：${stderr.slice(0, 300)}` : detail
  }

  // LSP initialize 握手：先等 spawn 成功再发 initialize（spawn 失败立即 reject，不向已销毁流写入）。
  async initialize(rootUri: string): Promise<void> {
    await this.spawnResult
    const initRequest = withTimeout(
      this.connection.sendRequest("initialize", {
        processId: process.pid,
        rootUri,
        capabilities: {},
      }),
      this.initTimeoutMs,
      "LSP 初始化",
    )
    // spawn 失败/进程提前退出路径：ready reject 后 race 立即抛错，避免等满 45s。
    const startupFailure = this.ready.catch(() => {
      throw this.startupError ?? new Error("LSP server 启动失败")
    })
    await Promise.race([initRequest, startupFailure])
    this.connection.sendNotification("initialized", {})
    this.readyOk = true
    this.resolveReady()
  }

  // 请求前等待就绪；运行中崩溃直接抛错。
  // 项目就绪前串行化（首个成功请求置位后并行），并统一对 "No Project" 竞态重试。
  private async request<T>(method: string, params: unknown): Promise<T> {
    await this.ready
    if (this.crashed) throw new Error("LSP server 已崩溃")
    if (!this.projectReady) {
      const prior = this.startupChain.catch(() => {})
      let release!: () => void
      this.startupChain = new Promise((resolve) => {
        release = resolve
      })
      await prior
      try {
        return await this.sendWithNoProjectRetry(method, params)
      } finally {
        release()
      }
    }
    return this.sendWithNoProjectRetry(method, params)
  }

  // 发送请求；tsserver 项目未就绪（"No Project"）时线性退避重试，其他错误原样抛出。
  private async sendWithNoProjectRetry<T>(method: string, params: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await withTimeout(
          this.connection.sendRequest<T>(method, params),
          this.requestTimeoutMs,
          method,
        )
        this.projectReady = true
        return result
      } catch (error) {
        if (attempt < MAX_NO_PROJECT_RETRIES && isNoProjectError(error)) {
          await sleep(NO_PROJECT_RETRY_BASE_MS * 2 ** attempt)
          continue
        }
        throw error
      }
    }
  }

  private uriFor(filePath: string): string {
    return pathToFileURL(filePath).toString()
  }

  // 打开文档：LSP 服务器须先收到 didOpen 才会响应文档请求（tsserver 无 didOpen 返回空）。
  // 每次请求前重开（版本自增），保证文件被编辑后视图新鲜；读失败降级空文本。
  private async ensureOpened(filePath: string): Promise<void> {
    const version = (this.openVersions.get(filePath) ?? 0) + 1
    this.openVersions.set(filePath, version)
    let text: string
    try {
      text = await readFile(filePath, "utf8")
    } catch {
      text = ""
    }
    this.connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri: this.uriFor(filePath), languageId: this.languageId, version, text },
    })
  }

  // textDocument 参数（文本 + 0-based 位置）。
  private textPosition(
    filePath: string,
    line0: number,
    character0: number,
  ): {
    textDocument: { uri: string }
    position: { line: number; character: number }
  } {
    return {
      textDocument: { uri: this.uriFor(filePath) },
      position: { line: line0, character: character0 },
    }
  }

  async goToDefinition(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    await this.ensureOpened(filePath)
    return this.request("textDocument/definition", this.textPosition(filePath, line0, character0))
  }

  async findReferences(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<Location[] | null> {
    await this.ensureOpened(filePath)
    return this.request("textDocument/references", {
      ...this.textPosition(filePath, line0, character0),
      context: { includeDeclaration: true },
    })
  }

  async hover(filePath: string, line0: number, character0: number): Promise<Hover | null> {
    await this.ensureOpened(filePath)
    return this.request("textDocument/hover", this.textPosition(filePath, line0, character0))
  }

  async documentSymbol(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    await this.ensureOpened(filePath)
    return this.request("textDocument/documentSymbol", {
      textDocument: { uri: this.uriFor(filePath) },
    })
  }

  // workspaceSymbol 为 workspace 级检索，但 tsserver 须先有 didOpen 创建项目才响应
  // （否则 navto 必抛 "No Project"，重试无效）；故先打开传入的文件触发项目创建。
  async workspaceSymbol(query: string, filePath: string): Promise<SymbolInformation[] | null> {
    await this.ensureOpened(filePath)
    return this.request("workspace/symbol", { query })
  }

  async goToImplementation(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    await this.ensureOpened(filePath)
    return this.request(
      "textDocument/implementation",
      this.textPosition(filePath, line0, character0),
    )
  }

  // prepareCallHierarchy：按位置取符号层级项（无符号返回空数组）。
  async prepareCallHierarchy(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<CallHierarchyItem[] | null> {
    await this.ensureOpened(filePath)
    return this.request(
      "textDocument/prepareCallHierarchy",
      this.textPosition(filePath, line0, character0),
    )
  }

  // incoming/outgoing 在内部先 prepare 取首个 item 再发请求（工具参数统一为位置）。
  async incomingCalls(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<CallHierarchyIncomingCall[] | null> {
    const item = await this.firstHierarchyItem(filePath, line0, character0)
    if (!item) return null
    return this.request("callHierarchy/incomingCalls", { item })
  }

  async outgoingCalls(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<CallHierarchyOutgoingCall[] | null> {
    const item = await this.firstHierarchyItem(filePath, line0, character0)
    if (!item) return null
    return this.request("callHierarchy/outgoingCalls", { item })
  }

  private async firstHierarchyItem(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<CallHierarchyItem | null> {
    const items = await this.prepareCallHierarchy(filePath, line0, character0)
    if (!items || items.length === 0) return null
    return items[0] ?? null
  }

  // 关闭：shutdown + exit 优雅退出（sendNotification 失败会 re-throw，须捕获），
  // 等子进程自然退出后兜底 kill；幂等。
  async shutdown(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    // 仅就绪且未崩溃时走优雅 shutdown/exit；否则进程已退出/流已销毁，直接回收。
    if (this.readyOk && !this.crashed) {
      try {
        await withTimeout(
          this.connection.sendRequest("shutdown"),
          this.requestTimeoutMs,
          "shutdown",
        )
        await this.connection.sendNotification("exit").catch(() => {})
      } catch {
        // server 已崩溃或未响应：走下方兜底 kill。
      }
    }
    // 等子进程自行退出（避免 kill 打断 exit 通知写入）；spawn 失败（无 pid）时跳过。
    if (
      this.child.pid !== undefined &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    ) {
      await Promise.race([
        new Promise<void>((resolve) => this.child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, LSP_EXIT_WAIT_MS)),
      ])
    }
    try {
      this.child.kill()
    } catch {
      // 子进程已退出，忽略。
    }
    this.connection.dispose()
  }
}
