import { readFileSync } from "node:fs"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { truncateHead } from "../tools/truncate"
import { skillLoader, stripFrontmatter } from "./skillLoader"

const readSkillSchema = z.object({
  name: z.string().describe("skill 名称（available_skills 中的 <name>）"),
})

// read_skill 工具：只收 skill name，加载器白名单查表解析路径，不收路径参数（豁免 cwd 限制）。
export const createReadSkillTool = (cwd: string): AgentTool<typeof readSkillSchema> => ({
  name: "read_skill",
  label: "读取 Skill",
  description:
    "读取指定 skill 的完整指令正文。当任务匹配 available_skills 中某个 skill 的 description 时调用 read_skill，name 填对应 <name>。",
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
            text: `未找到 skill "${params.name}"。可用 skill：${available || "（无）"}`,
          },
        ],
        details: { error: "skill_not_found" },
      }
    }

    const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim()
    const truncation = truncateHead(body)
    const text = truncation.truncated
      ? `${truncation.content}\n\n[skill 正文已截断，共 ${truncation.totalLines} 行。]`
      : truncation.content
    return {
      content: [
        {
          type: "text",
          text: `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${text}\n</skill>`,
        },
      ],
      details: { baseDir: skill.baseDir },
    }
  },
})
