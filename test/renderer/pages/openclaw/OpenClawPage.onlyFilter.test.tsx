// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OfficeTimelineMessage } from "@/features/openclaw/hooks/useOpenClawOffice"
import { useOpenClawOfficeStore } from "@/features/openclaw/openclawOfficeStore"
import { OpenClawPage } from "@/pages/openclaw"

// vi.mock 工厂先于模块执行，可变员工名册必须由 vi.hoisted 创建。
const hoisted = vi.hoisted(() => ({
  agents: [
    { id: "amy", name: "Amy" },
    { id: "lily", name: "Lily" },
  ],
}))

const timeline: OfficeTimelineMessage[] = [
  {
    agentId: "amy",
    message: {
      id: "a1",
      role: "assistant",
      content: "amy-reply",
      timestamp: 1,
      status: "completed",
    } satisfies OpenClawChatMessage,
  },
  {
    agentId: "lily",
    message: {
      id: "l1",
      role: "assistant",
      content: "lily-reply",
      timestamp: 2,
      status: "completed",
    } satisfies OpenClawChatMessage,
  },
]

// 页面级接线测试用桩输入框：暴露 onCommand / picker 回调，真实输入框交互由 OpenClawInput 用例覆盖。
interface StubPickerItem {
  id: string
  label: string
}

interface StubPicker {
  items: StubPickerItem[]
  onPick: (id: string) => void
}

interface StubInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onCommand: (commandId: string) => void
  commandCapabilities?: { canOnly: boolean; canRestore: boolean }
  picker?: StubPicker | null
}

vi.mock("@/features/openclaw", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/openclaw")>()
  const buildInstance = (): {
    name: string
    enabled: boolean
    agents: { id: string; name: string }[]
  } => ({
    name: "Local OpenClaw",
    enabled: true,
    agents: [...hoisted.agents],
  })
  return {
    ...actual,
    useOpenClawConfig: () => {
      const instance = buildInstance()
      return { instances: { local: instance }, enabledInstances: [{ id: "local", instance }] }
    },
    useOpenClawOffice: () => ({ sessions: [], timeline, isAnyStreaming: false }),
    OpenClawInput: ({
      value,
      onChange,
      onSend,
      onCommand,
      commandCapabilities,
      picker,
    }: StubInputProps): React.JSX.Element => (
      <div>
        <span data-testid="input-value">{value}</span>
        <span data-testid="can-restore">{String(commandCapabilities?.canRestore)}</span>
        <button data-testid="type-only" onClick={() => onChange("/only")}>
          type-only
        </button>
        <button data-testid="send" onClick={onSend}>
          send
        </button>
        <button data-testid="run-all" onClick={() => onCommand("all")}>
          run-all
        </button>
        {picker?.items.map((item) => (
          <button
            key={item.id}
            data-testid={`pick-${item.id}`}
            onClick={() => picker.onPick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    ),
  }
})

vi.mock("@/features/settings", () => ({ notifySettingsChanged: vi.fn() }))

const restoreButton = (): HTMLButtonElement =>
  screen.getByRole("button", { name: "Show all messages" }) as HTMLButtonElement

describe("OpenClawPage /only 员工筛选", () => {
  beforeEach(() => {
    hoisted.agents.splice(
      0,
      hoisted.agents.length,
      { id: "amy", name: "Amy" },
      {
        id: "lily",
        name: "Lily",
      },
    )
    useOpenClawOfficeStore.setState({
      selectedInstanceId: null,
      selectedAgentIds: [],
      activeAgentId: null,
      onlyAgentIds: null,
      pendingDispatch: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("输入 /only 后面板可切换员工并实时收窄消息列表", async () => {
    render(<OpenClawPage />)

    expect(screen.getByText("amy-reply")).not.toBeNull()
    expect(screen.getByText("lily-reply")).not.toBeNull()
    expect(restoreButton().disabled).toBe(true)

    fireEvent.click(screen.getByTestId("type-only"))
    fireEvent.click(await screen.findByTestId("pick-amy"))

    await waitFor(() => {
      expect(screen.queryByText("lily-reply")).toBeNull()
    })
    expect(screen.getByText("amy-reply")).not.toBeNull()
    expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["amy"])
    expect(screen.getByTestId("can-restore")).not.toBeNull()
    expect(restoreButton().disabled).toBe(false)
    expect(screen.getByText("Only:")).not.toBeNull()
  })

  it("再次切换同一员工即退出筛选并恢复全量列表", async () => {
    render(<OpenClawPage />)

    fireEvent.click(screen.getByTestId("type-only"))
    fireEvent.click(await screen.findByTestId("pick-amy"))
    await waitFor(() => expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["amy"]))

    fireEvent.click(screen.getByTestId("pick-amy"))

    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toBeNull()
    })
    expect(screen.getByText("lily-reply")).not.toBeNull()
    expect(restoreButton().disabled).toBe(true)
  })

  it("顶部 chips 的 × 移除最后一个员工即退出筛选", async () => {
    render(<OpenClawPage />)

    fireEvent.click(screen.getByTestId("type-only"))
    fireEvent.click(await screen.findByTestId("pick-lily"))
    await waitFor(() => expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["lily"]))

    const chipStrip = screen.getByText("Only:").parentElement as HTMLElement
    const chipClose = within(chipStrip).getByRole("button")
    fireEvent.click(chipClose)

    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toBeNull()
    })
    expect(screen.getByText("amy-reply")).not.toBeNull()
  })

  it("顶部恢复按钮清空筛选并恢复全量列表", async () => {
    render(<OpenClawPage />)

    fireEvent.click(screen.getByTestId("type-only"))
    fireEvent.click(await screen.findByTestId("pick-amy"))
    await waitFor(() => expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["amy"]))

    fireEvent.click(restoreButton())

    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toBeNull()
    })
    expect(screen.getByText("lily-reply")).not.toBeNull()
  })

  it("/all 命令恢复全部员工消息", async () => {
    render(<OpenClawPage />)

    fireEvent.click(screen.getByTestId("type-only"))
    fireEvent.click(await screen.findByTestId("pick-amy"))
    await waitFor(() => expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["amy"]))

    fireEvent.click(screen.getByTestId("run-all"))

    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toBeNull()
    })
    expect(screen.getByText("lily-reply")).not.toBeNull()
  })

  it("切换到未启用办公区时筛选被重置", async () => {
    useOpenClawOfficeStore.setState({ selectedInstanceId: "stale", onlyAgentIds: ["lily"] })

    render(<OpenClawPage />)

    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toBeNull()
    })
  })

  it("员工被禁用后筛选集合自动裁剪", async () => {
    useOpenClawOfficeStore.setState({ selectedInstanceId: "local", onlyAgentIds: ["amy", "lily"] })

    render(<OpenClawPage />)
    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["amy", "lily"])
    })

    hoisted.agents.splice(1, 1)
    act(() => {
      useOpenClawOfficeStore.getState().selectAgent("amy")
    })

    await waitFor(() => {
      expect(useOpenClawOfficeStore.getState().onlyAgentIds).toEqual(["amy"])
    })
  })
})
