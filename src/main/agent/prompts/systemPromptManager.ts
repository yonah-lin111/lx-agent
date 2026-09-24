/**
 * 动态分层系统提示词管理器 (SystemPromptManager)
 *
 * 提供有序系统片段、作用域覆盖 (Scope Overrides)、严格模板变量插值、运行时上下文快照与拦截器支持。
 */

import type { AgentContextUsage, CollaborationMode, SandboxPolicy } from "@shared/contracts/agent"
import { formatInstructions, loadInstructions } from "../instructionLoader"
import { formatMemoryPrompt, loadMemoryStores } from "../memories/memoryManager"
import { formatSkillsForPrompt, type LoadedSkill } from "../skills/skillLoader"
import { DEFAULT_BEHAVIOR_PROMPT } from "./behaviorPrompt"
import { buildCollaborationModePrompt } from "./collaborationModePrompt"
import { formatMcpGuidancePrompt } from "./mcpGuidance"
import {
  detectModelFamily,
  formatSandboxPolicyPrompt,
  getModelAdaptiveInstructions,
} from "./modelAdapters"
import { getPersonalityPrompt, type PersonalityName } from "./personalities"

/** 变量名称规范：小写字母开头，小写字母、数字及下划线组合 */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/

/** 匹配 {{...}} 组 */
const GROUP_AT = /^\{\{([^{}]*)\}\}/

/** 标准分层优先级常量（升序排列） */
export const PROMPT_ORDERS = {
  IDENTITY: -100,
  BEHAVIOR: -50,
  PERSONA: 0,
  MODEL_ADAPTIVE: 50,
  SKILLS: 100,
  MCP_GUIDANCE: 110,
  INSTRUCTIONS: 200,
  WORKSPACE_MEMORY: 250,
  RUNTIME_CONTEXT: 300,
  ENVIRONMENT: 350,
  CURRENT_TIME: 355,
  CONTEXT_WINDOW_GUIDANCE: 358,
  SANDBOX_POLICY: 360,
  COLLABORATION_MODE: 380,
  INTERCEPTOR: 400,
} as const

/** 标准系统提示词分段名称 */
export const PROMPT_SECTION_NAMES = {
  IDENTITY: "harness:identity",
  BEHAVIOR: "harness:behavior",
  COLLABORATION_MODE: "harness:collaboration-mode",
  MINIMAL_MODE: "harness:minimal-mode",
  PERSONA: "deployment:persona",
  MODEL_ADAPTIVE: "harness:model-adaptive",
  SKILLS: "agent:skills",
  MCP_GUIDANCE: "agent:mcp-guidance",
  INSTRUCTIONS: "agent:instructions",
  WORKSPACE_MEMORY: "agent:workspace-memory",
  RUNTIME_CONTEXT: "agent:runtime-context",
  ENVIRONMENT: "agent:environment",
  CURRENT_TIME: "agent:current-time",
  CONTEXT_WINDOW_GUIDANCE: "harness:context-window-guidance",
  SANDBOX_POLICY: "agent:sandbox-policy",
  LSP_FEEDBACK: "agent:lsp-feedback",
} as const

/** 装配上下文 */
export interface AssembleContext {
  sessionId?: string
  cwd?: string
  signal?: AbortSignal
  modelId?: string
  sandboxPolicy?: SandboxPolicy
  collaborationMode?: CollaborationMode
  // auto 编排下模型切出的有效模式（缺省 = 与 collaborationMode 相同）。
  effectiveCollaborationMode?: CollaborationMode
  currentTimeReminder?: string
  contextUsage?: AgentContextUsage | null
  activeSkills?: LoadedSkill[]
  /** 当前 agent 实际可用的代码检索 MCP server 名（已按连接状态与角色白名单过滤） */
  mcpServers?: string[]
  personality?: PersonalityName
  variables?: Record<string, string | undefined>
  [key: string]: unknown
}

/** 提示词分段输入 */
export interface PromptSection {
  /** 唯一段名 */
  readonly name: string
  /** 升序排序权重 */
  readonly order: number
  /** 静态文本或动态求值函数 */
  readonly text: string | ((context: AssembleContext) => string | Promise<string>)
  /** 是否独占整个系统提示词（为 true 时覆盖所有其他段） */
  readonly complete?: boolean
  /** 外部注入文本标记：为 true 时跳过模板插值，原样注入（AGENTS.md/SKILL.md/MEMORY.md） */
  readonly literal?: boolean
}

/** 动态运行时上下文输入 */
export interface PromptContext {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: AssembleContext) => string | Promise<string>)
  /** 外部注入文本标记：为 true 时跳过模板插值，原样注入 */
  readonly literal?: boolean
}

/** 提示词变量提供者 */
export type VariableProvider =
  | string
  | ((context: AssembleContext) => string | undefined | Promise<string | undefined>)

/** 已装配的单段结果 */
export interface AssembledSection {
  name: string
  text: string
}

/** 已装配的上下文条目 */
export interface AssembledContext {
  name: string
  text: string
}

/** 装配输出结构 */
export interface PromptAssembly {
  sections: AssembledSection[]
  contexts: AssembledContext[]
  variables: Record<string, string | undefined>
  rendered: string
}

/** 提示词拦截器 */
export interface PromptInterceptor {
  readonly name: string
  readonly apply: (
    assembly: PromptAssembly,
    context: AssembleContext,
  ) => PromptAssembly | Promise<PromptAssembly>
}

/** 严格模板变量插值 */
export function interpolateVariables(
  text: string,
  variables: Record<string, string | undefined>,
  sourceKind: "section" | "context",
  sourceName: string,
): string {
  let result = ""
  let last = 0
  for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
    const group = GROUP_AT.exec(text.slice(open))
    if (group === null) {
      if (text.indexOf("}}", open + 2) >= 0) {
        throw new Error(
          `malformed prompt variable reference at "${text.slice(open, open + 16)}..." in ${sourceKind} "${sourceName}"`,
        )
      }
      result += text.slice(last, open + 2)
      last = open + 2
      continue
    }

    const name = group[0].slice(2, -2)
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(
        `malformed prompt variable reference "{{${name}}}" in ${sourceKind} "${sourceName}" (variable names must match ${String(VARIABLE_NAME)})`,
      )
    }

    if (!Object.hasOwn(variables, name)) {
      const known = Object.keys(variables)
      throw new Error(
        `unknown prompt variable "{{${name}}}" in ${sourceKind} "${sourceName}"; registered variables: ${known.length > 0 ? known.join(", ") : "(none)"}`,
      )
    }

    const value = variables[name]
    if (value === undefined) {
      throw new Error(
        `prompt variable "{{${name}}}" has no value for this assembly (${sourceKind} "${sourceName}")`,
      )
    }

    result += text.slice(last, open) + value
    last = open + group[0].length
  }
  return result + text.slice(last)
}

/** 单层作用域存储 */
class ScopeLayer {
  readonly sections = new Map<string, PromptSection>()
  readonly contexts = new Map<string, PromptContext>()
  readonly variables = new Map<string, VariableProvider>()
  readonly interceptors = new Map<string, PromptInterceptor>()

  isEmpty(): boolean {
    return (
      this.sections.size === 0 &&
      this.contexts.size === 0 &&
      this.variables.size === 0 &&
      this.interceptors.size === 0
    )
  }
}

/** 动态提示词管理器 */
export class SystemPromptManager {
  private readonly globalLayer = new ScopeLayer()
  private readonly scopes = new Map<string, ScopeLayer>()

  private getScopeLayer(scopeId?: string): ScopeLayer {
    if (!scopeId) return this.globalLayer
    let layer = this.scopes.get(scopeId)
    if (!layer) {
      layer = new ScopeLayer()
      this.scopes.set(scopeId, layer)
    }
    return layer
  }

  /** 注册提示词分段，返回取消注册的 Disposer */
  registerSection(section: PromptSection, scopeId?: string): () => void {
    if (!Number.isFinite(section.order)) {
      throw new TypeError(`prompt section "${section.name}" order must be a finite number`)
    }
    const layer = this.getScopeLayer(scopeId)
    layer.sections.set(section.name, section)
    return () => {
      if (layer.sections.get(section.name) === section) {
        layer.sections.delete(section.name)
        if (scopeId && layer.isEmpty()) {
          this.scopes.delete(scopeId)
        }
      }
    }
  }

  /** 注册动态运行时上下文条目 */
  registerContext(context: PromptContext, scopeId?: string): () => void {
    if (!Number.isFinite(context.order)) {
      throw new TypeError(`prompt context "${context.name}" order must be a finite number`)
    }
    const layer = this.getScopeLayer(scopeId)
    layer.contexts.set(context.name, context)
    return () => {
      if (layer.contexts.get(context.name) === context) {
        layer.contexts.delete(context.name)
        if (scopeId && layer.isEmpty()) {
          this.scopes.delete(scopeId)
        }
      }
    }
  }

  /** 注册变量提供者 */
  registerVariable(name: string, provider: VariableProvider, scopeId?: string): () => void {
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(
        `invalid prompt variable name "${name}" (must match ${String(VARIABLE_NAME)})`,
      )
    }
    const layer = this.getScopeLayer(scopeId)
    layer.variables.set(name, provider)
    return () => {
      if (layer.variables.get(name) === provider) {
        layer.variables.delete(name)
        if (scopeId && layer.isEmpty()) {
          this.scopes.delete(scopeId)
        }
      }
    }
  }

  /** 注册装配拦截器 */
  registerInterceptor(interceptor: PromptInterceptor, scopeId?: string): () => void {
    const layer = this.getScopeLayer(scopeId)
    layer.interceptors.set(interceptor.name, interceptor)
    return () => {
      if (layer.interceptors.get(interceptor.name) === interceptor) {
        layer.interceptors.delete(interceptor.name)
        if (scopeId && layer.isEmpty()) {
          this.scopes.delete(scopeId)
        }
      }
    }
  }

  /** 销毁指定作用域的所有注册 */
  clearScope(scopeId: string): void {
    this.scopes.delete(scopeId)
  }

  private resolveScopeLayers(sessionId?: string): ScopeLayer[] {
    const layers: ScopeLayer[] = [this.globalLayer]
    if (sessionId && this.scopes.has(sessionId)) {
      layers.push(this.scopes.get(sessionId)!)
    }
    return layers
  }

  /** 同步执行多层提示词装配（适用于纯同步 section / provider 场景） */
  assembleSync(context: AssembleContext = {}): PromptAssembly {
    const scopeLayers = this.resolveScopeLayers(context.sessionId)

    // 1. 收集并解析变量
    const resolvedVariables: Record<string, string | undefined> = {
      ...(context.variables ?? {}),
    }
    if (context.cwd && !resolvedVariables.cwd) {
      resolvedVariables.cwd = context.cwd
    }
    if (context.sessionId && !resolvedVariables.session_id) {
      resolvedVariables.session_id = context.sessionId
    }

    for (const layer of scopeLayers) {
      for (const [name, provider] of layer.variables.entries()) {
        const val =
          typeof provider === "function" ? (provider(context) as string | undefined) : provider
        resolvedVariables[name] = val
      }
    }

    // 2. 合并分段
    const mergedSections = new Map<string, PromptSection>()
    for (const layer of scopeLayers) {
      for (const [name, section] of layer.sections.entries()) {
        mergedSections.set(name, section)
      }
    }

    // 3. 合并上下文
    const mergedContexts = new Map<string, PromptContext>()
    for (const layer of scopeLayers) {
      for (const [name, ctx] of layer.contexts.entries()) {
        mergedContexts.set(name, ctx)
      }
    }

    // 4. 按 order 升序排序
    const sortedSections = Array.from(mergedSections.values()).sort((a, b) => a.order - b.order)
    const sortedContexts = Array.from(mergedContexts.values()).sort((a, b) => a.order - b.order)

    // 5. 检查 complete 独占段
    const completeSections = sortedSections.filter((s) => s.complete === true)
    if (completeSections.length > 1) {
      throw new Error(
        `multiple complete prompt sections are active: ${completeSections.map((s) => JSON.stringify(s.name)).join(", ")}`,
      )
    }

    // 6. 解析 section 文本
    const assembledSections: AssembledSection[] = []
    let completeSectionResult: AssembledSection | undefined

    for (const section of sortedSections) {
      const rawText =
        typeof section.text === "function" ? (section.text(context) as string) : section.text
      const text = (
        section.literal === true
          ? rawText
          : interpolateVariables(rawText, resolvedVariables, "section", section.name)
      ).trim()
      if (text.length > 0) {
        const item = { name: section.name, text }
        assembledSections.push(item)
        if (section.complete === true) {
          completeSectionResult = item
        }
      }
    }

    // 7. 解析 context 文本
    const assembledContexts: AssembledContext[] = []
    for (const ctx of sortedContexts) {
      const rawText = typeof ctx.text === "function" ? (ctx.text(context) as string) : ctx.text
      const text = (
        ctx.literal === true
          ? rawText
          : interpolateVariables(rawText, resolvedVariables, "context", ctx.name)
      ).trim()
      if (text.length > 0) {
        assembledContexts.push({ name: ctx.name, text })
      }
    }

    const effectiveSections = completeSectionResult ? [completeSectionResult] : assembledSections

    const allParts = [
      ...effectiveSections.map((s) => s.text),
      ...(completeSectionResult ? [] : assembledContexts.map((c) => c.text)),
    ]

    const rendered = allParts.join("\n\n")

    let assembly: PromptAssembly = {
      sections: effectiveSections,
      contexts: completeSectionResult ? [] : assembledContexts,
      variables: resolvedVariables,
      rendered,
    }

    // 8. 执行同步拦截器
    for (const layer of scopeLayers) {
      for (const interceptor of layer.interceptors.values()) {
        assembly = interceptor.apply(assembly, context) as PromptAssembly
      }
    }

    return assembly
  }

  /** 同步便捷渲染方法 */
  renderSync(context: AssembleContext = {}): string {
    return this.assembleSync(context).rendered
  }

  /** 异步执行多层提示词装配（支持 Promise / 异步 provider） */
  async assemble(context: AssembleContext = {}): Promise<PromptAssembly> {
    const scopeLayers = this.resolveScopeLayers(context.sessionId)

    // 1. 收集并解析变量（后作用域覆盖前作用域）
    const resolvedVariables: Record<string, string | undefined> = {
      ...(context.variables ?? {}),
    }

    // 内置默认变量
    if (context.cwd && !resolvedVariables.cwd) {
      resolvedVariables.cwd = context.cwd
    }
    if (context.sessionId && !resolvedVariables.session_id) {
      resolvedVariables.session_id = context.sessionId
    }

    for (const layer of scopeLayers) {
      for (const [name, provider] of layer.variables.entries()) {
        const val = typeof provider === "function" ? await provider(context) : provider
        resolvedVariables[name] = val
      }
    }

    // 2. 合并分段（Scoped sections 覆盖同名 Global sections）
    const mergedSections = new Map<string, PromptSection>()
    for (const layer of scopeLayers) {
      for (const [name, section] of layer.sections.entries()) {
        mergedSections.set(name, section)
      }
    }

    // 3. 合并上下文（Scoped contexts 覆盖同名 Global contexts）
    const mergedContexts = new Map<string, PromptContext>()
    for (const layer of scopeLayers) {
      for (const [name, ctx] of layer.contexts.entries()) {
        mergedContexts.set(name, ctx)
      }
    }

    // 4. 按 order 升序排序
    const sortedSections = Array.from(mergedSections.values()).sort((a, b) => a.order - b.order)
    const sortedContexts = Array.from(mergedContexts.values()).sort((a, b) => a.order - b.order)

    // 5. 检查 complete 独占段
    const completeSections = sortedSections.filter((s) => s.complete === true)
    if (completeSections.length > 1) {
      throw new Error(
        `multiple complete prompt sections are active: ${completeSections.map((s) => JSON.stringify(s.name)).join(", ")}`,
      )
    }

    // 6. 解析 section 文本
    const assembledSections: AssembledSection[] = []
    let completeSectionResult: AssembledSection | undefined

    for (const section of sortedSections) {
      const rawText =
        typeof section.text === "function" ? await section.text(context) : section.text
      const text = (
        section.literal === true
          ? rawText
          : interpolateVariables(rawText, resolvedVariables, "section", section.name)
      ).trim()
      if (text.length > 0) {
        const item = { name: section.name, text }
        assembledSections.push(item)
        if (section.complete === true) {
          completeSectionResult = item
        }
      }
    }

    // 7. 解析 context 文本
    const assembledContexts: AssembledContext[] = []
    for (const ctx of sortedContexts) {
      const rawText = typeof ctx.text === "function" ? await ctx.text(context) : ctx.text
      const text = (
        ctx.literal === true
          ? rawText
          : interpolateVariables(rawText, resolvedVariables, "context", ctx.name)
      ).trim()
      if (text.length > 0) {
        assembledContexts.push({ name: ctx.name, text })
      }
    }

    const effectiveSections = completeSectionResult ? [completeSectionResult] : assembledSections

    const allParts = [
      ...effectiveSections.map((s) => s.text),
      ...(completeSectionResult ? [] : assembledContexts.map((c) => c.text)),
    ]

    const rendered = allParts.join("\n\n")

    let assembly: PromptAssembly = {
      sections: effectiveSections,
      contexts: completeSectionResult ? [] : assembledContexts,
      variables: resolvedVariables,
      rendered,
    }

    // 8. 依次执行拦截器
    for (const layer of scopeLayers) {
      for (const interceptor of layer.interceptors.values()) {
        assembly = await interceptor.apply(assembly, context)
      }
    }

    return assembly
  }

  /** 便捷渲染方法：返回最终拼接的系统提示词字符串 */
  async render(context: AssembleContext = {}): Promise<string> {
    const assembly = await this.assemble(context)
    return assembly.rendered
  }
}

/** Minimal 协作模式系统提示词：严格 XML 结构独占段（身份 + 最小工具约定）。 */
export const MINIMAL_MODE_PROMPT = [
  '<collaboration_mode name="minimal">',
  "  <intent>You are a helpful software engineer assistant operating in Minimal Mode.</intent>",
  "  <available_tools>",
  "    Available tools: bash (terminal), read, write, edit. Use bash for directory listing, searching, and running commands; use read/write/edit for file contents.",
  "  </available_tools>",
  "  <guidelines>",
  "    <guideline>Prefer read over cat: it returns line-numbered output with paging, avoiding huge terminal dumps.</guideline>",
  "    <guideline>For long-running processes, use shell backgrounding (command &amp;) or a persistent shell session (the session parameter); the background flag is unavailable in this mode.</guideline>",
  "    <guideline>Run pwd first if the working directory is unclear.</guideline>",
  "  </guidelines>",
  "</collaboration_mode>",
].join("\n")

/** 创建带有 LX Agent 标准默认分层的提示词管理器 */
export function createDefaultSystemPromptManager(
  options: { defaultPersonality?: PersonalityName; userMemoryRoot?: string } = {},
): SystemPromptManager {
  const defaultPersonality = options.defaultPersonality ?? "pragmatic"
  const manager = new SystemPromptManager()

  // -100: 基础身份
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.IDENTITY,
    order: PROMPT_ORDERS.IDENTITY,
    text: [
      "<identity>",
      "  You are Yonah (also known as LX), an AI assistant that helps users work on local projects.",
      "</identity>",
    ].join("\n"),
  })

  // -50: 通用行为规范
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.BEHAVIOR,
    order: PROMPT_ORDERS.BEHAVIOR,
    text: DEFAULT_BEHAVIOR_PROMPT,
  })

  // 380: 协作模式 (Collaboration Mode: Build / Auto / Plan / Review / Design)
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.COLLABORATION_MODE,
    order: PROMPT_ORDERS.COLLABORATION_MODE,
    text: (ctx) =>
      buildCollaborationModePrompt(
        ctx.collaborationMode ?? "build",
        ctx.effectiveCollaborationMode ?? ctx.collaborationMode ?? "build",
      ),
  })

  // 380: Minimal 模式独占提示词（complete 段：仅 minimal 模式渲染，渲染时压掉其余全部 section 与 context）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.MINIMAL_MODE,
    order: PROMPT_ORDERS.COLLABORATION_MODE,
    complete: true,
    text: (ctx) => (ctx.collaborationMode === "minimal" ? MINIMAL_MODE_PROMPT : ""),
  })

  // 0: 核心操作规范与角色指导 (结合动态人格与操作规则)
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.PERSONA,
    order: PROMPT_ORDERS.PERSONA,
    text: (ctx) => {
      const personalityName = ctx.personality ?? defaultPersonality
      const personality = getPersonalityPrompt(personalityName)
      const persona = [`<persona name="${personalityName}">`, personality, "</persona>"].join("\n")
      const coreOps = [
        "<operating_principles>",
        "  <tool_usage>You may use tools to read, search, write, and edit files within the project directory, and execute commands in the project root.</tool_usage>",
        "  <modification_discipline>Read a file to confirm its content before modifying it; state your intent before executing commands with side effects.</modification_discipline>",
        "  <background_tasks>For long-running commands (e.g., starting a dev server, long builds, listener processes), use bash tool with background: true to run in the background rather than blocking synchronously. After starting a background task, use job_output to read logs non-blockingly, job_list to check task status, and job_kill to terminate unneeded tasks. Do not restart the same background command before the task completes.</background_tasks>",
        "  <language>Think by default in English. Output in the user's language when they specify a language, or when rendering tool content and plan output.</language>",
        "</operating_principles>",
      ].join("\n")
      return `${persona}\n\n${coreOps}`
    },
  })

  // 50: 模型自适应指令段（根据 ctx.modelId 注入对应模型家族的定制约束）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.MODEL_ADAPTIVE,
    order: PROMPT_ORDERS.MODEL_ADAPTIVE,
    text: (ctx) => {
      const family = detectModelFamily(ctx.modelId)
      return getModelAdaptiveInstructions(family)
    },
  })

  // 100: 技能分层（动态根据 context.activeSkills 生成，技能描述来自外部 SKILL.md，原样注入）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.SKILLS,
    order: PROMPT_ORDERS.SKILLS,
    literal: true,
    text: (ctx) => {
      if (!ctx.activeSkills || ctx.activeSkills.length === 0) return ""
      return formatSkillsForPrompt(ctx.activeSkills).trim()
    },
  })

  // 110: 代码检索 MCP 策略指引（仅注入已连接且被当前 agent 允许的 server）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.MCP_GUIDANCE,
    order: PROMPT_ORDERS.MCP_GUIDANCE,
    text: (ctx) => formatMcpGuidancePrompt(ctx.mcpServers ?? []),
  })

  // 200: 项目与用户指令文件（动态根据 context.cwd 加载，外部 AGENTS.md 原样注入）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.INSTRUCTIONS,
    order: PROMPT_ORDERS.INSTRUCTIONS,
    literal: true,
    text: (ctx) => {
      if (!ctx.cwd) return ""
      return formatInstructions(loadInstructions(ctx.cwd)).trim()
    },
  })

  // 250: 分层记忆（user/project 双作用域 XML 原文原样注入，指导语常驻）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.WORKSPACE_MEMORY,
    order: PROMPT_ORDERS.WORKSPACE_MEMORY,
    literal: true,
    text: (ctx) => {
      if (!ctx.cwd) return ""
      const stores = loadMemoryStores(ctx.cwd, { userRoot: options.userMemoryRoot })
      return formatMemoryPrompt(stores).trim()
    },
  })

  // 350: 环境上下文（动态渲染 <env> 块）
  manager.registerContext({
    name: PROMPT_SECTION_NAMES.ENVIRONMENT,
    order: PROMPT_ORDERS.ENVIRONMENT,
    text: (ctx) => {
      const vars = ctx.variables ?? {}
      const lines: string[] = ["<env>"]
      if (vars.cwd || ctx.cwd) {
        lines.push(`  Working directory: ${vars.cwd ?? ctx.cwd}`)
      }
      if (vars.repo_root) {
        lines.push(`  Workspace root folder: ${vars.repo_root}`)
      }
      if (vars.git_branch) {
        lines.push(`  Git branch: ${vars.git_branch}`)
      }
      if (vars.is_worktree === "true") {
        lines.push(`  Is git worktree: yes`)
      }
      if (vars.platform) {
        lines.push(`  Platform: ${vars.platform}`)
      }
      if (vars.date) {
        lines.push(`  Today's date: ${vars.date}`)
      }
      if (lines.length === 1) return ""
      lines.push("</env>")
      return lines.join("\n")
    },
  })

  // 355: 动态当前时间提醒（<current_time> 块）
  manager.registerContext({
    name: PROMPT_SECTION_NAMES.CURRENT_TIME,
    order: PROMPT_ORDERS.CURRENT_TIME,
    text: (ctx) => {
      if (ctx.currentTimeReminder) {
        return ctx.currentTimeReminder
      }
      const now = new Date()
      return `<current_time>\nUTC: ${now.toISOString()}\nLocal: ${now.toString()}\n</current_time>`
    },
  })

  // 358: 动态上下文容量感知与告警 Harness
  manager.registerContext({
    name: PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
    order: PROMPT_ORDERS.CONTEXT_WINDOW_GUIDANCE,
    text: (ctx) => {
      const usage = ctx.contextUsage
      if (!usage || !usage.contextWindow || usage.contextWindow <= 0) return ""
      const ratio = usage.tokens / usage.contextWindow
      if (ratio < 0.75) return ""

      const remaining = Math.max(0, usage.contextWindow - usage.tokens)
      const percent = Math.min(100, Math.round(ratio * 100))
      const isCritical = ratio >= 0.9

      if (isCritical) {
        return [
          `<context_window_guidance level="critical">`,
          `Current context window usage: ${percent}% (approx. ${remaining.toLocaleString()} tokens remaining out of ${usage.contextWindow.toLocaleString()}).`,
          `CRITICAL: You are near the maximum context capacity. Keep responses concise, finish immediate edits, and recommend the user run /compact to summarize history before further broad inquiries.`,
          `</context_window_guidance>`,
        ].join("\n")
      }

      return [
        `<context_window_guidance level="warning">`,
        `Current context window usage: ${percent}% (approx. ${remaining.toLocaleString()} tokens remaining out of ${usage.contextWindow.toLocaleString()}).`,
        `Guidance: You are approaching the context limit. Refrain from dumping large files or redundant grep outputs. Prefer surgical symbol lookups. If continuing a long task, consider completing the current sub-goal cleanly.`,
        `</context_window_guidance>`,
      ].join("\n")
    },
  })

  // 360: 沙箱策略约束上下文（动态渲染 <sandbox_policy> 块）
  manager.registerContext({
    name: PROMPT_SECTION_NAMES.SANDBOX_POLICY,
    order: PROMPT_ORDERS.SANDBOX_POLICY,
    text: (ctx) => {
      const policy = ctx.sandboxPolicy ?? "workspace-write"
      return formatSandboxPolicyPrompt(policy)
    },
  })

  return manager
}

/** 全局单例管理器 */
export const defaultSystemPromptManager = createDefaultSystemPromptManager()
