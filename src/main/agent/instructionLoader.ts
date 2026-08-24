import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { getAppDataRoot } from "@/paths"
import { truncateHead } from "./tools/truncate"

// 指令文件单文件读取上限（防超大指令淹没上下文）。
const MAX_INSTRUCTION_BYTES = 50 * 1024

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

/** 解析仓库根目录（非 git 仓库或失败回退 undefined） */
export const findGitRepoRoot = (cwd: string): string | undefined => {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd,
      timeout: 1000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return root && existsSync(root) ? resolve(root) : undefined
  } catch {
    return undefined
  }
}

/** 获取从 repoRoot 到 targetDir 的所有目录路径链（从浅到深：repoRoot, ..., targetDir） */
export const getDirectoryChain = (repoRoot: string, targetDir: string): string[] => {
  const normalizedRoot = resolve(repoRoot)
  const normalizedTarget = resolve(targetDir)
  const rel = relative(normalizedRoot, normalizedTarget)

  // targetDir 不在 repoRoot 内
  if (rel.startsWith("..") || rel === "") {
    return [normalizedRoot]
  }

  const parts = rel.split(/[\/\\]/).filter(Boolean)
  const chain: string[] = [normalizedRoot]
  let current = normalizedRoot
  for (const part of parts) {
    current = join(current, part)
    chain.push(current)
  }
  return chain
}

/**
 * 加载会话指令文件：
 * 1. user 级 `~/.lx/AGENTS.md`
 * 2. 项目沿途 AGENTS.md（从 Git 仓库根目录到 cwd，由浅入深按顺序拼接，深层覆盖/靠后）
 *    - 如果非 Git 仓库，回退为仅读取 `<cwd>/AGENTS.md`
 * 3. 根级 CLAUDE.md fallback：仅当整条链未加载任何 AGENTS.md 时，在 cwd 尝试 fallback `<cwd>/CLAUDE.md`
 */
export const loadInstructions = (cwd: string): InstructionFile[] => {
  const instructions: InstructionFile[] = []

  // 1. User 级
  const userInstruction = readInstructionFile(join(getAppDataRoot(), "AGENTS.md"))
  if (userInstruction) instructions.push(userInstruction)

  // 2. 项目沿途 AGENTS.md
  const repoRoot = findGitRepoRoot(cwd)
  const dirChain = repoRoot ? getDirectoryChain(repoRoot, cwd) : [resolve(cwd)]

  let hasProjectAgentsMd = false
  for (const dir of dirChain) {
    const instr = readInstructionFile(join(dir, "AGENTS.md"))
    if (instr) {
      instructions.push(instr)
      hasProjectAgentsMd = true
    }
  }

  // 3. Fallback CLAUDE.md（仅在项目没有任何 AGENTS.md 时生效）
  if (!hasProjectAgentsMd) {
    const claudeInstr = readInstructionFile(join(cwd, "CLAUDE.md"))
    if (claudeInstr) {
      instructions.push(claudeInstr)
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
