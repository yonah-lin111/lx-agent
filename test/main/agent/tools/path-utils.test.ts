import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { pathExists, resolveToCwd } from "@/agent/tools/path-utils"

// 每个用例独立临时目录，用后清理。
const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-path-utils-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("resolveToCwd", () => {
  const cwd = join(tmpdir(), "lx-project")

  it("相对路径以 cwd 为基准解析为绝对路径", () => {
    const result = resolveToCwd("src/index.ts", cwd)
    expect(result).toBe(resolve(cwd, "src/index.ts"))
    expect(result.startsWith(cwd)).toBe(true)
  })

  it("绝对路径规范化后原样返回，不拼接 cwd", () => {
    const absolute = join(tmpdir(), "elsewhere", "a.ts")
    expect(resolveToCwd(absolute, cwd)).toBe(resolve(absolute))
  })

  it("越出 cwd 的路径仍返回绝对路径（读类工具不设边界）", () => {
    const result = resolveToCwd("../outside.txt", cwd)
    expect(result).toBe(resolve(cwd, "../outside.txt"))
    expect(result.startsWith(cwd)).toBe(false)
  })
})

describe("pathExists", () => {
  it("文件存在返回 true，不存在返回 false", async () => {
    const dir = await makeTmp()
    const filePath = join(dir, "a.txt")
    await writeFile(filePath, "x", "utf-8")
    expect(await pathExists(filePath)).toBe(true)
    expect(await pathExists(join(dir, "missing.txt"))).toBe(false)
  })
})
