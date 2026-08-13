import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { getPromptHistoryPath } from "@/paths"

// 历史提示词数量上限。
const MAX_HISTORY = 100

// 读取全局历史（新→旧）；文件缺失或损坏时回退空数组。
const readHistory = (): string[] => {
  const path = getPromptHistoryPath()
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

// 原子写入历史：先写临时文件再重命名，避免半写损坏。
const writeHistory = (history: string[]): void => {
  const path = getPromptHistoryPath()
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, "utf8")
  renameSync(temporaryPath, path)
}

// 获取全局历史提示词（新→旧，缺失返回空数组）。
export const getPromptHistory = (): string[] => readHistory()

// 追加提示词：去空白、跳过连续重复、新→旧排列并截断上限，写回文件后返回新历史。
export const addPromptHistory = (text: string): string[] => {
  const trimmed = text.trim()
  const history = readHistory()
  if (!trimmed || history[0] === trimmed) return history
  const next = [trimmed, ...history].slice(0, MAX_HISTORY)
  writeHistory(next)
  return next
}
