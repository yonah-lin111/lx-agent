import { describe, expect, it } from "vitest"
import { resolveSpawnSpec } from "../../scripts/rebuildNativeIfNeeded.mjs"

describe("resolveSpawnSpec", () => {
  it("Windows 下 .cmd/.bat 经 shell 执行（Node 安全修复后不能直接 spawn）", () => {
    expect(resolveSpawnSpec("pnpm.cmd", ["rebuild", "better-sqlite3"], "win32")).toEqual({
      file: "pnpm.cmd",
      args: ["rebuild", "better-sqlite3"],
      shell: true,
    })
    expect(resolveSpawnSpec("tool.bat", [], "win32").shell).toBe(true)
  })

  it("Windows 下的 .exe 无需 shell", () => {
    expect(resolveSpawnSpec("electron.exe", ["-e", "1"], "win32")).toEqual({
      file: "electron.exe",
      args: ["-e", "1"],
      shell: false,
    })
  })

  it("类 Unix 平台一律直接 spawn", () => {
    expect(resolveSpawnSpec("pnpm", ["rebuild"], "darwin").shell).toBe(false)
    expect(resolveSpawnSpec("pnpm", ["rebuild"], "linux").shell).toBe(false)
  })
})
