// @vitest-environment jsdom

import type { SkillFileEntry, SkillItem } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/LxMarkdown/LxMarkdownEditor", () => ({
  LxMarkdownEditor: ({
    initialContent,
    onChange,
  }: {
    initialContent?: string
    onChange?: (value: string) => void
  }) => (
    <textarea
      data-testid="markdown-editor"
      value={initialContent ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

import { SkillSettings } from "@/features/settings/components/SkillSettings"
import { useSkillDraftStore } from "@/features/settings/components/SkillSettings/skillDrafts"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"

// jsdom 未实现 ResizeObserver（LxSelect 滚动定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const listSkills = vi.fn<(cwd?: string, force?: boolean) => Promise<SkillItem[]>>()
const getSkillContent = vi.fn<(name: string, cwd?: string) => Promise<string | null>>()
const listSkillFiles = vi.fn<(skillDir: string) => Promise<SkillFileEntry[]>>()
const readSkillFile = vi.fn()
const writeSkillFile = vi.fn(async () => ({ ok: true as const }))
const saveSkill = vi.fn(async () => ({
  ok: true as const,
  filePath: "/home/u/.lx/skills/pdf-tools/SKILL.md",
  baseDir: "/home/u/.lx/skills/pdf-tools",
}))
const saveSkillSettings = vi.fn(async (settings: { disabled: string[] }) => settings)
const deleteSkill = vi.fn(async () => ({ success: true }))

const globalSkill: SkillItem = {
  name: "pdf-tools",
  description: "PDF processing",
  filePath: "/home/u/.lx/skills/pdf-tools/SKILL.md",
  baseDir: "/home/u/.lx/skills/pdf-tools",
  disableModelInvocation: false,
  isGlobal: true,
  sourceKind: "lx",
}

const agentsSkill: SkillItem = {
  name: "ego-browser",
  description: "Browser automation",
  filePath: "/home/u/.agents/skills/ego-browser/SKILL.md",
  baseDir: "/home/u/.agents/skills/ego-browser",
  disableModelInvocation: false,
  isGlobal: true,
  sourceKind: "agents",
}

const projectSkill: SkillItem = {
  name: "proj-skill",
  description: "Project scoped",
  filePath: "/repo/apps/web/.agents/skills/proj-skill/SKILL.md",
  baseDir: "/repo/apps/web/.agents/skills/proj-skill",
  disableModelInvocation: false,
  isGlobal: false,
  sourceKind: "agents",
}

const diskFiles = (): SkillFileEntry[] => [
  {
    relativePath: "SKILL.md",
    name: "SKILL.md",
    kind: "file",
    sizeBytes: 10,
  },
  {
    relativePath: "references",
    name: "references",
    kind: "directory",
    sizeBytes: 0,
  },
  {
    relativePath: "references/api.md",
    name: "api.md",
    kind: "file",
    sizeBytes: 4,
  },
]

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <SkillSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSkillDraftStore.getState().discardAll()
  useSettingsDraftStore.getState().setActiveSection("skills")

  listSkills.mockResolvedValue([globalSkill, agentsSkill, projectSkill])
  getSkillContent.mockResolvedValue("skill body")
  listSkillFiles.mockResolvedValue(diskFiles())
  readSkillFile.mockImplementation(async (_dir: string, path: string) => ({
    ok: true as const,
    content: path === "references/api.md" ? "# api reference" : "file content",
  }))

  window.api = {
    agent: {
      listSkills,
      getSkillContent,
      listSkillFiles,
      readSkillFile,
      writeSkillFile,
      deleteSkillFile: vi.fn(async () => ({ ok: true })),
      moveSkillFile: vi.fn(async () => ({ ok: true })),
      importSkillFiles: vi.fn(async () => ({ ok: true, files: [] })),
      saveSkill,
    },
    settings: {
      getSkillSettings: async () => ({ disabled: [] }),
      saveSkillSettings,
      deleteSkill,
      getUiSettings: async () => ({ locale: "en" as const }),
    },
    project: {
      projects: { list: async () => [{ id: "p1", name: "Web App", path: "/repo/apps/web" }] },
      items: { list: async () => [] },
    },
  } as unknown as typeof window.api
})

describe("SkillSettings", () => {
  it("全局作用域仅显示全局技能并带来源标签，切换项目后按项目加载", async () => {
    renderComponent()

    expect(await screen.findByText("pdf-tools")).toBeTruthy()
    expect(screen.getByText("ego-browser")).toBeTruthy()
    expect(screen.queryByText("proj-skill")).toBeNull()
    expect(screen.getByText(".agents")).toBeTruthy()

    fireEvent.click(screen.getByText("Project"))

    await waitFor(() => {
      expect(listSkills).toHaveBeenCalledWith("/repo/apps/web", false)
    })
    expect(screen.getAllByText("proj-skill").length).toBeGreaterThan(0)
  })

  it("选中技能后加载文件树与 SKILL.md 正文", async () => {
    renderComponent()
    await screen.findByText("pdf-tools")

    await waitFor(() => {
      expect(listSkillFiles).toHaveBeenCalledWith("/home/u/.lx/skills/pdf-tools")
    })
    expect(screen.getByText("api.md")).toBeTruthy()
    expect(getSkillContent).toHaveBeenCalledWith("pdf-tools", undefined)

    await waitFor(() => {
      expect((screen.getByTestId("markdown-editor") as HTMLTextAreaElement).value).toBe(
        "skill body",
      )
    })

    fireEvent.click(screen.getByText("api.md"))
    await waitFor(() => {
      expect(readSkillFile).toHaveBeenCalledWith(
        "/home/u/.lx/skills/pdf-tools",
        "references/api.md",
      )
    })
  })

  it("编辑正文后全局保存写回 SKILL.md（originalDir 锚定）", async () => {
    renderComponent()
    await screen.findByText("pdf-tools")
    await waitFor(() => {
      expect((screen.getByTestId("markdown-editor") as HTMLTextAreaElement).value).toBe(
        "skill body",
      )
    })

    fireEvent.change(screen.getByTestId("markdown-editor"), {
      target: { value: "updated body" },
    })
    expect(useSettingsDraftStore.getState().isDirty).toBe(true)

    const saved = await useSettingsDraftStore.getState().save()
    expect(saved).toBe(true)
    expect(saveSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        originalDir: "/home/u/.lx/skills/pdf-tools",
        name: "pdf-tools",
        content: "updated body",
        targetRoot: "lx",
      }),
    )
    expect(useSettingsDraftStore.getState().isDirty).toBe(false)
  })

  it("新建草稿保存时携带目标根目录与正文", async () => {
    renderComponent()
    await screen.findByText("pdf-tools")

    fireEvent.click(screen.getByLabelText("New Skill"))
    expect(await screen.findByText("Draft")).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText("e.g. pdf-processing"), {
      target: { value: "brand-new" },
    })
    fireEvent.change(
      screen.getByPlaceholderText(
        "What the skill does and when to use it, e.g. Extract PDF text and fill forms. Use when handling PDFs.",
      ),
      { target: { value: "Brand new skill" } },
    )
    fireEvent.change(screen.getByTestId("markdown-editor"), {
      target: { value: "# Body" },
    })

    const saved = await useSettingsDraftStore.getState().save()
    expect(saved).toBe(true)
    expect(saveSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user",
        targetRoot: "lx",
        name: "brand-new",
        description: "Brand new skill",
        content: "# Body",
      }),
    )
    expect(useSkillDraftStore.getState().createDraft).toBeNull()
  })
})
