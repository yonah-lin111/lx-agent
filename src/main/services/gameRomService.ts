import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, extname, join, resolve, sep } from "node:path"
import {
  GAME_ROM_EXTENSIONS,
  GAME_ROM_MAX_BYTES,
  GAME_STATE_SLOT_COUNT,
  GAME_TITLE_MAX_LENGTH,
  type GameImportInvalidReason,
  type GameImportResult,
  type GameKeymap,
  type GameRomEntry,
  normalizeGameKeymap,
} from "@shared/contracts/game"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"
import { getGameDir } from "@/paths"

// 每个游戏目录内的固定文件名（ROM 与 SRAM）。
export const GAME_ROM_FILE_NAME = "rom.gba"
export const GAME_SAVE_FILE_NAME = "sram.sav"

// 存档覆盖前的备份后缀（仅保留一份）。
const SAVE_BACKUP_SUFFIX = ".bak"

// 快速存档文件名：state-<slot>.bin。
const STATE_FILE_PREFIX = "state-"
const STATE_FILE_SUFFIX = ".bin"

// 旧布局归档特征：roms/<数字>.gba。
const LEGACY_ROM_FILE_PATTERN = /^\d+\.gba$/i

// 目录名 UTF-8 字节上限（保守值，避开常见文件系统 255 字节限制）。
const DIR_NAME_MAX_BYTES = 180

// Windows 保留设备名（命中时加前缀规避）。
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

// 文件系统非法字符（Windows 非法字符 + 控制字符），跨平台保守集合。
const ILLEGAL_NAME_PATTERN = /[\\/:*?"<>|\u0000-\u001f]/g

// 数据库行结构。
interface GameRomEntryRow {
  id: number
  title: string
  rom_path: string
  rom_hash: string
  rom_size: number
  created_at: string
  updated_at: string
  last_played_at: string | null
  keymap: string | null
}

// 服务可注入的文件目录（默认取应用数据目录，测试传入临时目录）。
export interface GameRomServiceDirs {
  gameDir: string
}

// 反序列化落库键位；损坏数据按"无覆盖"处理，不阻塞游戏列表。
const parseStoredKeymap = (raw: string | null): GameKeymap | null => {
  if (!raw) return null
  try {
    return normalizeGameKeymap(JSON.parse(raw))
  } catch {
    return null
  }
}

// 行 → 契约对象。
const toGameRomEntry = (row: GameRomEntryRow): GameRomEntry => ({
  id: row.id,
  title: row.title,
  romHash: row.rom_hash,
  romSize: row.rom_size,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastPlayedAt: row.last_played_at,
  keymap: parseStoredKeymap(row.keymap),
})

// 校验正整数条目 id。
const assertEntryId = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("INVALID_GAME_INPUT")
  }
  return value
}

// 校验并归一化标题。
const assertTitle = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("INVALID_GAME_INPUT")
  const title = value.trim()
  if (!title || title.length > GAME_TITLE_MAX_LENGTH) throw new Error("INVALID_GAME_INPUT")
  return title
}

// 校验快速存档槽位。
const assertStateSlot = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > GAME_STATE_SLOT_COUNT
  ) {
    throw new Error("INVALID_GAME_INPUT")
  }
  return value
}

// 标题默认取文件名（去扩展名），并截断到上限。
const deriveTitle = (filePath: string): string => {
  const fileName = basename(filePath)
  const stem = basename(filePath, extname(filePath)).trim() || fileName
  return stem.slice(0, GAME_TITLE_MAX_LENGTH)
}

// 标题消毒为合法目录名：非法字符替换、去首尾空白与结尾点、保留中文，超长按字节截断。
export const sanitizeGameDirName = (title: string): string => {
  const cleaned = title
    .replace(ILLEGAL_NAME_PATTERN, "_")
    .replace(/[. ]+$/, "")
    .trim()
  if (!cleaned) return ""

  let truncated = ""
  let byteLength = 0
  for (const char of cleaned) {
    const charBytes = Buffer.byteLength(char)
    if (byteLength + charBytes > DIR_NAME_MAX_BYTES) break
    truncated += char
    byteLength += charBytes
  }

  const result = truncated.replace(/[. ]+$/, "")
  if (!result) return ""
  return WINDOWS_RESERVED_NAME_PATTERN.test(result) ? `_${result}` : result
}

// 在游戏根目录下解析唯一目录：重名时追加 " (2)"、" (3)"…；excludeDir 供改名复用当前目录。
const resolveUniqueGameDir = (gameDir: string, baseName: string, excludeDir?: string): string => {
  for (let attempt = 1; ; attempt += 1) {
    const candidate = join(gameDir, attempt === 1 ? baseName : `${baseName} (${attempt})`)
    if (candidate === excludeDir) return candidate
    if (!existsSync(candidate)) return candidate
  }
}

// 校验 ROM 文件，返回 invalid 原因或可读取的字节。
const readRomBytes = (
  filePath: string,
): { ok: true; bytes: Buffer } | { ok: false; reason: GameImportInvalidReason } => {
  if (!GAME_ROM_EXTENSIONS.includes(extname(filePath).toLowerCase() as ".gba")) {
    return { ok: false, reason: "unsupportedExtension" }
  }

  try {
    const stats = statSync(filePath)
    if (!stats.isFile() || stats.size === 0) return { ok: false, reason: "unreadable" }
    if (stats.size > GAME_ROM_MAX_BYTES) return { ok: false, reason: "tooLarge" }
    return { ok: true, bytes: readFileSync(filePath) }
  } catch {
    return { ok: false, reason: "unreadable" }
  }
}

// 写入前保留上一版存档备份（仅保留一份 .bak）。
const backupSaveFile = (savePath: string): void => {
  if (!existsSync(savePath)) return
  copyFileSync(savePath, `${savePath}${SAVE_BACKUP_SUFFIX}`)
}

// 读取目录项，目录不存在或不可读时返回空数组。
const readDirNames = (dirPath: string): string[] => {
  try {
    return readdirSync(dirPath)
  } catch {
    return []
  }
}

// 旧布局判定：roms/ 下存在 <数字>.gba 归档，或 saves/<数字>/sram.sav。
const hasLegacyLayout = (gameDir: string): boolean => {
  const romsDir = join(gameDir, "roms")
  if (readDirNames(romsDir).some((name) => LEGACY_ROM_FILE_PATTERN.test(name))) return true

  const savesDir = join(gameDir, "saves")
  return readDirNames(savesDir).some(
    (name) => /^\d+$/.test(name) && existsSync(join(savesDir, name, GAME_SAVE_FILE_NAME)),
  )
}

/**
 * 创建游戏服务：ROM 条目读写、导入校验与去重、按标题建目录托管 ROM 与存档。
 */
export const createGameRomService = (
  getConnection: () => Database.Database,
  dirs: GameRomServiceDirs = { gameDir: getGameDir() },
) => {
  const findRow = (id: number): GameRomEntryRow | undefined =>
    getConnection().prepare("SELECT * FROM game_rom_entry WHERE id = ?").get(id) as
      | GameRomEntryRow
      | undefined

  const requireRow = (id: number): GameRomEntryRow => {
    const row = findRow(id)
    if (!row) throw new Error("GAME_ENTRY_NOT_FOUND")
    return row
  }

  // 条目目录：rom_path 所在目录；异常/缺失时回退到 game-<id>。
  const dirOf = (row: GameRomEntryRow, id: number): string =>
    row.rom_path ? dirname(row.rom_path) : join(dirs.gameDir, `game-${id}`)

  const romPathIn = (entryDir: string): string => join(entryDir, GAME_ROM_FILE_NAME)
  const savePathIn = (entryDir: string): string => join(entryDir, GAME_SAVE_FILE_NAME)
  const statePathIn = (entryDir: string, slot: number): string =>
    join(entryDir, `${STATE_FILE_PREFIX}${slot}${STATE_FILE_SUFFIX}`)

  const list = (): GameRomEntry[] => {
    const rows = getConnection()
      .prepare(
        "SELECT * FROM game_rom_entry ORDER BY (last_played_at IS NOT NULL) DESC, COALESCE(last_played_at, created_at) DESC, id DESC",
      )
      .all() as GameRomEntryRow[]
    return rows.map(toGameRomEntry)
  }

  // 单文件导入：校验 → 哈希去重 → 按标题建目录并复制 ROM 落库。
  const importFile = (filePath: string): GameImportResult => {
    const fileName = basename(filePath)
    const read = readRomBytes(filePath)
    if (!read.ok) return { status: "invalid", fileName, reason: read.reason }

    const romHash = createHash("sha256").update(read.bytes).digest("hex")
    const existing = getConnection()
      .prepare("SELECT * FROM game_rom_entry WHERE rom_hash = ?")
      .get(romHash) as GameRomEntryRow | undefined
    if (existing) {
      return { status: "duplicated", fileName, entry: toGameRomEntry(existing) }
    }

    const database = getConnection()
    const now = new Date().toISOString()
    const title = deriveTitle(filePath)

    const runImport = database.transaction((): number => {
      const info = database
        .prepare(
          "INSERT INTO game_rom_entry (title, rom_path, rom_hash, rom_size, created_at, updated_at, last_played_at) VALUES (?, '', ?, ?, ?, ?, NULL)",
        )
        .run(title, romHash, read.bytes.length, now, now)
      const id = Number(info.lastInsertRowid)
      // 行 id 决定消毒失败时的目录名；先插入再复制，复制失败时事务回滚。
      const baseName = sanitizeGameDirName(title) || `game-${id}`
      const entryDir = resolveUniqueGameDir(dirs.gameDir, baseName)
      mkdirSync(entryDir, { recursive: true })
      const romPath = romPathIn(entryDir)
      copyFileSync(filePath, romPath)
      database.prepare("UPDATE game_rom_entry SET rom_path = ? WHERE id = ?").run(romPath, id)
      return id
    })

    const id = runImport()
    return { status: "imported", fileName, entry: toGameRomEntry(requireRow(id)) }
  }

  const importFiles = (filePaths: string[]): GameImportResult[] => {
    if (!Array.isArray(filePaths)) throw new Error("INVALID_GAME_INPUT")
    return filePaths.map(importFile)
  }

  // 改名：目录跟随标题重命名（冲突时消歧），rom_path 同步更新。
  const rename = (id: number, title: string): GameRomEntry => {
    const entryId = assertEntryId(id)
    const nextTitle = assertTitle(title)
    const row = requireRow(entryId)

    const currentDir = dirOf(row, entryId)
    const baseName = sanitizeGameDirName(nextTitle) || `game-${entryId}`
    const targetDir = resolveUniqueGameDir(dirs.gameDir, baseName, currentDir)

    if (targetDir !== currentDir && existsSync(currentDir)) {
      renameSync(currentDir, targetDir)
    } else if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    const now = new Date().toISOString()
    getConnection()
      .prepare("UPDATE game_rom_entry SET title = ?, rom_path = ?, updated_at = ? WHERE id = ?")
      .run(nextTitle, romPathIn(targetDir), now, entryId)
    return toGameRomEntry(requireRow(entryId))
  }

  const remove = (id: number): void => {
    const entryId = assertEntryId(id)
    const row = requireRow(entryId)
    const entryDir = dirOf(row, entryId)

    getConnection().prepare("DELETE FROM game_rom_entry WHERE id = ?").run(entryId)

    // 只允许删除游戏根目录之内、且非根目录本身的路径。
    const gameDirResolved = resolve(dirs.gameDir)
    const entryDirResolved = resolve(entryDir)
    if (entryDirResolved.startsWith(gameDirResolved + sep)) {
      rmSync(entryDirResolved, { recursive: true, force: true })
    }
  }

  const markPlayed = (id: number): GameRomEntry => {
    const entryId = assertEntryId(id)
    const now = new Date().toISOString()
    requireRow(entryId)
    getConnection()
      .prepare("UPDATE game_rom_entry SET last_played_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, entryId)
    return toGameRomEntry(requireRow(entryId))
  }

  // 保存每游戏按键覆盖：null / 空对象落库为 NULL（全部回退默认键位）。
  const saveKeymap = (id: number, keymap: unknown): GameRomEntry => {
    const entryId = assertEntryId(id)
    requireRow(entryId)
    const normalized = normalizeGameKeymap(keymap)
    const now = new Date().toISOString()
    getConnection()
      .prepare("UPDATE game_rom_entry SET keymap = ?, updated_at = ? WHERE id = ?")
      .run(normalized ? JSON.stringify(normalized) : null, now, entryId)
    return toGameRomEntry(requireRow(entryId))
  }

  // 读取 ROM 文件路径（协议层按条目 id 解析，不接受任意路径）。
  const getRomFilePath = (id: number): string | null => {
    const entryId = assertEntryId(id)
    const row = findRow(entryId)
    if (!row?.rom_path || !existsSync(row.rom_path)) return null
    return row.rom_path
  }

  // 读取应用侧 SRAM（不存在时返回 null）。
  const readSave = (id: number): Buffer | null => {
    const entryId = assertEntryId(id)
    const row = requireRow(entryId)
    const savePath = savePathIn(dirOf(row, entryId))
    if (!existsSync(savePath)) return null
    return readFileSync(savePath)
  }

  const normalizeBytes = (data: unknown): Uint8Array => {
    if (data instanceof Uint8Array) return data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    throw new Error("INVALID_GAME_INPUT")
  }

  // 写入应用侧 SRAM：写入前保留一份 .bak 备份。
  const writeSave = (id: number, data: unknown): void => {
    const entryId = assertEntryId(id)
    const row = requireRow(entryId)
    const bytes = normalizeBytes(data)

    const entryDir = dirOf(row, entryId)
    mkdirSync(entryDir, { recursive: true })
    const savePath = savePathIn(entryDir)
    backupSaveFile(savePath)
    writeFileSync(savePath, bytes)
  }

  // 读取快速存档槽位（不存在时返回 null）。
  const readState = (id: number, slot: number): Buffer | null => {
    const entryId = assertEntryId(id)
    const stateSlot = assertStateSlot(slot)
    const row = requireRow(entryId)
    const statePath = statePathIn(dirOf(row, entryId), stateSlot)
    if (!existsSync(statePath)) return null
    return readFileSync(statePath)
  }

  // 写入快速存档槽位（直接覆盖，不保留备份）。
  const writeState = (id: number, slot: number, data: unknown): void => {
    const entryId = assertEntryId(id)
    const stateSlot = assertStateSlot(slot)
    const row = requireRow(entryId)
    const bytes = normalizeBytes(data)

    const entryDir = dirOf(row, entryId)
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(statePathIn(entryDir, stateSlot), bytes)
  }

  // 旧布局一次性重置：删除 game 目录与全部导入记录，重建空根目录；无旧布局时不动作。
  const resetLegacyLayout = (): boolean => {
    if (!hasLegacyLayout(dirs.gameDir)) return false

    rmSync(dirs.gameDir, { recursive: true, force: true })
    getConnection().prepare("DELETE FROM game_rom_entry").run()
    mkdirSync(dirs.gameDir, { recursive: true })
    return true
  }

  return {
    list,
    importFiles,
    rename,
    remove,
    markPlayed,
    saveKeymap,
    getRomFilePath,
    readSave,
    writeSave,
    readState,
    writeState,
    resetLegacyLayout,
  }
}

// 游戏服务单例。
export const gameRomService = createGameRomService(getDatabase)
