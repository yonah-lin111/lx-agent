import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  // rg/fd 的 mock 行为：spawnFailed 时 child 立刻 error 并 close(null)。
  mode: "path" as "path" | "limit-kill" | "spawn-fail",
  // limit-kill 模式下发出的 JSON 行 / fd 行。
  lines: [] as string[],
}))

// 强制走 Node 降级或模拟被 limit kill：不依赖真实 rg/fd。
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return {
    ...actual,
    spawn: () => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable
        stderr: Readable
        kill: () => void
      }
      child.stdout = new Readable({ read() {} })
      child.stderr = new Readable({ read() {} })
      child.kill = () => {}
      process.nextTick(() => {
        for (const line of holder.lines) child.stdout.push(`${line}\n`)
        child.stdout.push(null)
        if (holder.mode === "spawn-fail") {
          child.emit("error", new Error("spawn ENOENT"))
          child.emit("close", null)
          return
        }
        // limit-kill：模拟达到上限后 child.kill() 导致 exitCode null。
        child.emit("close", holder.mode === "limit-kill" ? null : 0)
      })
      return child
    },
  }
})

// Node 降级扫描是否被调用：limit-kill / abort 场景不应触发全量重扫。
const walkFilesSpy = vi.hoisted(() => vi.fn())
vi.mock("@/agent/tools/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agent/tools/search")>()
  walkFilesSpy.mockImplementation((...args: Parameters<typeof actual.walkFiles>) =>
    actual.walkFiles(...args),
  )
  return { ...actual, walkFiles: walkFilesSpy }
})

import { createFindTool } from "@/agent/tools/find"
import { createGrepTool } from "@/agent/tools/grep"

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

describe("grep/find 降级链路", () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "lx-grep-fallback-"))
    holder.mode = "path"
    holder.lines = []
    walkFilesSpy.mockClear()
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it("rg 达到匹配上限被 kill 时返回已收集结果，不做全量 Node 重扫", async () => {
    holder.mode = "limit-kill"
    holder.lines = [
      JSON.stringify({
        type: "match",
        data: {
          path: { text: join(workspace, "a.ts") },
          line_number: 1,
          lines: { text: "needle one" },
        },
      }),
      JSON.stringify({
        type: "match",
        data: {
          path: { text: join(workspace, "a.ts") },
          line_number: 2,
          lines: { text: "needle two" },
        },
      }),
    ]
    const tool = createGrepTool(workspace)

    const result = await tool.execute("t1", { pattern: "needle", limit: 2 })

    expect(toolText(result)).toContain("needle one")
    expect(toolText(result)).toContain("Reached limit")
    expect(walkFilesSpy).not.toHaveBeenCalled()
  })

  it("abort 语义：中止时返回明确中止提示而不是 No matches found", async () => {
    holder.mode = "spawn-fail"
    const tool = createGrepTool(workspace)
    const controller = new AbortController()
    controller.abort()

    const result = await tool.execute("t1", { pattern: "needle" }, controller.signal)

    expect(toolText(result)).toMatch(/aborted/i)
    expect(toolText(result)).not.toContain("No matches found")
  })

  it("fd 降级链路同样区分中止语义", async () => {
    holder.mode = "spawn-fail"
    const tool = createFindTool(workspace)
    const controller = new AbortController()
    controller.abort()

    const result = await tool.execute("t1", { pattern: "*.ts" }, controller.signal)

    expect(toolText(result)).toMatch(/aborted/i)
    expect(toolText(result)).not.toContain("No matching files found")
  })

  it("Node 降级对灾难性回溯正则在超时后返回，不锁死主进程", async () => {
    holder.mode = "spawn-fail"
    writeFileSync(join(workspace, "evil.txt"), `${"a".repeat(64)}b\n`)
    const tool = createGrepTool(workspace, undefined, { nodeScanTimeoutMs: 300 })

    const startedAt = Date.now()
    const result = await tool.execute("t1", { pattern: "(a+)+$" })
    const elapsed = Date.now() - startedAt

    expect(elapsed).toBeLessThan(3000)
    expect(toolText(result)).toMatch(/timed out|timeout/i)
  }, 5000)
})
