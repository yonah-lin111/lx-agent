// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
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
  useOpenClawWorkspaceStore: (selector: (state: typeof storeState) => unknown): unknown =>
    selector(storeState),
}))

describe("OpenClawLeftSideBar", () => {
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

  it("折叠态仅渲染办公区图标列表", () => {
    render(<OpenClawLeftSideBar isCollapsed />)

    expect(screen.queryByText("Lily")).toBeNull()
    expect(screen.getByLabelText("本机 Gateway")).not.toBeNull()
  })
})
