import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, extname, join } from "node:path"
import {
  GAME_ROM_EXTENSIONS,
  GAME_ROM_MAX_BYTES,
  GAME_TITLE_MAX_LENGTH,
  type GameImportInvalidReason,
  type GameImportResult,
  type GameRomEntry,
} from "@shared/contracts/game"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"
import { getGameRomsDir, getGameSavesDir } from "@/paths"

// 存档文件名（EmulatorJS mgba 核心的 SRAM 扩展名为 srm，此处按应用侧口径统一命名）。
export const GAME_SAVE_FILE_NAME = "sram.sav"

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
}

// 服务可注入的文件目录（默认取应用数据目录，测试传入临时目录）。
export interface GameRomServiceDirs {
  romsDir: string
  savesDir: string
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

// 标题默认取文件名（去扩展名），并截断到上限。
const deriveTitle = (filePath: string): string => {
  const fileName = basename(filePath)
  const stem = basename(filePath, extname(filePath)).trim() || fileName
  return stem.slice(0, GAME_TITLE_MAX_LENGTH)
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
  copyFileSync(savePath, `${savePath}.bak`)
}

/**
 * 创建游戏服务：ROM 条目读写、导入校验与去重、应用侧存档落盘。
 */
export const createGameRomService = (
  getConnection: () => Database.Database,
  dirs: GameRomServiceDirs = { romsDir: getGameRomsDir(), savesDir: getGameSavesDir() },
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

  const savePathOf = (id: number): string => join(dirs.savesDir, String(id), GAME_SAVE_FILE_NAME)

  const list = (): GameRomEntry[] => {
    const rows = getConnection()
      .prepare(
        "SELECT * FROM game_rom_entry ORDER BY (last_played_at IS NOT NULL) DESC, COALESCE(last_played_at, created_at) DESC, id DESC",
      )
      .all() as GameRomEntryRow[]
    return rows.map(toGameRomEntry)
  }

  // 单文件导入：校验 → 哈希去重 → 复制到应用数据目录并落库。
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
      // 行 id 决定归档文件名，先插入再复制，复制失败时事务回滚。
      mkdirSync(dirs.romsDir, { recursive: true })
      const targetPath = join(dirs.romsDir, `${id}${extname(filePath).toLowerCase()}`)
      copyFileSync(filePath, targetPath)
      database.prepare("UPDATE game_rom_entry SET rom_path = ? WHERE id = ?").run(targetPath, id)
      return id
    })

    const id = runImport()
    return { status: "imported", fileName, entry: toGameRomEntry(requireRow(id)) }
  }

  const importFiles = (filePaths: string[]): GameImportResult[] => {
    if (!Array.isArray(filePaths)) throw new Error("INVALID_GAME_INPUT")
    return filePaths.map(importFile)
  }

  const rename = (id: number, title: string): GameRomEntry => {
    const entryId = assertEntryId(id)
    const nextTitle = assertTitle(title)
    requireRow(entryId)

    const now = new Date().toISOString()
    getConnection()
      .prepare("UPDATE game_rom_entry SET title = ?, updated_at = ? WHERE id = ?")
      .run(nextTitle, now, entryId)
    return toGameRomEntry(requireRow(entryId))
  }

  const remove = (id: number): void => {
    const entryId = assertEntryId(id)
    const row = requireRow(entryId)

    getConnection().prepare("DELETE FROM game_rom_entry WHERE id = ?").run(entryId)
    rmSync(row.rom_path || join(dirs.romsDir, `${entryId}.gba`), { force: true })
    rmSync(join(dirs.savesDir, String(entryId)), { recursive: true, force: true })
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
    requireRow(entryId)
    const savePath = savePathOf(entryId)
    if (!existsSync(savePath)) return null
    return readFileSync(savePath)
  }

  const normalizeSaveBytes = (data: unknown): Uint8Array => {
    if (data instanceof Uint8Array) return data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    throw new Error("INVALID_GAME_INPUT")
  }

  // 写入应用侧 SRAM：写入前保留一份 .bak 备份。
  const writeSave = (id: number, data: unknown): void => {
    const entryId = assertEntryId(id)
    requireRow(entryId)
    const bytes = normalizeSaveBytes(data)

    const entryDir = join(dirs.savesDir, String(entryId))
    mkdirSync(entryDir, { recursive: true })
    const savePath = join(entryDir, GAME_SAVE_FILE_NAME)
    backupSaveFile(savePath)
    writeFileSync(savePath, bytes)
  }

  return {
    list,
    importFiles,
    rename,
    remove,
    markPlayed,
    getRomFilePath,
    readSave,
    writeSave,
  }
}

// 游戏服务单例。
export const gameRomService = createGameRomService(getDatabase)
