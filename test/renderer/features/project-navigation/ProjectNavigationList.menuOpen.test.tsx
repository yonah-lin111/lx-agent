// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProjectNavigationList } from "@/features/project-navigation/components/ProjectNavigationList"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"

// 构造包含项目、文件夹与条目的树。
const createProject = (): ProjectNavigationProject => ({
  id: "p1",
  name: "Test Proj",
  isImported: true,
  createdAt: "",
  updatedAt: "",
  projectFolders: [
    {
      id: "f1",
      name: "Folder 1",
      createdAt: "",
      updatedAt: "",
      projectFolders: [],
      prompts: [{ id: "item1", name: "Prompt 1", status: "todo", createdAt: "", updatedAt: "" }],
    },
  ],
  prompts: [],
})

const defaultProps = {
  searchKeyword: "",
  activePromptId: "",
  editingItem: null,
  collapsedProjects: { p1: true },
  collapsedProjectFolders: { f1: true },
  onItemOpen: vi.fn(),
  onPromptStatusChange: vi.fn(),
  onEditingItemChange: vi.fn(),
  onEditingItemCommit: vi.fn(),
  onEditingItemCancel: vi.fn(),
  onProjectToggle: vi.fn(),
  onProjectFolderToggle: vi.fn(),
  onOpenMenu: vi.fn(),
}

describe("ProjectNavigationList menu-open highlight", () => {
  afterEach(cleanup)

  it("activeMenuId 命中当前右键目标时仅标记该节点 data-menu-open", () => {
    const targets = [
      ["p1", '[data-item-level="project"]'],
      ["f1", '[data-item-level="folder"]'],
      ["item1", '[data-item-level="prompt"]'],
    ] as const

    for (const [menuId, selector] of targets) {
      const view = render(
        <ProjectNavigationList
          {...defaultProps}
          projects={[createProject()]}
          activeMenuId={menuId}
        />,
      )
      const row = view.container.querySelector(selector)
      expect(row?.getAttribute("data-menu-open")).toBe("true")
      expect(view.container.querySelectorAll("[data-menu-open]")).toHaveLength(1)
      view.unmount()
    }
  })

  it("activeMenuId 为空时不标记任何节点", () => {
    const { container } = render(
      <ProjectNavigationList {...defaultProps} projects={[createProject()]} activeMenuId={null} />,
    )
    expect(container.querySelectorAll("[data-menu-open]")).toHaveLength(0)
  })
})
