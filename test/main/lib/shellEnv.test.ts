import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// execFile / existsSync 桩（hoisted：vi.mock 工厂先于模块导入执行）。
const childProcess = vi.hoisted(() => ({
  calls: [] as Array<{ file: string; args: string[] }>,
  execFileImpl: (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ): void => {
    callback(null, "")
  },
}))

const fileSystem = vi.hoisted(() => ({ shellExists: true }))

vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ): void => {
    childProcess.calls.push({ file, args })
    childProcess.execFileImpl(file, args, options, callback)
  },
}))

vi.mock("node:fs", () => ({
  existsSync: (): boolean => fileSystem.shellExists,
}))

import { mergePathValue, resolveLoginShellPath } from "@/lib/shellEnv"

const originalPlatform = process.platform

// 覆写 process.platform（只读属性，需 defineProperty）。
const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

const PATH_START = "__LX_AGENT_PATH_START__"
const PATH_END = "__LX_AGENT_PATH_END__"

// 构造带标记与杂散输出的 shell stdout。
const shellOutput = (path: string): string => `rc noise\n${PATH_START}${path}${PATH_END}\ntail`

// 在临时 PATH 下执行回调并恢复原值。
const withPath = async (path: string, run: () => Promise<void>): Promise<void> => {
  const originalPath = process.env.PATH
  process.env.PATH = path
  try {
    await run()
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
  }
}

describe("mergePathValue", () => {
  it("解析结果优先、去重并保留现有条目", () => {
    expect(mergePathValue("/usr/bin:/bin", "/nvm/bin:/usr/bin", ":")).toBe("/nvm/bin:/usr/bin:/bin")
  })

  it("过滤空段并支持 Windows 分隔符", () => {
    expect(mergePathValue("C:\\Windows", "C:\\npm;;C:\\Windows", ";")).toBe("C:\\npm;C:\\Windows")
  })
})

describe("resolveLoginShellPath", () => {
  beforeEach(() => {
    childProcess.calls.length = 0
    fileSystem.shellExists = true
    childProcess.execFileImpl = (_file, _args, _options, callback) => callback(null, "")
    vi.stubEnv("SHELL", "/bin/zsh")
    setPlatform("darwin")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setPlatform(originalPlatform)
  })

  it("经登录 shell 解析 PATH，忽略 rc 杂散输出", async () => {
    childProcess.execFileImpl = (_file, _args, _options, callback) =>
      callback(null, shellOutput("/nvm/bin:/usr/bin:/bin"))

    await expect(resolveLoginShellPath()).resolves.toBe("/nvm/bin:/usr/bin:/bin")
    expect(childProcess.calls[0]).toMatchObject({
      file: "/bin/zsh",
      args: ["-ilc", expect.any(String)],
    })
  })

  it("Windows 直接跳过，不 spawn shell", async () => {
    setPlatform("win32")
    await expect(resolveLoginShellPath()).resolves.toBeNull()
    expect(childProcess.calls).toHaveLength(0)
  })

  it("shell 不存在时返回 null", async () => {
    fileSystem.shellExists = false
    await expect(resolveLoginShellPath()).resolves.toBeNull()
    expect(childProcess.calls).toHaveLength(0)
  })

  it("输出缺少标记或 PATH 非法时返回 null", async () => {
    childProcess.execFileImpl = (_file, _args, _options, callback) => callback(null, "noise only")
    await expect(resolveLoginShellPath()).resolves.toBeNull()

    childProcess.execFileImpl = (_file, _args, _options, callback) =>
      callback(null, shellOutput("no-delimiter"))
    await expect(resolveLoginShellPath()).resolves.toBeNull()
  })

  it("shell 执行失败时返回 null", async () => {
    childProcess.execFileImpl = (_file, _args, _options, callback) =>
      callback(new Error("boom"), "")
    await expect(resolveLoginShellPath()).resolves.toBeNull()
  })
})

describe("ensureLoginShellPath", () => {
  beforeEach(() => {
    childProcess.calls.length = 0
    fileSystem.shellExists = true
    vi.stubEnv("SHELL", "/bin/zsh")
    setPlatform("darwin")
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setPlatform(originalPlatform)
    vi.resetModules()
  })

  it("合并进 process.env.PATH 且只解析一次", async () => {
    childProcess.execFileImpl = (_file, _args, _options, callback) =>
      callback(null, shellOutput("/nvm/bin:/usr/bin"))
    const module = await import("@/lib/shellEnv")

    await withPath("/usr/bin:/bin", async () => {
      await module.ensureLoginShellPath()
      expect(process.env.PATH).toBe("/nvm/bin:/usr/bin:/bin")
      await module.ensureLoginShellPath()
      expect(childProcess.calls).toHaveLength(1)
    })
  })

  it("解析失败时保持 process.env.PATH 不变", async () => {
    childProcess.execFileImpl = (_file, _args, _options, callback) =>
      callback(new Error("boom"), "")
    const module = await import("@/lib/shellEnv")

    await withPath("/usr/bin:/bin", async () => {
      await module.ensureLoginShellPath()
      expect(process.env.PATH).toBe("/usr/bin:/bin")
    })
  })
})
