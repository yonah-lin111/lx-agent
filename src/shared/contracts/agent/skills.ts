// Skill 工作区（目录与文件）操作契约。

// Skill 作用域：全局（用户级）或项目级。
export type SkillScope = "user" | "project"

// Skill 目标根目录：lx 原生目录或跨客户端标准 .agents 目录。
export type SkillTargetRoot = "lx" | "agents"

// Skill 目录内条目（relativePath 统一使用 posix 分隔符）。
export interface SkillFileEntry {
  relativePath: string
  name: string
  kind: "file" | "directory"
  sizeBytes: number
}

// 保存（新建或更新）Skill 输入；已有 Skill 通过 originalDir 定位原目录。
export interface SaveSkillInput {
  scope: SkillScope
  // scope === "project" 时必填。
  projectPath?: string
  targetRoot: SkillTargetRoot
  // 已有 Skill 的原目录绝对路径；提供时优先用它定位，缺省回退到按名称查找。
  originalDir?: string
  // 已有 Skill 重命名时的原名。
  originalName?: string
  name: string
  description: string
  displayName?: string
  shortDescription?: string
  disableModelInvocation?: boolean
  // SKILL.md 正文；缺省表示保持既有正文（新建时视为空），frontmatter 由主进程合并保留未知键。
  content?: string
}

// 保存结果。
export type SaveSkillResult =
  | { ok: true; filePath: string; baseDir: string }
  | { ok: false; error: string }

// 文本文件读取结果。
export type SkillFileContent = { ok: true; content: string } | { ok: false; error: string }

// 文件写操作结果。
export type SkillFileOpResult = { ok: true } | { ok: false; error: string }

// 导入文件结果（files 为复制后的相对路径列表）。
export type ImportSkillFilesResult = { ok: true; files: string[] } | { ok: false; error: string }
