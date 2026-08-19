import { projectApi } from "@/features/project/api/projectApi"
import { terminalApi } from "@/features/terminal/api/terminalApi"

/**
 * 根据当前选中的条目与项目解析终端初始工作目录。
 * 优先级：item.worktreePath -> project.path (仅限 filesystem 类型) -> 操作系统 Desktop
 */
export const resolveInitialTerminalCwd = async (itemId?: string | null): Promise<string> => {
  if (!itemId) {
    return terminalApi.getDesktopPath()
  }

  try {
    const items = await projectApi.list()
    const item = items.find((entry) => entry.id === itemId)
    if (item?.worktreePath && typeof item.worktreePath === "string") {
      return item.worktreePath
    }

    if (item?.projectId) {
      const projects = await projectApi.listProjects()
      const project = projects.find((entry) => entry.id === item.projectId)
      if (project?.type === "filesystem" && project.path) {
        return project.path
      }
    }
  } catch (error) {
    console.error(
      "[Terminal] Failed to resolve project/worktree cwd, falling back to desktop:",
      error,
    )
  }

  return terminalApi.getDesktopPath()
}

/**
 * 根据工作目录路径解析友好的展示名称（取最末级文件夹名，根目录/空值兜底）。
 */
export const resolveCwdDisplayName = (cwd?: string): string => {
  if (!cwd || typeof cwd !== "string") {
    return "~"
  }

  const trimmed = cwd.trim().replace(/[/\\]+$/, "")
  if (!trimmed || trimmed === "/" || trimmed === "\\") {
    return "/"
  }

  const parts = trimmed.split(/[/\\]/)
  const last = parts[parts.length - 1]
  return last || "~"
}

/**
 * 格式化单个文件或目录路径供终端使用。
 * 若路径中包含空格或 shell 特殊字符，使用双引号包裹并对内部的双引号、反斜杠、美元符和反引号进行转义。
 */
export const formatTerminalPath = (path: string): string => {
  if (!path) return ""

  // 检测是否包含空白或 shell 特殊字符
  const needsQuotes = /[\s"'\\$`*?#[\]()<>~;&|]/.test(path)
  if (!needsQuotes) {
    return path
  }

  const escaped = path.replace(/([\\"$`])/g, "\\$1")
  return `"${escaped}"`
}

/**
 * 格式化多个文件或目录路径，以空格分隔。
 */
export const formatTerminalPaths = (paths: string[]): string => {
  return paths
    .map((p) => formatTerminalPath(p))
    .filter(Boolean)
    .join(" ")
}

/**
 * 从剪贴板或拖拽传输对象中解析所有文件或目录的物理绝对路径。
 * 优先级：DataTransfer.files (结合 Electron webUtils.getPathForFile) -> text/uri-list (file://)
 */
export const extractPathsFromDataTransfer = (dataTransfer: DataTransfer | null): string[] => {
  if (!dataTransfer) return []

  const paths: string[] = []

  // 1. 从 files 列表中解析绝对路径（在 Electron 下使用 getPathForFile 解析物理路径）
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    const files = Array.from(dataTransfer.files)
    for (const file of files) {
      try {
        const getPath = typeof window !== "undefined" ? window.api?.getPathForFile : undefined
        const path = getPath?.(file) || (file as { path?: string }).path || ""
        if (path) {
          paths.push(path)
        }
      } catch {
        const fallback = (file as { path?: string }).path
        if (fallback) {
          paths.push(fallback)
        }
      }
    }
    if (paths.length > 0) return paths
  }

  // 2. 从 text/uri-list 中解析 file:// URI
  const uriList = dataTransfer.getData("text/uri-list")
  if (uriList) {
    const lines = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))

    for (const line of lines) {
      if (line.startsWith("file://")) {
        try {
          const path = decodeURIComponent(new URL(line).pathname)
          if (path) {
            paths.push(path)
          }
        } catch {
          // 忽略非法 URI
        }
      }
    }
    if (paths.length > 0) return paths
  }

  return paths
}
