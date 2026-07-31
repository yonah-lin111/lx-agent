import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import type {
  CreateDesignInput,
  CreateModuleInput,
  CreateProjectInput,
  Design,
  DesignStatus,
  Module,
  Project,
  ReferencedFolder,
  UpdateDesignInput,
  UpdateModuleInput,
  UpdateProjectInput,
} from "@shared/project"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"
import { assertProjectDirectory, searchProjectFiles } from "@/lib/fileSystem"

export type {
  CreateDesignInput,
  CreateModuleInput,
  CreateProjectInput,
  Design,
  DesignStatus,
  Module,
  Project,
  ReferencedFolder,
  UpdateDesignInput,
  UpdateModuleInput,
  UpdateProjectInput,
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

// 模块数据库记录。
type ModuleRow = {
  external_id: string
  project_id: string
  name: string
  created_at: string
  updated_at: string
}

// 设计数据库记录。
type DesignRow = {
  external_id: string
  project_id: string
  module_id: string | null
  name: string
  design_data: string | null
  status: DesignStatus
  sort_order: number
  created_at: string
  updated_at: string
}

// 合法设计状态。
const DESIGN_STATUSES: DesignStatus[] = ["todo", "in_progress", "completed"]

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

// 规范化项目共享文件夹路径。
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
 * 将模块数据库记录转换为业务数据。
 */
const toModule = (row: ModuleRow): Module => ({
  id: row.external_id,
  projectId: row.project_id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 将设计数据库记录转换为业务数据。
 */
const toDesign = (row: DesignRow): Design => ({
  id: row.external_id,
  projectId: row.project_id,
  moduleId: row.module_id ?? undefined,
  name: row.name,
  designData: row.design_data ?? "",
  status: row.status,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 提供项目、模块和设计的持久化 CRUD 操作。
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
    // 外键 ON DELETE CASCADE 会同步删除下属模块和设计。
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

  listModules: (projectId?: string): Module[] => {
    const database = getConnection()
    const rows = projectId
      ? (database
          .prepare("SELECT * FROM module WHERE project_id = ? ORDER BY created_at ASC, id ASC")
          .all(projectId) as ModuleRow[])
      : (database
          .prepare("SELECT * FROM module ORDER BY created_at ASC, id ASC")
          .all() as ModuleRow[])

    return rows.map(toModule)
  },

  createModule: (input: CreateModuleInput): Module => {
    const now = new Date().toISOString()
    const id = randomUUID()
    const name = requireName(input.name)

    getConnection()
      .prepare(
        "INSERT INTO module (external_id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.projectId, name, now, now)

    return { id, projectId: input.projectId, name, createdAt: now, updatedAt: now }
  },

  updateModule: (id: string, input: UpdateModuleInput): void => {
    getConnection()
      .prepare("UPDATE module SET name = ?, updated_at = ? WHERE external_id = ?")
      .run(requireName(input.name), new Date().toISOString(), id)
  },

  deleteModule: (id: string): void => {
    // 外键 ON DELETE CASCADE 会同步删除所属设计。
    getConnection().prepare("DELETE FROM module WHERE external_id = ?").run(id)
  },

  listDesigns: (projectId?: string): Design[] => {
    const database = getConnection()
    const rows = projectId
      ? (database
          .prepare(
            "SELECT * FROM design WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC",
          )
          .all(projectId) as DesignRow[])
      : (database
          .prepare("SELECT * FROM design ORDER BY sort_order ASC, created_at ASC, id ASC")
          .all() as DesignRow[])

    return rows.map(toDesign)
  },

  createDesign: (input: CreateDesignInput): Design => {
    const database = getConnection()
    const now = new Date().toISOString()
    const id = randomUUID()
    const name = requireName(input.name)
    const sortOrder = database
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM design WHERE project_id = ?",
      )
      .get(input.projectId) as { sort_order: number }

    database
      .prepare(
        "INSERT INTO design (external_id, project_id, module_id, name, design_data, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.projectId,
        input.moduleId ?? null,
        name,
        input.designData ?? "",
        "todo",
        sortOrder.sort_order,
        now,
        now,
      )

    return {
      id,
      projectId: input.projectId,
      moduleId: input.moduleId,
      name,
      designData: input.designData ?? "",
      status: "todo",
      sortOrder: sortOrder.sort_order,
      createdAt: now,
      updatedAt: now,
    }
  },

  updateDesign: (id: string, input: UpdateDesignInput): void => {
    const updates: string[] = []
    const values: string[] = []

    if (input.name !== undefined) {
      updates.push("name = ?")
      values.push(requireName(input.name))
    }
    if (input.designData !== undefined) {
      updates.push("design_data = ?")
      values.push(input.designData)
    }
    if (input.status !== undefined) {
      if (!DESIGN_STATUSES.includes(input.status)) {
        throw new Error(`Invalid design status: ${input.status}`)
      }
      updates.push("status = ?")
      values.push(input.status)
    }
    if (updates.length === 0) return

    updates.push("updated_at = ?")
    values.push(new Date().toISOString(), id)
    getConnection()
      .prepare(`UPDATE design SET ${updates.join(", ")} WHERE external_id = ?`)
      .run(...values)
  },

  sortDesigns: (ids: string[]): Design[] => {
    const database = getConnection()
    const updateSortOrder = database.prepare(
      "UPDATE design SET sort_order = ?, updated_at = ? WHERE external_id = ?",
    )

    database.transaction(() => {
      const now = new Date().toISOString()
      ids.forEach((id, index) => updateSortOrder.run(index, now, id))
    })()

    return createProjectService(getConnection).listDesigns()
  },

  deleteDesign: (id: string): void => {
    getConnection().prepare("DELETE FROM design WHERE external_id = ?").run(id)
  },
})

// 生产环境使用的设计数据服务。
export const projectService = createProjectService(getDatabase)
