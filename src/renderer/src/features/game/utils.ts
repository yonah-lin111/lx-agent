import type { GameImportInvalidReason } from "@shared/contracts/game"
import type { TranslationKey } from "@/i18n"

// 导入失败原因码 → i18n key。
export const GAME_INVALID_REASON_KEYS: Record<GameImportInvalidReason, TranslationKey> = {
  unsupportedExtension: "game.invalidReason.unsupportedExtension",
  tooLarge: "game.invalidReason.tooLarge",
  unreadable: "game.invalidReason.unreadable",
}

// 字节数 → 人类可读体积（KB / MB，保留一位小数）。
export const formatRomSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// ISO 时间 → 本地短日期（跟随界面语言）。
export const formatPlayedAt = (iso: string, locale: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
