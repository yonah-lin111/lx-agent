// @vitest-environment jsdom

import type { InstructionFileInfo } from "@shared/contracts/agent"
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

import { AgentsMdSettings } from "@/features/settings/components/AgentsMdSettings"
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

const getInstruction =
  vi.fn<(scope: string, projectPath?: string) => Promise<InstructionFileInfo>>()
const saveInstruction = vi.fn<(input: unknown) => Promise<InstructionFileInfo>>()

const userInfo = (): InstructionFileInfo => ({
  scope: "user",
  path: "/home/user/.lx/AGENTS.md",
  exists: true,
  content: "global rules",
  chain: [],
  fallback: null,
})

const projectInfo = (): InstructionFileInfo => ({
  scope: "project",
  path: "/repo/apps/web/AGENTS.md",
  exists: false,
  content: null,
  chain: [{ path: "/repo/AGENTS.md", exists: true }],
  fallback: { path: "/repo/apps/web/CLAUDE.md", content: "claude rules" },
})

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <AgentsMdSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsDraftStore.getState().setActiveSection("agents-md")
  getInstruction.mockImplementation(async (scope: string) =>
    scope === "user" ? userInfo() : projectInfo(),
  )
  saveInstruction.mockResolvedValue(userInfo())
  window.api = {
    agent: { getInstruction, saveInstruction },
    project: {
      projects: { list: async () => [{ id: "p1", name: "Web App", path: "/repo/apps/web" }] },
      items: { list: async () => [] },
    },
    settings: { getUiSettings: async () => ({ locale: "en" as const }) },
  } as unknown as typeof window.api
})

describe("AgentsMdSettings", () => {
  it("默认展示系统提示词、文件路径与正文", async () => {
    renderComponent()

    expect(await screen.findByText("Global AGENTS.md")).toBeTruthy()
    expect(screen.getAllByText("/home/user/.lx/AGENTS.md").length).toBeGreaterThan(0)
    expect(screen.getByText("Configured")).toBeTruthy()
    expect((screen.getByTestId("markdown-editor") as HTMLTextAreaElement).value).toBe(
      "global rules",
    )
  })

  it("项目提示词展示只读上级指令链与 CLAUDE.md fallback，可复制其内容", async () => {
    renderComponent()
    await screen.findByText("Global AGENTS.md")

    fireEvent.click(screen.getByText("Project Prompt"))

    const chainToggle = await screen.findByText(/Read-only Parent Instructions/)
    expect(chainToggle).toBeTruthy()
    // 展开只读指令链后列出完整路径
    fireEvent.click(chainToggle)
    expect(await screen.findByText("/repo/AGENTS.md")).toBeTruthy()
    expect(screen.getByText(/No AGENTS\.md at the project root/)).toBeTruthy()

    fireEvent.click(screen.getByText("Copy Content"))
    await waitFor(() => {
      expect((screen.getByTestId("markdown-editor") as HTMLTextAreaElement).value).toBe(
        "claude rules",
      )
    })
  })

  it("编辑后标记脏状态，全局保存写回用户级 AGENTS.md 并清除脏状态", async () => {
    renderComponent()
    await screen.findByText("Global AGENTS.md")

    fireEvent.change(screen.getByTestId("markdown-editor"), {
      target: { value: "updated rules" },
    })
    expect(useSettingsDraftStore.getState().isDirty).toBe(true)

    const saved = await useSettingsDraftStore.getState().save()
    expect(saved).toBe(true)
    expect(saveInstruction).toHaveBeenCalledWith({ scope: "user", content: "updated rules" })
    expect(useSettingsDraftStore.getState().isDirty).toBe(false)
  })

  it("项目列表行点击切换选中项目并加载对应指令文件", async () => {
    getInstruction.mockImplementation(async (scope: string, projectPath?: string) =>
      scope === "user"
        ? userInfo()
        : { ...projectInfo(), path: `${projectPath}/AGENTS.md`, content: null },
    )
    window.api = {
      agent: { getInstruction, saveInstruction },
      project: {
        projects: {
          list: async () => [
            { id: "p1", name: "Web App", path: "/repo/apps/web" },
            { id: "p2", name: "Second App", path: "/repo/second" },
          ],
        },
        items: { list: async () => [] },
      },
      settings: { getUiSettings: async () => ({ locale: "en" as const }) },
    } as unknown as typeof window.api

    renderComponent()
    await screen.findByText("Global AGENTS.md")
    fireEvent.click(screen.getByText("Project Prompt"))

    await waitFor(() => {
      expect(getInstruction).toHaveBeenCalledWith("project", "/repo/apps/web")
    })

    fireEvent.click(screen.getByText("Second App"))

    await waitFor(() => {
      expect(getInstruction).toHaveBeenCalledWith("project", "/repo/second")
    })
    expect(screen.getAllByText("/repo/second/AGENTS.md").length).toBeGreaterThan(0)
  })

  it("重置丢弃当前草稿回到基线内容", async () => {
    renderComponent()
    await screen.findByText("Global AGENTS.md")

    fireEvent.change(screen.getByTestId("markdown-editor"), {
      target: { value: "draft change" },
    })
    useSettingsDraftStore.getState().reset()

    await waitFor(() => {
      const editor = screen.getByTestId("markdown-editor") as HTMLTextAreaElement
      expect(editor.value).toBe("global rules")
    })
    expect(useSettingsDraftStore.getState().isDirty).toBe(false)
  })
})
