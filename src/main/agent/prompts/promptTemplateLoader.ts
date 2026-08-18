import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import type { PromptTemplateItem } from "@shared/contracts/agent"
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
 * 从单文件读取并解析 Markdown 模板。
 */
function loadTemplateFromFile(
  filePath: string,
  source: "project" | "user",
): LoadedPromptTemplate | null {
  try {
    const raw = readFileSync(filePath, "utf8")
    const { data: frontmatter, content: body } = matter(raw)
    const name = basename(filePath).replace(/\.md$/, "")

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
      argumentHint = rawHint.trim()
    } else if (Array.isArray(rawHint)) {
      argumentHint = `[${rawHint.join(", ")}]`
    }

    return {
      name,
      description,
      argumentHint,
      content: body.trim(),
      source,
      filePath,
    }
  } catch {
    return null
  }
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
   * 加载当前环境下的全部 Prompt 模板：
   * 1. 全局：~/.lx/prompts/（user）
   * 2. 项目：<cwd>/.lx/prompts/ 或 <cwd>/.prompts/（project）
   * 冲突策略：Project Overrides User（项目级覆盖全局级）。
   */
  load(cwd?: string): LoadedPromptTemplate[] {
    const templateMap = new Map<string, LoadedPromptTemplate>()

    // 1. 加载全局（User）
    const globalDir = join(getAppDataRoot(), "prompts")
    const globalTemplates = loadTemplatesFromDir(globalDir, "user")
    for (const t of globalTemplates) {
      templateMap.set(t.name, t)
    }

    // 2. 加载项目（Project，优先级更高）
    if (cwd) {
      const projectLxDir = resolve(cwd, ".lx", "prompts")
      const projectDotDir = resolve(cwd, ".prompts")

      const projectTemplates = [
        ...loadTemplatesFromDir(projectDotDir, "project"),
        ...loadTemplatesFromDir(projectLxDir, "project"),
      ]

      for (const t of projectTemplates) {
        templateMap.set(t.name, t)
      }
    }

    return Array.from(templateMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * 转换为 IPC 传输条目列表。
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
