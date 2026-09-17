// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

const holder = vi.hoisted(() => ({
  clickHandler: null as ((payload: unknown) => void) | null,
  navigate: vi.fn(),
  switchTab: vi.fn(),
  selectOffice: vi.fn(),
}))

vi.mock("react-router-dom", () => ({ useNavigate: () => holder.navigate }))

vi.mock("@/features/agent", () => ({
  agentTabStore: { switchTab: holder.switchTab },
}))

vi.mock("@/features/openclaw", () => ({
  useOpenClawOfficeStore: { getState: () => ({ selectOffice: holder.selectOffice }) },
}))

vi.mock("@/features/notification/api/notificationApi", () => ({
  notificationApi: {
    onClick: (handler: (payload: unknown) => void) => {
      holder.clickHandler = handler
      return () => {
        holder.clickHandler = null
      }
    },
  },
}))

import { useNotificationClickRouter } from "@/features/notification/hooks/useNotificationClickRouter"

describe("useNotificationClickRouter", () => {
  beforeEach(() => {
    holder.clickHandler = null
    holder.navigate.mockClear()
    holder.switchTab.mockClear()
    holder.selectOffice.mockClear()
  })

  it("agent 通知切换右侧栏标签页", () => {
    renderHook(() => useNotificationClickRouter())

    holder.clickHandler?.({ source: "agent", tabId: "t1" })

    expect(holder.switchTab).toHaveBeenCalledWith("t1")
    expect(holder.navigate).not.toHaveBeenCalled()
  })

  it("openclaw 通知跳转办公区并选中员工", () => {
    renderHook(() => useNotificationClickRouter())

    holder.clickHandler?.({ source: "openclaw", instanceId: "i1", agentId: "a1" })

    expect(holder.selectOffice).toHaveBeenCalledWith("i1", "a1")
    expect(holder.navigate).toHaveBeenCalledWith(PAGE_ROUTES.openclaw)
  })

  it("卸载时取消订阅", () => {
    const { unmount } = renderHook(() => useNotificationClickRouter())
    expect(holder.clickHandler).not.toBeNull()

    unmount()

    expect(holder.clickHandler).toBeNull()
  })
})
