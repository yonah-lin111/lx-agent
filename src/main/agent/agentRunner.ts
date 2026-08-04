import type { AgentEvent, AgentMessage, AgentSendResult } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { projectService } from "@/services/projectService"
import { Agent } from "./core/agent"
import type { AgentTool } from "./core/types"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { createReadTool } from "./tools/read"
import { ToolRegistry } from "./tools/registry"
import { createTimeTool } from "./tools/time"

// Agent 默认系统提示词。
const DEFAULT_SYSTEM_PROMPT = [
  "你是 LX Agent，一个帮助用户在本地项目中工作的 AI 助手。",
  "你可以使用提供的工具读取项目目录内的文件。",
  "回答使用简体中文，代码与专有名词保留原文。",
].join("\n")

// 解析 Agent 会话 cwd：最近更新的文件系统项目目录。
const resolveCwd = (): string | undefined => {
  const projects = projectService.listProjects()
  const filesystemProjects = projects
    .filter((project) => project.type === "filesystem" && Boolean(project.path))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return filesystemProjects[0]?.path
}

// 装配会话工具集。
const createRegistry = (cwd: string): ToolRegistry => {
  const registry = new ToolRegistry(cwd)
  registry.register(createReadTool(cwd))
  registry.register(createTimeTool())
  registry.setActive(["read", "time"])
  return registry
}

/**
 * 会话级 Agent 装配：持有 Agent 实例与工具注册表，将事件转发给 IPC 层。
 *
 * Agent 实例跨 send 持久（保留会话上下文）；cwd 或模型配置变化时重建工具集与模型。
 */
class AgentRunner {
  private agent?: Agent
  private registry?: ToolRegistry
  private cwd?: string
  private unsubscribe?: () => void
  private eventSink?: (event: AgentEvent) => void
  // renderer 最近一次请求的模型选择；未设置时回退到默认模型。
  private requestedModel?: ModelSelection
  // renderer 最近一次请求的项目目录；未设置时回退到最近更新的文件系统项目。
  private requestedCwd?: string

  // 绑定事件转发目标（IPC 层注入 webContents 发送）。
  attachEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
  }

  // 保证 Agent 就绪；返回错误信息时表示不可用。
  private ensureReady(): { agent: Agent } | { error: string } {
    const cwd = this.requestedCwd ?? resolveCwd()
    if (!cwd) {
      return { error: "未找到可用的项目目录。请先在项目管理中创建并绑定文件系统项目。" }
    }

    const modelResult = this.requestedModel
      ? resolveModelSelection(this.requestedModel)
      : resolveDefaultModel()
    if ("error" in modelResult) {
      return { error: modelResult.error }
    }

    if (
      !this.agent ||
      !this.registry ||
      this.cwd !== cwd ||
      this.agent.state.model.provider !== modelResult.model.provider ||
      this.agent.state.model.id !== modelResult.model.id
    ) {
      const registry = createRegistry(cwd)
      const previousMessages = this.agent?.state.messages ?? []
      const agent = new Agent({
        streamFn: createAiSdkStreamFn(),
        initialState: {
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          model: modelResult.model,
          tools: registry.getActive(),
        },
      })
      agent.state.messages = previousMessages
      if (this.unsubscribe) {
        this.unsubscribe()
      }
      this.unsubscribe = agent.subscribe((event) => {
        this.eventSink?.(event)
      })
      this.agent = agent
      this.registry = registry
      this.cwd = cwd
    }

    return { agent: this.agent }
  }

  // 发送一条用户消息并驱动 Agent 运行。
  async send(
    text: string,
    selection?: ModelSelection,
    projectPath?: string,
  ): Promise<AgentSendResult> {
    if (selection !== undefined) {
      this.requestedModel = selection
    }
    if (projectPath !== undefined) {
      this.requestedCwd = projectPath
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const { agent } = ready
    if (agent.state.isStreaming) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    try {
      await agent.prompt(text)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // 中止当前 run。
  abort(): void {
    this.agent?.abort()
  }

  // 恢复会话上下文（renderer 恢复历史会话时调用）。
  restoreMessages(messages: AgentMessage[]): void {
    this.agent?.abort()
    const ready = this.ensureReady()
    if ("error" in ready) return
    ready.agent.state.messages = [...messages]
  }

  // 当前会话上下文。
  getMessages(): AgentMessage[] {
    return this.agent?.state.messages ?? []
  }

  // 当前会话使用的工具列表。
  getActiveTools(): AgentTool<any>[] {
    return this.registry?.getActive() ?? []
  }
}

// AgentRunner 单例。
export const agentRunner = new AgentRunner()
