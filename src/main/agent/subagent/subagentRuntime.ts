/**
 * 会话级子代理并发槽位（无队列、无事件）。
 *
 * 缺省未配置 maxConcurrent 时不限并发，tryAcquire 恒成功（行为与旧版一致）；
 * 达到上限立即拒绝而不排队，避免嵌套场景下父子互等死锁。
 */
export class SubagentRuntime {
  private activeCount = 0

  constructor(private readonly maxConcurrent?: number) {}

  // 尝试占用一个槽位：达到上限返回 false，不排队、不等待。
  tryAcquire(): boolean {
    if (this.maxConcurrent !== undefined && this.activeCount >= this.maxConcurrent) {
      return false
    }
    this.activeCount += 1
    return true
  }

  // 释放一个槽位（不低于 0）。
  release(): void {
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
}
