import { existsSync, readFileSync } from "node:fs"
import { HOOK_EVENT_NAMES, HOOK_MATCHER_EVENTS, type HookEventName } from "@shared/contracts/agent"
import type { HookCommandEntry, HookMatcherGroup, HookSettings } from "@shared/settings"
import { z } from "zod"
import { getConfigPath } from "@/paths"
import type { LoadedHook } from "./types"

export { HOOK_EVENT_NAMES }

// 仅这些事件消费 matcher 字段；其余事件忽略该字段。
const MATCHER_EVENTS = new Set<HookEventName>(HOOK_MATCHER_EVENTS)

// hook 默认超时（秒）与输出上限（token）。
const DEFAULT_TIMEOUT_SEC = 600
const DEFAULT_ADDITIONAL_CONTEXT_LIMIT = 2500

// 单条 handler 严格 schema：V1 仅 command；未知字段剥离。
const HOOK_HANDLER_SCHEMA = z.object({
  name: z.string().min(1).optional(),
  type: z.literal("command").optional(),
  command: z.string().trim().min(1),
  commandWindows: z.string().trim().min(1).optional(),
  timeout: z.number().min(1).optional(),
  additionalContextLimit: z.number().nonnegative().optional(),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isHookEventName = (value: string): value is HookEventName =>
  (HOOK_EVENT_NAMES as readonly string[]).includes(value)

// matcher 解析：竖线分隔的精确工具名（非正则）；非法输入告警后按“全部”处理。
export const parseMatcher = (
  value: unknown,
  warn: (message: string) => void,
): string[] | undefined => {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") {
    warn(`忽略非法 matcher（须为字符串）: ${JSON.stringify(value)}`)
    return undefined
  }
  const names = value
    .split("|")
    .map((name) => name.trim())
    .filter(Boolean)
  return names.length > 0 ? names : undefined
}

// 解析结果：规范化配置（一 hook 一组）与非法条目说明。
export interface HookSettingsParseResult {
  settings: HookSettings
  errors: string[]
}

/**
 * 解析 `agent.hooks` 原始配置为设置模型：合规条目扁平化为一 hook 一组，`name` 缺省物化。
 * 非法条目（未知事件键 / 非法结构 / 空命令 / 未知 handler 类型）记入 errors 且跳过，绝不抛出。
 */
export const parseHookSettings = (raw: unknown): HookSettingsParseResult => {
  if (raw === undefined || raw === null) return { settings: {}, errors: [] }
  if (!isRecord(raw)) return { settings: {}, errors: ["agent.hooks 必须是对象，已忽略"] }

  const settings: HookSettings = {}
  const errors: string[] = []
  let order = 0

  for (const [eventKey, groupsRaw] of Object.entries(raw)) {
    if (!isHookEventName(eventKey)) {
      errors.push(`忽略未知事件键: ${eventKey}`)
      continue
    }
    if (!Array.isArray(groupsRaw)) {
      errors.push(`忽略非法事件配置（须为数组）: ${eventKey}`)
      continue
    }

    const groups: HookMatcherGroup[] = []
    for (const groupRaw of groupsRaw) {
      if (!isRecord(groupRaw)) {
        errors.push(`忽略非法 matcher 组（须为对象）: ${eventKey}`)
        continue
      }
      const handlersRaw = groupRaw.hooks
      if (!Array.isArray(handlersRaw) || handlersRaw.length === 0) {
        errors.push(`忽略无 hooks 的 matcher 组: ${eventKey}`)
        continue
      }
      let matcher: string | undefined
      if (MATCHER_EVENTS.has(eventKey)) {
        const names = parseMatcher(groupRaw.matcher, (message) => errors.push(message))
        matcher = names?.join("|")
      }

      for (const handlerRaw of handlersRaw) {
        const handler = HOOK_HANDLER_SCHEMA.safeParse(handlerRaw)
        if (!handler.success) {
          errors.push(`忽略非法 hook 条目（${eventKey}）: ${handler.error.message}`)
          continue
        }
        const parsed = handler.data
        const entry: HookCommandEntry = {
          name: parsed.name ?? `${eventKey}#${order + 1}`,
          command: parsed.command,
          ...(parsed.commandWindows ? { commandWindows: parsed.commandWindows } : {}),
          ...(parsed.timeout !== undefined ? { timeout: parsed.timeout } : {}),
          ...(parsed.type ? { type: parsed.type } : {}),
          ...(parsed.additionalContextLimit !== undefined
            ? { additionalContextLimit: parsed.additionalContextLimit }
            : {}),
        }
        order += 1
        groups.push({ ...(matcher ? { matcher } : {}), hooks: [entry] })
      }
    }
    if (groups.length > 0) settings[eventKey] = groups
  }

  return { settings, errors }
}

/**
 * 读取 `agent.hooks` 设置模型：非法条目告警并忽略，缺失/损坏降级为空。
 */
export const readHookSettings = (
  raw: unknown,
  warn: (message: string) => void = console.warn,
): HookSettings => {
  const { settings, errors } = parseHookSettings(raw)
  for (const message of errors) warn(`[hooks] ${message}`)
  return settings
}

/**
 * 保存前严格校验设置模型：任一非法条目或含空工具名段的 matcher 即抛出（不写入坏配置）。
 */
export const validateHookSettings = (raw: unknown): HookSettings => {
  const { settings, errors } = parseHookSettings(raw)
  if (errors.length > 0) throw new Error(errors[0])

  if (isRecord(raw)) {
    for (const [eventKey, groupsRaw] of Object.entries(raw)) {
      if (!isHookEventName(eventKey) || !MATCHER_EVENTS.has(eventKey)) continue
      if (!Array.isArray(groupsRaw)) continue
      for (const groupRaw of groupsRaw) {
        if (!isRecord(groupRaw)) continue
        const matcher = groupRaw.matcher
        if (typeof matcher !== "string" || matcher.trim() === "") continue
        const names = matcher.split("|").map((name) => name.trim())
        if (names.some((name) => !name)) {
          throw new Error(`非法 matcher（含空工具名段）: ${matcher}`)
        }
      }
    }
  }

  return settings
}

/**
 * 解析 `agent.hooks` 原始配置为按配置顺序展开的 LoadedHook[]。
 * 任何非法条目告警并忽略，绝不抛出。
 */
export const parseHookConfig = (
  raw: unknown,
  warn: (message: string) => void = console.warn,
): LoadedHook[] => {
  const { settings, errors } = parseHookSettings(raw)
  for (const message of errors) warn(`[hooks] ${message}`)

  const hooks: LoadedHook[] = []
  let order = 0
  for (const [eventKey, groups] of Object.entries(settings)) {
    const event = eventKey as HookEventName
    for (const group of groups) {
      const entry = group.hooks[0]!
      hooks.push({
        name: entry.name,
        event,
        ...(group.matcher ? { matcher: group.matcher.split("|") } : {}),
        command: entry.command,
        ...(entry.commandWindows ? { commandWindows: entry.commandWindows } : {}),
        timeoutSec: entry.timeout ?? DEFAULT_TIMEOUT_SEC,
        additionalContextLimit: entry.additionalContextLimit ?? DEFAULT_ADDITIONAL_CONTEXT_LIMIT,
        order,
      })
      order += 1
    }
  }
  return hooks
}

/**
 * 读取 `~/.lx/config.json` 的 `agent.hooks` 并解析；缺失/损坏一律告警并降级为空。
 */
export const loadHooks = (
  configPath: string = getConfigPath(),
  warn: (message: string) => void = console.warn,
): LoadedHook[] => {
  try {
    if (!existsSync(configPath)) return []
    const text = readFileSync(configPath, "utf8").trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    if (!isRecord(parsed)) {
      warn("[hooks] 配置文件根节点必须是对象，已忽略 agent.hooks")
      return []
    }
    const agent = isRecord(parsed.agent) ? parsed.agent : undefined
    return parseHookConfig(agent?.hooks, warn)
  } catch (error) {
    warn(
      `[hooks] 读取 hooks 配置失败，已降级为空: ${error instanceof Error ? error.message : error}`,
    )
    return []
  }
}

/**
 * 会话级配置缓存：每个作用域只读取/解析一次（无热重载，配置变更仅对新会话生效）。
 */
class HookConfigStore {
  private cache = new Map<string, LoadedHook[]>()

  get(scopeKey: string): LoadedHook[] {
    const cached = this.cache.get(scopeKey)
    if (cached) return cached
    const loaded = loadHooks()
    this.cache.set(scopeKey, loaded)
    return loaded
  }

  reset(scopeKey?: string): void {
    if (scopeKey === undefined) {
      this.cache.clear()
      return
    }
    this.cache.delete(scopeKey)
  }
}

export const hookConfig = new HookConfigStore()
