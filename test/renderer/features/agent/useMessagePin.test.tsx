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

  it("已经吸顶的消息具备滞后（Hysteresis）缓冲区保护，避免临界点无限循环抖动", () => {
    const { result } = renderHook(() => useMessagePin())
    const end = document.createElement("div")

    let rectTop = -5
    end.getBoundingClientRect = () =>
      ({ top: rectTop, bottom: 0, left: 0, right: 0, width: 0, height: 0 }) as DOMRect

    act(() => {
      result.current.attachUserMessageEndRef("msg-1")(end)
    })

    // 1. 初次吸顶（rectTop <= 0，满足吸顶条件）
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(10))
    })
    expect(result.current.pinnedUserMessageId).toBe("msg-1")

    // 2. 稍微回滚一小段距离 (比如 rectTop 变为 20px)，由于已经吸顶，阈值为 containerTop + 64 (即 64px)
    // 20px <= 64px 依然成立，故应保持吸顶
    rectTop = 20
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(10))
    })
    expect(result.current.pinnedUserMessageId).toBe("msg-1")

    // 3. 回滚更远距离 (比如 rectTop 变为 80px)，超过 64px 缓冲区，应该解除吸顶
    rectTop = 80
    act(() => {
      result.current.updatePinnedQuestion(makeContainer(10))
    })
    expect(result.current.pinnedUserMessageId).toBeNull()
  })
})
