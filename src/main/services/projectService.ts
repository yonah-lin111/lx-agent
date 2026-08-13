import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import type {
  CreateProjectFolderInput,
  CreateProjectInput,
  CreateProjectItemInput,
  Project,
  ProjectFolder,
  ProjectItem,
  ProjectItemStatus,
  ReferencedFolder,
  UpdateProjectFolderInput,
  UpdateProjectInput,
  UpdateProjectItemInput,
} from "@shared/project"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"
import { assertProjectDirectory, searchProjectFiles } from "@/lib/fileSystem"

export type {
  CreateProjectFolderInput,
  CreateProjectInput,
  CreateProjectItemInput,
  Project,
  ProjectFolder,
  ProjectItem,
  ProjectItemStatus,
  ReferencedFolder,
  UpdateProjectFolderInput,
  UpdateProjectInput,
  UpdateProjectItemInput,
} from "@shared/project"

// 项目数据库记录。
type ProjectRow = {
  external_id: string
  name: string
  type: "filesystem" | "virtual"
  path: string | null
  referenced_folders: string | null
  created_at: string
  updated_at: string
}

// 项目文件夹数据库记录。
type ProjectFolderRow = {
  external_id: string
  project_id: string
  name: string
  created_at: string
  updated_at: string
}

// 项目条目数据库记录。
type ProjectItemRow = {
  external_id: string
  project_id: string
  project_folder_id: string | null
  name: string
  item_data: string | null
  enabled_folder_paths: string | null
  worktree_path: string | null
  status: ProjectItemStatus
  created_at: string
  updated_at: string
}

// 合法项目条目状态。
const PROJECT_ITEM_STATUSES: ProjectItemStatus[] = ["todo", "in_progress", "completed"]

// 合法共享文件夹引用。
const isReferencedFolder = (value: unknown): value is ReferencedFolder =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ReferencedFolder).path === "string" &&
      typeof (value as ReferencedFolder).createdAt === "string",
  )

/**
 * 验证并返回非空名称。
 */
const requireName = (name: string): string => {
  const trimmedName = name.trim()

  if (!trimmedName) {
    throw new Error("Name is required")
  }

  return trimmedName
}

/**
 * 将项目数据库记录转换为业务数据。
 */
const getReferencedFolders = (value: string | null): ReferencedFolder[] => {
  try {
    const folders = JSON.parse(value ?? "[]")
    if (!Array.isArray(folders)) return []

    return normalizeReferencedFolders(folders)
  } catch {
    return []
  }
}

// 将条目启用的文件夹路径数据库记录转换为业务数据。
const getEnabledFolderPaths = (value: string | null): string[] => {
  try {
    const paths = JSON.parse(value ?? "[]")
    if (!Array.isArray(paths)) return []

    return normalizeEnabledFolderPaths(paths)
  } catch {
    return []
  }
}

// 规范化共享文件夹路径。
const normalizeReferencedFolders = (folders: unknown[]): ReferencedFolder[] => {
  const foldersByPath = new Map<string, ReferencedFolder>()

  for (const folder of folders) {
    if (!isReferencedFolder(folder)) continue

    const path = folder.path.trim()
    if (!path) continue

    const createdAt = new Date(folder.createdAt)
    if (Number.isNaN(createdAt.getTime())) continue

    const existing = foldersByPath.get(path)
    if (!existing || existing.createdAt < folder.createdAt) {
      foldersByPath.set(path, { path, createdAt: folder.createdAt })
    }
  }

  return [...foldersByPath.values()]
}

// 规范化条目启用的文件夹路径。
const normalizeEnabledFolderPaths = (paths: unknown[]): string[] => {
  const uniquePaths = new Set<string>()

  for (const path of paths) {
    if (typeof path !== "string") continue
    const trimmed = path.trim()
    if (trimmed) uniquePaths.add(trimmed)
  }

  return [...uniquePaths]
}

const toProject = (row: ProjectRow): Project => ({
  id: row.external_id,
  name: row.name,
  type: row.type,
  path: row.path ?? undefined,
  referencedFolders: getReferencedFolders(row.referenced_folders),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 将项目文件夹数据库记录转换为业务数据。
 */
const toFolder = (row: ProjectFolderRow): ProjectFolder => ({
  id: row.external_id,
  projectId: row.project_id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 将项目条目数据库记录转换为业务数据。
 */
const toItem = (row: ProjectItemRow): ProjectItem => ({
  id: row.external_id,
  projectId: row.project_id,
  projectFolderId: row.project_folder_id ?? undefined,
  name: row.name,
  itemData: row.item_data ?? "",
  enabledFolderPaths: getEnabledFolderPaths(row.enabled_folder_paths),
  worktreePath: row.worktree_path ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 提供项目、文件夹和项目条目的持久化 CRUD 操作。
 */
export const createProjectService = (getConnection: () => Database.Database) => ({
  listProjects: (): Project[] => {
    const database = getConnection()
    const rows = database
      .prepare("SELECT * FROM project ORDER BY created_at DESC, id DESC")
      .all() as ProjectRow[]

    return rows.map(toProject)
  },

  createProject: (input: CreateProjectInput): Project => {
    const database = getConnection()
    const now = new Date().toISOString()
    const id = randomUUID()
    const name = requireName(input.name)
    const type = input.type ?? (input.path ? "filesystem" : "virtual")
    assertProjectDirectory(input.path)

    database
      .prepare(
        "INSERT INTO project (external_id, name, type, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, name, type, input.path?.trim() || null, now, now)

    return {
      id,
      name,
      type,
      path: input.path?.trim() || undefined,
      referencedFolders: [],
      createdAt: now,
      updatedAt: now,
    }
  },

  updateProject: (id: string, input: UpdateProjectInput): void => {
    const updates: string[] = []
    const values: Array<string | null> = []

    if (input.name !== undefined) {
      updates.push("name = ?")
      values.push(requireName(input.name))
    }
    if (input.type !== undefined) {
      updates.push("type = ?")
      values.push(input.type)
    }
    if (input.path !== undefined) {
      assertProjectDirectory(input.path)
      updates.push("path = ?")
      values.push(input.path.trim() || null)
    }
    if (input.referencedFolders !== undefined) {
      if (
        !Array.isArray(input.referencedFolders) ||
        !input.referencedFolders.every(isReferencedFolder)
      ) {
        throw new Error("INVALID_REFERENCED_FOLDERS")
      }
      updates.push("referenced_folders = ?")
      values.push(JSON.stringify(normalizeReferencedFolders(input.referencedFolders)))
    }
    if (updates.length === 0) return

    updates.push("updated_at = ?")
    values.push(new Date().toISOString(), id)
    getConnection()
      .prepare(`UPDATE project SET ${updates.join(", ")} WHERE external_id = ?`)
      .run(...values)
  },

  deleteProject: (id: string): void => {
    // 外键 ON DELETE CASCADE 会同步删除下属文件夹和条目。
    getConnection().prepare("DELETE FROM project WHERE external_id = ?").run(id)
  },

  searchProjectFiles: (projectId: string, query: string) => {
    const row = getConnection()
      .prepare("SELECT path FROM project WHERE external_id = ?")
      .get(projectId) as { path: string | null } | undefined
    if (!row?.path) return []

    return searchProjectFiles(row.path, query)
  },

  searchReferencedProjectFiles: (projectPaths: string[], query: string) =>
    projectPaths.flatMap((projectPath) => {
      try {
        const files = searchProjectFiles(projectPath, query, basename(projectPath))

        return files.map((file) => ({ ...file, projectPath }))
      } catch {
        return []
      }
    }),

  // 按任意绝对目录搜索文件（供 git 工作区上下文的 @ 提及使用）；目录不存在返回 []。
  searchDirectoryFiles: (directory: string, query: string) => {
    try {
      return searchProjectFiles(directory, query)
    } catch {
      return []
    }
  },

  listFolders: (projectId?: string): ProjectFolder[] => {
    const database = getConnection()
    const rows = projectId
      ? (database
          .prepare(
            "SELECT * FROM project_folder WHERE project_id = ? ORDER BY created_at ASC, id ASC",
          )
          .all(projectId) as ProjectFolderRow[])
      : (database
          .prepare("SELECT * FROM project_folder ORDER BY created_at ASC, id ASC")
          .all() as ProjectFolderRow[])

    return rows.map(toFolder)
  },

  createFolder: (input: CreateProjectFolderInput): ProjectFolder => {
    const now = new Date().toISOString()
    const id = randomUUID()
    const name = requireName(input.name)

    getConnection()
      .prepare(
        "INSERT INTO project_folder (external_id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.projectId, name, now, now)

    return { id, projectId: input.projectId, name, createdAt: now, updatedAt: now }
  },

  updateFolder: (id: string, input: UpdateProjectFolderInput): void => {
    getConnection()
      .prepare("UPDATE project_folder SET name = ?, updated_at = ? WHERE external_id = ?")
      .run(requireName(input.name), new Date().toISOString(), id)
  },

  deleteFolder: (id: string): void => {
    // 外键 ON DELETE CASCADE 会同步删除所属条目。
    getConnection().prepare("DELETE FROM project_folder WHERE external_id = ?").run(id)
  },

  listItems: (projectId?: string): ProjectItem[] => {
    const database = getConnection()
    const rows = projectId
      ? (database
          .prepare(
            "SELECT * FROM project_item WHERE project_id = ? ORDER BY created_at ASC, id ASC",
          )
          .all(projectId) as ProjectItemRow[])
      : (database
          .prepare("SELECT * FROM project_item ORDER BY created_at ASC, id ASC")
          .all() as ProjectItemRow[])

    return rows.map(toItem)
  },

  createItem: (input: CreateProjectItemInput): ProjectItem => {
    const database = getConnection()
    const now = new Date().toISOString()
    const id = randomUUID()
    const name = requireName(input.name)

    database
      .prepare(
        "INSERT INTO project_item (external_id, project_id, project_folder_id, name, item_data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.projectId,
        input.projectFolderId ?? null,
        name,
        input.itemData ?? "",
        "todo",
        now,
        now,
      )

    return {
      id,
      projectId: input.projectId,
      projectFolderId: input.projectFolderId,
      name,
      itemData: input.itemData ?? "",
      enabledFolderPaths: [],
      status: "todo",
      createdAt: now,
      updatedAt: now,
    }
  },

  updateItem: (id: string, input: UpdateProjectItemInput): void => {
    const updates: string[] = []
    const values: Array<string | null> = []

    if (input.name !== undefined) {
      updates.push("name = ?")
      values.push(requireName(input.name))
    }
    if (input.itemData !== undefined) {
      updates.push("item_data = ?")
      values.push(input.itemData)
    }
    if (input.status !== undefined) {
      if (!PROJECT_ITEM_STATUSES.includes(input.status)) {
        throw new Error(`Invalid project item status: ${input.status}`)
      }
      updates.push("status = ?")
      values.push(input.status)
    }
    if (input.enabledFolderPaths !== undefined) {
      if (!Array.isArray(input.enabledFolderPaths)) {
        throw new Error("INVALID_ENABLED_FOLDER_PATHS")
      }
      updates.push("enabled_folder_paths = ?")
      values.push(JSON.stringify(normalizeEnabledFolderPaths(input.enabledFolderPaths)))
    }
    if (input.worktreePath !== undefined) {
      updates.push("worktree_path = ?")
      values.push(input.worktreePath?.trim() || null)
    }
    if (updates.length === 0) return

    updates.push("updated_at = ?")
    values.push(new Date().toISOString(), id)
    getConnection()
      .prepare(`UPDATE project_item SET ${updates.join(", ")} WHERE external_id = ?`)
      .run(...values)
  },

  deleteItem: (id: string): void => {
    getConnection().prepare("DELETE FROM project_item WHERE external_id = ?").run(id)
  },
})

// 生产环境使用的项目数据服务。
export const projectService = createProjectService(getDatabase)
