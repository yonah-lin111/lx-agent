import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { withFileMutationQueue } from "@/agent/tools/file-mutation-queue"

describe("withFileMutationQueue 键一致性", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lx-mutation-queue-"))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("软链目录下的新文件与真实路径使用同一队列（写入不并发）", async () => {
    const realDir = join(root, "real")
    const linkDir = join(root, "link")
    mkdirSync(realDir)
    symlinkSync(realDir, linkDir)

    let active = 0
    let maxActive = 0
    const run = (filePath: string): Promise<void> =>
      withFileMutationQueue(filePath, async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 30))
        active -= 1
      })

    await Promise.all([run(join(linkDir, "a.txt")), run(join(realDir, "a.txt"))])

    expect(maxActive).toBe(1)
  })
})
