import { projectService } from "@/services/projectService"
import { mcpManager, wrapMcpTool } from "./mcp/mcpManager"
import { createReadSkillTool } from "./skills/readSkillTool"
import { createBashTool } from "./tools/bash"
import { createEditTool } from "./tools/edit"
import { createFindTool } from "./tools/find"
import { createGrepTool } from "./tools/grep"
import { createLsTool } from "./tools/ls"
import { createLspTool, type LspToolDeps } from "./tools/lsp"
import { createQuestionTool, type QuestionToolDeps } from "./tools/question"
import { createReadTool } from "./tools/read"
import { ToolRegistry } from "./tools/registry"
import { createTaskTool, type TaskToolDeps } from "./tools/task"
import { createTimeTool } from "./tools/time"
import { createTodoTool } from "./tools/todowrite"
import { createWebFetchTool } from "./tools/webfetch"
import { createWebSearchTool } from "./tools/webSearch"
import { createWriteTool } from "./tools/write"

// Agent 默认系统提示词。
export const DEFAULT_SYSTEM_PROMPT = [
  "你是 LX Agent，一个帮助用户在本地项目中工作的 AI 助手。",
  "你可以使用工具读取、搜索、写入和编辑项目目录内的文件，并在项目根目录执行命令。",
  "修改文件前先读取确认目标内容；执行有副作用的命令前说明你的意图。",
  "回答使用简体中文，代码与专有名词保留原文。",
  "面对多步骤任务（≥2 步、需要工具调用）时，用 todowrite 工具建立任务清单，并随进度更新；单步任务或闲聊不需要。",
].join("\n")

// 可装配的内置工具全集（注册全集，按能力快照激活子集）。
export const ALL_TOOL_NAMES = new Set([
  "read",
  "ls",
  "grep",
  "find",
  "write",
  "edit",
  "bash",
  "time",
  "todowrite",
  "web_search",
  "webfetch",
  "task",
  "question",
  "lsp",
])

// skill 注入上限（按 name 排序取前 N；描述注入时截断）。
export const MAX_INJECTED_SKILLS = 50

// 解析 Agent 会话 cwd：最近更新的文件系统项目目录。
export const resolveCwd = (): string | undefined => {
  const projects = projectService.listProjects()
  const filesystemProjects = projects
    .filter((project) => project.type === "filesystem" && Boolean(project.path))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return filesystemProjects[0]?.path
}

export interface SessionToolDeps {
  getSessionId: () => string | null
}

// 装配会话工具集：注册内置工具全集 + task + MCP 包装工具 + read_skill + lsp，按能力集激活。
export const createRegistry = (
  cwd: string,
  activeTools: string[],
  mcpToolNames: string[],
  withReadSkill: boolean,
  taskDeps?: TaskToolDeps,
  questionDeps?: QuestionToolDeps,
  lspDeps?: LspToolDeps,
  sessionDeps?: SessionToolDeps,
): ToolRegistry => {
  const effectiveSessionDeps =
    sessionDeps ?? (lspDeps ? { getSessionId: lspDeps.getSessionId } : undefined)
  const registry = new ToolRegistry(cwd)
  registry.register(createReadTool(cwd, effectiveSessionDeps))
  registry.register(createLsTool(cwd, effectiveSessionDeps))
  registry.register(createGrepTool(cwd, effectiveSessionDeps))
  registry.register(createFindTool(cwd, effectiveSessionDeps))
  registry.register(createWriteTool(cwd, lspDeps))
  registry.register(createEditTool(cwd, lspDeps))
  registry.register(createBashTool(cwd, effectiveSessionDeps))
  registry.register(createTimeTool())
  registry.register(createTodoTool())
  registry.register(createWebSearchTool())
  registry.register(createWebFetchTool(undefined, effectiveSessionDeps))
  if (lspDeps) {
    registry.register(createLspTool(lspDeps))
  }
  if (questionDeps) {
    registry.register(createQuestionTool(questionDeps))
  }
  // task 子代理工具：execute 时从注册表当前激活集派生子代理工具集（去掉 task 斩断递归）。
  if (taskDeps) {
    registry.register(
      createTaskTool({
        ...taskDeps,
        getSessionId: taskDeps.getSessionId ?? effectiveSessionDeps?.getSessionId,
        getTools: () => registry.getActive().filter((tool) => tool.name !== "task"),
      }),
    )
  }
  // MCP 工具：仅注册允许列表命中的已连接工具。
  const activeMcpNames: string[] = []
  for (const handle of mcpManager.getTools()) {
    if (mcpToolNames.includes(handle.fullName)) {
      registry.register(wrapMcpTool(handle.server, handle.def, handle.client, handle.timeout))
      activeMcpNames.push(handle.fullName)
    }
  }
  if (withReadSkill) {
    registry.register(createReadSkillTool(cwd))
  }
  // 配置可能引用未注册工具，过滤后激活。
  registry.setActive([
    ...activeTools.filter((name) => ALL_TOOL_NAMES.has(name)),
    ...activeMcpNames,
    ...(withReadSkill ? ["read_skill"] : []),
  ])
  return registry
}
