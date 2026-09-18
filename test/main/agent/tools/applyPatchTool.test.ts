import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  failWritePath: "",
  failUnlinkPath: "",
}))

// 注入单点写/删失败：验证落盘阶段失败时的回滚与错误上报。
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    writeFile: async (
      path: Parameters<typeof actual.writeFile>[0],
      data: never,
      options: never,
    ) => {
      if (holder.failWritePath && String(path).includes(holder.failWritePath)) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
      }
      return actual.writeFile(path, data, options)
    },
    unlink: async (path: Parameters<typeof actual.unlink>[0]) => {
      if (holder.failUnlinkPath && String(path).includes(holder.failUnlinkPath)) {
        throw Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" })
      }
      return actual.unlink(path)
    },
  }
})

import { createApplyPatchTool } from "@/agent/tools/applyPatch"

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

describe("apply_patch 落盘原子性", () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "lx-patch-atomic-"))
    holder.failWritePath = ""
    holder.failUnlinkPath = ""
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it("多文件写入中途失败时回滚已写文件并上报错误", async () => {
    writeFileSync(join(workspace, "a.txt"), "AAA")
    writeFileSync(join(workspace, "b.txt"), "BBB")
    holder.failWritePath = "b.txt"
    const tool = createApplyPatchTool(workspace)

    const patch = [
      "*** Begin Patch",
      "*** Update File: a.txt",
      "@@",
      "-AAA",
      "+AAA-updated",
      "*** Update File: b.txt",
      "@@",
      "-BBB",
      "+BBB-updated",
      "*** End Patch",
    ].join("\n")

    const outcome = await tool.execute("t1", { patch }).catch((error: Error) => error)

    // 不得留下半应用状态。
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("AAA")
    expect(readFileSync(join(workspace, "b.txt"), "utf-8")).toBe("BBB")
    // 失败必须作为明确错误返回，而不是宣称成功。
    expect(outcome).not.toBeInstanceOf(Error)
    if (outcome instanceof Error) throw outcome
    expect(toolText(outcome)).not.toContain("Successfully applied patch")
    expect(toolText(outcome)).toMatch(/failed|aborted/i)
  })

  it("删除失败不得被吞掉后宣称成功", async () => {
    writeFileSync(join(workspace, "c.txt"), "CCC")
    holder.failUnlinkPath = "c.txt"
    const tool = createApplyPatchTool(workspace)

    const patch = ["*** Begin Patch", "*** Delete File: c.txt", "*** End Patch"].join("\n")

    const outcome = await tool.execute("t1", { patch }).catch((error: Error) => error)

    expect(outcome).not.toBeInstanceOf(Error)
    if (outcome instanceof Error) throw outcome
    expect(toolText(outcome)).not.toContain("Successfully applied patch")
    expect(toolText(outcome)).toMatch(/failed|aborted/i)
  })
})
