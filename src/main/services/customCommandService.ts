import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type {
  CustomCommandDetailItem,
  CustomCommandScope,
  CustomCommandType,
  DeleteCustomCommandInput,
  ListCustomCommandsInput,
  SaveCustomCommandInput,
} from "@shared/contracts/customCommand"
import { getAppDataRoot } from "@/paths"
import {
  loadMarkdownCommandFromFile,
  loadTemplateFromFile,
  RESERVED_COMMANDS,
} from "../agent/prompts/promptTemplateLoader"

export class CustomCommandService {
  private getTargetDir(
    type: CustomCommandType,
    scope: CustomCommandScope,
    projectPath?: string,
  ): string {
    if (scope === "user") {
      return join(getAppDataRoot(), "command", type)
    }
    if (!projectPath || !projectPath.trim()) {
      throw new Error("Project path is required for project-scoped commands.")
    }
    return resolve(projectPath.trim(), ".lx", "command", type)
  }

  private validateName(name: string): void {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error("Command name cannot be empty.")
    }
    if (RESERVED_COMMANDS.has(trimmed) || trimmed.startsWith("skill:")) {
      throw new Error(`Command name "${trimmed}" is reserved.`)
    }
    // 允许字母、数字、下划线、短横线
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new Error("Command name can only contain letters, numbers, hyphens, and underscores.")
    }
  }

  list(input: ListCustomCommandsInput = {}): CustomCommandDetailItem[] {
    const { type, scope, projectPath } = input
    const typesToScan: CustomCommandType[] = type ? [type] : ["agentInput", "agentMD"]
    const scopesToScan: CustomCommandScope[] = scope
      ? [scope]
      : projectPath
        ? ["user", "project"]
        : ["user"]

    const results: CustomCommandDetailItem[] = []

    for (const curType of typesToScan) {
      for (const curScope of scopesToScan) {
        if (curScope === "project" && (!projectPath || !projectPath.trim())) {
          continue
        }

        try {
          const dir = this.getTargetDir(curType, curScope, projectPath)
          if (!existsSync(dir)) continue

          const entries = readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".md")) continue
            const fullPath = join(dir, entry.name)

            if (curType === "agentInput") {
              const loaded = loadTemplateFromFile(fullPath, curScope)
              if (loaded) {
                results.push({
                  name: loaded.name,
                  type: "agentInput",
                  scope: curScope,
                  filePath: fullPath,
                  description: loaded.description,
                  content: loaded.content,
                  argumentHint: loaded.argumentHint,
                })
              }
            } else {
              const loaded = loadMarkdownCommandFromFile(fullPath, curScope)
              if (loaded) {
                results.push({
                  name: loaded.name,
                  type: "agentMD",
                  scope: curScope,
                  filePath: fullPath,
                  description: loaded.description,
                  content: loaded.content,
                  mdScope: loaded.scope,
                })
              }
            }
          }
        } catch (err) {
          console.warn(
            `[CustomCommandService] Error listing commands for ${curType} in ${curScope}:`,
            err,
          )
        }
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  save(input: SaveCustomCommandInput): CustomCommandDetailItem {
    const { type, scope, projectPath, oldName, name, description, content, argumentHint, mdScope } =
      input
    this.validateName(name)

    const targetDir = this.getTargetDir(type, scope, projectPath)
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    // 如果是重命名或修改原有名称，删除旧文件
    if (oldName && oldName.trim() && oldName.trim() !== name.trim()) {
      const oldFile = join(targetDir, `${oldName.trim()}.md`)
      if (existsSync(oldFile)) {
        try {
          unlinkSync(oldFile)
        } catch {
          // ignore
        }
      }
    }

    const targetFile = join(targetDir, `${name.trim()}.md`)

    const normalizedContent = (content || "").replace(/^\r?\n+/, "").trimEnd()

    // 组装 frontmatter
    const lines: string[] = ["---"]
    lines.push(`description: ${JSON.stringify(description.trim())}`)

    if (type === "agentInput") {
      if (argumentHint && argumentHint.trim()) {
        lines.push(`argument-hint: ${JSON.stringify(argumentHint.trim())}`)
      }
    } else {
      lines.push(`scope: ${mdScope === "template" ? "template" : "global"}`)
    }
    lines.push("---")
    lines.push("")
    lines.push(normalizedContent)
    lines.push("")

    writeFileSync(targetFile, lines.join("\n"), "utf8")

    return {
      name: name.trim(),
      type,
      scope,
      filePath: targetFile,
      description: description.trim(),
      content: normalizedContent,
      argumentHint: argumentHint?.trim(),
      mdScope: type === "agentMD" ? (mdScope === "template" ? "template" : "global") : undefined,
    }
  }

  delete(input: DeleteCustomCommandInput): void {
    const { type, scope, name, projectPath } = input
    const targetDir = this.getTargetDir(type, scope, projectPath)
    const targetFile = join(targetDir, `${name.trim()}.md`)

    if (existsSync(targetFile)) {
      unlinkSync(targetFile)
    }
  }
}

export const customCommandService = new CustomCommandService()
