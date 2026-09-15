import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { TodoList, TodoStateMessage, UserMessageCommand } from "@shared/contracts/agent"
import { getSkillSettings } from "@/services/settingsService"
import { getAppDataRoot } from "../paths"
import { MAX_INJECTED_SKILLS } from "./assembly"
import { mcpManager } from "./mcp/mcpManager"
import { promptTemplateLoader } from "./prompts/promptTemplateLoader"
import {
  extractSkillMentions,
  type LoadedSkill,
  skillLoader,
  stripFrontmatter,
} from "./skills/skillLoader"
import type { AttachedFile } from "./turnStore"

// 附件文件名消毒：仅保留最后一段路径（剥离分隔符与 ..），非法名返回 undefined。
const sanitizeAttachmentName = (name: string): string | undefined => {
  const base = name
    .split(/[\\/]+/)
    .filter(Boolean)
    .pop()
  if (!base || base === "." || base === "..") return undefined
  return base
}

// 把待发送附件复制到会话附件目录（按类型分目录），非法名跳过、失败不中断发送。
export const processPendingFiles = (sessionId: string, files: AttachedFile[]): AttachedFile[] => {
  const copied: AttachedFile[] = []
  const sessionDir = join(getAppDataRoot(), "session", sessionId)

  for (const file of files) {
    const safeName = sanitizeAttachmentName(file.name)
    if (!safeName) {
      console.warn(`Skipped attachment with invalid file name: "${file.name}"`)
      continue
    }

    const subFolder = file.type === "image" ? "image" : "text"
    const destFolder = join(sessionDir, subFolder)

    if (!existsSync(destFolder)) {
      mkdirSync(destFolder, { recursive: true })
    }

    const destPath = join(destFolder, safeName)
    try {
      copyFileSync(file.path, destPath)
      copied.push({
        name: safeName,
        path: destPath,
        type: file.type,
        size: file.size,
        extension: file.extension,
      })
    } catch (err) {
      console.error(`Failed to copy attachment file: ${file.path} to ${destPath}`, err)
    }
  }
  return copied
}

// 构造任务清单状态消息（transformContext 注入；不进 state.messages）。
export const createTodoStateMessage = (todos: TodoList): TodoStateMessage => ({
  role: "todoState",
  todos,
  timestamp: Date.now(),
})

// 当前已连接的 MCP 工具全名列表。
export const resolveMcpTools = (): string[] =>
  mcpManager.getTools().map((handle) => handle.fullName)

// 解析注入到系统提示的技能列表：排除禁用与不可模型调用项，按名称排序后按上限截断。
export const resolveInjectedSkills = (cwd: string): LoadedSkill[] => {
  const disabledSkills = new Set(getSkillSettings().disabled)
  const available = skillLoader
    .load(cwd)
    .filter((skill) => !skill.disableModelInvocation && !disabledSkills.has(skill.name))
  return [...available].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_INJECTED_SKILLS)
}

// 组装单个技能的提示块（含 MCP 依赖缺失告警）。
const buildSkillPromptBlock = (skill: LoadedSkill): string => {
  const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim()
  let mcpNote = ""
  if (skill.dependencies?.tools) {
    const mcpTools = skill.dependencies.tools.filter((t) => t.type.toLowerCase() === "mcp")
    if (mcpTools.length > 0) {
      const connectedServers = new Set(
        mcpManager
          .getStatus()
          .filter((s) => s.status === "connected")
          .map((s) => s.name),
      )
      const missing = mcpTools.filter((t) => !connectedServers.has(t.value))
      if (missing.length > 0) {
        mcpNote = `\n\n[Warning: This skill requires MCP server(s): ${missing.map((m) => m.value).join(", ")}, which are currently disconnected.]`
      }
    }
  }
  return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}${mcpNote}\n</skill>`
}

// 展开输入中的技能/提示模板指令，并识别对应命令元数据。
export const expandAndDetectCommand = (
  text: string,
  cwd?: string,
): {
  expanded: string
  command?: UserMessageCommand
} => {
  const disabledSkills = new Set(getSkillSettings().disabled)

  // 1. 兼容 /skill:<name> 命令语法
  if (text.startsWith("/skill:")) {
    const spaceIndex = text.indexOf(" ")
    const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex)
    const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim()
    const skill = cwd ? skillLoader.get(skillName, cwd) : undefined
    if (skill && !disabledSkills.has(skill.name)) {
      const skillBlock = buildSkillPromptBlock(skill)
      return {
        expanded: args ? `${skillBlock}\n\n${args}` : skillBlock,
        command: {
          name: skill.name,
          kind: "skill",
        },
      }
    }
  }

  // 2. 显式 $skill-name 提及语法（零轮往返直接注入当前轮提示词）
  if (cwd) {
    const mentionedNames = extractSkillMentions(text)
    if (mentionedNames.length > 0) {
      const matchedSkills = mentionedNames
        .filter((name) => !disabledSkills.has(name))
        .map((name) => skillLoader.get(name, cwd))
        .filter((s): s is LoadedSkill => s !== undefined)

      if (matchedSkills.length > 0) {
        const blocks = matchedSkills.map((s) => buildSkillPromptBlock(s)).join("\n\n")
        return {
          expanded: `${blocks}\n\n${text}`,
          command: {
            name: matchedSkills[0].name,
            kind: "skill",
          },
        }
      }
    }
  }

  // 3. Prompt 模板指令
  const templateMatch = promptTemplateLoader.match(text, cwd)
  if (templateMatch) {
    return {
      expanded: templateMatch.expanded,
      command: {
        name: templateMatch.template.name,
        kind: "prompt",
        source: templateMatch.template.source,
      },
    }
  }

  return { expanded: text }
}
