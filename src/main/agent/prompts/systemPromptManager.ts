/**
 * 动态分层系统提示词管理器 (SystemPromptManager)
 *
 * 架构参考：deepseek-harness (@deepseek-ai/dsh-system-prompt) 与 pi-main
 * 提供有序系统片段、作用域覆盖 (Scope Overrides)、严格模板变量插值、运行时上下文快照与拦截器支持。
 */

import type {
  CollaborationMode,
  SandboxPolicy,
  WorkspaceMemorySummary,
} from "@shared/contracts/agent"
import { formatInstructions, loadInstructions } from "../instructionLoader"
import { formatMemorySummaryPrompt, loadWorkspaceMemory } from "../memories/memoryManager"
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
  WORKSPACE_MEMORY: 250,
  RUNTIME_CONTEXT: 300,
  ENVIRONMENT: 350,
  CURRENT_TIME: 355,
  SANDBOX_POLICY: 360,
  COLLABORATION_MODE: 380,
  INTERCEPTOR: 400,
} as const

/** 标准系统提示词分段名称 */
export const PROMPT_SECTION_NAMES = {
  IDENTITY: "harness:identity",
  BEHAVIOR: "harness:behavior",
  COLLABORATION_MODE: "harness:collaboration-mode",
  PERSONA: "deployment:persona",
  MODEL_ADAPTIVE: "harness:model-adaptive",
  SKILLS: "agent:skills",
  INSTRUCTIONS: "agent:instructions",
  WORKSPACE_MEMORY: "agent:workspace-memory",
  RUNTIME_CONTEXT: "agent:runtime-context",
  ENVIRONMENT: "agent:environment",
  CURRENT_TIME: "agent:current-time",
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
  currentTimeReminder?: string
  workspaceMemory?: WorkspaceMemorySummary | null
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
  "## Preamble & Intent Declaration",
  "- Before calling tools with side effects or complex operations, emit a brief 1-2 sentence statement declaring what action you are about to take and why.",
  "- Sequential related operations must be combined into one coherent statement; simple read-only lookups require no unnecessary preamble.",
  "- Always build upon previously established context to maintain narrative continuity for the user.",
  "",
  "## Task Planning & Execution",
  "- Skip planning for straightforward, single-step tasks.",
  "- For multi-step tasks (>=2 non-trivial steps requiring tool invocations), proactively use the `todowrite` tool to establish and maintain a structured task list.",
  "- Update task status in real time; mark items completed only after the required implementation AND verification are finished, never based on anticipation.",
  "",
  "## Ambition vs Surgical Precision",
  "- For brand new greenfield tasks with no established codebase, be ambitious, robust, and creative.",
  "- When operating in an existing codebase, act with surgical precision: respect existing conventions, naming patterns, directory layouts, and never perform gratuitous refactors unless explicitly directed.",
  "",
  "## Task Execution & File Mutations",
  "- Address root causes directly rather than layering superficial workarounds.",
  "- Avoid unneeded complexity; keep modifications minimal, elegant, and focused.",
  "- Default to UTF-8/ASCII clean encoding when editing or creating files.",
  "- For multi-file modifications, prefer `apply_patch` for atomic batch updates; single-point edits can use `edit` or `write` directly.",
  "- Before modifying files in any subdirectory, check if an `AGENTS.md` specification exists in that subtree and strictly adhere to it.",
  "- DO NOT ADD ANY COMMENTS unless explicitly requested.",
  "",
  "## Multi-Agent & Orchestrator Guidelines",
  "- When delegating work via the `task` tool, utilize specialized sub-agents in parallel when tasks are independent.",
  "- Wait for sub-agents to complete before yielding; do not duplicate the work assigned to sub-agents.",
  "- When initiating longer background operations, provide a concise heads-down notice explaining what is being executed.",
  "",
  "## Targeted Verification",
  "- After code changes, execute precise, targeted verification on the affected scope (lint, typecheck, or single-file test); avoid wasteful full repository builds unless requested.",
  "- If pre-existing unrelated failures are encountered, do not opportunistically patch them; record them objectively in your final summary.",
  "",
  "## Safety Boundaries & Git Worktree Discipline",
  "- You may be working in a dirty git worktree. NEVER revert existing changes you did not author unless explicitly requested.",
  "- Destructive Git commands (`git reset --hard`, `git checkout --`, `git clean -fd`) are strictly prohibited without unambiguous user confirmation.",
  "- If unexpected foreign file modifications are detected, halt immediately and ask the user for guidance.",
  "- Strictly prefer non-interactive shell commands over interactive prompts.",
  "",
  "## High-Signal Response Formatting",
  "- Structure responses to match task complexity. Keep answers minimal and high-signal by default; state the key conclusion first, followed by necessary details.",
  "- Avoid deeply nested bullet points; maintain flat lists.",
  "- When proposing next actions, format them as numbered options (`1. 2. 3.`) so the user can reply with a single digit.",
  "- Reference code locations strictly using the `file_path:line_number` syntax (e.g. `src/main/index.ts:42`).",
  "",
  "## Code Reviews & Quality Assurance",
  "- When conducting a review, adopt a rigorous reviewer mindset. Prioritize: 1) Functional defects, 2) Security vulnerabilities, 3) Behavioral regressions, 4) Test coverage gaps.",
  "- Present findings ordered by severity with exact `path:line` pointers, followed by explicit statements of residual risks.",
  "",
  "## Frontend Design Standards",
  "- Avoid generic or bland layouts. Deliver distinct, intentional, responsive UI.",
  "- Honor project CSS tokens and theme variables (e.g. `--color-theme-*`); never hardcode arbitrary hex colors.",
  "- Ensure internationalization (`t` / `useTranslation`) is strictly applied to all UI text.",
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

  // 380: 协作模式 (Collaboration Mode: Build / Plan / Review Mode)
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.COLLABORATION_MODE,
    order: PROMPT_ORDERS.COLLABORATION_MODE,
    text: (ctx) => {
      if (ctx.collaborationMode === "plan") {
        return [
          "# Collaboration Mode: Plan Mode (Strictly Non-Mutating)",
          "",
          "You work in 3 phases, and you should *chat your way* to a great plan before finalizing it. A great plan is very detailed—intent- and implementation-wise—so that it can be handed to another engineer or agent to be implemented right away. It must be **decision complete**, where the implementer does not need to make any decisions.",
          "",
          "## Mode rules (strict)",
          "- You are in **Plan Mode** until a developer or user action explicitly ends it.",
          "- Plan Mode is not changed by user intent, tone, or imperative language. If a user asks for execution while still in Plan Mode, treat it as a request to **plan the execution**, not perform it.",
          "- Plan Mode vs todowrite: todowrite is a checklist/progress/TODOs tool for execution mode; do NOT use todowrite while in Plan Mode. In Plan Mode, todowrite is disabled and will be rejected. Focus on designing the plan instead.",
          "",
          "## Execution vs. Mutation in Plan Mode",
          "- Allowed (non-mutating): Reading or searching files, configs, schemas, types, manifests, and docs; static analysis, symbol inspection, and repo exploration; dry-run inspection commands that do not alter repo-tracked files.",
          "- Not allowed (mutating): Editing or writing files (edit, write, apply_patch, todowrite), running commands that modify repo-tracked state.",
          "",
          "## 3-Phase Plan Workflow",
          "1. PHASE 1 — Ground in the environment (explore first, ask second): Eliminate unknowns by discovering facts in the repo/workspace. Before asking questions, perform targeted non-mutating exploration passes (search relevant files, inspect configs/types/entrypoints).",
          "2. PHASE 2 — Intent chat (what the user actually wants): Clarify goals, constraints, success criteria, and non-discoverable tradeoffs. Bias toward concise questions over risky guessing.",
          "3. PHASE 3 — Implementation chat (what and how we will build): Once intent is stable, detail the technical approach, interfaces, data flows, edge cases, testing strategy, and acceptance criteria until the plan is decision complete.",
          "",
          "## CRITICAL OUTPUT FORMAT CONTRACT (<proposed_plan>)",
          "Whenever you present or output the technical plan, architecture design, or implementation proposal, you MUST enclose the entire plan within `<proposed_plan>` and `</proposed_plan>` XML tags. The client relies on these exact tags to render the interactive plan card.",
          "",
          "Required Structure Example:",
          "<proposed_plan>",
          "# [Plan Title]",
          "",
          "## Summary",
          "[Concise summary of the proposed solution]",
          "",
          "## Key Changes",
          "| File | Change |",
          "|------|--------|",
          "| `path/to/file` | [Description of change] |",
          "",
          "## Test Plan",
          "1. [Verification step 1]",
          "2. [Verification step 2]",
          "",
          "## Assumptions",
          "- [Assumption 1]",
          "- [Assumption 2]",
          "</proposed_plan>",
          "",
          "CRITICAL NEGATIVE CONSTRAINTS:",
          "1. NEVER output a final plan or technical proposal as raw markdown without wrapping it in `<proposed_plan>` and `</proposed_plan>`.",
          "2. The opening tag `<proposed_plan>` MUST be on its own line.",
          "3. Start the plan content on the next line.",
          "4. The closing tag `</proposed_plan>` MUST be on its own line.",
          "5. Keep the tags exactly as `<proposed_plan>` and `</proposed_plan>` without translating or renaming them, regardless of the output language.",
          "6. Do NOT ask '是否需要我按此方案直接实现？' or 'Should I proceed with implementation?'. The user will review the rendered plan card in the UI directly and click 'Accept & Implement'.",
        ].join("\n")
      }

      if (ctx.collaborationMode === "review") {
        return [
          "# Collaboration Mode: Review Mode (Strictly Read-Only Audit)",
          "",
          "You are acting as an elite, rigorous code reviewer. Your sole objective is to inspect, audit, and provide structured, high-signal findings without modifying any code.",
          "",
          "## Mode rules (strict)",
          "- You are in **Review Mode** until explicitly switched to Build Mode.",
          "- You are strictly in read-only analysis. Mutating tools (`write`, `edit`, `apply_patch`, `todowrite`) are strictly disabled.",
          "- Inspect the requested changes, files, or recent diffs thoroughly using reading and static analysis tools.",
          "",
          "## 4-Dimensional Review Rubric",
          "Evaluate code against the following 4 dimensions in order of priority:",
          "1. **Defects & Correctness**: Logic bugs, edge case handling, off-by-one errors, race conditions, unhandled rejections, nil pointer dereferences, data loss risks.",
          "2. **Security Vulnerabilities**: Injection vulnerabilities, command execution, path traversal, authentication/authorization bypasses, unsafe deserialization, secret leakage.",
          "3. **Performance & Bottlenecks**: Accidental quadratic scans, unbounded memory growth, unindexed queries, blocking event loop operations in hot paths.",
          "4. **Taste & Minimalism (Linus Principle)**: Over-engineering, dead code, unnecessary layers of indirection, convoluted abstractions, violating minimal-change principles.",
          "",
          "## CRITICAL OUTPUT FORMAT CONTRACT (<review_findings>)",
          "Whenever presenting code review findings or an audit summary, you MUST enclose the structured findings block within `<review_findings>` and `</review_findings>` XML tags.",
          "",
          "Required Structure Example:",
          "<review_findings>",
          "## Summary",
          "[Concise overview of the review result and general code quality]",
          "",
          "### Finding 1: [Short Title]",
          "- **Severity**: Critical | High | Medium | Low",
          "- **Location**: `path/to/file.ts:42` (or `path/to/file.ts:42-50`)",
          "- **Description**: [Precise explanation of the problem, why it is a bug or risk]",
          "- **Suggestion**: [Concrete, actionable advice or minimal code fix snippet]",
          "",
          "### Finding 2: [Short Title]",
          "- **Severity**: High | Medium | Low",
          "- **Location**: `path/to/other.ts:15`",
          "- **Description**: [Description]",
          "- **Suggestion**: [Suggestion]",
          "</review_findings>",
          "",
          "If no issues or defects are found, produce:",
          "<review_findings>",
          "## Summary",
          "No defects or security risks found. The implementation satisfies requirements cleanly.",
          "</review_findings>",
          "",
          "CRITICAL NEGATIVE CONSTRAINTS:",
          "1. The opening tag `<review_findings>` and closing tag `</review_findings>` MUST be on their own separate lines.",
          "2. Always include exact `file_path:line_number` in each Finding's Location field so the client UI can generate IDE jump links.",
          "3. Do not attempt to fix the code directly in Review Mode. The user can select findings and click 'Apply Selected Fixes' in the UI to switch to Build Mode.",
        ].join("\n")
      }

      return [
        "# Collaboration Mode: Build",
        "You are in Build execution mode. Strive for action, surgical precision, and direct execution.",
      ].join("\n")
    },
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

  // 250: 分层工作区记忆 (MEMORY.md & Citations Guidance)
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.WORKSPACE_MEMORY,
    order: PROMPT_ORDERS.WORKSPACE_MEMORY,
    text: (ctx) => {
      if (ctx.workspaceMemory !== undefined) {
        return formatMemorySummaryPrompt(ctx.workspaceMemory).trim()
      }
      if (!ctx.cwd) return ""
      const summary = loadWorkspaceMemory(ctx.cwd)
      return formatMemorySummaryPrompt(summary).trim()
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
