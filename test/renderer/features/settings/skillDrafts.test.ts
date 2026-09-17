// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"
import {
  hasEditChanges,
  isMetaChanged,
  mergeSkillTree,
  resolveFileOrigin,
  type SkillEdit,
  toMetaDraft,
  useSkillDraftStore,
} from "@/features/settings/components/SkillSettings/skillDrafts"

const meta = {
  name: "alpha",
  description: "desc",
  displayName: "",
  shortDescription: "",
  disableModelInvocation: false,
}

const baseEdit = (overrides: Partial<SkillEdit> = {}): SkillEdit => ({
  originalMeta: meta,
  meta,
  files: {},
  deleted: [],
  moves: {},
  created: [],
  ...overrides,
})

beforeEach(() => {
  useSkillDraftStore.getState().discardAll()
})

describe("mergeSkillTree", () => {
  const diskEntries = [
    { relativePath: "SKILL.md", name: "SKILL.md", kind: "file" as const, sizeBytes: 10 },
    {
      relativePath: "references/api.md",
      name: "api.md",
      kind: "file" as const,
      sizeBytes: 5,
    },
    {
      relativePath: "references",
      name: "references",
      kind: "directory" as const,
      sizeBytes: 0,
    },
    { relativePath: "scripts/run.sh", name: "run.sh", kind: "file" as const, sizeBytes: 3 },
  ]

  it("无草稿时仅输出磁盘文件（不含目录与 SKILL.md）", () => {
    const tree = mergeSkillTree(diskEntries, undefined)
    expect(tree.map((entry) => entry.relativePath)).toEqual(["references/api.md", "scripts/run.sh"])
    expect(tree.every((entry) => !entry.isVirtual && !entry.isDirty)).toBe(true)
  })

  it("应用删除与移动，并合并虚拟新增文件", () => {
    const tree = mergeSkillTree(
      diskEntries,
      baseEdit({
        files: { "references/api.md": "new content", "assets/logo.svg": "<svg/>" },
        deleted: ["scripts/run.sh"],
        moves: { "references/api.md": "references/api-v2.md" },
        created: ["assets/logo.svg"],
      }),
    )

    const paths = tree.map((entry) => entry.relativePath)
    expect(paths).toContain("references/api-v2.md")
    expect(paths).toContain("assets/logo.svg")
    expect(paths).not.toContain("scripts/run.sh")
    expect(paths).not.toContain("references/api.md")

    const moved = tree.find((entry) => entry.relativePath === "references/api-v2.md")
    expect(moved?.isDirty).toBe(true)
    expect(moved?.isVirtual).toBe(false)
    const added = tree.find((entry) => entry.relativePath === "assets/logo.svg")
    expect(added?.isVirtual).toBe(true)
  })

  it("resolveFileOrigin 把展示路径解析回原始路径", () => {
    const edit = baseEdit({ moves: { "references/api.md": "references/api-v2.md" } })
    expect(resolveFileOrigin(edit, "references/api-v2.md")).toBe("references/api.md")
    expect(resolveFileOrigin(edit, "references/other.md")).toBe("references/other.md")
    expect(resolveFileOrigin(undefined, "a.md")).toBe("a.md")
  })
})

describe("skill draft store", () => {
  it("新建草稿：默认含 SKILL.md，可更新元数据与文件", () => {
    const store = useSkillDraftStore.getState()
    store.beginCreate("agents")
    store.updateCreateMeta({ name: "pdf-tools", description: "PDF" })
    store.addCreateFile("references/a.md")
    store.updateCreateFile("references/a.md", "# A")
    store.removeCreateFile("SKILL.md")

    const draft = useSkillDraftStore.getState().createDraft
    expect(draft?.targetRoot).toBe("agents")
    expect(draft?.meta.name).toBe("pdf-tools")
    expect(draft?.files).toEqual({ "SKILL.md": "", "references/a.md": "# A" })

    useSkillDraftStore.getState().setCreateTargetRoot("lx")
    expect(useSkillDraftStore.getState().createDraft?.targetRoot).toBe("lx")
    useSkillDraftStore.getState().cancelCreate()
    expect(useSkillDraftStore.getState().createDraft).toBeNull()
  })

  it("已有 Skill：内容回退到基线时移除修改标记", () => {
    const store = useSkillDraftStore.getState()
    store.ensureEdit("/skills/alpha", toMetaDraft({ ...meta, disableModelInvocation: true }))
    store.updateEditFile("/skills/alpha", "references/a.md", "changed", true)
    expect(useSkillDraftStore.getState().edits["/skills/alpha"].files).toEqual({
      "references/a.md": "changed",
    })

    store.updateEditFile("/skills/alpha", "references/a.md", "baseline", false)
    expect(useSkillDraftStore.getState().edits["/skills/alpha"].files).toEqual({})
    expect(hasEditChanges(useSkillDraftStore.getState().edits["/skills/alpha"])).toBe(false)
  })

  it("重命名后再编辑内容：内容始终以原始路径为键", () => {
    const store = useSkillDraftStore.getState()
    store.ensureEdit("/skills/alpha", meta)
    store.moveEditFile("/skills/alpha", "references/api.md", "references/api-v2.md")
    let edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.moves).toEqual({ "references/api.md": "references/api-v2.md" })

    store.updateEditFile("/skills/alpha", "references/api-v2.md", "moved content", true)
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.files).toEqual({ "references/api.md": "moved content" })

    // 再次重命名（展示路径 → 新路径）改写同一映射，不产生重复项
    store.moveEditFile("/skills/alpha", "references/api-v2.md", "references/api-v3.md")
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.moves).toEqual({ "references/api.md": "references/api-v3.md" })

    // 改名回到原名时移除映射，内容仍按原始路径保留
    store.moveEditFile("/skills/alpha", "references/api-v3.md", "references/api.md")
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.moves).toEqual({})
    expect(edit.files).toEqual({ "references/api.md": "moved content" })
  })

  it("删除与移动区分新建文件与磁盘文件", () => {
    const store = useSkillDraftStore.getState()
    store.ensureEdit("/skills/alpha", meta)

    // 磁盘文件删除 → 记入 deleted
    store.deleteEditFile("/skills/alpha", "references/old.md")
    let edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.deleted).toEqual(["references/old.md"])

    // 新建文件：created 记录 + 内容按 origin 存放
    store.addEditFile("/skills/alpha", "notes.md", "hi")
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.created).toEqual(["notes.md"])
    expect(edit.files["notes.md"]).toBe("hi")

    // 新建文件移动 → 只改 moves，不改 files 键
    store.moveEditFile("/skills/alpha", "notes.md", "docs/notes.md")
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.files["notes.md"]).toBe("hi")
    expect(edit.moves["notes.md"]).toBe("docs/notes.md")

    // 新建文件删除 → 不进入 deleted，且清掉 created 与内容
    store.deleteEditFile("/skills/alpha", "docs/notes.md")
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.files["notes.md"]).toBeUndefined()
    expect(edit.created).toEqual([])
    expect(edit.deleted).not.toContain("notes.md")
  })

  it("SKILL.md 不允许直接增删移，元数据变更可检测", () => {
    const store = useSkillDraftStore.getState()
    store.ensureEdit("/skills/alpha", meta)
    store.addEditFile("/skills/alpha", "SKILL.md", "x")
    store.deleteEditFile("/skills/alpha", "SKILL.md")
    store.moveEditFile("/skills/alpha", "SKILL.md", "SKILL2.md")

    let edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(edit.files).toEqual({})
    expect(edit.deleted).toEqual([])
    expect(edit.moves).toEqual({})
    expect(edit.created).toEqual([])

    store.updateEditMeta("/skills/alpha", { description: "new" })
    edit = useSkillDraftStore.getState().edits["/skills/alpha"]
    expect(isMetaChanged(edit)).toBe(true)
    expect(hasEditChanges(edit)).toBe(true)

    store.discardEdit("/skills/alpha")
    expect(useSkillDraftStore.getState().edits["/skills/alpha"]).toBeUndefined()
  })
})
