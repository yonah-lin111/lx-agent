// 游戏领域契约：本地 GBA ROM 条目管理、导入结果与应用侧存档写入。

// 自定义协议 scheme：webview 模拟器宿主页、静态资产、ROM 与存档均经此协议加载。
export const GAME_PROTOCOL = "lx-game"

// webview 模拟器宿主页使用的持久化分区；主进程必须在该 session 上单独注册协议，否则加载会失败。
export const GAME_WEBVIEW_PARTITION = "persist:lx-game"

// ROM 扩展名白名单（小写，含点）。
export const GAME_ROM_EXTENSIONS = [".gba"] as const

// 单个 ROM 文件大小上限（64MB）。
export const GAME_ROM_MAX_BYTES = 64 * 1024 * 1024

// 单条游戏条目标题长度上限。
export const GAME_TITLE_MAX_LENGTH = 120

// 快速存档（save state）槽位数量，槽位取值为 1..GAME_STATE_SLOT_COUNT。
export const GAME_STATE_SLOT_COUNT = 9

// 可配置的动作：手柄 10 键 + 宿主 4 个模拟器热键。
export const GAME_KEY_ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "a",
  "b",
  "l",
  "r",
  "start",
  "select",
  "turboA",
  "turboB",
  "speed",
  "pause",
] as const

// 单个可配置动作的稳定标识。
export type GameKeyAction = (typeof GAME_KEY_ACTIONS)[number]

// 每游戏按键覆盖：动作 → KeyboardEvent.code；未覆盖的动作使用默认键位。
export type GameKeymap = Partial<Record<GameKeyAction, string>>

// 默认键位（WASD 方向、J/K 为 A/B、Q/E 为 L/R、Enter/Backspace 为 Start/Select）。
export const DEFAULT_GAME_KEYMAP: Record<GameKeyAction, string> = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  a: "KeyJ",
  b: "KeyK",
  l: "KeyQ",
  r: "KeyE",
  start: "Enter",
  select: "Backspace",
  turboA: "KeyU",
  turboB: "KeyI",
  speed: "Tab",
  pause: "Escape",
}

// 允许绑定的按键：KeyboardEvent.code → 模拟器内核使用的键值（兼容 EmulatorJS keyCode）。
export const GAME_KEY_CODE_TABLE: Readonly<Record<string, number>> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  CapsLock: 20,
  Escape: 27,
  Space: 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
  Digit0: 48,
  Digit1: 49,
  Digit2: 50,
  Digit3: 51,
  Digit4: 52,
  Digit5: 53,
  Digit6: 54,
  Digit7: 55,
  Digit8: 56,
  Digit9: 57,
  KeyA: 65,
  KeyB: 66,
  KeyC: 67,
  KeyD: 68,
  KeyE: 69,
  KeyF: 70,
  KeyG: 71,
  KeyH: 72,
  KeyI: 73,
  KeyJ: 74,
  KeyK: 75,
  KeyL: 76,
  KeyM: 77,
  KeyN: 78,
  KeyO: 79,
  KeyP: 80,
  KeyQ: 81,
  KeyR: 82,
  KeyS: 83,
  KeyT: 84,
  KeyU: 85,
  KeyV: 86,
  KeyW: 87,
  KeyX: 88,
  KeyY: 89,
  KeyZ: 90,
  MetaLeft: 91,
  MetaRight: 92,
  Numpad0: 96,
  Numpad1: 97,
  Numpad2: 98,
  Numpad3: 99,
  Numpad4: 100,
  Numpad5: 101,
  Numpad6: 102,
  Numpad7: 103,
  Numpad8: 104,
  Numpad9: 105,
  NumpadMultiply: 106,
  NumpadAdd: 107,
  NumpadSubtract: 109,
  NumpadDecimal: 110,
  NumpadDivide: 111,
  F1: 112,
  F2: 113,
  F3: 114,
  F4: 115,
  F5: 116,
  F6: 117,
  F7: 118,
  F8: 119,
  F9: 120,
  F10: 121,
  F11: 122,
  F12: 123,
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
}

// 解析后的完整键位（动作 → EmulatorJS 键值），下发给模拟器 guest。
export type GameKeymapCodes = Record<GameKeyAction, number>

// 覆盖键位合并为完整键位（缺失动作回退默认）。
export const resolveGameKeymap = (
  overrides?: GameKeymap | null,
): Record<GameKeyAction, string> => ({
  ...DEFAULT_GAME_KEYMAP,
  ...(overrides ?? {}),
})

// 完整键位解析为模拟器键值表。
export const resolveGameKeymapCodes = (overrides?: GameKeymap | null): GameKeymapCodes => {
  const resolved = resolveGameKeymap(overrides)
  const codes = {} as GameKeymapCodes
  for (const action of GAME_KEY_ACTIONS) {
    const keyCode = GAME_KEY_CODE_TABLE[resolved[action]]
    if (keyCode === undefined) throw new Error("INVALID_GAME_INPUT")
    codes[action] = keyCode
  }
  return codes
}

// 运行时校验并归一化键位覆盖：未知动作 / 未知按键 / 非法值一律拒绝，空对象归一为 null。
export const normalizeGameKeymap = (value: unknown): GameKeymap | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_GAME_INPUT")

  const normalized: GameKeymap = {}
  for (const [action, code] of Object.entries(value)) {
    if (!GAME_KEY_ACTIONS.includes(action as GameKeyAction)) throw new Error("INVALID_GAME_INPUT")
    if (typeof code !== "string" || GAME_KEY_CODE_TABLE[code] === undefined) {
      throw new Error("INVALID_GAME_INPUT")
    }
    normalized[action as GameKeyAction] = code
  }
  return Object.keys(normalized).length > 0 ? normalized : null
}

// 一条已导入的游戏条目（标题默认取 ROM 文件名，可改名）。
export interface GameRomEntry {
  id: number
  title: string
  // ROM 内容 sha256（去重与完整性校验的唯一键）。
  romHash: string
  romSize: number
  createdAt: string
  updatedAt: string
  lastPlayedAt: string | null
  // 每游戏按键覆盖；null 表示全部使用默认键位。
  keymap: GameKeymap | null
}

// 单次导入结果状态：imported 新建条目；duplicated 命中已有内容；invalid 校验失败。
export type GameImportStatus = "imported" | "duplicated" | "invalid"

// invalid 原因码（renderer 侧映射 i18n 文案）。
export type GameImportInvalidReason = "unsupportedExtension" | "tooLarge" | "unreadable"

// 单次导入结果（一个文件一条）。
export interface GameImportResult {
  status: GameImportStatus
  fileName: string
  reason?: GameImportInvalidReason
  entry?: GameRomEntry
}

// 模拟器运行时配置（webview 预加载脚本的 file:// URL 由主进程解析）。
export interface GameRuntimeConfig {
  guestPreloadUrl: string
}

// 游戏领域 preload API 契约。
export interface GameApi {
  game: {
    list: () => Promise<GameRomEntry[]>
    importFromDialog: () => Promise<GameImportResult[]>
    rename: (id: number, title: string) => Promise<GameRomEntry>
    remove: (id: number) => Promise<void>
    markPlayed: (id: number) => Promise<GameRomEntry>
    saveKeymap: (id: number, keymap: GameKeymap | null) => Promise<GameRomEntry>
    writeSave: (id: number, data: Uint8Array) => Promise<void>
    writeState: (id: number, slot: number, data: Uint8Array) => Promise<void>
    getRuntimeConfig: () => Promise<GameRuntimeConfig>
  }
}
