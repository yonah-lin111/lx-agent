import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensureDatabaseDir } from "@/paths"

// 测试临时目录。
let temporaryDir: string | null = null

afterEach(() => {
  if (temporaryDir) {
    rmSync(temporaryDir, { force: true, recursive: true })
  }

  temporaryDir = null
})

describe("ensureDatabaseDir", () => {
  it("创建不存在的数据库目录", () => {
    temporaryDir = mkdtempSync(join(tmpdir(), "lx-agent-paths-"))
    const databaseDir = join(temporaryDir, "db")

    ensureDatabaseDir(databaseDir)

    expect(existsSync(databaseDir)).toBe(true)
    expect(statSync(databaseDir).isDirectory()).toBe(true)
  })

  it("在数据库目录路径被文件占用时失败", () => {
    temporaryDir = mkdtempSync(join(tmpdir(), "lx-agent-paths-"))
    const databaseDir = join(temporaryDir, "db")
    writeFileSync(databaseDir, "blocked")

    expect(() => ensureDatabaseDir(databaseDir)).toThrow("SQLite database path is not a directory")
  })
})
