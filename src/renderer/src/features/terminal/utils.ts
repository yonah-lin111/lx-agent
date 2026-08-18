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
