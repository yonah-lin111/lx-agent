import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  ensureDatabaseDir,
  getAppDataRoot,
  getDatabasePath,
  resolveAppDataRoot,
  sanitizePathSegment,
} from "@/paths"

// 恢复 LX_AGENT_DATA_ROOT：未设置时删除，避免写入字符串 "undefined" 污染后续测试。
const restoreEnvRoot = (previous: string | undefined): void => {
  if (previous === undefined) {
    Reflect.deleteProperty(process.env, "LX_AGENT_DATA_ROOT")
    return
  }
  process.env.LX_AGENT_DATA_ROOT = previous
}

// 测试临时目录。
let temporaryDir: string | null = null

afterEach(() => {
  if (temporaryDir) {
    rmSync(temporaryDir, { force: true, recursive: true })
  }

  temporaryDir = null
})

describe("resolveAppDataRoot", () => {
  it("开发态使用 .lx-dev，打包态使用 .lx", () => {
    expect(resolveAppDataRoot("/home/lx", true)).toBe(join("/home/lx", ".lx-dev"))
    expect(resolveAppDataRoot("/home/lx", false)).toBe(join("/home/lx", ".lx"))
  })
})

describe("getAppDataRoot", () => {
  it("支持通过环境变量覆盖应用数据根目录（测试隔离）", () => {
    const previous = process.env.LX_AGENT_DATA_ROOT
    const override = join(tmpdir(), "lx-agent-root-override")
    process.env.LX_AGENT_DATA_ROOT = override

    try {
      expect(getAppDataRoot()).toBe(override)
    } finally {
      restoreEnvRoot(previous)
    }
  })

  it("未覆盖时开发态默认落在 ~/.lx-dev，数据库路径随之隔离", () => {
    const previous = process.env.LX_AGENT_DATA_ROOT
    const defaultAppDescriptor = Object.getOwnPropertyDescriptor(process, "defaultApp")
    Reflect.deleteProperty(process.env, "LX_AGENT_DATA_ROOT")
    Object.defineProperty(process, "defaultApp", { value: true, configurable: true })

    try {
      expect(getAppDataRoot()).toBe(join(homedir(), ".lx-dev"))
      expect(getDatabasePath()).toBe(join(homedir(), ".lx-dev", "db", "lx.db"))
    } finally {
      restoreEnvRoot(previous)
      if (defaultAppDescriptor) {
        Object.defineProperty(process, "defaultApp", defaultAppDescriptor)
      } else {
        Reflect.deleteProperty(process, "defaultApp")
      }
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
