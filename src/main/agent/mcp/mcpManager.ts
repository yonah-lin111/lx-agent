import { readFileSync } from "node:fs"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  type CallToolResult,
  CallToolResultSchema,
  type Tool,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type { McpServerStatusItem } from "@shared/contracts/agent"
import { getConfigPath } from "@/paths"
import type { AgentTool } from "../core/types"
import { jsonSchemaToZod } from "./jsonSchemaToZod"

// MCP server 配置（config.json `agent.mcp` 节点，字段对齐 opencode Local）。
export type McpServerConfig = {
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  disabled?: boolean
  timeout?: number
}

// server 连接状态。
export type McpServerStatus = "connected" | "disabled" | "failed"

// 已连接工具句柄（供 AgentTool 适配；全名 `server_tool` 前缀化）。
export type McpToolHandle = {
  server: string
  def: Tool
  client: Client
  timeout: number
  fullName: string
}

// 默认连接初始化超时（ms）。
const DEFAULT_TIMEOUT = 30000

// 分页拉全工具列表上限（页）。
const MAX_LIST_TOOL_PAGES = 1000

// 工具名前缀化（对齐 opencode sanitize）。
const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_")

// MCP 工具全名：`sanitize(server)_sanitize(name)`，防与内置工具/跨 server 冲突。
export const mcpToolName = (server: string, name: string): string =>
  `${sanitize(server)}_${sanitize(name)}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 读取 config.json 的 agent.mcp 节点；disabled / 非法条目跳过。
const readMcpServerConfig = (): Record<string, McpServerConfig> => {
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), "utf8")) as unknown
    if (!isRecord(raw) || !isRecord(raw.agent)) return {}
    const mcp = raw.agent.mcp
    if (!isRecord(mcp)) return {}
    const servers: Record<string, McpServerConfig> = {}
    for (const [name, value] of Object.entries(mcp)) {
      if (!isRecord(value) || !Array.isArray(value.command)) continue
      const command = value.command.filter((item): item is string => typeof item === "string")
      if (command.length === 0) continue
      servers[name] = {
        command,
        ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
        ...(isRecord(value.environment)
          ? { environment: value.environment as Record<string, string> }
          : {}),
        ...(typeof value.disabled === "boolean" ? { disabled: value.disabled } : {}),
        ...(typeof value.timeout === "number" ? { timeout: value.timeout } : {}),
      }
    }
    return servers
  } catch {
    return {}
  }
}

// 分页拉全工具列表（nextCursor 循环，游标去重；失败返回空）。
const listAllTools = async (client: Client, timeout: number): Promise<Tool[]> => {
  const tools: Tool[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < MAX_LIST_TOOL_PAGES; page++) {
    const result = await client.listTools({ cursor }, { timeout })
    tools.push(...result.tools)
    if (!result.nextCursor || seenCursors.has(result.nextCursor)) break
    seenCursors.add(result.nextCursor)
    cursor = result.nextCursor
  }
  return tools
}

// 将 MCP 工具结果内容块序列化为文本（非 text 块仅标注类型，避免注入 base64）。
const contentToText = (content: CallToolResult["content"]): string =>
  content
    .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
    .filter(Boolean)
    .join("\n")

// MCP 工具 → AgentTool 适配：前缀命名、串行执行、isError 抛错、structuredContent 兜底。
export const wrapMcpTool = (
  server: string,
  def: Tool,
  client: Client,
  timeout: number,
): AgentTool<any> => ({
  name: mcpToolName(server, def.name),
  label: def.name,
  description: def.description ?? "",
  inputSchema: jsonSchemaToZod(def.inputSchema),
  executionMode: "sequential",
  execute: async (_toolCallId, params, signal) => {
    const result = (await client.callTool(
      { name: def.name, arguments: params },
      CallToolResultSchema,
      { signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {} },
    )) as CallToolResult
    if (result.isError) {
      const message = contentToText(result.content)
      throw new Error(message || `MCP tool ${def.name} execution failed`)
    }
    if (result.content.length > 0 || result.structuredContent == null) {
      return { content: [{ type: "text", text: contentToText(result.content) }] }
    }
    return { content: [{ type: "text", text: JSON.stringify(result.structuredContent) }] }
  },
})

type ServerState = {
  server: string
  status: McpServerStatus
  tools: Tool[]
  error?: string
  client?: Client
  timeout: number
}

/**
 * MCP server 生命周期管理：spawn stdio / connect / listTools / 状态 / 监听 / 断开。
 *
 * 单 server 失败降级不阻塞（记 failed 状态），其余照常。
 */
class McpManager {
  private states = new Map<string, ServerState>()
  private connectPromise?: Promise<void>
  private statusChangeListeners = new Set<() => void>()

  // 订阅连接状态变更，返回退订函数（渲染层状态 icon 刷新）。
  onStatusChange(listener: () => void): () => void {
    this.statusChangeListeners.add(listener)
    return () => {
      this.statusChangeListeners.delete(listener)
    }
  }

  // 通知状态变更订阅者。
  private emitStatusChange(): void {
    for (const listener of this.statusChangeListeners) listener()
  }

  // 写入 server 状态并通知变更。
  private updateState(name: string, state: ServerState): void {
    this.states.set(name, state)
    this.emitStatusChange()
  }

  // 全部 server 的连接状态快照（供渲染层展示）。
  getStatus(): McpServerStatusItem[] {
    return [...this.states.values()].map(({ server, status }) => ({ name: server, status }))
  }

  // 读取 agent.mcp 配置（disabled / 非法条目跳过）。
  getServers(): Record<string, McpServerConfig> {
    return readMcpServerConfig()
  }

  // 幂等连接：并发调用共享同一次连接。
  ensureConnected(): Promise<void> {
    this.connectPromise ??= this.connectAll()
    return this.connectPromise
  }

  // 逐 server 并发连接。
  async connectAll(): Promise<void> {
    const servers = readMcpServerConfig()
    await Promise.all(
      Object.entries(servers).map(([name, config]) => this.connectServer(name, config)),
    )
  }

  // 单 server 连接；失败记 failed 不抛。
  private async connectServer(name: string, config: McpServerConfig): Promise<void> {
    const timeout = config.timeout ?? DEFAULT_TIMEOUT
    const [command, ...args] = config.command
    if (config.disabled || !command) {
      this.updateState(name, { server: name, status: "disabled", tools: [], timeout })
      return
    }
    const transport = new StdioClientTransport({
      command,
      args,
      cwd: config.cwd,
      env: { ...(process.env as Record<string, string>), ...config.environment },
    })
    const client = new Client({ name: "lx-agent", version: "0.1.0" })
    try {
      await client.connect(transport, { timeout })
      const tools = await listAllTools(client, timeout).catch(() => [])
      // 监听：ToolListChanged → 重拉工具；onclose → failed。
      client.setRequestHandler(ToolListChangedNotificationSchema, async () => {
        const refreshed = await listAllTools(client, timeout).catch(() => [])
        const state = this.states.get(name)
        if (state && state.status === "connected") state.tools = refreshed
        return {}
      })
      client.onclose = () => {
        const state = this.states.get(name)
        if (state && state.status === "connected") {
          this.updateState(name, {
            server: name,
            status: "failed",
            tools: [],
            timeout: state.timeout,
            error: "MCP server connection closed",
          })
        }
      }
      this.updateState(name, { server: name, status: "connected", tools, client, timeout })
    } catch (error) {
      this.updateState(name, {
        server: name,
        status: "failed",
        tools: [],
        timeout,
        error: error instanceof Error ? error.message : String(error),
      })
      // 关闭 transport 避免残留子进程。
      void transport.close()
    }
  }

  // 已连接 server 的工具句柄。
  getTools(): McpToolHandle[] {
    const handles: McpToolHandle[] = []
    for (const state of this.states.values()) {
      if (state.status !== "connected" || !state.client) continue
      for (const def of state.tools) {
        handles.push({
          server: state.server,
          def,
          client: state.client,
          timeout: state.timeout,
          fullName: mcpToolName(state.server, def.name),
        })
      }
    }
    return handles
  }

  // 断开全部连接（应用退出时调用；SDK 关闭 transport 终止子进程）。
  async disconnectAll(): Promise<void> {
    const clients = [...this.states.values()]
      .filter((state) => state.client)
      .map((state) => state.client!)
    this.states.clear()
    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.close()
        } catch {
          // 断开失败不阻塞退出。
        }
      }),
    )
  }
}

// McpManager 单例。
export const mcpManager = new McpManager()
