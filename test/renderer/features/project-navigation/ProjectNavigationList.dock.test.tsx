// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProjectNavigationList } from "@/features/project-navigation/components/ProjectNavigationList"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"

// 构造包含项目、文件夹与条目的树（collapsed 映射存在即表示展开）。
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

// 生成 DOMRect 替身。
const createRect = (top: number, height: number, left: number, width: number): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect

// 模拟系统“减少动态效果”偏好。
const stubReducedMotion = (matches: boolean): void => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

// 容器 200x300、行高 28px、行距 30px，四行依次排布。
const stubRowRects = (container: HTMLElement): void => {
  const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLElement
  const rows = Array.from(container.querySelectorAll(".lx-nav-item")) as HTMLElement[]
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === scrollContainer) return createRect(200, 300, 100, 200)
    const index = rows.indexOf(this)
    if (index >= 0) return createRect(210 + index * 30, 28, 110, 180)
    return createRect(0, 0, 0, 0)
  })
}

// 读取四行当前变换。
const readRowTransforms = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>(".lx-nav-item")).map(
    (node) => node.style.transform,
  )

// 提取变换中的 scale 数值。
const parseScale = (transform: string): number =>
  Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? Number.NaN)

// 提取变换中的 translateY 数值。
const parseTranslateY = (transform: string): number =>
  Number(/translateY\(([-\d.]+)px\)/.exec(transform)?.[1] ?? Number.NaN)

const renderList = (): ReturnType<typeof render> =>
  render(<ProjectNavigationList {...defaultProps} projects={[createProject()]} />)

describe("ProjectNavigationList dock magnify", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("列表容器保留 Dock 放大所需的横向内边距", () => {
    const { container } = renderList()
    expect((container.querySelector(".custom-scrollbar") as HTMLElement).className).toContain(
      "px-2.5",
    )
  })

  it("指针移动时按纵向 Dock 布局写入行变换", () => {
    stubReducedMotion(false)
    const { container } = renderList()
    stubRowRects(container)

    // clientY 224 = 容器顶 200 + 首行中心 24
    fireEvent.pointerMove(container.querySelector(".custom-scrollbar") as HTMLElement, {
      clientY: 224,
      clientX: 150,
    })

    const transforms = readRowTransforms(container)
    expect(transforms).toHaveLength(4)
    expect(transforms[0]).toBe("translateY(0px) scale(1.08)")
    expect(parseScale(transforms[1])).toBeCloseTo(1.0675, 3)
    expect(parseTranslateY(transforms[1])).toBeCloseTo(2.06, 2)
    expect(parseScale(transforms[3])).toBe(1)
  })

  it("指针离开后复位全部行变换", () => {
    stubReducedMotion(false)
    const { container } = renderList()
    stubRowRects(container)

    const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLElement
    fireEvent.pointerMove(scrollContainer, { clientY: 224, clientX: 150 })
    expect(readRowTransforms(container).some((transform) => transform !== "")).toBe(true)

    fireEvent.pointerLeave(scrollContainer)
    expect(readRowTransforms(container)).toEqual(["", "", "", ""])
  })

  it("列表滚动时复位全部行变换", () => {
    stubReducedMotion(false)
    const { container } = renderList()
    stubRowRects(container)

    const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLElement
    fireEvent.pointerMove(scrollContainer, { clientY: 254, clientX: 150 })
    expect(readRowTransforms(container).some((transform) => transform !== "")).toBe(true)

    fireEvent.scroll(scrollContainer)
    expect(readRowTransforms(container)).toEqual(["", "", "", ""])
  })

  it("系统减少动态效果时不做放大", () => {
    stubReducedMotion(true)
    const { container } = renderList()
    stubRowRects(container)

    fireEvent.pointerMove(container.querySelector(".custom-scrollbar") as HTMLElement, {
      clientY: 224,
      clientX: 150,
    })

    expect(readRowTransforms(container)).toEqual(["", "", "", ""])
  })
})
