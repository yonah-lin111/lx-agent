// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProjectNavigationList } from "@/features/project-navigation/components/ProjectNavigationList"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"

describe("ProjectNavigationList unimported items", () => {
  afterEach(cleanup)

  const defaultProps = {
    searchKeyword: "",
    activePromptId: "",
    editingItem: null,
    collapsedProjects: {},
    collapsedProjectFolders: {},
    onItemOpen: vi.fn(),
    onPromptStatusChange: vi.fn(),
    onEditingItemChange: vi.fn(),
    onEditingItemCommit: vi.fn(),
    onEditingItemCancel: vi.fn(),
    onProjectToggle: vi.fn(),
    onProjectFolderToggle: vi.fn(),
    onOpenMenu: vi.fn(),
  }

  it("未导入项目渲染小圆点且不渲染 LxTag", () => {
    const unimportedProject: ProjectNavigationProject = {
      id: "u1",
      name: "Unimported Proj",
      isImported: false,
      createdAt: "",
      updatedAt: "",
      projectFolders: [],
      prompts: [],
    }

    const { container } = render(
      <ProjectNavigationList {...defaultProps} projects={[unimportedProject]} />,
    )

    const projectRow = container.querySelector(
      '[data-item-level="project"][data-unimported="true"]',
    )
    expect(projectRow).not.toBeNull()

    const dot = projectRow?.querySelector(".rounded-full")
    expect(dot).not.toBeNull()

    const tag = container.querySelector(".lx-tag")
    expect(tag).toBeNull()
  })
})
