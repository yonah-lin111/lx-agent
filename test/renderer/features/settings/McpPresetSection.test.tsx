// @vitest-environment jsdom

import { MCP_PRESETS, type McpPresetStatusItem } from "@shared/mcpPresets"
import type { McpServerConfig } from "@shared/settings"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { McpPresetSection } from "@/features/settings/components/McpPresetSection"

// jsdom 未实现 ResizeObserver（LxTooltip 定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// 构造全部已安装（或全部未安装）的探测状态。
const statusesWith = (installed: boolean): McpPresetStatusItem[] =>
  MCP_PRESETS.map((preset) => ({
    id: preset.id,
    installed,
    detectedPath: installed ? `/usr/local/bin/${preset.probeBin}` : null,
  }))

interface RenderOptions {
  statuses?: McpPresetStatusItem[]
  servers?: Record<string, McpServerConfig>
  searchQuery?: string
  installingId?: (typeof MCP_PRESETS)[number]["id"] | null
}

const renderSection = (options: RenderOptions = {}) => {
  const handlers = {
    onAdd: vi.fn(),
    onInstall: vi.fn(),
    onCopyCommand: vi.fn(),
    onOpenHomepage: vi.fn(),
  }
  const view = render(
    <McpPresetSection
      statuses={options.statuses ?? statusesWith(true)}
      servers={options.servers ?? {}}
      searchQuery={options.searchQuery ?? ""}
      installingId={options.installingId ?? null}
      {...handlers}
    />,
  )
  return { ...view, ...handlers }
}

describe("McpPresetSection", () => {
  beforeEach(cleanup)

  it("渲染全部未添加的预设与安装状态", () => {
    renderSection({ statuses: statusesWith(true) })

    expect(screen.getByText("Recommended Presets")).toBeTruthy()
    expect(screen.getByText("Context7")).toBeTruthy()
    expect(screen.getByText("CodeGraph")).toBeTruthy()
    expect(screen.getByText("Codebase Memory")).toBeTruthy()
    // 已安装预设显示探测路径。
    expect(screen.getByText("/usr/local/bin/codegraph")).toBeTruthy()
  })

  it("已添加到配置的预设不再渲染", () => {
    renderSection({
      servers: { codegraph: { command: ["codegraph", "serve", "--mcp"] } },
    })

    expect(screen.queryByText("CodeGraph")).toBeNull()
    expect(screen.getByText("Context7")).toBeTruthy()
    expect(screen.getByText("Codebase Memory")).toBeTruthy()
  })

  it("全部预设已添加时整个区块隐藏", () => {
    const servers: Record<string, McpServerConfig> = {}
    for (const preset of MCP_PRESETS) {
      servers[preset.id] = { command: [...preset.command] }
    }
    renderSection({ servers })

    expect(screen.queryByText("Recommended Presets")).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("搜索关键字过滤预设（区分大小写不敏感）", () => {
    renderSection({ searchQuery: "codegraph" })

    expect(screen.getByText("CodeGraph")).toBeTruthy()
    expect(screen.queryByText("Context7")).toBeNull()
    expect(screen.queryByText("Codebase Memory")).toBeNull()
  })

  it("已安装预设启用开关可点击并回传预设", () => {
    const { onAdd } = renderSection({ statuses: statusesWith(true) })

    const checkbox = screen.getByRole("checkbox", { name: "Enable CodeGraph" })
    expect((checkbox as HTMLInputElement).disabled).toBe(false)

    fireEvent.click(checkbox)

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0][0]).toMatchObject({ id: "codegraph" })
  })

  it("未安装的 npm-global 预设显示安装按钮并触发安装", () => {
    const { onInstall } = renderSection({ statuses: statusesWith(false) })

    const installButtons = screen.getAllByRole("button", { name: /^Install / })
    expect(installButtons).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: "Install CodeGraph" }))

    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onInstall.mock.calls[0][0]).toMatchObject({ id: "codegraph" })
  })

  it("未安装的 npx 类预设不显示安装按钮且开关禁用", () => {
    renderSection({ statuses: statusesWith(false) })

    expect(screen.queryByRole("button", { name: "Install Context7" })).toBeNull()
    expect(
      (screen.getByRole("checkbox", { name: "Enable Context7" }) as HTMLInputElement).disabled,
    ).toBe(true)
  })

  it("安装中状态显示 Loading 文案并禁用按钮", () => {
    renderSection({ statuses: statusesWith(false), installingId: "codegraph" })

    const installing = screen.getByRole("button", { name: "Install CodeGraph" })
    expect((installing as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("Installing...")).toBeTruthy()
  })

  it("复制安装命令与打开官网按钮回传预设", () => {
    const { onCopyCommand, onOpenHomepage } = renderSection()

    fireEvent.click(screen.getByRole("button", { name: "Copy install command CodeGraph" }))
    expect(onCopyCommand.mock.calls[0][0]).toMatchObject({ id: "codegraph" })

    fireEvent.click(screen.getByRole("button", { name: "Homepage Context7" }))
    expect(onOpenHomepage).toHaveBeenCalledWith("https://github.com/upstash/context7")
  })
})
