// @vitest-environment jsdom

import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { StrictMode } from "react"
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

type SetupProps = { enabled: boolean; isStreaming: boolean; isLastAssistant?: boolean }

const setup = (initial: SetupProps) =>
  renderHook(
    ({ enabled, isStreaming, isLastAssistant = true }: SetupProps) =>
      useSuggestedQuestions({ enabled, isStreaming, isLastAssistant, context }),
    { initialProps: initial },
  )

describe("useSuggestedQuestions", () => {
  beforeEach(() => vi.mocked(agentApi.suggestedQuestions).mockReset())

  it("条件不满足时不发起请求", () => {
    const { result } = setup({ enabled: false, isStreaming: false })

    expect(agentApi.suggestedQuestions).not.toHaveBeenCalled()
    expect(result.current.questions).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it("恢复的历史消息（挂载即完成）不生成建议", async () => {
    const { result } = setup({ enabled: true, isStreaming: false })

    await act(async () => {})
    expect(agentApi.suggestedQuestions).not.toHaveBeenCalled()
    expect(result.current.questions).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it("实时'流式→完成'转换后生成建议问题", async () => {
    vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result, rerender } = setup({ enabled: false, isStreaming: true })

    // 流式结束瞬间：isStreaming 先翻转为 false，enabled 可能滞后（message_end 早于 agent_end）。
    rerender({ enabled: false, isStreaming: false })
    rerender({ enabled: true, isStreaming: false })
    expect(result.current.isLoading).toBe(true)
    await act(async () => {})
    expect(agentApi.suggestedQuestions).toHaveBeenCalledWith(context)
    expect(result.current.questions).toEqual(["问题一", "问题二"])
    expect(result.current.isLoading).toBe(false)
  })

  it("同内容数组引用变化不重复请求", async () => {
    const suggest = vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { rerender } = renderHook(
      ({
        enabled,
        isStreaming,
        isLastAssistant = true,
        ctx,
      }: SetupProps & { ctx: typeof context }) =>
        useSuggestedQuestions({ enabled, isStreaming, isLastAssistant, context: ctx }),
      {
        initialProps: { enabled: false, isStreaming: true, ctx: context },
      },
    )

    rerender({ enabled: true, isStreaming: false, ctx: context })
    await act(async () => {})
    expect(suggest).toHaveBeenCalledTimes(1)

    // 数组引用变化但内容不变：不重新生成。
    rerender({ enabled: true, isStreaming: false, ctx: [...context] })
    await act(async () => {})
    expect(suggest).toHaveBeenCalledTimes(1)
  })

  it("不再是最后一条时清理状态", async () => {
    vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result, rerender } = setup({ enabled: false, isStreaming: true })

    rerender({ enabled: true, isStreaming: false })
    await act(async () => {})
    expect(result.current.questions).toEqual(["问题一", "问题二"])

    // 新一轮消息使该条目不再是最后一条：复位并清理。
    rerender({ enabled: false, isStreaming: false, isLastAssistant: false })
    expect(result.current.questions).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it("clear 立即清空状态", async () => {
    vi.mocked(agentApi.suggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const { result, rerender } = setup({ enabled: false, isStreaming: true })

    rerender({ enabled: true, isStreaming: false })
    await act(async () => {})
    expect(result.current.questions).toEqual(["问题一", "问题二"])

    act(() => result.current.clear())
    expect(result.current.questions).toEqual([])
  })

  it("StrictMode 下恢复消息不生成、不卡 loading", async () => {
    const { result } = renderHook(
      () =>
        useSuggestedQuestions({
          enabled: true,
          isStreaming: false,
          isLastAssistant: true,
          context,
        }),
      { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> },
    )

    await act(async () => {})
    expect(agentApi.suggestedQuestions).not.toHaveBeenCalled()
    expect(result.current.questions).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})
