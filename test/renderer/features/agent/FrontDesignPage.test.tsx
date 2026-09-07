// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { FrontDesignPage } from "@/pages/front-design/FrontDesignPage"

// mock LxTooltip，使其在测试环境中直接展开 click.content
vi.mock("@/components/ui/LxTooltip", () => {
  return {
    LxTooltip: ({ children, click }: any) => {
      return (
        <div data-testid="lx-tooltip-wrapper">
          {children}
          {click?.content && <div data-testid="tooltip-click-content">{click.content}</div>}
        </div>
      )
    },
  }
})

describe("FrontDesignPage 前端设计预览看板", () => {
  beforeEach(() => {
    cleanup()
    frontDesignStore.clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    frontDesignStore.clear()
    localStorage.clear()
  })

  it("无 HTML 时渲染空状态且 main 区域保留 p-4", () => {
    const { container } = render(<FrontDesignPage />)
    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    expect(main?.className).toContain("p-4")
    expect(container.querySelector("iframe")).toBeNull()
    // 不应存在任何搜索框或地址输入框
    expect(screen.queryByRole("textbox")).toBeNull()
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

  it("激活新设计时立即更新设计看板内容", () => {
    frontDesignStore.registerDesign({
      id: "design-1",
      title: "Design 1",
      html: "<div>Design 1 Content</div>",
      sessionId: "session-1",
    })

    const { container, rerender } = render(<FrontDesignPage />)
    expect(frontDesignStore.getState().activeDesignId).toBe("design-1")

    let iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute("srcdoc")).toContain("Design 1 Content")

    // 激活设计 2
    frontDesignStore.registerDesign({
      id: "design-2",
      title: "Design 2",
      html: "<div>Design 2 Content</div>",
      sessionId: "session-2",
      autoActivate: true,
    })

    rerender(<FrontDesignPage />)
    expect(frontDesignStore.getState().activeDesignId).toBe("design-2")
    iframe = container.querySelector("iframe")
    expect(iframe?.getAttribute("srcdoc")).toContain("Design 2 Content")
  })

  it("支持页面主题切换（浅色/暗色/跟随系统），并持久化与调整预览容器样式", () => {
    frontDesignStore.registerDesign({
      id: "design-theme-test",
      title: "Theme Test",
      html: "<div>Theme Content</div>",
    })

    const { container } = render(<FrontDesignPage />)

    // 选项应包含跟随系统、浅色模式、暗色模式
    const lightOption = screen.getByRole("button", { name: /浅色模式|Light/i })
    const darkOption = screen.getByRole("button", { name: /暗色模式|Dark/i })
    const systemOption = screen.getByRole("button", { name: /跟随系统|System/i })

    expect(lightOption).not.toBeNull()
    expect(darkOption).not.toBeNull()
    expect(systemOption).not.toBeNull()

    // 选择浅色模式
    fireEvent.click(lightOption)
    expect(localStorage.getItem("lx_front_design_theme")).toBe("light")

    let iframe = container.querySelector("iframe")
    expect(iframe?.className).toContain("bg-white")
    expect(iframe?.getAttribute("srcdoc")).toContain("color-scheme: light")

    // 切换为暗色模式
    fireEvent.click(darkOption)
    expect(localStorage.getItem("lx_front_design_theme")).toBe("dark")

    iframe = container.querySelector("iframe")
    expect(iframe?.className).toContain("bg-[#0b0f19]")
    expect(iframe?.getAttribute("srcdoc")).toContain("color-scheme: dark")
  })

  it("支持纯 CSS 模式与打开本地工程目录按钮交互", () => {
    const openDesignDirSpy = vi.fn().mockResolvedValue(true)
    ;(window as any).api = {
      agent: {
        openDesignDir: openDesignDirSpy,
      },
    }

    frontDesignStore.registerDesign({
      id: "design-css-test",
      title: "Pure CSS Design",
      html: "<style>.box{color:red;}</style><div>Pure CSS</div>",
      mode: "css",
      sessionId: "session-123",
    })

    const { container } = render(<FrontDesignPage />)

    // 应展示原生 CSS 模式徽标
    expect(screen.getByText(/原生 CSS|Pure CSS/i)).not.toBeNull()

    // 应该出现打开工程目录按钮
    const openDirBtn = screen.getByRole("button", { name: /打开工程目录|Open Design Directory/i })
    expect(openDirBtn).not.toBeNull()

    fireEvent.click(openDirBtn)
    expect(openDesignDirSpy).toHaveBeenCalledWith("session-123", "design-css-test")

    const iframe = container.querySelector("iframe")
    expect(iframe?.getAttribute("srcdoc")).toContain("color:red")
  })

  it("点击清空画布按钮重置 activeDesignId 为 null 并展现空状态占位", () => {
    frontDesignStore.registerDesign({
      id: "design-to-clear",
      title: "Active Design",
      html: "<div class='p-2'>Will be cleared</div>",
    })

    const { container } = render(<FrontDesignPage />)
    expect(container.querySelector("iframe")).not.toBeNull()

    const clearCanvasBtn = screen.getByRole("button", { name: /清空画布|clear canvas/i })
    expect(clearCanvasBtn).not.toBeNull()

    fireEvent.click(clearCanvasBtn)

    expect(frontDesignStore.getState().activeDesignId).toBeNull()
    expect(container.querySelector("iframe")).toBeNull()
    expect(screen.getByText(/等待 Agent 输出前端设计稿|Waiting for Design Output/i)).not.toBeNull()
  })
})
