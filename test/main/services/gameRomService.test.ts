import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GAME_ROM_MAX_BYTES } from "@shared/contracts/game"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createGameRomService } from "@/services/gameRomService"

let database: Database.Database
let service: ReturnType<typeof createGameRomService>
let romsDir: string
let savesDir: string
let sourceDir: string

const writeSource = (name: string, bytes: number[] = [1, 2, 3, 4, 5, 6, 7, 8]): string => {
  const filePath = join(sourceDir, name)
  writeFileSync(filePath, Buffer.from(bytes))
  return filePath
}

beforeEach(() => {
  database = new Database(":memory:")
  runMigrations(database)

  const workDir = mkdtempSync(join(tmpdir(), "lx-game-test-"))
  romsDir = join(workDir, "roms")
  savesDir = join(workDir, "saves")
  sourceDir = join(workDir, "source")
  mkdirSync(sourceDir, { recursive: true })

  service = createGameRomService(() => database, { romsDir, savesDir })
})

afterEach(() => {
  database.close()
})

describe("gameRomService 导入与去重", () => {
  it("导入 .gba 新建条目并把 ROM 复制到应用数据目录", () => {
    const sourcePath = writeSource("demo.gba")

    const [result] = service.importFiles([sourcePath])

    expect(result.status).toBe("imported")
    expect(result.entry?.title).toBe("demo")
    expect(result.entry?.romSize).toBe(8)
    expect(result.entry?.romHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.entry?.lastPlayedAt).toBeNull()

    const entry = result.entry
    expect(entry).toBeDefined()
    const copiedPath = join(romsDir, `${entry?.id}.gba`)
    expect(existsSync(copiedPath)).toBe(true)
    expect(readFileSync(copiedPath)).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(service.list()).toHaveLength(1)
  })

  it("相同内容重复导入返回 duplicated 且不新建条目（与文件名无关）", () => {
    const first = service.importFiles([writeSource("demo.gba")])[0]
    const second = service.importFiles([writeSource("renamed.gba")])[0]

    expect(first.status).toBe("imported")
    expect(second.status).toBe("duplicated")
    expect(second.entry?.id).toBe(first.entry?.id)
    expect(service.list()).toHaveLength(1)
  })

  it("内容不同的同名文件视为新游戏", () => {
    service.importFiles([writeSource("demo.gba", [1, 1, 1])])
    const second = service.importFiles([writeSource("demo.gba", [2, 2, 2])])[0]

    expect(second.status).toBe("imported")
    expect(service.list()).toHaveLength(2)
  })

  it("非 .gba 扩展名、超大文件与不可读文件返回 invalid 原因", () => {
    const zipPath = writeSource("demo.zip")
    const oversizedPath = writeSource("big.gba")
    truncateSync(oversizedPath, GAME_ROM_MAX_BYTES + 1)

    const results = service.importFiles([zipPath, oversizedPath, join(sourceDir, "missing.gba")])

    expect(results.map((result) => result.status)).toEqual(["invalid", "invalid", "invalid"])
    expect(results.map((result) => result.reason)).toEqual([
      "unsupportedExtension",
      "tooLarge",
      "unreadable",
    ])
    expect(service.list()).toHaveLength(0)
  })
})

describe("gameRomService 条目管理", () => {
  it("重命名会 trim 标题并拒绝空标题与超长标题", () => {
    const entry = service.importFiles([writeSource("demo.gba")])[0].entry

    const renamed = service.rename(entry?.id ?? 0, "  我的游戏  ")
    expect(renamed.title).toBe("我的游戏")

    expect(() => service.rename(entry?.id ?? 0, "   ")).toThrow("INVALID_GAME_INPUT")
    expect(() => service.rename(entry?.id ?? 0, "x".repeat(121))).toThrow("INVALID_GAME_INPUT")
    expect(() => service.rename(999, "任意")).toThrow("GAME_ENTRY_NOT_FOUND")
  })

  it("删除条目会同时清理 ROM 文件与存档目录", () => {
    const entry = service.importFiles([writeSource("demo.gba")])[0].entry
    const entryId = entry?.id ?? 0
    service.writeSave(entryId, new Uint8Array([1, 2, 3]))

    service.remove(entryId)

    expect(service.list()).toHaveLength(0)
    expect(existsSync(join(romsDir, `${entryId}.gba`))).toBe(false)
    expect(existsSync(join(savesDir, String(entryId)))).toBe(false)
    expect(() => service.remove(entryId)).toThrow("GAME_ENTRY_NOT_FOUND")
  })

  it("markPlayed 更新最近游玩时间并让该条目排到列表最前", () => {
    const first = service.importFiles([writeSource("a.gba", [1])])[0].entry
    service.importFiles([writeSource("b.gba", [2])])

    const played = service.markPlayed(first?.id ?? 0)

    expect(played.lastPlayedAt).not.toBeNull()
    expect(service.list()[0]?.id).toBe(first?.id)
  })

  it("getRomFilePath 返回应用数据目录内的 ROM 路径，文件被外部清理后返回 null", () => {
    const entry = service.importFiles([writeSource("demo.gba")])[0].entry
    const entryId = entry?.id ?? 0
    const romPath = service.getRomFilePath(entryId)
    expect(romPath).toBe(join(romsDir, `${entryId}.gba`))

    rmSync(romPath ?? "", { force: true })
    expect(service.getRomFilePath(entryId)).toBeNull()
  })
})

describe("gameRomService 存档读写", () => {
  it("存档 roundtrip：不存在返回 null，写入后可读回", () => {
    const entry = service.importFiles([writeSource("demo.gba")])[0].entry
    const entryId = entry?.id ?? 0

    expect(service.readSave(entryId)).toBeNull()

    service.writeSave(entryId, new Uint8Array([10, 20, 30]))
    expect(service.readSave(entryId)).toEqual(Buffer.from([10, 20, 30]))
  })

  it("覆盖写入前保留一份 .bak 备份", () => {
    const entry = service.importFiles([writeSource("demo.gba")])[0].entry
    const entryId = entry?.id ?? 0

    service.writeSave(entryId, new Uint8Array([1, 1, 1]))
    service.writeSave(entryId, new Uint8Array([2, 2, 2]))

    expect(existsSync(join(savesDir, String(entryId), "sram.sav"))).toBe(true)
    expect(readFileSync(join(savesDir, String(entryId), "sram.sav.bak"))).toEqual(
      Buffer.from([1, 1, 1]),
    )
    expect(service.readSave(entryId)).toEqual(Buffer.from([2, 2, 2]))
  })

  it("拒绝非法存档数据与不存在的条目", () => {
    const entry = service.importFiles([writeSource("demo.gba")])[0].entry

    expect(() => service.writeSave(entry?.id ?? 0, "not-bytes")).toThrow("INVALID_GAME_INPUT")
    expect(() => service.writeSave(999, new Uint8Array([1]))).toThrow("GAME_ENTRY_NOT_FOUND")
    expect(() => service.readSave(999)).toThrow("GAME_ENTRY_NOT_FOUND")
  })
})
