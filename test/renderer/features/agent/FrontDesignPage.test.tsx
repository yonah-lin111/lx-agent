// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { FrontDesignPage } from "@/pages/front-design/FrontDesignPage"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}))

// mock LxTooltip，使其在测试环境中直接展开 click.content
vi.mock("@/components/ui/LxTooltip", () => {
  return {
    LxTooltip: ({ children, click, content }: any) => {
      return (
        <div data-testid="lx-tooltip-wrapper">
          {children}
          {click?.content && <div data-testid="tooltip-click-content">{click.content}</div>}
          {content && <div data-testid="tooltip-hover-content">{content}</div>}
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

  it("无 HTML 时渲染空状态且 main 区域保留 p-4 与 front-design-empty-canvas", () => {
    const { container } = render(<FrontDesignPage />)
    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    expect(main?.className).toContain("p-4")
    expect(main?.className).toContain("front-design-empty-canvas")
    expect(container.querySelector(".front-design-empty-container")).not.toBeNull()
    expect(container.querySelector(".front-design-empty-icon")).not.toBeNull()
    expect(container.querySelector(".front-design-empty-title")).not.toBeNull()
    expect(container.querySelector(".front-design-empty-desc")).not.toBeNull()
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
    expect(previewContainer?.className).toContain("rounded-[6px]")
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

    // 应展示原生 CSS 模式徽标且带有 front-design-badge 语义类
    const badge = screen.getByText(/原生 CSS|Pure CSS/i)
    expect(badge).not.toBeNull()
    expect(badge.className).toContain("front-design-badge")

    // 应该出现打开工程目录按钮
    const openDirBtn = screen.getByRole("button", { name: /打开工程目录|Open Design Directory/i })
    expect(openDirBtn).not.toBeNull()

    fireEvent.click(openDirBtn)
    expect(openDesignDirSpy).toHaveBeenCalledWith("session-123", "design-css-test")

    const iframe = container.querySelector("iframe")
    expect(iframe?.getAttribute("srcdoc")).toContain("color:red")
  })

  it("Tailwind 模式下顶部左侧模式徽标带有 front-design-badge 类以适配主题", () => {
    frontDesignStore.registerDesign({
      id: "design-tw-badge",
      title: "Tailwind Badge Test",
      html: "<div class='text-blue-500'>Tailwind Mode</div>",
      mode: "tailwindcss",
    })

    render(<FrontDesignPage />)
    const twBadge = screen.getByText(/Tailwind CSS/i)
    expect(twBadge).not.toBeNull()
    expect(twBadge.className).toContain("front-design-badge")
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
    expect(container.querySelector("main")?.className).toContain("front-design-empty-canvas")
    expect(screen.getByText(/等待 Agent 输出前端设计稿|Waiting for Design Output/i)).not.toBeNull()
  })

  it("存在多版本链时，顶部显示版本下拉菜单并支持切换版本", () => {
    // 注册 v1
    frontDesignStore.registerDesign({
      id: "design-v1",
      title: "Hero Banner",
      html: "<div>V1 Content</div>",
    })
    // 注册 v2 (基于 v1)
    frontDesignStore.registerDesign({
      id: "design-v2",
      title: "Hero Banner v2",
      html: "<div>V2 Content</div>",
      parentId: "design-v1",
    })
    frontDesignStore.setActiveDesignId("design-v2")

    const { container } = render(<FrontDesignPage />)

    // 当前激活的应该是 design-v2 (v2)
    expect(frontDesignStore.getState().activeDesignId).toBe("design-v2")
    const versionTrigger = screen.getByRole("button", { name: /选择版本|select version/i })
    expect(versionTrigger.textContent).toContain("v2")

    // 在 mock 的 LxTooltip 下，版本菜单项直接挂载
    const v1Option = screen.getByRole("button", { name: /版本 1|v1/i })
    expect(v1Option).not.toBeNull()

    // 点击切换到 v1
    fireEvent.click(v1Option)
    expect(frontDesignStore.getState().activeDesignId).toBe("design-v1")
    const iframe = container.querySelector("iframe")
    expect(iframe?.getAttribute("srcdoc")).toContain("V1 Content")
  })

  it("当 Agent 产生二次修改版本时，FrontDesignPage 自动响应并激活新版本（v2）展示最新代码", () => {
    // 初始设计 v1
    frontDesignStore.registerDesign({
      id: "agent-d1",
      title: "App Landing",
      html: "<div>V1 Base</div>",
      autoActivate: true,
    })

    const { container, rerender } = render(<FrontDesignPage />)
    expect(frontDesignStore.getState().activeDesignId).toBe("agent-d1")
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("V1 Base")

    // 模拟二次修改：Agent 输出带有 autoActivate 的 v2
    frontDesignStore.registerDesign({
      id: "agent-d2",
      parentId: "agent-d1",
      title: "App Landing",
      html: "<div>V2 Modified</div>",
      autoActivate: true,
    })

    rerender(<FrontDesignPage />)

    // 画布与状态必须自动切换为 v2
    expect(frontDesignStore.getState().activeDesignId).toBe("agent-d2")
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("V2 Modified")
    expect(frontDesignStore.getState().version).toBe(2)

    // 顶部下拉应指示当前版本为 v2，且支持切回 v1
    const versionTrigger = screen.getByRole("button", { name: /选择版本|select version/i })
    expect(versionTrigger.textContent).toContain("v2")
  })

  it("头部不再展示在对话中迭代按钮（Iterate in Chat 按钮及对应逻辑已彻底移除）", () => {
    frontDesignStore.registerDesign({
      id: "design-target",
      title: "Settings Page",
      html: "<div>Settings Form</div>",
      sessionId: "session-test",
    })

    render(<FrontDesignPage />)

    // 确认按钮已彻底从 DOM 中移除
    expect(screen.queryByRole("button", { name: /在对话中迭代|Iterate in Chat/i })).toBeNull()
  })

  it("点选微调 Inspector 按钮在有 HTML 时可用，且不再展示顶部中间提示横幅，按 ESC 退出", () => {
    frontDesignStore.registerDesign({
      id: "design-inspect",
      title: "Inspectable Design",
      html: "<div id='root'><button id='btn-test'>Click Me</button></div>",
    })

    render(<FrontDesignPage />)

    const inspectBtn = screen.getByRole("button", { name: /点选微调|Visual Inspector/i })
    expect(inspectBtn).not.toBeNull()
    // 验证 Tooltip 包含 Shift + Alt 快捷键提示
    expect(screen.getByText(/Shift \+ Alt/i)).not.toBeNull()

    // 点击激活
    fireEvent.click(inspectBtn)
    expect(inspectBtn.getAttribute("data-highlighted")).toBe("true")

    // 按照需求：顶部中间提示已彻底移除，不应再渲染
    expect(screen.queryByText(/连续点选|Click elements/i)).toBeNull()

    // 按下 ESC 键退出微调模式
    fireEvent.keyDown(window, { key: "Escape" })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()
  })

  it("支持快捷键 Shift + Alt 切换元素选中模式（再次按下可关闭），并兼容 ESC 键与按钮退出", () => {
    frontDesignStore.registerDesign({
      id: "design-shift-alt-test",
      title: "Shift Alt Design",
      html: "<div id='root'><span>Shift Alt Test</span></div>",
    })

    render(<FrontDesignPage />)

    const inspectBtn = screen.getByRole("button", { name: /点选微调|Visual Inspector/i })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 1. 按下 Shift + Alt 打开点选模式
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true, altKey: true })
    expect(inspectBtn.getAttribute("data-highlighted")).toBe("true")

    // 2. 再次按下 Shift + Alt 成功关闭点选模式
    fireEvent.keyDown(window, { key: "Alt", shiftKey: true, altKey: true })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 3. 再次按下 Shift + Alt 重新打开
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true, altKey: true })
    expect(inspectBtn.getAttribute("data-highlighted")).toBe("true")

    // 4. 通过 ESC 键退出
    fireEvent.keyDown(window, { key: "Escape" })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 5. 再次通过 Shift + Alt 打开
    fireEvent.keyDown(window, { key: "Alt", shiftKey: true, altKey: true })
    expect(inspectBtn.getAttribute("data-highlighted")).toBe("true")

    // 6. 通过点击工具栏按钮退出
    fireEvent.click(inspectBtn)
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()
  })

  it("单独按下 Shift、单独按下 Alt 或触发三键组合时均不打开点选模式", () => {
    frontDesignStore.registerDesign({
      id: "design-partial-keys",
      title: "Partial Keys Design",
      html: "<div>Content</div>",
    })

    render(<FrontDesignPage />)

    const inspectBtn = screen.getByRole("button", { name: /点选微调|Visual Inspector/i })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 单独按 Shift
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true, altKey: false })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 单独按 Alt
    fireEvent.keyDown(window, { key: "Alt", shiftKey: false, altKey: true })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 触发了其他按键（如 Shift + Alt + F）
    fireEvent.keyDown(window, { key: "f", shiftKey: true, altKey: true })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()
  })

  it("当输入焦点处于 input、textarea 或可编辑元素时忽略 Shift + Alt 快捷键（防误触保护）", () => {
    frontDesignStore.registerDesign({
      id: "design-shift-alt-input",
      title: "Shift Alt Input Design",
      html: "<div>Content</div>",
    })

    render(<FrontDesignPage />)

    const inspectBtn = screen.getByRole("button", { name: /点选微调|Visual Inspector/i })
    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()

    // 构造一个处于聚焦状态的输入控件
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { key: "Shift", shiftKey: true, altKey: true })

    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()
    document.body.removeChild(input)
  })

  it("流式输出过程中（isStreaming 为 true）禁用 Shift + Alt 快捷键与 Inspector 按钮", () => {
    frontDesignStore.registerDesign({
      id: "design-streaming-lock",
      title: "Streaming Lock Design",
      html: "<div>Streaming Content</div>",
      isStreaming: true,
    })

    render(<FrontDesignPage />)

    const inspectBtn = screen.getByRole("button", { name: /点选微调|Visual Inspector/i })
    // 工具栏按钮应置灰禁用
    expect(inspectBtn.hasAttribute("disabled")).toBe(true)

    // Shift + Alt 同样被忽略
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true, altKey: true })

    expect(inspectBtn.getAttribute("data-highlighted")).toBeNull()
  })

  it("流式更新 HTML 时保持稳定 iframe srcDoc，避免触发全文档重新加载白屏闪烁", () => {
    // 初始流式 chunk 1
    frontDesignStore.registerDesign({
      id: "design-smooth-stream",
      title: "Smooth Stream",
      html: "<div>Chunk 1</div>",
      isStreaming: true,
    })

    const { container, rerender } = render(<FrontDesignPage />)
    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    const initialSrcDoc = iframe?.getAttribute("srcdoc")
    expect(initialSrcDoc).toContain("Chunk 1")

    // 模拟流式更新 chunk 2
    frontDesignStore.registerDesign({
      id: "design-smooth-stream",
      title: "Smooth Stream",
      html: "<div>Chunk 1 and Chunk 2</div>",
      isStreaming: true,
    })

    rerender(<FrontDesignPage />)

    // 核心断言：同一设计的流式更新期间，iframe 的 srcdoc 属性保持原样不被反复重置
    // 从而杜绝了浏览器刷新 iframe 导致的白屏与高频闪烁
    expect(iframe?.getAttribute("srcdoc")).toBe(initialSrcDoc)
  })

  it("点选模式下点击元素自动注入定向锚点 @design:id#target 到活动 Tab 且不发生路由跳转，支持连续点选", async () => {
    mockNavigate.mockClear()
    const activeTabId = agentTabStore.getActiveTabId()
    let injectedPrompt = ""
    const unregister = agentTabStore.registerInputSetter(activeTabId, (updater) => {
      injectedPrompt = typeof updater === "function" ? updater(injectedPrompt) : updater
    })

    frontDesignStore.registerDesign({
      id: "d-inspect-click",
      title: "Pricing Page",
      html: "<div id='root'><section data-section='pricing'><button id='buy-now'>Buy</button><span class='title'>Plan A</span></section></div>",
    })

    const { container } = render(<FrontDesignPage />)

    // 激活 Inspector
    const inspectBtn = screen.getByRole("button", { name: /点选微调|Visual Inspector/i })
    fireEvent.click(inspectBtn)

    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()

    // 在 iframe 文档中构造测试目标元素
    const doc = iframe?.contentDocument
    expect(doc).not.toBeNull()
    if (doc) {
      doc.body.innerHTML =
        "<div id='root'><section data-section='pricing'><button id='buy-now'>Buy</button><span id='plan-title' class='title'>Plan A</span></section></div>"
      const targetBtn = doc.getElementById("buy-now")!
      const targetSpan = doc.getElementById("plan-title")!

      // 触发点击目标元素 1
      fireEvent.click(targetBtn)
      await Promise.resolve()
      await Promise.resolve()

      // 校验生成了带 #buy-now 的定向锚点 Token，且绝不跳转到首页
      expect(injectedPrompt).toContain("@design:d-inspect-click#buy-now (button#buy-now) ")
      expect(mockNavigate).not.toHaveBeenCalled()

      // 触发点击目标元素 2（连续点选追加）
      fireEvent.click(targetSpan)
      await Promise.resolve()
      await Promise.resolve()

      // 校验两个 Token 均已注入，Inspector 状态未退出且仍无跳转
      expect(injectedPrompt).toContain("@design:d-inspect-click#plan-title (span#plan-title) ")
      expect(mockNavigate).not.toHaveBeenCalled()

      // 触发点击目标元素 3（无 ID 的匿名元素，应动态挂载 data-design-id 并同步回 store）
      const targetP = doc.createElement("p")
      targetP.textContent = "Anonymous paragraph"
      doc.body.appendChild(targetP)

      fireEvent.click(targetP)
      await Promise.resolve()
      await Promise.resolve()

      expect(injectedPrompt).toContain("@design:d-inspect-click#[data-design-id=")
      expect(frontDesignStore.getState().html).toContain("data-design-id=")
      expect(mockNavigate).not.toHaveBeenCalled()
    }

    unregister()
  })

  it("多轮修改后（v1, v2, v3），顶部版本下拉菜单完整显示所有版本选项，并支持自由往返切换且实时更新画布 HTML", () => {
    // 1. 注册 v1
    frontDesignStore.registerDesign({
      id: "app-page",
      title: "App Page",
      html: "<div id='content'>Version 1 Content</div>",
      autoActivate: true,
    })

    // 2. 二次修改：生成 v2
    frontDesignStore.registerDesign({
      id: "app-page-v2",
      parentId: "app-page",
      title: "App Page",
      html: "<div id='content'>Version 2 Content</div>",
      autoActivate: true,
    })

    // 3. 三次修改：生成 v3
    frontDesignStore.registerDesign({
      id: "app-page-v3",
      parentId: "app-page-v2",
      title: "App Page",
      html: "<div id='content'>Version 3 Content</div>",
      autoActivate: true,
    })

    const { container } = render(<FrontDesignPage />)

    // 默认激活最新版本 v3
    expect(frontDesignStore.getState().activeDesignId).toBe("app-page-v3")
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Version 3 Content")

    // 验证顶部版本按钮显示 v3
    const versionTrigger = screen.getByRole("button", { name: /选择版本|select version/i })
    expect(versionTrigger.textContent).toContain("v3")

    // 验证下拉菜单中同时包含 v1, v2, v3 选项
    const v1Option = screen.getByRole("button", { name: /版本 1|v1/i })
    const v2Option = screen.getByRole("button", { name: /版本 2|v2/i })
    const v3Option = screen.getByRole("button", { name: /版本 3|v3/i })
    expect(v1Option).not.toBeNull()
    expect(v2Option).not.toBeNull()
    expect(v3Option).not.toBeNull()

    // 切换到 v1
    fireEvent.click(v1Option)
    expect(frontDesignStore.getState().activeDesignId).toBe("app-page")
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Version 1 Content")

    // 切换到 v2
    fireEvent.click(v2Option)
    expect(frontDesignStore.getState().activeDesignId).toBe("app-page-v2")
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Version 2 Content")

    // 切回 v3
    fireEvent.click(v3Option)
    expect(frontDesignStore.getState().activeDesignId).toBe("app-page-v3")
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Version 3 Content")
  })
})
