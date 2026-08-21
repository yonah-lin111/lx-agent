// 流式看门狗配置选项。
export interface WatchdogOptions {
  // 超时毫秒数。
  timeoutMs: number
  // 自定义超时错误信息。
  errorMessage?: string
}

// 默认流式空闲超时时间（30 秒）。
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30_000

/**
 * 流式空闲超时看门狗。
 *
 * 在流式请求开始或接收到 chunk 时启动/重置计时器。
 * 若在超时周期内无新 chunk 产生，触发 controller 中止信号。
 */
export class IdleWatchdog implements Disposable {
  // 配置选项。
  private readonly options: WatchdogOptions
  // 定时器引用。
  private timer: NodeJS.Timeout | null = null
  // 中止控制器。
  private readonly controller = new AbortController()
  // 是否已释放。
  private disposed = false

  constructor(options: WatchdogOptions) {
    this.options = options
    this.reset()
  }

  // 获取中止信号。
  get signal(): AbortSignal {
    return this.controller.signal
  }

  // 检查是否已中止。
  get aborted(): boolean {
    return this.controller.signal.aborted
  }

  // 每接收到一个 chunk 时喂狗（重置超时计数器）。
  feed = (): void => {
    if (this.disposed) return
    this.reset()
  }

  // 重置定时器。
  private reset = (): void => {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.disposed || this.controller.signal.aborted) return

    this.timer = setTimeout(() => {
      this.timer = null
      this.controller.abort(
        new Error(
          this.options.errorMessage || `Stream idle timeout after ${this.options.timeoutMs}ms`,
        ),
      )
    }, this.options.timeoutMs)
  }

  // 释放看门狗定时器资源。
  dispose = (): void => {
    if (this.disposed) return
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  };

  // 支持 Symbol.dispose 显式资源管理。
  [Symbol.dispose] = (): void => {
    this.dispose()
  }
}
