import type { GameImportInvalidReason, GameKeyAction } from "@shared/contracts/game"
import type { TranslationKey } from "@/i18n"

// 导入失败原因码 → i18n key。
export const GAME_INVALID_REASON_KEYS: Record<GameImportInvalidReason, TranslationKey> = {
  unsupportedExtension: "game.invalidReason.unsupportedExtension",
  tooLarge: "game.invalidReason.tooLarge",
  unreadable: "game.invalidReason.unreadable",
}

// 可配置动作 → i18n key。
export const GAME_KEY_ACTION_LABEL_KEYS: Record<GameKeyAction, TranslationKey> = {
  up: "game.keymap.actions.up",
  down: "game.keymap.actions.down",
  left: "game.keymap.actions.left",
  right: "game.keymap.actions.right",
  a: "game.keymap.actions.a",
  b: "game.keymap.actions.b",
  l: "game.keymap.actions.l",
  r: "game.keymap.actions.r",
  start: "game.keymap.actions.start",
  select: "game.keymap.actions.select",
  turboA: "game.keymap.actions.turboA",
  turboB: "game.keymap.actions.turboB",
  speed: "game.keymap.actions.speed",
  pause: "game.keymap.actions.pause",
}

// 翻译函数签名（与 i18n context 的 t 对齐）。
type GameTranslate = (key: TranslationKey, params?: Record<string, string | number>) => string

// 需走 i18n 的命名键：KeyboardEvent.code → i18n key。
const NAMED_KEY_LABEL_KEYS: Record<string, TranslationKey> = {
  Enter: "game.keymap.keys.enter",
  Backspace: "game.keymap.keys.backspace",
  Tab: "game.keymap.keys.tab",
  Escape: "game.keymap.keys.escape",
  Space: "game.keymap.keys.space",
  ShiftLeft: "game.keymap.keys.shift",
  ShiftRight: "game.keymap.keys.shift",
  ControlLeft: "game.keymap.keys.ctrl",
  ControlRight: "game.keymap.keys.ctrl",
  AltLeft: "game.keymap.keys.alt",
  AltRight: "game.keymap.keys.alt",
  MetaLeft: "game.keymap.keys.meta",
  MetaRight: "game.keymap.keys.meta",
  CapsLock: "game.keymap.keys.capsLock",
  Insert: "game.keymap.keys.insert",
  Delete: "game.keymap.keys.delete",
  Home: "game.keymap.keys.home",
  End: "game.keymap.keys.end",
  PageUp: "game.keymap.keys.pageUp",
  PageDown: "game.keymap.keys.pageDown",
}

// 方向键与符号键的展示标签（语言无关）。
const SYMBOL_KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Semicolon: ";",
  Equal: "=",
  Comma: ",",
  Minus: "-",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  BracketLeft: "[",
  Backslash: "\\",
  BracketRight: "]",
  Quote: "'",
  NumpadMultiply: "×",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadDecimal: ".",
  NumpadDivide: "/",
}

// KeyboardEvent.code → 展示标签（命名键走 i18n，字母/数字/符号直出）。
export const formatGameKeyLabel = (code: string, t: GameTranslate): string => {
  const namedKey = NAMED_KEY_LABEL_KEYS[code]
  if (namedKey) return t(namedKey)
  const symbolKey = SYMBOL_KEY_LABELS[code]
  if (symbolKey) return symbolKey
  if (code.startsWith("Numpad")) return t("game.keymap.keys.numpad", { key: code.slice(6) })
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  return code
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
