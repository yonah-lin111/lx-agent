// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import type { PromptHistoryNavigation } from "@/features/agent/hooks/usePromptHistory"
import { usePromptHistory } from "@/features/agent/hooks/usePromptHistory"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn(), add: vi.fn() },
}))

type HookResult = ReturnType<typeof usePromptHistory>

// 在 act 内执行历史导航（内部更新 browsing 状态）并返回结果。
const navigate = (hook: { current: HookResult }, direction: "up" | "down", text: string) => {
  let result: PromptHistoryNavigation = null
  act(() => {
    result = hook.current.navigate(direction, text)
  })
  return result
}

describe("usePromptHistory", () => {
  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
  })

  it("挂载时加载全局历史，空输入 ↑ 进入最近一条并置浏览态", async () => {
    vi.mocked(promptHistoryApi.get).mockResolvedValue(["第二条", "第一条"])
    const { result } = renderHook(() => usePromptHistory())

    expect(promptHistoryApi.get).toHaveBeenCalledTimes(1)
    await act(async () => {})

    expect(navigate(result, "up", "")).toEqual({ text: "第二条", cursor: "start" })
    expect(result.current.browsing).toBe(true)
  })

  it("↑ 上翻到更旧，↓ 下翻到更新，越过最新恢复草稿", async () => {
    vi.mocked(promptHistoryApi.get).mockResolvedValue(["p2", "p1"])
    const { result } = renderHook(() => usePromptHistory())
    await act(async () => {})

    expect(navigate(result, "up", "草稿文本")).toEqual({ text: "p2", cursor: "start" })
    expect(navigate(result, "up", "p2")).toEqual({ text: "p1", cursor: "start" })
    expect(navigate(result, "up", "p1")).toBeNull()
    expect(navigate(result, "down", "p1")).toEqual({ text: "p2", cursor: "end" })
    expect(navigate(result, "down", "p2")).toEqual({ text: "草稿文本", cursor: "end" })
    expect(result.current.browsing).toBe(false)
  })

  it("record 调用 API 并更新本地历史", async () => {
    vi.mocked(promptHistoryApi.get).mockResolvedValue([])
    vi.mocked(promptHistoryApi.add).mockResolvedValue(["新消息"])
    const { result } = renderHook(() => usePromptHistory())
    await act(async () => {})

    act(() => result.current.record("新消息"))
    expect(promptHistoryApi.add).toHaveBeenCalledWith("新消息")
    await act(async () => {})

    expect(navigate(result, "up", "")).toEqual({ text: "新消息", cursor: "start" })
  })

  it("record 忽略空白内容", async () => {
    vi.mocked(promptHistoryApi.get).mockResolvedValue([])
    const { result } = renderHook(() => usePromptHistory())
    await act(async () => {})

    act(() => result.current.record("   "))
    expect(promptHistoryApi.add).not.toHaveBeenCalled()
  })

  it("reset 退出历史浏览，下次 ↑ 重新进入", async () => {
    vi.mocked(promptHistoryApi.get).mockResolvedValue(["p1"])
    const { result } = renderHook(() => usePromptHistory())
    await act(async () => {})

    expect(navigate(result, "up", "")).toEqual({ text: "p1", cursor: "start" })
    expect(result.current.browsing).toBe(true)

    act(() => result.current.reset())
    expect(result.current.browsing).toBe(false)
    expect(navigate(result, "up", "草稿2")).toEqual({ text: "p1", cursor: "start" })
  })
})
