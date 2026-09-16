// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenClawLeftSideBar } from "@/pages/openclaw/components/OpenClawLeftSideBar"

const selectOffice = vi.fn()
const selectAgent = vi.fn()

const storeState = {
  selectedInstanceId: "local",
  selectedAgentIds: ["lily"],
  selectOffice,
  selectAgent,
}

const statuses: Record<string, string> = { lily: "working", amy: "idle" }

// 可变的会话统计注入，供各用例独立设置。
const agentStats: Record<string, unknown> = {}

vi.mock("@/features/openclaw", () => ({
  OFFICE_STATUS_DOT_CLASS: {
    working: "dot-working",
    idle: "dot-idle",
    connecting: "dot-connecting",
    blocked: "dot-blocked",
    error: "dot-error",
    offline: "dot-offline",
  },
  OFFICE_STATUS_LABEL_KEY: {
    working: "openclaw.statusWorking",
    idle: "openclaw.statusIdle",
    connecting: "openclaw.statusConnecting",
    blocked: "openclaw.statusBlocked",
    error: "openclaw.statusError",
    offline: "openclaw.statusDisconnected",
  },
  accentHexForIndex: (index: number): string => ["#ff6b6b", "#6bcf7f"][index % 2] as string,
  useOfficeAgentStats: (): Record<string, unknown> => agentStats,
  useOfficeAgentStatuses: (): Record<string, string> => statuses,
  useOpenClawConfig: () => ({
    instances: {
      local: {
        name: "本机 Gateway",
        enabled: true,
        agents: [
          { id: "lily", name: "Lily" },
          { id: "amy", name: "Amy" },
        ],
      },
    },
    enabledInstances: [
      {
        id: "local",
        instance: {
          name: "本机 Gateway",
          agents: [
            { id: "lily", name: "Lily" },
            { id: "amy", name: "Amy" },
          ],
        },
      },
    ],
  }),
  useOpenClawOfficeStore: (selector: (state: typeof storeState) => unknown): unknown =>
    selector(storeState),
}))

describe("OpenClawLeftSideBar", () => {
  beforeEach(() => {
    for (const key of Object.keys(agentStats)) delete agentStats[key]
  })

  afterEach(() => {
    cleanup()
    selectOffice.mockClear()
    selectAgent.mockClear()
  })

  it("渲染办公区与员工名册（含状态文案）", () => {
    render(<OpenClawLeftSideBar />)

    expect(screen.getByText("本机 Gateway")).not.toBeNull()
    expect(screen.getByText("Lily")).not.toBeNull()
    expect(screen.getByText("Amy")).not.toBeNull()
    expect(screen.getByText("Working")).not.toBeNull()
    expect(screen.getByText("Idle")).not.toBeNull()
  })

  it("点击员工默认单选（非追加）", () => {
    render(<OpenClawLeftSideBar />)

    fireEvent.click(screen.getByText("Amy").closest("button") as HTMLButtonElement)

    expect(selectAgent).toHaveBeenCalledWith("amy", { additive: false })
  })

  it("Ctrl/Cmd 点击员工为追加多选", () => {
    render(<OpenClawLeftSideBar />)

    fireEvent.click(screen.getByText("Amy").closest("button") as HTMLButtonElement, {
      ctrlKey: true,
    })

    expect(selectAgent).toHaveBeenCalledWith("amy", { additive: true })
  })

  it("办公区与员工条目使用主题钩子类，且不再渲染底部操作提示", () => {
    render(<OpenClawLeftSideBar />)

    const officeButton = screen.getByText("本机 Gateway").closest("button")
    expect(officeButton?.className).toContain("openclaw-office-item")
    expect(officeButton?.getAttribute("data-active")).toBe("true")

    const agentButton = screen.getByText("Lily").closest("button")
    expect(agentButton?.className).toContain("openclaw-agent-item")
    expect(agentButton?.getAttribute("aria-pressed")).toBe("true")

    // 底部派发提示已移除（中英文案均包含 Ctrl/Cmd）。
    expect(document.body.textContent).not.toContain("Ctrl/Cmd")
  })

  it("员工条目展示会话模型与上下文百分比", () => {
    agentStats.lily = {
      model: "gpt-5.2",
      modelProvider: "openai",
      contextUsed: 250000,
      contextWindow: 1000000,
    }

    render(<OpenClawLeftSideBar />)

    expect(screen.getByText("gpt-5.2")).not.toBeNull()
    expect(screen.getByText("25%")).not.toBeNull()
  })

  it("上下文占比达到警戒阈值时使用压力着色", () => {
    agentStats.lily = { model: "gpt-5.2", contextUsed: 950000, contextWindow: 1000000 }

    render(<OpenClawLeftSideBar />)

    const percent = screen.getByText("95%")
    expect(percent.className).toContain("text-rose-300/90")
  })

  it("无会话统计时不渲染统计行", () => {
    render(<OpenClawLeftSideBar />)

    expect(screen.getByText("Lily")).not.toBeNull()
    expect(screen.queryByText("gpt-5.2")).toBeNull()
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
  })

  it("容量缺失时仅渲染模型名", () => {
    agentStats.lily = { model: "gemini-3.8-flash" }

    render(<OpenClawLeftSideBar />)

    expect(screen.getByText("gemini-3.8-flash")).not.toBeNull()
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
  })

  it("折叠态仅渲染办公区图标列表", () => {
    render(<OpenClawLeftSideBar isCollapsed />)

    expect(screen.queryByText("Lily")).toBeNull()
    expect(screen.getByLabelText("本机 Gateway")).not.toBeNull()
  })
})
