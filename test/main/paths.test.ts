import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensureDatabaseDir, getAppDataRoot } from "@/paths"

// 测试临时目录。
let temporaryDir: string | null = null

afterEach(() => {
  if (temporaryDir) {
    rmSync(temporaryDir, { force: true, recursive: true })
  }

  temporaryDir = null
})

describe("getAppDataRoot", () => {
  it("支持通过环境变量覆盖应用数据根目录（测试隔离）", () => {
    const previous = process.env.LX_AGENT_DATA_ROOT
    const override = join(tmpdir(), "lx-agent-root-override")
    process.env.LX_AGENT_DATA_ROOT = override

    try {
      expect(getAppDataRoot()).toBe(override)
    } finally {
      process.env.LX_AGENT_DATA_ROOT = previous
    }
  })
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
