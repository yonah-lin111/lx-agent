import { readFileSync } from "node:fs"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { mcpManager } from "../mcp/mcpManager"
import { truncateHead } from "../tools/truncate"
import { skillLoader, stripFrontmatter } from "./skillLoader"

const readSkillSchema = z.object({
  name: z.string().describe("skill name (from available_skills <name>)"),
})

interface ReadSkillToolOptions {
  mcpManager?: {
    getStatus: () => Array<{ name: string; status: string }>
  }
}

// read_skill 工具：只收 skill name，加载器白名单查表解析路径，不收路径参数（豁免 cwd 限制）。
export const createReadSkillTool = (
  cwd: string,
  options?: ReadSkillToolOptions,
): AgentTool<typeof readSkillSchema> => {
  const manager = options?.mcpManager ?? mcpManager
  return {
    name: "read_skill",
    label: "读取 Skill",
    description:
      "Read the full instruction body for a specified skill. Call read_skill when a task matches a skill's description in available_skills.",
    inputSchema: readSkillSchema,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const skill = skillLoader.get(params.name, cwd)
      if (!skill) {
        const available = skillLoader
          .load(cwd)
          .map((item) => item.name)
          .join(", ")
        return {
          content: [
            {
              type: "text",
              text: `Skill "${params.name}" not found. Available skills: ${available || "(none)"}`,
            },
          ],
          details: { error: "skill_not_found" },
        }
      }

      const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim()
      const truncation = truncateHead(body)
      const text = truncation.truncated
        ? `${truncation.content}\n\n[skill body truncated, ${truncation.totalLines} lines total.]`
        : truncation.content

      let mcpNote = ""
      if (skill.dependencies?.tools) {
        const mcpTools = skill.dependencies.tools.filter((t) => t.type.toLowerCase() === "mcp")
        if (mcpTools.length > 0) {
          const connectedServers = new Set(
            manager
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

      return {
        content: [
          {
            type: "text",
            text: `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${text}${mcpNote}\n</skill>`,
          },
        ],
        details: { baseDir: skill.baseDir },
      }
    },
  }
}
