// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProjectNavigationMenu } from "@/features/project-navigation/components/ProjectNavigationMenu"

describe("ProjectNavigationMenu import/unimport actions", () => {
  afterEach(cleanup)

  const defaultProps = {
    isOpen: true,
    title: "Test Project",
    x: 100,
    y: 100,
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onToggleImportProject: vi.fn(),
  }

  it("当项目为未导入状态时展示导入操作并可触发回调", () => {
    const onToggle = vi.fn()
    render(
      <ProjectNavigationMenu
        {...defaultProps}
        type="project"
        isImported={false}
        onToggleImportProject={onToggle}
      />,
    )

    const importItem = screen.getByText(/^(Import|导入项目)$/)
    expect(importItem).toBeDefined()
    importItem.click()
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it("当项目为已导入状态时展示设为未导入操作并可触发回调", () => {
    const onToggle = vi.fn()
    render(
      <ProjectNavigationMenu
        {...defaultProps}
        type="project"
        isImported={true}
        onToggleImportProject={onToggle}
      />,
    )

    const unimportItem = screen.getByText(/^(Unimport|设为未导入)$/)
    expect(unimportItem).toBeDefined()
    unimportItem.click()
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it("当项目包含物理路径时展示复制项目路径选项并可触发回调", () => {
    const onCopy = vi.fn()
    render(
      <ProjectNavigationMenu
        {...defaultProps}
        type="project"
        path="/Users/yonah/my-project"
        onCopyProjectPath={onCopy}
      />,
    )

    const copyItem = screen.getByText(/^(Copy Project Path|复制项目路径)$/)
    expect(copyItem).toBeDefined()
    copyItem.click()
    expect(onCopy).toHaveBeenCalledOnce()
  })

  it("当项目无物理路径时不展示复制项目路径选项", () => {
    const onCopy = vi.fn()
    render(
      <ProjectNavigationMenu {...defaultProps} type="project" path="" onCopyProjectPath={onCopy} />,
    )

    const copyItem = screen.queryByText(/^(Copy Project Path|复制项目路径)$/)
    expect(copyItem).toBeNull()
  })
})
