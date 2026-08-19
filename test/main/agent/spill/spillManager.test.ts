import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SpillManager } from "@/agent/spill/spillManager"
import type { TruncationResult } from "@/agent/tools/truncate"

describe("SpillManager", () => {
  let tmpBase: string
  let manager: SpillManager

  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), "spill-test-"))
    manager = new SpillManager(tmpBase)
  })

  afterEach(async () => {
    if (existsSync(tmpBase)) {
      await rm(tmpBase, { recursive: true, force: true })
    }
  })

  it("saveSpillFile 写入指定会话与调用文件", () => {
    const filePath = manager.saveSpillFile("sess-1", "call:123", "hello world large text")
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, "utf-8")).toBe("hello world large text")
    expect(filePath).toContain("call_123.txt")
  })

  it("cleanSessionSpill 清除对应会话目录", () => {
    const filePath = manager.saveSpillFile("sess-1", "c1", "content")
    expect(existsSync(filePath)).toBe(true)
    manager.cleanSessionSpill("sess-1")
    expect(existsSync(filePath)).toBe(false)
  })

  it("formatSpillNotice 生成包含统计与提示的通知", () => {
    const truncation: TruncationResult = {
      content: "preview",
      truncated: true,
      truncatedBy: "lines",
      totalLines: 5000,
      outputLines: 2000,
      totalBytes: 200 * 1024,
      outputBytes: 50 * 1024,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines: 2000,
      maxBytes: 50 * 1024,
    }
    const notice = manager.formatSpillNotice("/tmp/spill/file.txt", truncation)
    expect(notice).toContain("Showing 2000 of 5000 lines")
    expect(notice).toContain("Full output saved to: /tmp/spill/file.txt")
    expect(notice).toContain("Use 'read' tool with offset/limit")
  })

  it("handleTruncation 未截断时直接返回原始内容", () => {
    const truncation: TruncationResult = {
      content: "short",
      truncated: false,
      truncatedBy: null,
      totalLines: 1,
      outputLines: 1,
      totalBytes: 5,
      outputBytes: 5,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines: 2000,
      maxBytes: 50 * 1024,
    }
    const res = manager.handleTruncation("short", truncation, {
      sessionId: "s1",
      toolCallId: "c1",
    })
    expect(res.text).toBe("short")
    expect(res.spillFilePath).toBeUndefined()
  })

  it("handleTruncation 截断时写入 spill 文件并附加 notice", () => {
    const truncation: TruncationResult = {
      content: "line1\nline2",
      truncated: true,
      truncatedBy: "bytes",
      totalLines: 100,
      outputLines: 2,
      totalBytes: 10000,
      outputBytes: 200,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines: 2000,
      maxBytes: 50 * 1024,
    }
    const raw = "line1\nline2\nline3...rest"
    const res = manager.handleTruncation(raw, truncation, {
      sessionId: "s1",
      toolCallId: "c1",
    })
    expect(res.spillFilePath).toBeDefined()
    expect(existsSync(res.spillFilePath!)).toBe(true)
    expect(readFileSync(res.spillFilePath!, "utf-8")).toBe(raw)
    expect(res.text).toContain("line1\nline2")
    expect(res.text).toContain("Full output saved to:")
  })

  it("cleanStaleSpills 清理超过 TTL 的旧会话目录", () => {
    const sOld = join(tmpBase, "old-sess")
    const sNew = join(tmpBase, "new-sess")
    mkdirSync(sOld, { recursive: true })
    mkdirSync(sNew, { recursive: true })
    writeFileSync(join(sOld, "f.txt"), "old")
    writeFileSync(join(sNew, "f.txt"), "new")

    // 修改 old 目录的 mtime 到 10 天前
    const tenDaysAgo = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(sOld, tenDaysAgo, tenDaysAgo)

    manager.cleanStaleSpills(7)

    expect(existsSync(sOld)).toBe(false)
    expect(existsSync(sNew)).toBe(true)
  })
})
