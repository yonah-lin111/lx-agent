// @vitest-environment jsdom

import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useSuggestedQuestions } from "@/features/agent/hooks/useSuggestedQuestions"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: { suggestedQuestions: vi.fn() },
}))

const context: SuggestedQuestionContextMessage[] = [
  { role: "user", content: "你好" },
  { role: "assistant", content: "有什么可以帮你？" },
]

describe("useSuggestedQuestions", () => {
  beforeEach(() => vi.mocked(agentApi.suggestedQuestions).mockReset())

  it("条件不满足时不发起请求", () => {
    const { result } = renderHook(() => useSuggestedQuestions({ enabled: false, context }))

    expect(agentApi.suggestedQuestions).not.toHaveBeenCalled()
    expect(result.current.questions).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it("条件满足时生成建议问题", async () => {
    vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result } = renderHook(() => useSuggestedQuestions({ enabled: true, context }))

    expect(result.current.isLoading).toBe(true)
    await act(async () => {})
    expect(agentApi.suggestedQuestions).toHaveBeenCalledWith(context)
    expect(result.current.questions).toEqual(["问题一", "问题二"])
    expect(result.current.isLoading).toBe(false)
  })

  it("同一上下文内容变化但内容相同不重复请求", async () => {
    const suggest = vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result, rerender } = renderHook(
      ({ enabled, ctx }: { enabled: boolean; ctx: SuggestedQuestionContextMessage[] }) =>
        useSuggestedQuestions({ enabled, context: ctx }),
      { initialProps: { enabled: true, ctx: context } },
    )
    await act(async () => {})
    expect(suggest).toHaveBeenCalledTimes(1)

    // 数组引用变化但内容不变：不重新生成。
    rerender({ enabled: true, ctx: [...context] })
    await act(async () => {})
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(result.current.questions).toEqual(["问题一", "问题二"])
  })

  it("条件不再满足时清理状态", async () => {
    vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result, rerender } = renderHook(
      ({ enabled, ctx }: { enabled: boolean; ctx: SuggestedQuestionContextMessage[] }) =>
        useSuggestedQuestions({ enabled, context: ctx }),
      { initialProps: { enabled: true, ctx: context } },
    )
    await act(async () => {})
    expect(result.current.questions).toEqual(["问题一", "问题二"])

    rerender({ enabled: false, ctx: context })
    expect(result.current.questions).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it("clear 立即清空状态", async () => {
    vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result } = renderHook(() => useSuggestedQuestions({ enabled: true, context }))
    await act(async () => {})
    expect(result.current.questions).toEqual(["问题一", "问题二"])

    act(() => result.current.clear())
    expect(result.current.questions).toEqual([])
  })
})
