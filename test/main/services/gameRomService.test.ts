import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GAME_ROM_MAX_BYTES, GAME_STATE_SLOT_COUNT } from "@shared/contracts/game"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createGameRomService, sanitizeGameDirName } from "@/services/gameRomService"

let database: Database.Database
let service: ReturnType<typeof createGameRomService>
let gameDir: string
let sourceDir: string

const writeSource = (name: string, bytes: number[] = [1, 2, 3, 4, 5, 6, 7, 8]): string => {
  const filePath = join(sourceDir, name)
  writeFileSync(filePath, Buffer.from(bytes))
  return filePath
}

const importEntry = (name: string, bytes?: number[]) =>
  service.importFiles([writeSource(name, bytes)])[0].entry

beforeEach(() => {
  database = new Database(":memory:")
  runMigrations(database)

  const workDir = mkdtempSync(join(tmpdir(), "lx-game-test-"))
  gameDir = join(workDir, "game")
  sourceDir = join(workDir, "source")
  mkdirSync(sourceDir, { recursive: true })

  service = createGameRomService(() => database, { gameDir })
})

afterEach(() => {
  database.close()
})

describe("sanitizeGameDirName 目录名消毒", () => {
  it("替换文件系统非法字符、去首尾空白与结尾点，保留中文", () => {
    expect(sanitizeGameDirName("我的 / 游戏:1")).toBe("我的 _ 游戏_1")
    expect(sanitizeGameDirName("  demo...  ")).toBe("demo")
    expect(sanitizeGameDirName("a\\b<c>d|e?f*g")).toBe("a_b_c_d_e_f_g")
  })

  it("空结果与 Windows 保留名有稳定兜底", () => {
    expect(sanitizeGameDirName("")).toBe("")
    expect(sanitizeGameDirName("...")).toBe("")
    expect(sanitizeGameDirName("CON")).toBe("_CON")
    expect(sanitizeGameDirName("lpt1")).toBe("_lpt1")
  })

  it("超长中文标题按 UTF-8 字节截断，结果不超过 180 字节", () => {
    const name = sanitizeGameDirName("游".repeat(100))

    expect(name.length).toBeLessThan(100)
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(180)
  })
})

describe("gameRomService 导入与去重", () => {
  it("导入 .gba 按标题建目录，ROM 复制为 rom.gba 并落库", () => {
    const result = service.importFiles([writeSource("demo.gba")])[0]

    expect(result.status).toBe("imported")
    expect(result.entry?.title).toBe("demo")
    expect(result.entry?.romSize).toBe(8)
    expect(result.entry?.romHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.entry?.lastPlayedAt).toBeNull()

    const entry = result.entry
    expect(entry).toBeDefined()
    const romPath = join(gameDir, "demo", "rom.gba")
    expect(service.getRomFilePath(entry?.id ?? 0)).toBe(romPath)
    expect(readFileSync(romPath)).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(service.list()).toHaveLength(1)
  })

  it("内容不同的同名文件各建目录，重名时追加 (2)", () => {
    const first = importEntry("demo.gba", [1, 1, 1])
    const second = importEntry("demo.gba", [2, 2, 2])

    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(existsSync(join(gameDir, "demo", "rom.gba"))).toBe(true)
    expect(existsSync(join(gameDir, "demo (2)", "rom.gba"))).toBe(true)
    expect(service.list()).toHaveLength(2)
  })

  it("相同内容重复导入返回 duplicated 且不新建目录（与文件名无关）", () => {
    const first = service.importFiles([writeSource("demo.gba")])[0]
    const second = service.importFiles([writeSource("renamed.gba")])[0]

    expect(first.status).toBe("imported")
    expect(second.status).toBe("duplicated")
    expect(second.entry?.id).toBe(first.entry?.id)
    expect(readdirSync(gameDir)).toEqual(["demo"])
    expect(service.list()).toHaveLength(1)
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
  it("重命名 trim 标题并拒绝空标题与超长标题", () => {
    const entry = importEntry("demo.gba")

    const renamed = service.rename(entry?.id ?? 0, "  我的游戏  ")
    expect(renamed.title).toBe("我的游戏")

    expect(() => service.rename(entry?.id ?? 0, "   ")).toThrow("INVALID_GAME_INPUT")
    expect(() => service.rename(entry?.id ?? 0, "x".repeat(121))).toThrow("INVALID_GAME_INPUT")
    expect(() => service.rename(999, "任意")).toThrow("GAME_ENTRY_NOT_FOUND")
  })

  it("重命名同步移动目录、更新 rom_path，非法字符被消毒", () => {
    const entry = importEntry("a.gba")
    const entryId = entry?.id ?? 0

    const renamed = service.rename(entryId, "我的 / 游戏:1")

    expect(renamed.title).toBe("我的 / 游戏:1")
    expect(existsSync(join(gameDir, "a"))).toBe(false)
    expect(existsSync(join(gameDir, "我的 _ 游戏_1", "rom.gba"))).toBe(true)
    expect(service.getRomFilePath(entryId)).toBe(join(gameDir, "我的 _ 游戏_1", "rom.gba"))
  })

  it("重命名撞其他游戏目录时追加 (2)，改回同名不重复移动", () => {
    const first = importEntry("a.gba", [1])
    const second = importEntry("demo.gba", [2])

    const renamed = service.rename(first?.id ?? 0, "demo")
    expect(renamed.title).toBe("demo")
    expect(existsSync(join(gameDir, "demo", "rom.gba"))).toBe(true)
    expect(existsSync(join(gameDir, "demo (2)", "rom.gba"))).toBe(true)
    expect(service.getRomFilePath(first?.id ?? 0)).toBe(join(gameDir, "demo (2)", "rom.gba"))

    const again = service.rename(first?.id ?? 0, "demo")
    expect(again.title).toBe("demo")
    expect(existsSync(join(gameDir, "demo (2)", "rom.gba"))).toBe(true)
    expect(service.getRomFilePath(second?.id ?? 0)).toBe(join(gameDir, "demo", "rom.gba"))
  })

  it("标题消毒为空时回退 game-<id> 目录", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0

    service.rename(entryId, "...")

    expect(existsSync(join(gameDir, `game-${entryId}`, "rom.gba"))).toBe(true)
    expect(service.getRomFilePath(entryId)).toBe(join(gameDir, `game-${entryId}`, "rom.gba"))
  })

  it("删除条目会删除整个游戏目录", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0
    service.writeSave(entryId, new Uint8Array([1, 2, 3]))
    service.writeState(entryId, 1, new Uint8Array([4, 5, 6]))

    service.remove(entryId)

    expect(service.list()).toHaveLength(0)
    expect(existsSync(join(gameDir, "demo"))).toBe(false)
    expect(() => service.remove(entryId)).toThrow("GAME_ENTRY_NOT_FOUND")
  })

  it("markPlayed 更新最近游玩时间并让该条目排到列表最前", () => {
    const first = importEntry("a.gba", [1])
    importEntry("b.gba", [2])

    const played = service.markPlayed(first?.id ?? 0)

    expect(played.lastPlayedAt).not.toBeNull()
    expect(service.list()[0]?.id).toBe(first?.id)
  })

  it("getRomFilePath 返回游戏目录内的 ROM 路径，文件被外部清理后返回 null", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0
    const romPath = service.getRomFilePath(entryId)
    expect(romPath).toBe(join(gameDir, "demo", "rom.gba"))

    rmSync(romPath ?? "", { force: true })
    expect(service.getRomFilePath(entryId)).toBeNull()
  })
})

describe("gameRomService 存档读写", () => {
  it("存档 roundtrip：不存在返回 null，写入后可读回", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0

    expect(service.readSave(entryId)).toBeNull()

    service.writeSave(entryId, new Uint8Array([10, 20, 30]))
    expect(service.readSave(entryId)).toEqual(Buffer.from([10, 20, 30]))
  })

  it("覆盖写入前保留一份 .bak 备份", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0

    service.writeSave(entryId, new Uint8Array([1, 1, 1]))
    service.writeSave(entryId, new Uint8Array([2, 2, 2]))

    expect(existsSync(join(gameDir, "demo", "sram.sav"))).toBe(true)
    expect(readFileSync(join(gameDir, "demo", "sram.sav.bak"))).toEqual(Buffer.from([1, 1, 1]))
    expect(service.readSave(entryId)).toEqual(Buffer.from([2, 2, 2]))
  })

  it("拒绝非法存档数据与不存在的条目", () => {
    const entry = importEntry("demo.gba")

    expect(() => service.writeSave(entry?.id ?? 0, "not-bytes")).toThrow("INVALID_GAME_INPUT")
    expect(() => service.writeSave(999, new Uint8Array([1]))).toThrow("GAME_ENTRY_NOT_FOUND")
    expect(() => service.readSave(999)).toThrow("GAME_ENTRY_NOT_FOUND")
  })
})

describe("gameRomService 快速存档读写", () => {
  it("state roundtrip：按槽位写入 state-<slot>.bin，不存在返回 null", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0

    expect(service.readState(entryId, 1)).toBeNull()

    service.writeState(entryId, 3, new Uint8Array([7, 7, 7]))
    expect(readFileSync(join(gameDir, "demo", "state-3.bin"))).toEqual(Buffer.from([7, 7, 7]))
    expect(service.readState(entryId, 3)).toEqual(Buffer.from([7, 7, 7]))
    expect(service.readState(entryId, 2)).toBeNull()
  })

  it("拒绝越界槽位、非整数槽位与不存在的条目", () => {
    const entry = importEntry("demo.gba")
    const entryId = entry?.id ?? 0

    for (const slot of [0, GAME_STATE_SLOT_COUNT + 1, 1.5]) {
      expect(() => service.readState(entryId, slot)).toThrow("INVALID_GAME_INPUT")
      expect(() => service.writeState(entryId, slot, new Uint8Array([1]))).toThrow(
        "INVALID_GAME_INPUT",
      )
    }

    expect(() => service.writeState(999, 1, new Uint8Array([1]))).toThrow("GAME_ENTRY_NOT_FOUND")
    expect(() => service.writeState(entryId, 1, "not-bytes")).toThrow("INVALID_GAME_INPUT")
  })
})

describe("gameRomService 旧布局重置", () => {
  it("无旧布局时不动作", () => {
    expect(service.resetLegacyLayout()).toBe(false)

    const entry = importEntry("demo.gba")
    expect(service.resetLegacyLayout()).toBe(false)
    expect(service.list()).toHaveLength(1)
    expect(existsSync(join(gameDir, "demo", "rom.gba"))).toBe(true)
    expect(entry?.title).toBe("demo")
  })

  it("标题恰为 roms/saves 的新布局目录不会误判为旧布局", () => {
    importEntry("roms.gba", [1])
    importEntry("saves.gba", [2])

    expect(existsSync(join(gameDir, "roms", "rom.gba"))).toBe(true)
    expect(existsSync(join(gameDir, "saves", "rom.gba"))).toBe(true)
    expect(service.resetLegacyLayout()).toBe(false)
    expect(service.list()).toHaveLength(2)
  })

  it("检测到旧布局时清空目录与导入记录并重建根目录", () => {
    mkdirSync(join(gameDir, "roms"), { recursive: true })
    mkdirSync(join(gameDir, "saves", "1"), { recursive: true })
    writeFileSync(join(gameDir, "roms", "1.gba"), Buffer.from([1]))
    writeFileSync(join(gameDir, "saves", "1", "sram.sav"), Buffer.from([2]))
    importEntry("demo.gba")

    expect(service.resetLegacyLayout()).toBe(true)

    expect(service.list()).toHaveLength(0)
    expect(readdirSync(gameDir)).toEqual([])
    expect(existsSync(join(gameDir, "demo"))).toBe(false)
  })
})
