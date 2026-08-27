/**
 * 动态分层系统提示词管理器 (SystemPromptManager)
 *
 * 架构参考：deepseek-harness (@deepseek-ai/dsh-system-prompt) 与 pi-main
 * 提供有序系统片段、作用域覆盖 (Scope Overrides)、严格模板变量插值、运行时上下文快照与拦截器支持。
 */

import type { SandboxPolicy } from "@shared/contracts/agent"
import { formatInstructions, loadInstructions } from "../instructionLoader"
import { formatSkillsForPrompt, type LoadedSkill } from "../skills/skillLoader"
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
  INSTRUCTIONS: 200,
  RUNTIME_CONTEXT: 300,
  ENVIRONMENT: 350,
  SANDBOX_POLICY: 360,
  INTERCEPTOR: 400,
} as const

/** 标准系统提示词分段名称 */
export const PROMPT_SECTION_NAMES = {
  IDENTITY: "harness:identity",
  BEHAVIOR: "harness:behavior",
  PERSONA: "deployment:persona",
  MODEL_ADAPTIVE: "harness:model-adaptive",
  SKILLS: "agent:skills",
  INSTRUCTIONS: "agent:instructions",
  RUNTIME_CONTEXT: "agent:runtime-context",
  ENVIRONMENT: "agent:environment",
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
  activeSkills?: LoadedSkill[]
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
}

/** 动态运行时上下文输入 */
export interface PromptContext {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: AssembleContext) => string | Promise<string>)
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
      const text = interpolateVariables(rawText, resolvedVariables, "section", section.name).trim()
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
      const text = interpolateVariables(rawText, resolvedVariables, "context", ctx.name).trim()
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
      const text = interpolateVariables(rawText, resolvedVariables, "section", section.name).trim()
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
      const text = interpolateVariables(rawText, resolvedVariables, "context", ctx.name).trim()
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

/** 通用模型无关行为规范（对齐 Codex harness 行为层） */
export const DEFAULT_BEHAVIOR_PROMPT = [
  "# General Behavior Guidelines",
  "",
  "## Preamble",
  "- Before calling tools with side effects or complex operations, briefly state (1-2 sentences) what action you are about to take; related sequential actions should be combined into one statement; simple read-only operations need no explanation.",
  "- Build on prior context: connect dots with what has been done so far to maintain clarity for the user.",
  "",
  "## Task Planning",
  "- Skip planning for straightforward tasks (roughly the easiest 25-40%).",
  "- For multi-step tasks (>=2 steps, requiring tool calls), use the todowrite tool to establish a task list and update status in real time as progress is made; do not output single-step plans.",
  "- Mark tasks completed only after the required work and verification are done, never based on intent.",
  "",
  "## Ambition vs Precision",
  "- For brand new tasks with no prior context, be ambitious and creative.",
  "- When operating in an existing codebase, act with surgical precision: respect existing conventions, do not rename files/variables or perform gratuitous refactors unless explicitly asked.",
  "",
  "## Task Execution & Editing Constraints",
  "- Fix problems at the root cause rather than applying surface-level patches.",
  "- Avoid unneeded complexity; keep changes minimal and focused.",
  "- Default to ASCII when editing or creating files. Only introduce non-ASCII or Unicode characters when there is clear justification and the file already uses them.",
  "- For multi-file modifications, prefer apply_patch for atomic updates; single-point edits can use edit/write directly.",
  "- Before modifying files in a subdirectory, check if an AGENTS.md specification exists in that subtree and obey it.",
  "- DO NOT ADD ANY COMMENTS unless explicitly asked.",
  "",
  "## Sub-Agent & Orchestrator Guidelines",
  "- When delegating work via the task tool, prefer multiple sub-agents to parallelize work where time is a constraint.",
  "- If sub-agents are running, wait for them before yielding unless answering an explicit user question. Do not perform the sub-agent's work yourself while they are working.",
  "- If you expect a longer heads-down stretch, provide a brief heads-down note explaining why and when you will report back.",
  "",
  "## Verification Philosophy",
  "- After code changes, prioritize targeted verification most relevant to the modifications (e.g., lint, typecheck, or unit tests for modified files); avoid meaningless full repository verification; formatting iterations should be attempted at most 3 times; if you discover unrelated failing tests, do not fix them opportunistically, just objectively note them in your conclusion.",
  "",
  "## Safety Boundary & Dirty Worktrees",
  "- You may be in a dirty git worktree. NEVER revert existing changes you did not make unless explicitly requested.",
  "- Strictly prohibit executing destructive commands like `git reset --hard` or `git checkout --` without explicit user authorization.",
  "- While working, if you notice unexpected changes you did not make, stop immediately and ask the user how they would like to proceed.",
  "- Prefer non-interactive commands over interactive prompts.",
  "",
  "## Response Guidelines",
  "- Structure your answer to match task complexity. Keep responses minimal and high-signal by default; for substantial changes, state the solution first, then walk through key points.",
  "- Never use nested bullets. Keep lists flat (single level).",
  "- When suggesting next steps, use numbered lists (`1. 2. 3.`) so the user can quickly respond with a single number. Do not make suggestions if there are no natural next steps.",
  "- When referencing code or files, use the `path:line` format (e.g., `src/index.ts:42`).",
  "- For casual chit-chat, just chat naturally.",
  "",
  "## Reviews",
  "- When the user asks for a review, default to a code-review mindset. Prioritize identifying bugs, security risks, behavioral regressions, and missing tests. Present findings first, ordered by severity and including file and line references, followed by open questions or assumptions. State explicitly if no findings exist and note residual risks.",
  "",
  "## Frontend Design Tasks (Anti-AI-Slop)",
  "- When doing frontend design tasks, avoid collapsing into 'AI slop' or safe, average-looking layouts. Aim for interfaces that feel intentional, bold, and distinct.",
  "- Typography: Use expressive, purposeful fonts and avoid default system stacks (Inter, Roboto, Arial) unless explicitly requested.",
  "- Color & Look: Choose a clear visual direction; define CSS variables; avoid purple-on-white defaults or dark mode bias.",
  "- Motion: Use a few meaningful animations (page-load, staggered reveals) instead of generic micro-motions.",
  "- Background: Don't rely on flat, single-color backgrounds; use subtle gradients, shapes, or textures.",
  "- Responsiveness: Ensure layouts adapt properly across both desktop and mobile viewports.",
  "- Exception: If working within an existing website or design system, preserve established patterns, structure, and visual language.",
].join("\n")

/** 创建带有 LX Agent 标准默认分层的提示词管理器 */
export function createDefaultSystemPromptManager(
  options: { defaultPersonality?: PersonalityName } = {},
): SystemPromptManager {
  const defaultPersonality = options.defaultPersonality ?? "pragmatic"
  const manager = new SystemPromptManager()

  // -100: 基础身份
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.IDENTITY,
    order: PROMPT_ORDERS.IDENTITY,
    text: "You are LX Agent, an AI assistant that helps users work on local projects.",
  })

  // -50: 通用行为规范
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.BEHAVIOR,
    order: PROMPT_ORDERS.BEHAVIOR,
    text: DEFAULT_BEHAVIOR_PROMPT,
  })

  // 0: 核心操作规范与角色指导 (结合动态人格与操作规则)
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.PERSONA,
    order: PROMPT_ORDERS.PERSONA,
    text: (ctx) => {
      const personality = getPersonalityPrompt(ctx.personality ?? defaultPersonality)
      const coreOps = [
        "You may use tools to read, search, write, and edit files within the project directory, and execute commands in the project root.",
        "Read a file to confirm its content before modifying it; state your intent before executing commands with side effects.",
        "For long-running commands (e.g., starting a dev server, long builds, listener processes), use bash tool with background: true to run in the background rather than blocking synchronously.",
        "After starting a background task, use job_output to read logs non-blockingly, job_list to check task status, and job_kill to terminate unneeded tasks. Do not restart the same background command before the task completes.",
        "Think by default in English. Output in the user's language when they specify a language, or when rendering tool content and plan output.",
      ].join("\n")
      return `${personality}\n\n${coreOps}`
    },
  })

  // 50: 模型自适应指令段（根据 ctx.modelId 注入 GPT-5.2 Codex / Claude / Generic 定制约束）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.MODEL_ADAPTIVE,
    order: PROMPT_ORDERS.MODEL_ADAPTIVE,
    text: (ctx) => {
      const family = detectModelFamily(ctx.modelId)
      return getModelAdaptiveInstructions(family)
    },
  })

  // 100: 技能分层（动态根据 context.activeSkills 生成）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.SKILLS,
    order: PROMPT_ORDERS.SKILLS,
    text: (ctx) => {
      if (!ctx.activeSkills || ctx.activeSkills.length === 0) return ""
      return formatSkillsForPrompt(ctx.activeSkills).trim()
    },
  })

  // 200: 项目与用户指令文件（动态根据 context.cwd 加载）
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.INSTRUCTIONS,
    order: PROMPT_ORDERS.INSTRUCTIONS,
    text: (ctx) => {
      if (!ctx.cwd) return ""
      return formatInstructions(loadInstructions(ctx.cwd)).trim()
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
