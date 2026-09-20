// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { scheduleApi } from "@/features/schedule/api/scheduleApi"
import { useScheduleRollover } from "@/features/schedule/hooks/useScheduleRollover"
import { getTodayKey, shiftDateKey } from "@/lib/date"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useScheduleRollover", () => {
  it("非今天日期不触发顺延探测", async () => {
    const listSpy = vi.spyOn(scheduleApi, "listByDate")
    const { result } = renderHook(() => useScheduleRollover({ entryDate: "2020-01-01" }))

    expect(result.current.hasRolloverItems).toBe(false)
    expect(listSpy).not.toHaveBeenCalled()
  })

  it("今天日期且昨日有未完成任务时展示顺延提示并支持顺延提交", async () => {
    const today = getTodayKey()
    const yesterday = shiftDateKey(today, -1)

    const listSpy = vi.spyOn(scheduleApi, "listByDate").mockResolvedValue([
      {
        id: 101,
        entryDate: yesterday,
        content: "yesterday unfinished",
        priority: "P1",
        completed: false,
        completedDate: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 102,
        entryDate: yesterday,
        content: "yesterday done",
        priority: "P2",
        completed: true,
        completedDate: yesterday,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
      },
    ])
    const updateSpy = vi.spyOn(scheduleApi, "update").mockResolvedValue({} as any)
    const onCompleted = vi.fn()

    const { result } = renderHook(() =>
      useScheduleRollover({ entryDate: today, onRolloverCompleted: onCompleted }),
    )

    // 等待 useEffect 异步加载
    await act(async () => {
      await Promise.resolve()
    })

    expect(listSpy).toHaveBeenCalledWith(yesterday)
    expect(result.current.hasRolloverItems).toBe(true)
    expect(result.current.count).toBe(1)

    // 执行顺延
    await act(async () => {
      await result.current.executeRollover()
    })

    expect(updateSpy).toHaveBeenCalledWith({ id: 101, entryDate: today })
    expect(result.current.hasRolloverItems).toBe(false)
    expect(onCompleted).toHaveBeenCalledOnce()
  })

  it("enabled=false 时不探测，恢复 enabled 后重新探测", async () => {
    const today = getTodayKey()
    const yesterday = shiftDateKey(today, -1)
    const listSpy = vi.spyOn(scheduleApi, "listByDate").mockResolvedValue([])

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useScheduleRollover({ entryDate: today, enabled }),
      { initialProps: { enabled: false } },
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(listSpy).not.toHaveBeenCalled()
    expect(result.current.hasRolloverItems).toBe(false)

    rerender({ enabled: true })
    await act(async () => {
      await Promise.resolve()
    })
    expect(listSpy).toHaveBeenCalledWith(yesterday)
  })
})
