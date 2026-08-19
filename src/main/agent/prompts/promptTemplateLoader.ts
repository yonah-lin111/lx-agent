import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import type { PromptTemplateItem } from "@shared/contracts/agent"
import type { MarkdownCommandScope, MarkdownTemplateCommandItem } from "@shared/contracts/markdown"
import matter from "gray-matter"
import { getAppDataRoot } from "@/paths"

// 已加载的 Prompt 模板对象（含正文与来源元信息）。
export interface LoadedPromptTemplate {
  name: string
  description: string
  argumentHint?: string
  content: string
  source: "project" | "user"
  filePath: string
}

// 已加载的 Markdown 模板命令对象。
export interface LoadedMarkdownTemplateCommand {
  name: string
  description: string
  content: string
  scope: MarkdownCommandScope
  source: "project" | "user"
  filePath: string
}

// 排除的内置命令及前缀（避免与内置 slash 命令冲突）。
const RESERVED_COMMANDS = new Set([
  "clear",
  "new",
  "undo",
  "steer",
  "model",
  "gitWorktree",
  "compact",
  "export",
])

/**
 * 解析 bash 风格参数字符串（支持单双引号包裹的空格内容与转义字符）。
 */
export function parseCommandArgs(argsString: string): string[] {
  const args: string[] = []
  let current = ""
  let inQuote: string | null = null
  let escapeNext = false

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i]

    if (escapeNext) {
      current += char
      escapeNext = false
      continue
    }

    if (char === "\\") {
      escapeNext = true
      continue
    }

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuote = char
    } else if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }

  if (current) {
    args.push(current)
  }

  return args
}

/**
 * 替换模板中的参数占位符（对齐 pi-main 语法）：
 * - $1, $2, ...：位置参数
 * - $@ 与 $ARGUMENTS：全部参数（空格拼接）
 * - ${N:-default}：位置参数缺省默认值
 * - ${@:-default} 与 ${ARGUMENTS:-default}：全部参数缺省默认值
 * - ${@:N}：从第 N 个参数开始切片（1-based）
 * - ${@:N:L}：从第 N 个参数开始取 L 个
 */
export function substituteArgs(content: string, args: string[]): string {
  const allArgs = args.join(" ")

  return content.replace(
    /\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_match, defaultTarget, defaultValue, sliceStart, sliceLength, simple) => {
      if (defaultTarget) {
        const value =
          defaultTarget === "@" || defaultTarget === "ARGUMENTS"
            ? allArgs
            : args[Number.parseInt(defaultTarget, 10) - 1]
        return value ? value : defaultValue
      }

      if (sliceStart) {
        let start = Number.parseInt(sliceStart, 10) - 1
        if (start < 0) start = 0

        if (sliceLength) {
          const length = Number.parseInt(sliceLength, 10)
          return args.slice(start, start + length).join(" ")
        }
        return args.slice(start).join(" ")
      }

      if (simple === "ARGUMENTS" || simple === "@") {
        return allArgs
      }

      const index = Number.parseInt(simple, 10) - 1
      return args[index] ?? ""
    },
  )
}

/**
 * 从模板正文中推断参数占位符提示：
 * - 查找 $1, $2 ... 或 ${1:-default}
 * - 查找 $@ 或 $ARGUMENTS
 */
export function inferArgumentHint(content: string): string | undefined {
  const numberedMatches = Array.from(content.matchAll(/\$\{(\d+)(?::-([^}]*))?\}|\$(\d+)/g))
  if (numberedMatches.length > 0) {
    const argMap = new Map<number, string>()
    for (const match of numberedMatches) {
      const num = Number.parseInt(match[1] || match[3], 10)
      const defaultValue = match[2]
      if (num > 0) {
        if (!argMap.has(num) || defaultValue) {
          argMap.set(num, defaultValue ? defaultValue : `arg${num}`)
        }
      }
    }
    const maxNum = Math.max(...Array.from(argMap.keys()))
    const parts: string[] = []
    for (let i = 1; i <= maxNum; i++) {
      const name = argMap.get(i) || `arg${i}`
      parts.push(name.startsWith("[") ? name : `[${name}]`)
    }
    return parts.join(" ")
  }

  if (/\$(ARGUMENTS|@)|\$\{(ARGUMENTS|@)(?::-([^}]*))?\}/.test(content)) {
    return "[arguments]"
  }

  return undefined
}

/**
 * 健壮解析 frontmatter，支持非标准 YAML 格式（如未加引号的 argument-hint: [content] [title]）。
 */
export function parseFrontmatterSafely(fileContent: string): {
  frontmatter: Record<string, unknown>
  content: string
} {
  try {
    const parsed = matter(fileContent)
    if (parsed && parsed.data && Object.keys(parsed.data).length > 0) {
      return { frontmatter: parsed.data, content: parsed.content || "" }
    }
  } catch {
    // gray-matter 遇到非严格 YAML 时降级到正则行解析
  }

  // 手动提取 --- 包裹的 frontmatter 区块
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, content: fileContent }
  }

  const rawYaml = match[1]
  const body = match[2]
  const data: Record<string, unknown> = {}

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    let value = trimmed.slice(colonIdx + 1).trim()

    // 去除外层引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim()
    }

    data[key] = value
  }

  return { frontmatter: data, content: body }
}

/**
 * 从单个 .md 文件加载并解析 Prompt 模板。
 */
export function loadTemplateFromFile(
  filePath: string,
  source: "project" | "user",
): LoadedPromptTemplate | null {
  try {
    const fileContent = readFileSync(filePath, "utf8")
    const { frontmatter, content: body } = parseFrontmatterSafely(fileContent)

    const name = (frontmatter.name ? String(frontmatter.name) : basename(filePath, ".md")).trim()
    if (!name || RESERVED_COMMANDS.has(name) || name.startsWith("skill:")) {
      return null
    }

    let description = ""
    if (typeof frontmatter.description === "string" && frontmatter.description.trim()) {
      description = frontmatter.description.trim()
    } else {
      const firstLine = body.split("\n").find((line) => line.trim())
      if (firstLine) {
        description = firstLine.trim().slice(0, 60)
        if (firstLine.length > 60) description += "..."
      }
    }

    let argumentHint: string | undefined
    const rawHint = frontmatter["argument-hint"] ?? frontmatter.argumentHint
    if (typeof rawHint === "string" && rawHint.trim()) {
      const trimmedHint = rawHint.trim()
      if (trimmedHint.includes(",") && !trimmedHint.startsWith("[")) {
        argumentHint = trimmedHint
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => (s.startsWith("[") ? s : `[${s}]`))
          .join(" ")
      } else if (!trimmedHint.startsWith("[") && !trimmedHint.includes(" ")) {
        argumentHint = `[${trimmedHint}]`
      } else {
        argumentHint = trimmedHint
      }
    } else if (Array.isArray(rawHint)) {
      argumentHint = rawHint
        .map((h) => (String(h).startsWith("[") ? String(h) : `[${h}]`))
        .join(" ")
    } else {
      argumentHint = inferArgumentHint(body)
    }

    return {
      name,
      description,
      argumentHint,
      content: body.replace(/^\r?\n+/, "").trimEnd(),
      source,
      filePath,
    }
  } catch {
    return null
  }
}

/**
 * 从单个 .md 文件加载并解析 Markdown 模板命令。
 */
export function loadMarkdownCommandFromFile(
  filePath: string,
  source: "project" | "user",
): LoadedMarkdownTemplateCommand | null {
  try {
    const fileContent = readFileSync(filePath, "utf8")
    const { frontmatter, content: body } = parseFrontmatterSafely(fileContent)

    const name = (frontmatter.name ? String(frontmatter.name) : basename(filePath, ".md")).trim()
    if (!name || RESERVED_COMMANDS.has(name) || name.startsWith("skill:")) {
      return null
    }

    let description = ""
    if (typeof frontmatter.description === "string" && frontmatter.description.trim()) {
      description = frontmatter.description.trim()
    } else {
      const firstLine = body.split("\n").find((line) => line.trim())
      if (firstLine) {
        description = firstLine.trim().slice(0, 60)
        if (firstLine.length > 60) description += "..."
      }
    }

    const scope: MarkdownCommandScope =
      frontmatter.scope === "template" ? "template" : "global"

    return {
      name,
      description,
      content: body.replace(/^\r?\n+/, "").trimEnd(),
      scope,
      source,
      filePath,
    }
  } catch {
    return null
  }
}

/**
 * 扫描指定目录下的 Markdown 模板命令 .md 文件（非递归）。
 */
function loadMarkdownCommandsFromDir(
  dir: string,
  source: "project" | "user",
): LoadedMarkdownTemplateCommand[] {
  const commands: LoadedMarkdownTemplateCommand[] = []
  if (!existsSync(dir)) return commands

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      let isFile = entry.isFile()

      if (entry.isSymbolicLink()) {
        try {
          isFile = statSync(fullPath).isFile()
        } catch {
          continue
        }
      }

      if (isFile && entry.name.endsWith(".md")) {
        const cmd = loadMarkdownCommandFromFile(fullPath, source)
        if (cmd) {
          commands.push(cmd)
        }
      }
    }
  } catch {
    return commands
  }

  return commands
}

/**
 * 扫描指定目录下的 .md 模板文件（非递归）。
 */
function loadTemplatesFromDir(dir: string, source: "project" | "user"): LoadedPromptTemplate[] {
  const templates: LoadedPromptTemplate[] = []
  if (!existsSync(dir)) return templates

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      let isFile = entry.isFile()

      if (entry.isSymbolicLink()) {
        try {
          isFile = statSync(fullPath).isFile()
        } catch {
          continue
        }
      }

      if (isFile && entry.name.endsWith(".md")) {
        const template = loadTemplateFromFile(fullPath, source)
        if (template) {
          templates.push(template)
        }
      }
    }
  } catch {
    return templates
  }

  return templates
}

export class PromptTemplateLoader {
  /**
   * 加载当前环境下的全部 Prompt 模板（用于 AgentInput 对话输入框）：
   * 1. 全局：~/.lx/command/agentInput/（优先）或 ~/.lx/prompts/（user）
   * 2. 项目：<cwd>/.lx/command/agentInput/（优先）、<cwd>/.lx/prompts/ 或 <cwd>/.prompts/（project）
   * 冲突策略：Project Overrides User（项目级覆盖全局级）。
   */
  load(cwd?: string): LoadedPromptTemplate[] {
    const templateMap = new Map<string, LoadedPromptTemplate>()

    // 1. 加载全局（User）
    const legacyGlobalDir = join(getAppDataRoot(), "prompts")
    const newGlobalDir = join(getAppDataRoot(), "command", "agentInput")
    const globalTemplates = [
      ...loadTemplatesFromDir(legacyGlobalDir, "user"),
      ...loadTemplatesFromDir(newGlobalDir, "user"),
    ]
    for (const t of globalTemplates) {
      templateMap.set(t.name, t)
    }

    // 2. 加载项目（Project，优先级更高）
    if (cwd) {
      const legacyProjectLxDir = resolve(cwd, ".lx", "prompts")
      const legacyProjectDotDir = resolve(cwd, ".prompts")
      const newProjectCommandDir = resolve(cwd, ".lx", "command", "agentInput")

      const projectTemplates = [
        ...loadTemplatesFromDir(legacyProjectDotDir, "project"),
        ...loadTemplatesFromDir(legacyProjectLxDir, "project"),
        ...loadTemplatesFromDir(newProjectCommandDir, "project"),
      ]

      for (const t of projectTemplates) {
        templateMap.set(t.name, t)
      }
    }

    return Array.from(templateMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * 加载当前环境下的全部 Markdown 模板命令（用于 Markdown 文档编辑器）：
   * 1. 全局：~/.lx/command/agentMD/（user）
   * 2. 项目：<cwd>/.lx/command/agentMD/（project）
   * 冲突策略：Project Overrides User（项目级覆盖全局级）。
   */
  loadMarkdownCommands(cwd?: string): LoadedMarkdownTemplateCommand[] {
    const commandMap = new Map<string, LoadedMarkdownTemplateCommand>()

    // 1. 加载全局（User）
    const globalDir = join(getAppDataRoot(), "command", "agentMD")
    const globalCommands = loadMarkdownCommandsFromDir(globalDir, "user")
    for (const cmd of globalCommands) {
      commandMap.set(cmd.name, cmd)
    }

    // 2. 加载项目（Project，优先级更高）
    if (cwd) {
      const projectDir = resolve(cwd, ".lx", "command", "agentMD")
      const projectCommands = loadMarkdownCommandsFromDir(projectDir, "project")
      for (const cmd of projectCommands) {
        commandMap.set(cmd.name, cmd)
      }
    }

    return Array.from(commandMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * 转换为 IPC 传输条目列表（Agent 对话框）。
   */
  list(cwd?: string): PromptTemplateItem[] {
    return this.load(cwd).map((t) => ({
      name: t.name,
      description: t.description,
      argumentHint: t.argumentHint,
      source: t.source,
      filePath: t.filePath,
    }))
  }

  /**
   * 转换为 IPC 传输条目列表（Markdown 编辑器）。
   */
  listMarkdownCommands(cwd?: string): MarkdownTemplateCommandItem[] {
    return this.loadMarkdownCommands(cwd).map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      content: cmd.content,
      scope: cmd.scope,
      source: cmd.source,
      filePath: cmd.filePath,
    }))
  }

  /**
   * 匹配文本中的模板调用：
   * 若 text 以 /<template_name> 开头（且不是保留命令或 /skill:），返回匹配到的模板对象、解析参数与宏替换后的文本。
   */
  match(
    text: string,
    cwd?: string,
  ): { template: LoadedPromptTemplate; args: string[]; expanded: string } | null {
    if (!text.startsWith("/") || text.startsWith("/skill:")) return null

    const matched = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/)
    if (!matched) return null

    const commandName = matched[1]
    if (RESERVED_COMMANDS.has(commandName)) return null

    const argsString = matched[2] ?? ""
    const templates = this.load(cwd)
    const template = templates.find((t) => t.name === commandName)

    if (template) {
      const args = parseCommandArgs(argsString)
      const expanded = substituteArgs(template.content, args)
      return { template, args, expanded }
    }

    return null
  }

  /**
   * 展开文本中的模板调用：
   * 若 text 以 /<template_name> 开头（且不是保留命令或 /skill:），则执行参数解析与宏替换。
   */
  expand(text: string, cwd?: string): string {
    const matched = this.match(text, cwd)
    return matched ? matched.expanded : text
  }
}

// 进程级单例
export const promptTemplateLoader = new PromptTemplateLoader()
