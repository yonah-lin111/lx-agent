import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type {
  InstructionChainEntry,
  InstructionFallback,
  InstructionFileInfo,
  InstructionScope,
  SaveInstructionInput,
} from "@shared/contracts/agent"
import { findGitRepoRoot, getDirectoryChain } from "@/agent/instructionLoader"
import { getAppDataRoot } from "@/paths"

// 读取指令文件正文；读取失败返回 null。
const readContent = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

// 解析项目根目录（校验存在且为目录）。
const resolveProjectDir = (projectPath?: string): string => {
  if (!projectPath?.trim()) throw new Error("Project path is required.")
  const projectDir = resolve(projectPath.trim())
  if (!existsSync(projectDir)) throw new Error("Project path does not exist.")
  if (!statSync(projectDir).isDirectory()) throw new Error("Project path is not a directory.")
  return projectDir
}

// 解析项目可编辑目标与只读上级指令链。
const resolveProjectTarget = (
  projectDir: string,
): { targetPath: string; chain: InstructionChainEntry[]; fallback: InstructionFallback | null } => {
  const targetPath = join(projectDir, "AGENTS.md")

  // 上级只读链：git root → 项目父目录之间存在的 AGENTS.md（不含项目自身）。
  const chain: InstructionChainEntry[] = []
  const repoRoot = findGitRepoRoot(projectDir)
  if (repoRoot) {
    const dirs = getDirectoryChain(repoRoot, projectDir)
    for (const dir of dirs.slice(0, -1)) {
      const candidate = join(dir, "AGENTS.md")
      if (existsSync(candidate)) chain.push({ path: candidate, exists: true })
    }
  }

  // fallback：项目根无 AGENTS.md 但存在 CLAUDE.md 时展示（不自动复制）。
  let fallback: InstructionFallback | null = null
  if (!existsSync(targetPath)) {
    const claudePath = join(projectDir, "CLAUDE.md")
    if (existsSync(claudePath)) {
      fallback = { path: claudePath, content: readContent(claudePath) ?? "" }
    }
  }

  return { targetPath, chain, fallback }
}

// 读取指令文件信息（用户级或项目级）。
export const getInstruction = (
  scope: InstructionScope,
  projectPath?: string,
): InstructionFileInfo => {
  if (scope === "user") {
    const targetPath = join(getAppDataRoot(), "AGENTS.md")
    return {
      scope,
      path: targetPath,
      exists: existsSync(targetPath),
      content: existsSync(targetPath) ? readContent(targetPath) : null,
      chain: [],
      fallback: null,
    }
  }

  const projectDir = resolveProjectDir(projectPath)
  const { targetPath, chain, fallback } = resolveProjectTarget(projectDir)
  return {
    scope,
    path: targetPath,
    exists: existsSync(targetPath),
    content: existsSync(targetPath) ? readContent(targetPath) : null,
    chain,
    fallback,
  }
}

// 保存指令文件（不存在时创建；统一 UTF-8 + LF）。
export const saveInstruction = (input: SaveInstructionInput): InstructionFileInfo => {
  const content = (input.content ?? "").replace(/\r\n/g, "\n").trimEnd()
  const normalized = content ? `${content}\n` : ""

  if (input.scope === "user") {
    const targetPath = join(getAppDataRoot(), "AGENTS.md")
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, normalized, "utf8")
    return getInstruction("user")
  }

  const projectDir = resolveProjectDir(input.projectPath)
  const targetPath = join(projectDir, "AGENTS.md")
  writeFileSync(targetPath, normalized, "utf8")
  return getInstruction("project", projectDir)
}
