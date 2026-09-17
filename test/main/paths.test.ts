import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, sep } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  ensureDatabaseDir,
  getAppDataRoot,
  getSessionDesignDir,
  sanitizePathSegment,
} from "@/paths"

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

describe("sanitizePathSegment", () => {
  it("保留字母、数字、下划线与短横线", () => {
    expect(sanitizePathSegment("design-01_a")).toBe("design-01_a")
  })

  it("替换路径分隔符、Windows 非法字符与点号", () => {
    expect(sanitizePathSegment("a/b\\c")).toBe("a_b_c")
    expect(sanitizePathSegment("a:b*c?d")).toBe("a_b_c_d")
    expect(sanitizePathSegment("../..")).toBe("_____")
    expect(sanitizePathSegment("设计 稿")).toBe("____")
  })

  it("空串与非字符串内容回退为占位段", () => {
    expect(sanitizePathSegment("")).toBe("_")
    expect(sanitizePathSegment("///")).toBe("___")
  })
})

describe("getSessionDesignDir", () => {
  it("会话与设计 id 均消毒，路径始终落在会话设计根目录内", () => {
    const dir = getSessionDesignDir("8f3b2c1e-0000-4444-8888-abcdefabcdef", "../../evil:design")

    const designRoot = join(getAppDataRoot(), "session")
    expect(dir.startsWith(designRoot)).toBe(true)
    expect(dir).toBe(
      join(designRoot, "8f3b2c1e-0000-4444-8888-abcdefabcdef", "design", "______evil_design"),
    )
    // 消毒后不含路径分隔符以外的段，dirname 不会逃出 design 目录
    expect(basename(dirname(dir))).toBe("design")
  })

  it("空设计 id 回退为占位段而非拼出额外层级", () => {
    const dir = getSessionDesignDir("sess-1", "")

    expect(dir).toBe(join(getAppDataRoot(), "session", "sess-1", "design", "_"))
    expect(dir.split(sep).at(-1)).toBe("_")
  })
})
