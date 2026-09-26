// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { projectApi } from "@/features/project/api/projectApi"
import { ProjectRecentItemsTags } from "@/features/project/components/ProjectRecentItemsTags"
import { useRecentItemsStore } from "@/features/project/recentItemsStore"

// Mock ResizeObserver for jsdom environment（每个用例重建，避免被 unstubAllGlobals 清理）。
const stubResizeObserver = (): void => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = (): void => undefined
      unobserve = (): void => undefined
      disconnect = (): void => undefined
    },
  )
}
stubResizeObserver()

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn(),
    listFolders: vi.fn(),
    list: vi.fn(),
  },
}))

const mockedApi = vi.mocked(projectApi)

// 生成 DOMRect 替身。
const createRect = (left: number, width: number, height: number): DOMRect =>
  ({
    x: left,
    y: 0,
    left,
    right: left + width,
    top: 0,
    bottom: height,
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

// 读取滚动容器与三个芯片外层（变换目标）。
const readDockNodes = (
  container: HTMLElement,
): { scroller: HTMLElement; wrappers: HTMLElement[] } => {
  const scroller = container.querySelector(".scrollbar-hidden") as HTMLElement
  const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".project-recent-tag")).map(
    (chip) => chip.parentElement as HTMLElement,
  )
  return { scroller, wrappers }
}

// 滚动容器 200x32、三个芯片宽 60/40/30、间距 4px。
const stubTagRects = (scroller: HTMLElement, wrappers: HTMLElement[]): void => {
  const layout = [
    { left: 104, width: 60 },
    { left: 168, width: 40 },
    { left: 212, width: 30 },
  ]
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === scroller) return createRect(100, 200, 32)
    const index = wrappers.indexOf(this)
    if (index >= 0) {
      const item = layout[index]
      return item ? createRect(item.left, item.width, 24) : createRect(0, 0, 0)
    }
    return createRect(0, 0, 0)
  })
}

// 提取变换中的 scale 数值。
const parseScale = (transform: string): number =>
  Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? Number.NaN)

// 渲染三个最近打开芯片并等待异步卡片解析完成。
const renderTags = async (): Promise<HTMLElement> => {
  useRecentItemsStore.setState({ ids: ["item-1", "item-2", "item-3"] })
  mockedApi.listProjects.mockResolvedValue([
    {
      id: "p1",
      name: "Project A",
      type: "virtual",
      referencedFolders: [],
      createdAt: "",
      updatedAt: "",
    },
  ])
  mockedApi.listFolders.mockResolvedValue([])
  mockedApi.list.mockResolvedValue(
    ["item-1", "item-2", "item-3"].map((id, index) => ({
      id,
      projectId: "p1",
      name: `Item ${index + 1}`,
      itemData: "[]",
      enabledFolderPaths: [],
      status: "todo" as const,
      createdAt: "",
      updatedAt: "",
    })),
  )

  let container: HTMLElement
  await act(async () => {
    ;({ container } = render(<ProjectRecentItemsTags />))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  return container!
}

describe("ProjectRecentItemsTags dock magnify", () => {
  beforeEach(() => {
    stubResizeObserver()
    localStorage.clear()
    useRecentItemsStore.setState({ ids: [] })
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("滚动容器加高到 h-8 以容纳芯片放大", async () => {
    const container = await renderTags()
    const { scroller } = readDockNodes(container)
    expect(scroller.className).toContain("h-8")
    expect(scroller.className).toContain("overflow-x-auto")
  })

  it("指针在芯片内时该芯片达到放大上限，邻居按边缘距离衰减", async () => {
    stubReducedMotion(false)
    const container = await renderTags()
    const { scroller, wrappers } = readDockNodes(container)
    expect(wrappers).toHaveLength(3)
    stubTagRects(scroller, wrappers)

    // clientX 134 = 容器左 100 + 首个芯片中心 34
    fireEvent.pointerMove(scroller, { clientX: 134 })

    expect(wrappers[0].style.transform).toBe("translateX(0px) scale(1.2)")
    expect(parseScale(wrappers[1].style.transform)).toBeCloseTo(1.1208, 3)
    expect(parseScale(wrappers[2].style.transform)).toBe(1)
    // 宽芯片右边缘处仍为最大放大（edge 模式，center 模式会失效）
    expect(parseScale(wrappers[2].style.transform)).toBe(1)
  })

  it("指针离开后复位全部芯片变换", async () => {
    stubReducedMotion(false)
    const container = await renderTags()
    const { scroller, wrappers } = readDockNodes(container)
    stubTagRects(scroller, wrappers)

    fireEvent.pointerMove(scroller, { clientX: 134 })
    expect(wrappers[0].style.transform).not.toBe("")

    fireEvent.pointerLeave(scroller)
    expect(wrappers.map((wrapper) => wrapper.style.transform)).toEqual(["", "", ""])
  })

  it("横向滚动时复位全部芯片变换", async () => {
    stubReducedMotion(false)
    const container = await renderTags()
    const { scroller, wrappers } = readDockNodes(container)
    stubTagRects(scroller, wrappers)

    fireEvent.pointerMove(scroller, { clientX: 188 })
    expect(wrappers.some((wrapper) => wrapper.style.transform !== "")).toBe(true)

    fireEvent.scroll(scroller)
    expect(wrappers.map((wrapper) => wrapper.style.transform)).toEqual(["", "", ""])
  })
})
