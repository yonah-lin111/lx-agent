// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SCHEDULE_CHANGED_EVENT } from "@/features/schedule/api/scheduleApi"
import { useScheduleItems } from "@/features/schedule/hooks/useScheduleItems"

const createApiMock = () => ({
  listByDate: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  listRangeStats: vi.fn().mockResolvedValue([]),
})

describe("useScheduleItems", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("enabled 为 false 时不发起查询，展开后加载", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useScheduleItems("2026-09-19", enabled),
      { initialProps: { enabled: false } },
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(api.listByDate).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => {
      expect(api.listByDate).toHaveBeenCalledTimes(1)
    })
    expect(api.listByDate).toHaveBeenCalledWith({ entryDate: "2026-09-19" })
  })

  it("收到 schedule:changed 广播后重新加载", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderHook(() => useScheduleItems("2026-09-19", true))
    await waitFor(() => {
      expect(api.listByDate).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT))
    })

    await waitFor(() => {
      expect(api.listByDate).toHaveBeenCalledTimes(2)
    })
  })

  it("enabled 为 false 时不响应变更广播", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderHook(() => useScheduleItems("2026-09-19", false))
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT))
      await Promise.resolve()
    })

    expect(api.listByDate).not.toHaveBeenCalled()
  })
})
