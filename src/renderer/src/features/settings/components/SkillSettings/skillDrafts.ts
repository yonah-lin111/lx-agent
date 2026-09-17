import type { SkillFileEntry, SkillTargetRoot } from "@shared/contracts/agent"
import { create } from "zustand"

// Skill 元数据草稿（与表单五项一一对应）。
export interface SkillMetaDraft {
  name: string
  description: string
  displayName: string
  shortDescription: string
  disableModelInvocation: boolean
}

// 新建 Skill 草稿（未落盘）。
export interface SkillCreateDraft {
  targetRoot: SkillTargetRoot
  meta: SkillMetaDraft
  // 相对路径 → 内容（含 SKILL.md 正文）。
  files: Record<string, string>
}

// 已有 Skill 的修改草稿（按 baseDir 记录）。
// files / deleted / moves / created 的键统一使用「原始相对路径」（origin）：
// 展示路径 = moves[origin] ?? origin，避免重命名与内容编辑的键失配。
export interface SkillEdit {
  originalMeta: SkillMetaDraft
  meta: SkillMetaDraft
  // origin 路径 → 新内容（修改或新建）。
  files: Record<string, string>
  // 待删除的 origin 路径。
  deleted: string[]
  // 移动/重命名：origin 路径 → 展示路径。
  moves: Record<string, string>
  // 本草稿内新建文件的 origin 路径。
  created: string[]
}

// 文件树展示条目。
export interface SkillTreeEntry {
  relativePath: string
  isVirtual: boolean
  isDirty: boolean
}

// 由 SkillItem 生成基线元数据草稿。
export const toMetaDraft = (item: {
  name: string
  description: string
  displayName?: string
  shortDescription?: string
  disableModelInvocation: boolean
}): SkillMetaDraft => ({
  name: item.name,
  description: item.description,
  displayName: item.displayName ?? "",
  shortDescription: item.shortDescription ?? "",
  disableModelInvocation: item.disableModelInvocation,
})

// 元数据是否已变更。
export const isMetaChanged = (edit: SkillEdit): boolean =>
  JSON.stringify(edit.meta) !== JSON.stringify(edit.originalMeta)

// 修改草稿是否包含任何待保存内容。
export const hasEditChanges = (edit: SkillEdit | undefined): boolean => {
  if (!edit) return false
  return (
    isMetaChanged(edit) ||
    Object.keys(edit.files).length > 0 ||
    edit.deleted.length > 0 ||
    Object.keys(edit.moves).length > 0 ||
    edit.created.length > 0
  )
}

// 把展示路径解析回 origin 路径（未命中返回原值）。
export const resolveFileOrigin = (edit: SkillEdit | undefined, displayPath: string): string => {
  if (!edit) return displayPath
  for (const [origin, target] of Object.entries(edit.moves)) {
    if (target === displayPath) return origin
  }
  return displayPath
}

// 合并磁盘文件树与草稿变更（删除、移动、虚拟新增），返回展示条目。
export const mergeSkillTree = (
  diskEntries: SkillFileEntry[],
  edit: SkillEdit | undefined,
): SkillTreeEntry[] => {
  const deleted = new Set(edit?.deleted ?? [])
  const moves = edit?.moves ?? {}
  const result = new Map<string, SkillTreeEntry>()

  for (const entry of diskEntries) {
    if (entry.kind !== "file") continue
    if (entry.relativePath === "SKILL.md" || deleted.has(entry.relativePath)) continue
    const displayPath = moves[entry.relativePath] ?? entry.relativePath
    result.set(displayPath, {
      relativePath: displayPath,
      isVirtual: false,
      isDirty: Boolean(edit && entry.relativePath in edit.files),
    })
  }

  for (const origin of edit?.created ?? []) {
    const displayPath = moves[origin] ?? origin
    if (displayPath === "SKILL.md") continue
    result.set(displayPath, { relativePath: displayPath, isVirtual: true, isDirty: true })
  }

  return [...result.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

// Skill 草稿状态定义。
interface SkillDraftState {
  createDraft: SkillCreateDraft | null
  edits: Record<string, SkillEdit>
  beginCreate: (targetRoot: SkillTargetRoot) => void
  setCreateTargetRoot: (targetRoot: SkillTargetRoot) => void
  cancelCreate: () => void
  updateCreateMeta: (patch: Partial<SkillMetaDraft>) => void
  addCreateFile: (relativePath: string) => void
  updateCreateFile: (relativePath: string, content: string) => void
  removeCreateFile: (relativePath: string) => void
  ensureEdit: (baseDir: string, meta: SkillMetaDraft) => SkillEdit
  updateEditMeta: (baseDir: string, patch: Partial<SkillMetaDraft>) => void
  addEditFile: (baseDir: string, relativePath: string, content: string) => void
  updateEditFile: (baseDir: string, relativePath: string, content: string, changed: boolean) => void
  deleteEditFile: (baseDir: string, relativePath: string) => void
  moveEditFile: (baseDir: string, fromRelativePath: string, toRelativePath: string) => void
  discardEdit: (baseDir: string) => void
  discardAll: () => void
}

// 空修改草稿。
const emptyEdit = (meta: SkillMetaDraft): SkillEdit => ({
  originalMeta: meta,
  meta,
  files: {},
  deleted: [],
  moves: {},
  created: [],
})

/**
 * Skill 草稿 Store：新建草稿与已有 Skill 的内存修改（跨 Tab 切换保留，统一由全局保存栏落盘）。
 */
export const useSkillDraftStore = create<SkillDraftState>((set, get) => ({
  createDraft: null,
  edits: {},

  beginCreate: (targetRoot: SkillTargetRoot): void => {
    set({
      createDraft: {
        targetRoot,
        meta: {
          name: "",
          description: "",
          displayName: "",
          shortDescription: "",
          disableModelInvocation: false,
        },
        files: { "SKILL.md": "" },
      },
    })
  },

  cancelCreate: (): void => set({ createDraft: null }),

  setCreateTargetRoot: (targetRoot: SkillTargetRoot): void => {
    const current = get().createDraft
    if (!current || current.targetRoot === targetRoot) return
    set({ createDraft: { ...current, targetRoot } })
  },

  updateCreateMeta: (patch): void => {
    const current = get().createDraft
    if (!current) return
    set({ createDraft: { ...current, meta: { ...current.meta, ...patch } } })
  },

  addCreateFile: (relativePath: string): void => {
    const current = get().createDraft
    if (!current || current.files[relativePath] !== undefined) return
    set({ createDraft: { ...current, files: { ...current.files, [relativePath]: "" } } })
  },

  updateCreateFile: (relativePath: string, content: string): void => {
    const current = get().createDraft
    if (!current) return
    set({ createDraft: { ...current, files: { ...current.files, [relativePath]: content } } })
  },

  removeCreateFile: (relativePath: string): void => {
    const current = get().createDraft
    if (!current || relativePath === "SKILL.md") return
    const { [relativePath]: _removed, ...rest } = current.files
    set({ createDraft: { ...current, files: rest } })
  },

  ensureEdit: (baseDir: string, meta: SkillMetaDraft): SkillEdit => {
    const existing = get().edits[baseDir]
    if (existing) return existing
    const created = emptyEdit(meta)
    set({ edits: { ...get().edits, [baseDir]: created } })
    return created
  },

  updateEditMeta: (baseDir: string, patch): void => {
    const edit = get().edits[baseDir]
    if (!edit) return
    set({
      edits: {
        ...get().edits,
        [baseDir]: { ...edit, meta: { ...edit.meta, ...patch } },
      },
    })
  },

  addEditFile: (baseDir: string, relativePath: string, content: string): void => {
    const edit = get().edits[baseDir]
    if (!edit || relativePath === "SKILL.md") return
    const created = edit.created.includes(relativePath)
      ? edit.created
      : [...edit.created, relativePath]
    set({
      edits: {
        ...get().edits,
        [baseDir]: {
          ...edit,
          files: { ...edit.files, [relativePath]: content },
          created,
          deleted: edit.deleted.filter((item) => item !== relativePath),
        },
      },
    })
  },

  updateEditFile: (
    baseDir: string,
    relativePath: string,
    content: string,
    changed: boolean,
  ): void => {
    const edit = get().edits[baseDir]
    if (!edit) return
    const origin = resolveFileOrigin(edit, relativePath)
    const files = { ...edit.files }
    if (changed) {
      files[origin] = content
    } else {
      delete files[origin]
    }
    set({ edits: { ...get().edits, [baseDir]: { ...edit, files } } })
  },

  deleteEditFile: (baseDir: string, relativePath: string): void => {
    const edit = get().edits[baseDir]
    if (!edit || relativePath === "SKILL.md") return
    const origin = resolveFileOrigin(edit, relativePath)
    const files = { ...edit.files }
    delete files[origin]
    const moves = { ...edit.moves }
    delete moves[origin]
    const isCreated = edit.created.includes(origin)
    set({
      edits: {
        ...get().edits,
        [baseDir]: {
          ...edit,
          files,
          moves,
          created: edit.created.filter((item) => item !== origin),
          deleted: isCreated ? edit.deleted : [...new Set([...edit.deleted, origin])],
        },
      },
    })
  },

  moveEditFile: (baseDir: string, fromRelativePath: string, toRelativePath: string): void => {
    const edit = get().edits[baseDir]
    if (!edit || fromRelativePath === "SKILL.md" || toRelativePath === "SKILL.md") return
    const origin = resolveFileOrigin(edit, fromRelativePath)
    const moves = { ...edit.moves }
    if (origin === toRelativePath) {
      delete moves[origin]
    } else {
      moves[origin] = toRelativePath
    }
    set({
      edits: {
        ...get().edits,
        [baseDir]: {
          ...edit,
          moves,
          deleted: edit.deleted.filter((item) => item !== toRelativePath),
        },
      },
    })
  },

  discardEdit: (baseDir: string): void => {
    const { [baseDir]: _discarded, ...rest } = get().edits
    set({ edits: rest })
  },

  discardAll: (): void => set({ createDraft: null, edits: {} }),
}))
