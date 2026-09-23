import { execSync } from "node:child_process"
import type { AgentContextUsage, CollaborationMode, SandboxPolicy } from "@shared/contracts/agent"
import { mcpManager, wrapMcpTool } from "./mcp/mcpManager"
import type { PersonalityName } from "./prompts/personalities"
import { defaultSystemPromptManager, type SystemPromptManager } from "./prompts/systemPromptManager"
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
import { createMemoryTool } from "./tools/memory"
import { createQuestionTool, type QuestionToolDeps } from "./tools/question"
import { createReadTool } from "./tools/read"
import { ToolRegistry } from "./tools/registry"
import { createTaskTool, type TaskToolDeps } from "./tools/task"
import { createTimeTool } from "./tools/time"
import { createTodoTool } from "./tools/todowrite"
import { createViewImageTool } from "./tools/viewImage"
import { createWebFetchTool } from "./tools/webfetch"
import { createWebSearchTool } from "./tools/webSearch"
import { createWireframeTool } from "./tools/wireframe"
import { createWriteTool } from "./tools/write"

// Agent 默认系统提示词（保持向后兼容常量）。
export const DEFAULT_SYSTEM_PROMPT = [
  "You are Yonah (also known as LX), an AI assistant that helps users work on local projects.",
  "You may use tools to read, search, write, and edit files within the project directory, and execute commands in the project root.",
  "Read a file to confirm its content before modifying it; state your intent before executing commands with side effects.",
  "For long-running commands (e.g., starting a dev server, long builds, listener processes), use bash tool with background: true to run in the background rather than blocking synchronously.",
  "After starting a background task, use job_output to read logs non-blockingly, job_list to check task status, and job_kill to terminate unneeded tasks. Do not restart the same background command before the task completes.",
  "Think by default in English. Output in the user's language when they specify a language, or when rendering tool content and plan output.",
  "For multi-step tasks (>=2 steps, requiring tool calls), use todowrite to establish a task list and update it as progress is made; skip todowrite for single-step tasks or casual conversation.",
  "When creating new UI components, pages, or modifying user-facing visual layouts, proactively invoke the wireframe tool to design and review the ASCII layout before editing or creating frontend files; skip wireframe for non-visual code changes.",
].join("\n")

export interface BuildSystemPromptOptions {
  cwd?: string
  sessionId?: string
  modelId?: string
  sandboxPolicy?: SandboxPolicy
  collaborationMode?: CollaborationMode
  currentTimeReminder?: string
  contextUsage?: AgentContextUsage | null
  activeSkills?: LoadedSkill[]
  /** 当前 agent 可用的代码检索 MCP server 名（由调用方按连接状态与角色白名单过滤） */
  mcpServers?: string[]
  personality?: PersonalityName
  manager?: SystemPromptManager
  variables?: Record<string, string | undefined>
}

// git 环境变量缓存 TTL：5 秒。同一轮发送可能多次装配系统提示词，5 秒内复用可消除重复的同步 git 调用，
// 同时把分支/工作树状态的最大陈旧窗口限制在 5 秒。
const GIT_ENV_CACHE_TTL_MS = 5 * 1000

// 按 cwd 缓存 git 派生变量（含非 git 仓库/超时的空结果），避免同一 cwd 反复承受 execSync 卡顿。
const gitEnvCache = new Map<
  string,
  { vars: Record<string, string | undefined>; expiresAt: number }
>()

// 缓存时钟（测试可注入）。
let gitEnvCacheNow: () => number = () => Date.now()

/** 注入 git 环境变量缓存时钟（测试用） */
export const setGitEnvCacheClock = (now: () => number): void => {
  gitEnvCacheNow = now
}

/** 清空 git 环境变量缓存（测试用，避免跨用例污染） */
export const clearGitEnvCache = (): void => {
  gitEnvCache.clear()
}

/** 收集 git 派生环境变量（按 cwd 短 TTL 缓存，失败结果同样缓存） */
const collectGitEnvironmentVariables = (cwd: string): Record<string, string | undefined> => {
  const now = gitEnvCacheNow()
  const cached = gitEnvCache.get(cwd)
  if (cached && cached.expiresAt > now) {
    return cached.vars
  }

  const vars: Record<string, string | undefined> = {}
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

  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd,
      timeout: 1000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd,
      timeout: 1000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (gitCommonDir && gitDir && gitCommonDir !== gitDir) {
      vars.is_worktree = "true"
    }
  } catch {
    // 非 git 仓库或超时，静默跳过
  }

  gitEnvCache.set(cwd, { vars, expiresAt: now + GIT_ENV_CACHE_TTL_MS })
  return vars
}

/** 同步收集环境上下文变量 (cwd, platform, date, git repo_root & git_branch) */
export const collectEnvironmentVariables = (cwd?: string): Record<string, string | undefined> => {
  const vars: Record<string, string | undefined> = {
    platform: process.platform,
    date: new Date().toDateString(),
  }
  if (cwd) {
    vars.cwd = cwd
    Object.assign(vars, collectGitEnvironmentVariables(cwd))
  }
  return vars
}

/** 当前已连接的 MCP server 名（代码检索策略指引只注入已连接的 server）。 */
export const resolveConnectedMcpServers = (): string[] =>
  mcpManager
    .getStatus()
    .filter((server) => server.status === "connected")
    .map((server) => server.name)

// 动态装配系统提示词（异步）。
export const buildSystemPrompt = async (
  options: BuildSystemPromptOptions = {},
): Promise<string> => {
  const manager = options.manager ?? defaultSystemPromptManager
  const envVars = collectEnvironmentVariables(options.cwd)
  return manager.render({
    cwd: options.cwd,
    sessionId: options.sessionId,
    modelId: options.modelId,
    sandboxPolicy: options.sandboxPolicy,
    collaborationMode: options.collaborationMode,
    currentTimeReminder: options.currentTimeReminder,
    contextUsage: options.contextUsage,
    activeSkills: options.activeSkills,
    mcpServers: options.mcpServers,
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
    modelId: options.modelId,
    sandboxPolicy: options.sandboxPolicy,
    collaborationMode: options.collaborationMode,
    currentTimeReminder: options.currentTimeReminder,
    contextUsage: options.contextUsage,
    activeSkills: options.activeSkills,
    mcpServers: options.mcpServers,
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
  "wireframe",
  "web_search",
  "webfetch",
  "task",
  "question",
  "memory",
  "lsp",
  "view_image",
  "job_output",
  "job_list",
  "job_kill",
])

// skill 注入上限（按 name 排序取前 N；描述注入时截断）。
export const MAX_INJECTED_SKILLS = 50

// 解析 Agent 会话 cwd：最近更新的文件系统项目目录（独立模块，避免 settingsService 侧循环依赖）。
export { resolveCwd } from "./cwdResolver"

export interface SessionToolDeps {
  getSessionId: () => string | null
  // 当前模型视觉能力（false 时不注册/不激活 view_image；缺省视为 true）。
  supportsImages?: () => boolean
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
  const viewImageEnabled = effectiveSessionDeps?.supportsImages?.() ?? true
  const registry = new ToolRegistry(cwd)
  registry.register(createReadTool(cwd, effectiveSessionDeps))
  registry.register(createMemoryTool(cwd))
  registry.register(createLsTool(cwd, effectiveSessionDeps))
  registry.register(createGrepTool(cwd, effectiveSessionDeps))
  registry.register(createFindTool(cwd, effectiveSessionDeps))
  registry.register(createWriteTool(cwd, lspDeps))
  registry.register(createEditTool(cwd, lspDeps))
  registry.register(createApplyPatchTool(cwd, lspDeps))
  registry.register(createBashTool(cwd, effectiveSessionDeps))
  registry.register(createTimeTool())
  registry.register(createTodoTool())
  registry.register(createWireframeTool())
  registry.register(createWebSearchTool())
  registry.register(createWebFetchTool(undefined, effectiveSessionDeps))
  registry.register(createJobOutputTool(effectiveSessionDeps))
  registry.register(createJobListTool(effectiveSessionDeps))
  registry.register(createJobKillTool(effectiveSessionDeps))
  // view_image：仅视觉模型注册（装配时门控；执行侧仍保留兜底校验）。
  if (viewImageEnabled) {
    registry.register(
      createViewImageTool(cwd, { supportsImages: effectiveSessionDeps?.supportsImages }),
    )
  }
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
      registry.register(
        wrapMcpTool(handle.server, handle.def, handle.client, handle.timeout, handle.serial),
      )
      activeMcpNames.push(handle.fullName)
    }
  }
  if (withReadSkill) {
    registry.register(createReadSkillTool(cwd))
  }
  // 配置可能引用未注册工具，过滤后激活（非视觉模型剔除 view_image）。
  registry.setActive([
    ...activeTools.filter(
      (name) => ALL_TOOL_NAMES.has(name) && (name !== "view_image" || viewImageEnabled),
    ),
    ...activeMcpNames,
    ...(withReadSkill ? ["read_skill"] : []),
  ])
  return registry
}
