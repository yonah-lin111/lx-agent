// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { FrontDesignPage } from "@/pages/front-design/FrontDesignPage"

describe("FrontDesignPage 视图模式与边距展示", () => {
  beforeEach(() => {
    cleanup()
    frontDesignStore.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    frontDesignStore.clear()
  })

  it("无 HTML 时渲染空状态且 main 区域保留 p-4", () => {
    const { container } = render(<FrontDesignPage />)
    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    expect(main?.className).toContain("p-4")
    expect(container.querySelector("iframe")).toBeNull()
  })

  it("Desktop 模式下有 HTML 内容时 main 区域为 p-0 且预览容器无边框与圆角贴边", () => {
    frontDesignStore.registerDesign({
      id: "test-design-1",
      title: "Hero Design",
      html: "<div class='p-4'>Hello World</div>",
      updatedAt: Date.now(),
    })

    const { container } = render(<FrontDesignPage />)
    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    // 桌面端贴边：移除外边距
    expect(main?.className).toContain("p-0")
    expect(main?.className).not.toContain("p-4")

    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()

    const previewContainer = iframe?.parentElement
    expect(previewContainer?.className).toContain("rounded-none")
    expect(previewContainer?.className).toContain("border-none")
    expect(previewContainer?.className).toContain("shadow-none")
    expect(previewContainer?.className).toContain("max-w-full")
  })

  it("切换为 Tablet 与 Mobile 模式时保留设备卡片圆角、阴影与 p-4 边距", () => {
    frontDesignStore.registerDesign({
      id: "test-design-2",
      title: "Responsive Design",
      html: "<div>Responsive</div>",
      updatedAt: Date.now(),
    })

    const { container } = render(<FrontDesignPage />)

    // 点击平板视口按钮
    const tabletBtn = screen.getByRole("button", { name: /平板视口|Tablet/i })
    fireEvent.click(tabletBtn)

    const main = container.querySelector("main")
    expect(main?.className).toContain("p-4")
    expect(main?.className).not.toContain("p-0")

    const iframe = container.querySelector("iframe")
    const previewContainer = iframe?.parentElement
    expect(previewContainer?.className).toContain("max-w-[768px]")
    expect(previewContainer?.className).toContain("rounded-[8px]")
    expect(previewContainer?.className).toContain("border-white/10")

    // 点击手机视口按钮
    const mobileBtn = screen.getByRole("button", { name: /手机视口|Mobile/i })
    fireEvent.click(mobileBtn)

    expect(main?.className).toContain("p-4")
    expect(previewContainer?.className).toContain("max-w-[375px]")

    // 切回桌面端：边距再次移除
    const desktopBtn = screen.getByRole("button", { name: /桌面视口|Desktop/i })
    fireEvent.click(desktopBtn)

    expect(main?.className).toContain("p-0")
    expect(previewContainer?.className).toContain("rounded-none")
    expect(previewContainer?.className).toContain("max-w-full")
  })
})
