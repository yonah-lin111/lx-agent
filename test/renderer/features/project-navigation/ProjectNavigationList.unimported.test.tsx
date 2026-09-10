// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
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

  it("未导入项目以灰色半透明展示，且不渲染小圆点与 LxTag", () => {
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
    expect(projectRow?.className).toContain("opacity-75")

    // 验证小圆点与 LxTag 均不存在
    const dot = projectRow?.querySelector(".rounded-full")
    expect(dot).toBeNull()

    const tag = container.querySelector(".lx-tag")
    expect(tag).toBeNull()

    // 验证未导入项目图标替换为 FolderGit
    expect(projectRow?.querySelector(".lucide-folder-git")).not.toBeNull()
    expect(projectRow?.querySelector(".lucide-boxes")).toBeNull()
  })

  it("已导入项目渲染 Boxes 图标", () => {
    const importedProject: ProjectNavigationProject = {
      id: "i1",
      name: "Imported Proj",
      isImported: true,
      createdAt: "",
      updatedAt: "",
      projectFolders: [],
      prompts: [],
    }

    const { container } = render(
      <ProjectNavigationList {...defaultProps} projects={[importedProject]} />,
    )

    const projectRow = container.querySelector('[data-item-level="project"]')
    expect(projectRow).not.toBeNull()
    expect(projectRow?.querySelector(".lucide-boxes")).not.toBeNull()
    expect(projectRow?.querySelector(".lucide-folder-git")).toBeNull()
  })

  it("右键项目条目时调用 onOpenMenu 并传递包含物理路径的项目数据", () => {
    const onOpenMenu = vi.fn()
    const projectWithPath: ProjectNavigationProject = {
      id: "p-path",
      name: "Path Proj",
      path: "/Users/yonah/projects/demo",
      isImported: true,
      createdAt: "",
      updatedAt: "",
      projectFolders: [],
      prompts: [],
    }

    const { container } = render(
      <ProjectNavigationList
        {...defaultProps}
        projects={[projectWithPath]}
        onOpenMenu={onOpenMenu}
      />,
    )

    const projectRow = container.querySelector('[data-item-level="project"]')
    expect(projectRow).not.toBeNull()
    fireEvent.contextMenu(projectRow!)

    expect(onOpenMenu).toHaveBeenCalledOnce()
    expect(onOpenMenu).toHaveBeenCalledWith(
      expect.anything(),
      "project",
      expect.objectContaining({
        id: "p-path",
        path: "/Users/yonah/projects/demo",
      }),
    )
  })
})
