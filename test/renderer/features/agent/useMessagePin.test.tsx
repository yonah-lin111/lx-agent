// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useMessagePin } from "@/features/agent/hooks/useMessagePin"

// 模拟滚动容器：jsdom 的 getBoundingClientRect 默认全 0，使"锚点顶 <= 容器顶"判定成立；
// scrollTop 用于区分"已滚过视口"与"未滚动"。
const makeContainer = (scrollTop: number): HTMLDivElement =>
  ({ scrollTop, getBoundingClientRect: () => ({ top: 0 }) }) as unknown as HTMLDivElement

describe("useMessagePin", () => {
  it("用户消息完全滚过视口顶部后吸顶", () => {
    const { result } = renderHook(() => useMessagePin())
    act(() => {
      result.current.attachUserMessageEndRef("msg-1")(document.createElement("div"))
    })
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(10))
    })
    expect(result.current.pinnedUserMessageId).toBe("msg-1")
  })

  it("未滚出视口（scrollTop 接近 0）时不吸顶", () => {
    const { result } = renderHook(() => useMessagePin())
    act(() => {
      result.current.attachUserMessageEndRef("msg-1")(document.createElement("div"))
    })
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(0))
    })
    expect(result.current.pinnedUserMessageId).toBeNull()
  })

  it("锚点卸载后不再吸顶", () => {
    const { result } = renderHook(() => useMessagePin())
    const end = document.createElement("div")
    act(() => {
      result.current.attachUserMessageEndRef("msg-1")(end)
    })
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(10))
    })
    expect(result.current.pinnedUserMessageId).toBe("msg-1")

    act(() => {
      result.current.attachUserMessageEndRef("msg-1")(null)
    })
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(10))
    })
    expect(result.current.pinnedUserMessageId).toBeNull()
  })
})
