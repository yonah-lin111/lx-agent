/**
 * 动态分层系统提示词管理器 (SystemPromptManager)
 *
 * 架构参考：deepseek-harness (@deepseek-ai/dsh-system-prompt) 与 pi-main
 * 提供有序系统片段、作用域覆盖 (Scope Overrides)、严格模板变量插值、运行时上下文快照与拦截器支持。
 */

import { formatInstructions, loadInstructions } from "../instructionLoader"
import { formatSkillsForPrompt, type LoadedSkill } from "../skills/skillLoader"

/** 变量名称规范：小写字母开头，小写字母、数字及下划线组合 */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/

/** 匹配 {{...}} 组 */
const GROUP_AT = /^\{\{([^{}]*)\}\}/

/** 标准分层优先级常量（升序排列） */
export const PROMPT_ORDERS = {
  IDENTITY: -100,
  BEHAVIOR: -50,
  PERSONA: 0,
  SKILLS: 100,
  INSTRUCTIONS: 200,
  RUNTIME_CONTEXT: 300,
  ENVIRONMENT: 350,
  INTERCEPTOR: 400,
} as const

/** 标准系统提示词分段名称 */
export const PROMPT_SECTION_NAMES = {
  IDENTITY: "harness:identity",
  BEHAVIOR: "harness:behavior",
  PERSONA: "deployment:persona",
  SKILLS: "agent:skills",
  INSTRUCTIONS: "agent:instructions",
  RUNTIME_CONTEXT: "agent:runtime-context",
  ENVIRONMENT: "agent:environment",
  LSP_FEEDBACK: "agent:lsp-feedback",
} as const

/** 装配上下文 */
export interface AssembleContext {
  sessionId?: string
  cwd?: string
  signal?: AbortSignal
  activeSkills?: LoadedSkill[]
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

    const rendered = effectiveSections.map((s) => s.text).join("\n\n")

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

    const rendered = effectiveSections.map((s) => s.text).join("\n\n")

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
  "# 通用行为规范",
  "",
  "## 意图说明 (Preamble)",
  "- 在调用具有副作用或复杂操作的工具前，用 1-2 句简明说明即将执行的动作；相关的连续动作合并为一条说明；简单的单次读取不必多言。",
  "",
  "## 任务规划 (Plan)",
  "- 面对多步骤任务（≥2 步、需要工具调用）时，用 todowrite 工具建立任务清单并随进度即时更新状态；简单任务或闲聊跳过 todowrite，不输出单步计划。",
  "",
  "## 验证哲学 (Verification)",
  "- 代码修改后，优先执行与改动最相关的定向验证（如针对修改文件的 lint、typecheck 或单测），避免无意义的全量验证；格式化迭代最多尝试 3 次；发现既有不相关的失败测试不顺手修复，仅在结论中客观指出。",
  "",
  "## 安全边界 (Safety)",
  "- 绝不 revert 非自己做出的更改；严禁未经用户明确授权执行 `git reset --hard`、`git checkout --` 等破坏性命令；发现非预期的意外更改时立即停下询问用户。",
  "",
  "## 结果回复规范 (Response)",
  "- 默认保持极简；实质改动先给出一句话结论再展开要点；引用代码或文件时使用 `path:line` 格式（如 `src/index.ts:42`）；结尾可提供自然的下一步建议（无建议则不附带）。",
  "",
  "## 编辑约束 (Editing & Instructions)",
  "- 遵循最小修改原则，保持代码既有风格，不过度抽象，注释克制；触碰子目录文件前，应先检查该子树下是否存在 AGENTS.md 规范并予以遵守。",
].join("\n")

/** 创建带有 LX Agent 标准默认分层的提示词管理器 */
export function createDefaultSystemPromptManager(): SystemPromptManager {
  const manager = new SystemPromptManager()

  // -100: 基础身份
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.IDENTITY,
    order: PROMPT_ORDERS.IDENTITY,
    text: "你是 LX Agent，一个帮助用户在本地项目中工作的 AI 助手。",
  })

  // -50: 通用行为规范
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.BEHAVIOR,
    order: PROMPT_ORDERS.BEHAVIOR,
    text: DEFAULT_BEHAVIOR_PROMPT,
  })

  // 0: 核心操作规范与角色指导
  manager.registerSection({
    name: PROMPT_SECTION_NAMES.PERSONA,
    order: PROMPT_ORDERS.PERSONA,
    text: [
      "你可以使用工具读取、搜索、写入和编辑项目目录内的文件，并在项目根目录执行命令。",
      "修改文件前先读取确认目标内容；执行有副作用的命令前说明你的意图。",
      "面对长耗时命令（如启动开发服务器、长编译、监听进程），使用 bash 工具的 background: true 在后台运行，不要同步阻塞等待。",
      "后台任务启动后可使用 job_output 非阻塞读取日志，使用 job_list 查看任务状态，使用 job_kill 终止不需要的任务。在任务完成前不要重复启动相同的后台命令。",
      "回答使用简体中文，代码与专有名词保留原文。",
    ].join("\n"),
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

  return manager
}

/** 全局单例管理器 */
export const defaultSystemPromptManager = createDefaultSystemPromptManager()
