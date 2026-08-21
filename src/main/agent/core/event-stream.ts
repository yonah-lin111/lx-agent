import type { AssistantMessage, AssistantMessageEvent } from "@shared/contracts/agent"

// 泛型事件流：支持异步迭代与最终结果提取。
export class EventStream<T, R = T> implements AsyncIterable<T>, Disposable {
  // 事件缓冲队列。
  private queue: T[] = []
  // 等待消费的 promise resolve 回调队列。
  private waiting: ((value: IteratorResult<T>) => void)[] = []
  // 是否已结束。
  private done = false
  // 最终结果是否已写入。
  private resultResolved = false
  // 最终结果 promise。
  private readonly finalResultPromise: Promise<R>
  // 最终结果 resolve 回调。
  private resolveFinalResult!: (result: R) => void
  // 最终结果 reject 回调。
  private rejectFinalResult!: (error: unknown) => void
  // 判断事件是否代表完成状态。
  private readonly isComplete: (event: T) => boolean
  // 从完成事件提取最终结果。
  private readonly extractResult: (event: T) => R

  constructor(isComplete: (event: T) => boolean, extractResult: (event: T) => R) {
    this.isComplete = isComplete
    this.extractResult = extractResult
    this.finalResultPromise = new Promise((resolve, reject) => {
      this.resolveFinalResult = resolve
      this.rejectFinalResult = reject
    })
  }

  // 推送新事件。
  push = (event: T): void => {
    if (this.done) return

    if (this.isComplete(event)) {
      this.done = true
      this.resultResolved = true
      this.resolveFinalResult(this.extractResult(event))
    }

    const waiter = this.waiting.shift()
    if (waiter) {
      waiter({ value: event, done: false })
    } else {
      this.queue.push(event)
    }
  }

  // 结束事件流。
  end = (result?: R): void => {
    if (this.done && this.waiting.length === 0) return
    this.done = true
    if (result !== undefined) {
      this.resultResolved = true
      this.resolveFinalResult(result)
    } else if (!this.resultResolved) {
      this.resultResolved = true
      this.rejectFinalResult(new Error("Stream ended without result"))
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!
      waiter({ value: undefined as never, done: true })
    }
  }

  // 释放流资源。
  dispose = (): void => {
    this.end()
  };

  // 显式资源管理。
  [Symbol.dispose] = (): void => {
    this.dispose()
  }

  // 异步迭代器实现。
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    try {
      while (true) {
        if (this.queue.length > 0) {
          yield this.queue.shift()!
        } else if (this.done) {
          return
        } else {
          const result = await new Promise<IteratorResult<T>>((resolve) =>
            this.waiting.push(resolve),
          )
          if (result.done) return
          yield result.value
        }
      }
    } finally {
      this.end()
    }
  }

  // 获取最终结果 promise。
  result = (): Promise<R> => {
    return this.finalResultPromise
  }
}

// 助手消息事件流：done/error 事件携带最终消息。
export class AssistantMessageEventStream extends EventStream<
  AssistantMessageEvent,
  AssistantMessage
> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") {
          return event.message
        } else if (event.type === "error") {
          return event.error
        }
        throw new Error("Unexpected event type for final result")
      },
    )
  }
}

// 创建助手消息事件流（供 streamFn 适配器使用）。
export const createAssistantMessageEventStream = (): AssistantMessageEventStream =>
  new AssistantMessageEventStream()
