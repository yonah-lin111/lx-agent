// @vitest-environment jsdom

// 回归：设置页编辑器挂载时机 —— 选中 Skill 后正文必须进入 CodeMirror，
// 保存后重载（缓存清空 → 重新读盘）也不得丢正文（真实编辑器，不用 mock）。

import { EditorView } from "@codemirror/view"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// jsdom 未实现 Range 测量，CodeMirror 渲染需要最小实现。
const rect = {
  left: 10,
  right: 10,
  top: 5,
  bottom: 25,
  width: 0,
  height: 20,
  x: 10,
  y: 5,
  toJSON: () => ({}),
} as DOMRect
Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => rect

import { SkillSettings } from "@/features/settings/components/SkillSettings"
import { useSkillDraftStore } from "@/features/settings/components/SkillSettings/skillDrafts"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"

// 磁盘上的 SKILL.md 正文：保存会写回这里，重载从读取。
let diskContent = "skill body"

const saveSkill = vi.fn(async (input: { content: string }) => {
  diskContent = input.content
  return {
    ok: true as const,
    filePath: "/home/u/.lx/skills/pdf-tools/SKILL.md",
    baseDir: "/home/u/.lx/skills/pdf-tools",
  }
})

// 读取当前 CodeMirror 文档内容。
const docText = (): string => {
  const element = document.querySelector(".cm-editor") as HTMLElement | null
  if (!element) return "<no editor>"
  const view = EditorView.findFromDOM(element)
  return view ? view.state.doc.toString() : "<no view>"
}

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <SkillSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  diskContent = "skill body"
  useSkillDraftStore.getState().discardAll()
  useSettingsDraftStore.getState().setActiveSection("skills")

  window.api = {
    agent: {
      listSkills: async () => [
        {
          name: "pdf-tools",
          description: "PDF processing",
          filePath: "/home/u/.lx/skills/pdf-tools/SKILL.md",
          baseDir: "/home/u/.lx/skills/pdf-tools",
          disableModelInvocation: false,
          isGlobal: true,
          sourceKind: "lx",
        },
      ],
      getSkillContent: async () => diskContent,
      listSkillFiles: async () => [
        { relativePath: "SKILL.md", name: "SKILL.md", kind: "file", sizeBytes: 10 },
      ],
      readSkillFile: async () => ({ ok: true, content: "file content" }),
      writeSkillFile: async () => ({ ok: true }),
      deleteSkillFile: async () => ({ ok: true }),
      moveSkillFile: async () => ({ ok: true }),
      importSkillFiles: async () => ({ ok: true, files: [] }),
      saveSkill,
    },
    settings: {
      getSkillSettings: async () => ({ disabled: [] }),
      saveSkillSettings: async (settings: { disabled: string[] }) => settings,
      deleteSkill: async () => ({ success: true }),
      getUiSettings: async () => ({ locale: "en" as const }),
    },
    project: {
      projects: { list: async () => [{ id: "p1", name: "Web App", path: "/repo/apps/web" }] },
      items: { list: async () => [] },
    },
  } as unknown as typeof window.api
})

describe("SkillSettings 编辑器正文同步", () => {
  it("选中 Skill 后编辑器渲染磁盘正文，不在空基线上挂载", async () => {
    renderComponent()
    await screen.findByText("pdf-tools")

    await waitFor(() => {
      expect(docText()).toBe("skill body")
    })
  })

  it("保存后重载正文仍保留（缓存清空不吞内容）", async () => {
    renderComponent()
    await screen.findByText("pdf-tools")
    await waitFor(() => {
      expect(docText()).toBe("skill body")
    })

    const editorElement = document.querySelector(".cm-editor") as HTMLElement
    const view = EditorView.findFromDOM(editorElement)
    if (!view) throw new Error("editor view not found")
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "updated body" } })
    await waitFor(() => {
      expect(docText()).toBe("updated body")
    })

    const saved = await useSettingsDraftStore.getState().save()
    expect(saved).toBe(true)
    expect(saveSkill).toHaveBeenCalled()

    await waitFor(() => {
      expect(docText()).toBe("updated body")
    })
  })
})
