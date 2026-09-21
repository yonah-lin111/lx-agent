/**
 * 会话级子代理并发槽位（顶层 FIFO 排队、嵌套 fail-fast）。
 *
 * 缺省未配置 maxConcurrent 时不限并发，acquire 恒成功（行为与旧版一致）。
 * 达到上限时：顶层会话（depth 0）允许排队，release 把槽位直接移交队首，
 * 避免被后来的 tryAcquire 插队；嵌套子代理（depth ≥ 1）保持立即拒绝，
 * 因为父代理占用槽位等待子代理会让排队形成循环等待（死锁）。
 */
export type SubagentLease = () => void

export interface AcquireOptions {
  // 是否允许排队等待空闲槽位（仅顶层会话允许）。
  queue?: boolean
  // 中止信号：排队期间中止则出队并返回 null。
  signal?: AbortSignal
}

interface Waiter {
  resolve: (lease: SubagentLease | null) => void
  signal?: AbortSignal
  onAbort?: () => void
}

export class SubagentRuntime {
  private activeCount = 0
  private readonly waiters: Waiter[] = []

  constructor(private readonly maxConcurrent?: number) {}

  // 尝试占用一个槽位：达到上限返回 false，不排队、不等待。
  tryAcquire(): boolean {
    if (this.maxConcurrent !== undefined && this.activeCount >= this.maxConcurrent) {
      return false
    }
    this.activeCount += 1
    return true
  }

  // 同步占用（槽位空闲时）：返回幂等租约；达到上限返回 null（由调用方决定排队或拒绝）。
  tryAcquireLease(): SubagentLease | null {
    return this.tryAcquire() ? this.createLease() : null
  }

  // 占用一个槽位：达到上限且允许排队时按 FIFO 等待；中止或不允许排队时返回 null。
  async acquire(options: AcquireOptions = {}): Promise<SubagentLease | null> {
    if (this.tryAcquire()) return this.createLease()
    if (!options.queue) return null
    const { signal } = options
    if (signal?.aborted) return null

    return new Promise<SubagentLease | null>((resolve) => {
      const waiter: Waiter = { resolve, signal }
      waiter.onAbort = () => this.settleWaiter(waiter, null)
      signal?.addEventListener("abort", waiter.onAbort, { once: true })
      this.waiters.push(waiter)
    })
  }

  // 释放一个槽位：有排队者时直接移交队首（activeCount 不变），否则计数递减。
  release(): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort)
      waiter.resolve(this.createLease())
      return
    }
    if (this.activeCount > 0) {
      this.activeCount -= 1
    }
  }

  get active(): number {
    return this.activeCount
  }

  get limit(): number | undefined {
    return this.maxConcurrent
  }

  // 当前排队等待数（观测/测试用）。
  get waiting(): number {
    return this.waiters.length
  }

  // 出队并结算（中止路径；release 移交路径走 shift 后直接 resolve）。
  private settleWaiter(waiter: Waiter, lease: SubagentLease | null): void {
    const index = this.waiters.indexOf(waiter)
    if (index === -1) return
    this.waiters.splice(index, 1)
    if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort)
    waiter.resolve(lease)
  }

  // 幂等租约：重复调用只释放一次（finally 路径安全）。
  private createLease(): SubagentLease {
    let released = false
    return () => {
      if (released) return
      released = true
      this.release()
    }
  }
}
