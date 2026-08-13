import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getAppDataRoot } from "@/paths"
import { truncateHead } from "./tools/truncate"

// 指令文件单文件读取上限（防超大指令淹没上下文）。
const MAX_INSTRUCTION_BYTES = 50 * 1024

// 项目级指令文件候选（二选一，命中即停）。
const PROJECT_INSTRUCTION_NAMES = ["AGENTS.md", "CLAUDE.md"] as const

// 已加载的指令文件（绝对路径 + 截断后的内容）。
export interface InstructionFile {
  path: string
  content: string
}

// 读取单个指令文件；缺失/读取失败/空内容返回 null（静默跳过，不阻断装配）。
const readInstructionFile = (path: string): InstructionFile | null => {
  try {
    const content = truncateHead(readFileSync(path, "utf8"), {
      maxBytes: MAX_INSTRUCTION_BYTES,
    }).content
    if (!content.trim()) return null
    return { path, content }
  } catch {
    return null
  }
}

/**
 * 加载会话指令文件：user 级 `~/.lx/AGENTS.md` + 项目级 `<cwd>/AGENTS.md` → `<cwd>/CLAUDE.md`
 * （项目级二选一、命中即停，不递归 findUp）。与 skill 双来源机制同构但语义独立：
 * skill = 可复用指令包（按需 read_skill），instruction = 项目/user 级常驻规范（无条件注入）。
 */
export const loadInstructions = (cwd: string): InstructionFile[] => {
  const instructions: InstructionFile[] = []
  const userInstruction = readInstructionFile(join(getAppDataRoot(), "AGENTS.md"))
  if (userInstruction) instructions.push(userInstruction)
  for (const name of PROJECT_INSTRUCTION_NAMES) {
    const projectInstruction = readInstructionFile(join(cwd, name))
    if (projectInstruction) {
      instructions.push(projectInstruction)
      break
    }
  }
  return instructions
}

// 指令文件注入块（对齐 opencode：`Instructions from: <abs path>\n<content>`）。
// 无指令时返回空串（不污染 system prompt）。
export const formatInstructions = (instructions: InstructionFile[]): string => {
  if (instructions.length === 0) return ""
  const blocks = instructions.map(
    (instruction) => `Instructions from: ${instruction.path}\n${instruction.content}`,
  )
  return `\n\n${blocks.join("\n\n")}`
}
