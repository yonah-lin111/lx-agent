// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type React from "react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LeftSideBar } from "@/components/layout/LeftSideBar"
import { LeftSideBarDockNav } from "@/components/layout/LeftSideBarDockNav"

// 生成 DOMRect 替身。
const createRect = (left: number, width: number, height = 24): DOMRect =>
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

// 容器 200px 宽、6 项各 24px、间距 4px，居中排布。
const stubDockRects = (): void => {
  const container = document.querySelector(".sidebar-dock-nav") as HTMLElement
  const items = Array.from(document.querySelectorAll(".sidebar-dock-item")) as HTMLElement[]
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === container) return createRect(100, 200, 32)
    const index = items.indexOf(this)
    if (index >= 0) return createRect(118 + index * 28, 24, 24)
    return createRect(0, 0, 0)
  })
}

// 读取所有导航项的当前变换。
const readDockTransforms = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".sidebar-dock-item")).map(
    (node) => node.style.transform,
  )

// 提取变换中的 scale 数值。
const parseScale = (transform: string): number =>
  Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? Number.NaN)

// 提取变换中的 translateX 数值。
const parseTranslateX = (transform: string): number =>
  Number(/translateX\(([-\d.]+)px\)/.exec(transform)?.[1] ?? Number.NaN)

// 展示当前路由路径，用于断言导航跳转。
const LocationProbe = (): React.JSX.Element => {
  const { pathname } = useLocation()
  return <span data-testid="location-path">{pathname}</span>
}

// 渲染底部 Dock 导航。
const renderDockNav = (
  props: { isCollapsed?: boolean; withProbe?: boolean } = {},
): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <LeftSideBarDockNav isCollapsed={props.isCollapsed ?? false} />
      {props.withProbe ? <LocationProbe /> : null}
    </MemoryRouter>,
  )

describe("LeftSideBarDockNav", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("渲染全部主导航项并标记当前路由", () => {
    render(
      <MemoryRouter initialEntries={["/ui"]}>
        <LeftSideBarDockNav isCollapsed={false} />
      </MemoryRouter>,
    )

    expect(document.querySelectorAll(".sidebar-dock-item").length).toBe(6)
    expect(screen.getByLabelText("Open UI Preview Page").getAttribute("aria-current")).toBe("page")
    expect(screen.getByLabelText("Open Home Page").getAttribute("aria-current")).toBeNull()
  })

  it("点击导航项跳转到对应路由", () => {
    renderDockNav({ withProbe: true })

    fireEvent.click(screen.getByLabelText("Open Projects Page"))

    expect(screen.getByTestId("location-path").textContent).toBe("/project")
  })

  it("指针移动时按 Dock 布局写入变换", () => {
    stubReducedMotion(false)
    renderDockNav()
    stubDockRects()

    fireEvent.pointerMove(document.querySelector(".sidebar-dock-nav") as HTMLElement, {
      clientX: 130,
    })

    const transforms = readDockTransforms()
    expect(transforms[0]).toBe("translateX(0px) scale(1.5)")
    expect(parseScale(transforms[1])).toBeCloseTo(1.281, 3)
    // 写入样式前按 2 位小数取整：9.375 → 9.38
    expect(parseTranslateX(transforms[1])).toBe(9.38)
    expect(parseScale(transforms[5])).toBe(1)
  })

  it("指针离开后复位全部变换", () => {
    stubReducedMotion(false)
    renderDockNav()
    stubDockRects()

    const container = document.querySelector(".sidebar-dock-nav") as HTMLElement
    fireEvent.pointerMove(container, { clientX: 130 })
    expect(readDockTransforms().some((transform) => transform !== "")).toBe(true)

    fireEvent.pointerLeave(container)
    expect(readDockTransforms()).toEqual(["", "", "", "", "", ""])
  })

  it("窗口尺寸变化时复位全部变换", () => {
    stubReducedMotion(false)
    renderDockNav()
    stubDockRects()

    const container = document.querySelector(".sidebar-dock-nav") as HTMLElement
    fireEvent.pointerMove(container, { clientX: 158 })
    expect(readDockTransforms().some((transform) => transform !== "")).toBe(true)

    fireEvent(window, new Event("resize"))
    expect(readDockTransforms()).toEqual(["", "", "", "", "", ""])
  })

  it("系统减少动态效果时不做放大", () => {
    stubReducedMotion(true)
    renderDockNav()
    stubDockRects()

    fireEvent.pointerMove(document.querySelector(".sidebar-dock-nav") as HTMLElement, {
      clientX: 130,
    })

    expect(readDockTransforms()).toEqual(["", "", "", "", "", ""])
  })

  it("折叠态不启用放大", () => {
    stubReducedMotion(false)
    renderDockNav({ isCollapsed: true })
    stubDockRects()

    const container = document.querySelector(".sidebar-dock-nav") as HTMLElement
    expect(container.className).toContain("flex-col")
    fireEvent.pointerMove(container, { clientX: 130 })

    expect(readDockTransforms()).toEqual(["", "", "", "", "", ""])
  })
})

describe("LeftSideBar 集成", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("渲染主导航并支持折叠切换", () => {
    stubReducedMotion(false)
    render(
      <MemoryRouter initialEntries={["/"]}>
        <LeftSideBar>
          <div>侧栏内容</div>
        </LeftSideBar>
      </MemoryRouter>,
    )

    expect(document.querySelectorAll(".sidebar-dock-item").length).toBe(6)

    fireEvent.click(screen.getByLabelText("Collapse Sidebar"))

    expect((document.querySelector(".sidebar-dock-nav") as HTMLElement).className).toContain(
      "flex-col",
    )
    expect(screen.getByLabelText("Expand Sidebar")).not.toBeNull()
  })
})
