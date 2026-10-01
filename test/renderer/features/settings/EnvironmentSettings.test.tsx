// @vitest-environment jsdom

import type { EnvironmentRuntimeInfo } from "@shared/settings"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EnvironmentSettings } from "@/features/settings/components/EnvironmentSettings"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const mockGetEnvironmentVersions = vi.fn()
const mockGetUiSettings = vi.fn().mockResolvedValue({ locale: "zh" })

const mockEnvironments: EnvironmentRuntimeInfo[] = [
  {
    id: "git",
    name: "git",
    displayName: "Git",
    command: "git",
    installed: true,
    version: "2.43.0",
    path: "/usr/local/bin/git",
    isRequired: true,
    descriptionKey: "settings.environmentGitDesc",
    downloadUrl: "https://git-scm.com",
  },
  {
    id: "node",
    name: "node",
    displayName: "Node.js",
    command: "node",
    installed: true,
    version: "20.11.1",
    path: "/usr/local/bin/node",
    isRequired: true,
    descriptionKey: "settings.environmentNodeDesc",
    downloadUrl: "https://nodejs.org",
  },
  {
    id: "python",
    name: "python",
    displayName: "Python",
    command: "python3",
    installed: true,
    version: "3.12.2",
    path: "/usr/bin/python3",
    isRequired: false,
    descriptionKey: "settings.environmentPythonDesc",
    downloadUrl: "https://www.python.org",
  },
  {
    id: "java",
    name: "java",
    displayName: "Java",
    command: "java",
    installed: false,
    version: null,
    path: null,
    isRequired: false,
    descriptionKey: "settings.environmentJavaDesc",
    downloadUrl: "https://adoptium.net",
  },
]

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <EnvironmentSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsDraftStore.getState().setActiveSection("environment")
  mockGetEnvironmentVersions.mockResolvedValue(mockEnvironments)
  window.api = {
    settings: {
      getEnvironmentVersions: mockGetEnvironmentVersions,
      getUiSettings: mockGetUiSettings,
    },
  } as unknown as typeof window.api
})

describe("EnvironmentSettings", () => {
  it("加载并渲染环境列表、标签与版本信息", async () => {
    renderComponent()

    expect(await screen.findByText("Git")).toBeTruthy()
    expect(screen.getByText("Node.js")).toBeTruthy()
    expect(screen.getByText("Python")).toBeTruthy()
    expect(screen.getByText("Java")).toBeTruthy()

    // 必需标签与可选标签
    const requiredTags = screen.getAllByText("必需")
    expect(requiredTags.length).toBe(2)
    const optionalTags = screen.getAllByText("可选")
    expect(optionalTags.length).toBe(2)

    // 已安装版本号
    expect(screen.getByText("v2.43.0")).toBeTruthy()
    expect(screen.getByText("v20.11.1")).toBeTruthy()
    expect(screen.getByText("v3.12.2")).toBeTruthy()

    // 未安装状态
    expect(screen.getAllByText("未检测到").length).toBeGreaterThan(0)
    // 获取 Java 按钮
    expect(screen.getByRole("button", { name: /获取 Java/ })).toBeTruthy()
  })

  it("点击未安装环境的获取按钮唤起浏览器", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
    renderComponent()

    const getJavaBtn = await screen.findByRole("button", { name: /获取 Java/ })
    fireEvent.click(getJavaBtn)

    expect(openSpy).toHaveBeenCalledWith("https://adoptium.net", "_blank")
  })

  it("支持搜索框过滤环境列表", async () => {
    renderComponent()

    await screen.findByText("Git")
    const searchInput = screen.getByPlaceholderText("搜索运行环境...")
    fireEvent.change(searchInput, { target: { value: "node" } })

    expect(screen.getByText("Node.js")).toBeTruthy()
    expect(screen.queryByText("Git")).toBeNull()
    expect(screen.queryByText("Java")).toBeNull()
  })

  it("点击刷新按钮带 force 参数重新探测", async () => {
    renderComponent()

    await screen.findByText("Git")
    expect(mockGetEnvironmentVersions).toHaveBeenCalledWith({ force: false })

    const refreshBtn = screen.getByRole("button", { name: "刷新状态" })
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockGetEnvironmentVersions).toHaveBeenCalledWith({ force: true })
    })
  })
})
