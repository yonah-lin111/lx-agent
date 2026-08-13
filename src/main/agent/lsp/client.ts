import { type ChildProcess, spawn } from "node:child_process"
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

/**
 * 单个 LSP server 客户端：spawn 子进程 + vscode-jsonrpc 连接 + 9 操作请求封装。
 * 位置参数按 LSP 约定为 0-based；调用方（工具层）负责从 1-based 转换。
 * 生命周期由 lspManager 管理：会话内缓存复用，会话切换/应用退出时 shutdown。
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

  constructor(spec: LspServerSpec, options: LspClientOptions = {}) {
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
  private async request<T>(method: string, params: unknown): Promise<T> {
    await this.ready
    if (this.crashed) throw new Error("LSP server 已崩溃")
    return withTimeout(
      this.connection.sendRequest<T>(method, params),
      this.requestTimeoutMs,
      method,
    )
  }

  private uriFor(filePath: string): string {
    return pathToFileURL(filePath).toString()
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
    return this.request("textDocument/definition", this.textPosition(filePath, line0, character0))
  }

  async findReferences(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<Location[] | null> {
    return this.request("textDocument/references", {
      ...this.textPosition(filePath, line0, character0),
      context: { includeDeclaration: true },
    })
  }

  async hover(filePath: string, line0: number, character0: number): Promise<Hover | null> {
    return this.request("textDocument/hover", this.textPosition(filePath, line0, character0))
  }

  async documentSymbol(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.request("textDocument/documentSymbol", {
      textDocument: { uri: this.uriFor(filePath) },
    })
  }

  async workspaceSymbol(query: string): Promise<SymbolInformation[] | null> {
    return this.request("workspace/symbol", { query })
  }

  async goToImplementation(
    filePath: string,
    line0: number,
    character0: number,
  ): Promise<Location | Location[] | LocationLink[] | null> {
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
