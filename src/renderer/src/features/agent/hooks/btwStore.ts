import type { BtwContextMessage } from "@shared/contracts/agent"

// btw 消息：侧问问题或回答（失败回答以 failed 标记，不作为后续上下文）。
export interface BtwMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
  failed?: boolean
}

// btw 侧问线：同一主会话锚点（最近一条主用户消息 timestamp）下的连续侧问。
export interface BtwThread {
  id: string
  anchor: number
  createdAt: number
  messages: BtwMessage[]
}

// 单 owner 消息条数上限（超出按最旧淘汰，空线程一并移除）。
const MAX_MESSAGES_PER_OWNER = 100
// localStorage 键前缀（仅已落库会话持久化；草稿态 owner 只存内存）。
const STORAGE_KEY_PREFIX = "btw:history:"
// 草稿态 owner 前缀（tab 不跨重启稳定，持久化只会产生孤儿键）。
const DRAFT_OWNER_PREFIX = "tab:"
// 空列表共享引用（保证 useSyncExternalStore 快照稳定）。
const EMPTY_THREADS: BtwThread[] = []

/**
 * btw owner key：已落库会话 = sessionId；草稿会话 = `tab:<tabId>`；都缺省时返回 null。
 */
export const getBtwOwnerKey = (
  sessionId: string | null | undefined,
  tabId?: string | null,
): string | null => sessionId ?? (tabId ? `${DRAFT_OWNER_PREFIX}${tabId}` : null)

// 草稿态 owner 不持久化。
const isPersistableOwner = (ownerKey: string): boolean => !ownerKey.startsWith(DRAFT_OWNER_PREFIX)

// 生成稳定前缀的随机 id。
const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// 校验持久化数据中的消息形状（损坏数据丢弃）。
const isValidMessage = (value: unknown): value is BtwMessage => {
  if (!value || typeof value !== "object") return false
  const message = value as Record<string, unknown>
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "number"
  )
}

// 校验持久化数据中的侧问线形状。
const isValidThread = (value: unknown): value is BtwThread => {
  if (!value || typeof value !== "object") return false
  const thread = value as Record<string, unknown>
  return (
    typeof thread.id === "string" &&
    typeof thread.anchor === "number" &&
    typeof thread.createdAt === "number" &&
    Array.isArray(thread.messages) &&
    thread.messages.every(isValidMessage)
  )
}

// owner → 侧问线列表（内存权威数据）。
const threadsByOwner = new Map<string, BtwThread[]>()
// 已尝试从 localStorage 加载的 owner（懒加载去重）。
const hydratedOwners = new Set<string>()
const listeners = new Set<() => void>()

const notify = (): void => {
  for (const listener of listeners) listener()
}

const persist = (ownerKey: string): void => {
  if (!isPersistableOwner(ownerKey) || typeof localStorage === "undefined") return
  try {
    const threads = threadsByOwner.get(ownerKey) ?? []
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${ownerKey}`, JSON.stringify(threads))
  } catch {
    // 存储失败（配额/隐私模式）：内存数据保持可用。
  }
}

// 懒加载 owner 的持久化数据（幂等；损坏数据丢弃）。
const hydrate = (ownerKey: string): void => {
  if (hydratedOwners.has(ownerKey)) return
  hydratedOwners.add(ownerKey)
  if (!isPersistableOwner(ownerKey) || typeof localStorage === "undefined") return
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${ownerKey}`)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    const threads = parsed.filter(isValidThread)
    if (threads.length > 0) threadsByOwner.set(ownerKey, threads)
  } catch {
    // 损坏数据丢弃，不阻塞面板。
  }
}

// 消息总量超限时按最旧淘汰。
const trimOwner = (threads: BtwThread[]): BtwThread[] => {
  const total = threads.reduce((sum, thread) => sum + thread.messages.length, 0)
  if (total <= MAX_MESSAGES_PER_OWNER) return threads
  const next = threads.map((thread) => ({ ...thread, messages: [...thread.messages] }))
  let remaining = total
  while (remaining > MAX_MESSAGES_PER_OWNER) {
    const oldest = next.find((thread) => thread.messages.length > 0)
    if (!oldest) break
    oldest.messages.shift()
    remaining -= 1
  }
  return next.filter((thread) => thread.messages.length > 0)
}

const setThreads = (ownerKey: string, threads: BtwThread[]): void => {
  threadsByOwner.set(ownerKey, trimOwner(threads))
  persist(ownerKey)
  notify()
}

/**
 * btw 侧问线 store：按 owner（会话/草稿 Tab）隔离，草稿态仅内存、落库后迁移持久化。
 */
export const btwStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  // 读取 owner 的侧问线（懒加载持久化数据；无数据返回共享空引用）。
  getThreads(ownerKey: string | null): BtwThread[] {
    if (!ownerKey) return EMPTY_THREADS
    hydrate(ownerKey)
    return threadsByOwner.get(ownerKey) ?? EMPTY_THREADS
  },

  // 追加侧问问题：同锚点并入最后一条侧问线，锚点变化新建侧问线。
  appendUser(
    ownerKey: string,
    anchor: number,
    content: string,
  ): { threadId: string; messageId: string } {
    hydrate(ownerKey)
    const threads = threadsByOwner.get(ownerKey) ?? []
    const message: BtwMessage = {
      id: createId("btw-q"),
      role: "user",
      content,
      createdAt: Date.now(),
    }
    const last = threads.at(-1)
    if (last && last.anchor === anchor) {
      setThreads(ownerKey, [
        ...threads.slice(0, -1),
        { ...last, messages: [...last.messages, message] },
      ])
      return { threadId: last.id, messageId: message.id }
    }
    const thread: BtwThread = {
      id: createId("btw-thread"),
      anchor,
      createdAt: message.createdAt,
      messages: [message],
    }
    setThreads(ownerKey, [...threads, thread])
    return { threadId: thread.id, messageId: message.id }
  },

  // 追加侧问回答（失败时以 failed 标记）。
  appendAssistant(ownerKey: string, threadId: string, content: string, failed = false): void {
    hydrate(ownerKey)
    const threads = threadsByOwner.get(ownerKey)
    if (!threads) return
    const message: BtwMessage = {
      id: createId("btw-a"),
      role: "assistant",
      content,
      createdAt: Date.now(),
      ...(failed ? { failed: true } : {}),
    }
    setThreads(
      ownerKey,
      threads.map((thread) =>
        thread.id === threadId ? { ...thread, messages: [...thread.messages, message] } : thread,
      ),
    )
  },

  // 清理指定锚点的侧问线（主会话轮次被删除/撤销时调用）。
  removeThreadsByAnchor(ownerKey: string, anchor: number): void {
    hydrate(ownerKey)
    const threads = threadsByOwner.get(ownerKey)
    if (!threads || threads.length === 0) return
    const next = threads.filter((thread) => thread.anchor !== anchor)
    if (next.length === threads.length) return
    setThreads(ownerKey, next)
  },

  // 草稿 owner 绑定会话后迁移数据并持久化（目标已有数据时按创建时间合并）。
  migrateOwner(fromKey: string, toKey: string): void {
    if (fromKey === toKey) return
    const source = threadsByOwner.get(fromKey)
    if (!source || source.length === 0) return
    hydrate(toKey)
    const target = threadsByOwner.get(toKey) ?? []
    const merged = [...target, ...source].sort((a, b) => a.createdAt - b.createdAt)
    threadsByOwner.set(toKey, trimOwner(merged))
    threadsByOwner.delete(fromKey)
    persist(toKey)
    notify()
  },

  // 删除 owner 的全部侧问线（会话被删除时调用）。
  deleteOwner(ownerKey: string): void {
    const existed = threadsByOwner.delete(ownerKey)
    if (isPersistableOwner(ownerKey) && typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${ownerKey}`)
      } catch {
        // 忽略删除失败。
      }
    }
    if (existed) notify()
  },
}

/**
 * 侧问线消息转为模型上下文（失败回答不参与后续上下文）。
 */
export const toBtwContextMessages = (thread: BtwThread): BtwContextMessage[] =>
  thread.messages
    .filter((message) => !message.failed && message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }))
