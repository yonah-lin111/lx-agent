import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, IdleWatchdog } from "@/agent/stream/idleWatchdog"

describe("IdleWatchdog 流式空闲看门狗", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("默认常量为 30 秒", () => {
    expect(DEFAULT_STREAM_IDLE_TIMEOUT_MS).toBe(30_000)
  })

  it("初始状态未中止，定时器超时后触发 abort", () => {
    const watchdog = new IdleWatchdog({ timeoutMs: 1000 })
    expect(watchdog.aborted).toBe(false)
    expect(watchdog.signal.aborted).toBe(false)

    vi.advanceTimersByTime(999)
    expect(watchdog.aborted).toBe(false)

    vi.advanceTimersByTime(1)
    expect(watchdog.aborted).toBe(true)
    expect(watchdog.signal.aborted).toBe(true)
    expect(watchdog.signal.reason).toBeInstanceOf(Error)
    expect((watchdog.signal.reason as Error).message).toContain("Stream idle timeout after 1000ms")
  })

  it("支持自定义错误消息", () => {
    const watchdog = new IdleWatchdog({
      timeoutMs: 500,
      errorMessage: "自定义超时错误",
    })

    vi.advanceTimersByTime(500)
    expect(watchdog.aborted).toBe(true)
    expect((watchdog.signal.reason as Error).message).toBe("自定义超时错误")
  })

  it("feed 能够重置计时器，防止在连续 chunk 期间误判超时", () => {
    const watchdog = new IdleWatchdog({ timeoutMs: 1000 })

    vi.advanceTimersByTime(800)
    expect(watchdog.aborted).toBe(false)

    // 接收到 chunk，喂狗
    watchdog.feed()

    vi.advanceTimersByTime(800)
    expect(watchdog.aborted).toBe(false)

    // 再次喂狗
    watchdog.feed()

    vi.advanceTimersByTime(800)
    expect(watchdog.aborted).toBe(false)

    // 停止喂狗，超过 1000ms 后超时
    vi.advanceTimersByTime(1000)
    expect(watchdog.aborted).toBe(true)
  })

  it("dispose 后清理定时器且不再触发 abort", () => {
    const watchdog = new IdleWatchdog({ timeoutMs: 1000 })

    vi.advanceTimersByTime(500)
    watchdog.dispose()

    vi.advanceTimersByTime(2000)
    expect(watchdog.aborted).toBe(false)
  })

  it("支持 Symbol.dispose 显式释放", () => {
    const watchdog = new IdleWatchdog({ timeoutMs: 1000 })

    vi.advanceTimersByTime(500)
    watchdog[Symbol.dispose]()

    vi.advanceTimersByTime(2000)
    expect(watchdog.aborted).toBe(false)
  })

  it("结合 AbortSignal.any 能准确区分用户取消与看门狗超时", () => {
    const userController = new AbortController()
    const watchdog = new IdleWatchdog({ timeoutMs: 1000 })
    const combinedSignal = AbortSignal.any([userController.signal, watchdog.signal])

    expect(combinedSignal.aborted).toBe(false)

    // 用户主动取消
    userController.abort(new Error("用户手动取消"))

    expect(combinedSignal.aborted).toBe(true)
    expect(userController.signal.aborted).toBe(true)
    expect(watchdog.aborted).toBe(false)

    watchdog.dispose()
  })

  it("结合 AbortSignal.any 在看门狗超时触发时用户信号未中止", () => {
    const userController = new AbortController()
    const watchdog = new IdleWatchdog({ timeoutMs: 1000 })
    const combinedSignal = AbortSignal.any([userController.signal, watchdog.signal])

    expect(combinedSignal.aborted).toBe(false)

    vi.advanceTimersByTime(1000)

    expect(combinedSignal.aborted).toBe(true)
    expect(watchdog.aborted).toBe(true)
    expect(userController.signal.aborted).toBe(false)

    watchdog.dispose()
  })
})
