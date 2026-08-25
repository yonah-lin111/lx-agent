import { execSync } from "node:child_process"
import { projectService } from "@/services/projectService"
import { mcpManager, wrapMcpTool } from "./mcp/mcpManager"
import { defaultSystemPromptManager, type SystemPromptManager } from "./prompts/systemPromptManager"
import type { PersonalityName } from "./prompts/personalities"
import { createReadSkillTool } from "./skills/readSkillTool"
import type { LoadedSkill } from "./skills/skillLoader"
import { createApplyPatchTool } from "./tools/applyPatch"
import { createBashTool } from "./tools/bash"
import { createEditTool } from "./tools/edit"
import { createFindTool } from "./tools/find"
import { createGrepTool } from "./tools/grep"
import { createJobKillTool, createJobListTool, createJobOutputTool } from "./tools/jobTools"
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

// Agent 默认系统提示词（保持向后兼容常量）。
export const DEFAULT_SYSTEM_PROMPT = [
  "You are LX Agent, an AI assistant that helps users work on local projects.",
  "You may use tools to read, search, write, and edit files within the project directory, and execute commands in the project root.",
  "Read a file to confirm its content before modifying it; state your intent before executing commands with side effects.",
  "For long-running commands (e.g., starting a dev server, long builds, listener processes), use bash tool with background: true to run in the background rather than blocking synchronously.",
  "After starting a background task, use job_output to read logs non-blockingly, job_list to check task status, and job_kill to terminate unneeded tasks. Do not restart the same background command before the task completes.",
  "Think by default in English. Output in the user's language when they specify a language, or when rendering tool content and plan output.",
  "For multi-step tasks (>=2 steps, requiring tool calls), use todowrite to establish a task list and update it as progress is made; skip todowrite for single-step tasks or casual conversation.",
].join("\n")

export interface BuildSystemPromptOptions {
  cwd?: string
  sessionId?: string
  activeSkills?: LoadedSkill[]
  personality?: PersonalityName
  manager?: SystemPromptManager
  variables?: Record<string, string | undefined>
}

/** 同步收集环境上下文变量 (cwd, platform, date, git repo_root & git_branch) */
export const collectEnvironmentVariables = (cwd?: string): Record<string, string | undefined> => {
  const vars: Record<string, string | undefined> = {
    platform: process.platform,
    date: new Date().toDateString(),
  }
  if (cwd) {
    vars.cwd = cwd
    try {
      const repoRoot = execSync("git rev-parse --show-toplevel", {
        cwd,
        timeout: 1000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
      if (repoRoot) {
        vars.repo_root = repoRoot
      }
    } catch {
      // 非 git 仓库或超时，静默跳过
    }

    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        timeout: 1000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
      if (branch) {
        vars.git_branch = branch
      }
    } catch {
      // 非 git 仓库或超时，静默跳过
    }
  }
  return vars
}

// 动态装配系统提示词（异步）。
export const buildSystemPrompt = async (
  options: BuildSystemPromptOptions = {},
): Promise<string> => {
  const manager = options.manager ?? defaultSystemPromptManager
  const envVars = collectEnvironmentVariables(options.cwd)
  return manager.render({
    cwd: options.cwd,
    sessionId: options.sessionId,
    activeSkills: options.activeSkills,
    personality: options.personality,
    variables: { ...envVars, ...(options.variables ?? {}) },
  })
}

// 动态装配系统提示词（同步）。
export const buildSystemPromptSync = (options: BuildSystemPromptOptions = {}): string => {
  const manager = options.manager ?? defaultSystemPromptManager
  const envVars = collectEnvironmentVariables(options.cwd)
  return manager.renderSync({
    cwd: options.cwd,
    sessionId: options.sessionId,
    activeSkills: options.activeSkills,
    personality: options.personality,
    variables: { ...envVars, ...(options.variables ?? {}) },
  })
}

// 可装配的内置工具全集（注册全集，按能力快照激活子集）。
export const ALL_TOOL_NAMES = new Set([
  "read",
  "ls",
  "grep",
  "find",
  "write",
  "edit",
  "apply_patch",
  "bash",
  "time",
  "todowrite",
  "web_search",
  "webfetch",
  "task",
  "question",
  "lsp",
  "job_output",
  "job_list",
  "job_kill",
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
  registry.register(createApplyPatchTool(cwd, lspDeps))
  registry.register(createBashTool(cwd, effectiveSessionDeps))
  registry.register(createTimeTool())
  registry.register(createTodoTool())
  registry.register(createWebSearchTool())
  registry.register(createWebFetchTool(undefined, effectiveSessionDeps))
  registry.register(createJobOutputTool(effectiveSessionDeps))
  registry.register(createJobListTool(effectiveSessionDeps))
  registry.register(createJobKillTool(effectiveSessionDeps))
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
