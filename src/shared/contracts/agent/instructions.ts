// AGENTS.md 指令文件读取与保存契约。

// 指令文件作用域：用户级或项目级。
export type InstructionScope = "user" | "project"

// 只读上级指令链条目。
export interface InstructionChainEntry {
  path: string
  exists: boolean
}

// 项目无 AGENTS.md 时生效的 CLAUDE.md fallback。
export interface InstructionFallback {
  path: string
  content: string
}

// 指令文件目标信息。
export interface InstructionFileInfo {
  scope: InstructionScope
  // 可编辑目标文件绝对路径。
  path: string
  exists: boolean
  // 可编辑目标正文；文件不存在为 null。
  content: string | null
  // 只读上级指令链（git root → 项目父目录之间存在的 AGENTS.md）。
  chain: InstructionChainEntry[]
  // CLAUDE.md fallback；无则 null。
  fallback: InstructionFallback | null
}

// 保存指令文件输入。
export interface SaveInstructionInput {
  scope: InstructionScope
  // scope === "project" 时必填。
  projectPath?: string
  content: string
}
