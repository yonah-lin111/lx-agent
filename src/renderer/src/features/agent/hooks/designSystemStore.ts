import { useSyncExternalStore } from "react"

// 设计系统令牌：约束 Agent 在 design 模式下的每一次生成与修改。
export interface DesignSystemTokens {
  colors: string[]
  radius: string
  fontFamily: string
  notes: string
}

// 空令牌。
export const EMPTY_DESIGN_SYSTEM: DesignSystemTokens = {
  colors: [],
  radius: "",
  fontFamily: "",
  notes: "",
}

const STORAGE_KEY = "lx-agent-design-system-v1"
const MAX_COLORS = 12
const MAX_COLOR_LENGTH = 32
const MAX_RADIUS_LENGTH = 24
const MAX_FONT_LENGTH = 120
const MAX_NOTES_LENGTH = 2000

// 文本字段钳制：非字符串或超长时截断。
const clampText = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.slice(0, maxLength) : ""

// 归一化任意来源数据为合法令牌，坏数据退化为空令牌字段。
export const normalizeDesignSystemTokens = (raw: unknown): DesignSystemTokens => {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DESIGN_SYSTEM }
  const source = raw as Partial<Record<keyof DesignSystemTokens, unknown>>
  const colors = Array.isArray(source.colors)
    ? source.colors
        .map((color) => clampText(color, MAX_COLOR_LENGTH).trim())
        .filter(Boolean)
        .slice(0, MAX_COLORS)
    : []

  return {
    colors,
    radius: clampText(source.radius, MAX_RADIUS_LENGTH).trim(),
    fontFamily: clampText(source.fontFamily, MAX_FONT_LENGTH).trim(),
    notes: clampText(source.notes, MAX_NOTES_LENGTH).trim(),
  }
}

// 令牌是否为空（无任何字段）。
export const isEmptyDesignSystem = (tokens: DesignSystemTokens): boolean =>
  tokens.colors.length === 0 && !tokens.radius && !tokens.fontFamily && !tokens.notes.trim()

// 从 localStorage 读取令牌，任何异常退化为空令牌。
const loadTokens = (): DesignSystemTokens => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_DESIGN_SYSTEM }
    return normalizeDesignSystemTokens(JSON.parse(raw))
  } catch {
    return { ...EMPTY_DESIGN_SYSTEM }
  }
}

let cachedTokens: DesignSystemTokens = loadTokens()
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * 设计系统令牌存储：模块级单例 + localStorage 持久化，跨会话全局共用一份。
 */
export const designSystemStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getTokens: (): DesignSystemTokens => cachedTokens,

  setTokens: (next: Partial<DesignSystemTokens>): void => {
    cachedTokens = normalizeDesignSystemTokens({ ...cachedTokens, ...next })
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cachedTokens))
    } catch {
      // 忽略持久化失败
    }
    notify()
  },

  reset: (): void => {
    cachedTokens = { ...EMPTY_DESIGN_SYSTEM }
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {
      // 忽略持久化失败
    }
    notify()
  },
}

/**
 * 响应式 Hook：订阅设计系统令牌。
 */
export const useDesignSystem = (): DesignSystemTokens => {
  return useSyncExternalStore(designSystemStore.subscribe, designSystemStore.getTokens)
}
