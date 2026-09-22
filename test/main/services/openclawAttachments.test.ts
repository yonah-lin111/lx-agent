// @vitest-environment node

import { mkdtempSync, writeFileSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES,
  OPENCLAW_MAX_IMAGE_BYTES,
  type OpenClawAttachmentFile,
} from "@shared/contracts/openclaw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveOpenClawAttachments } from "@/services/openclaw/openclawClientManager/attachments"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    stat: vi.fn(actual.stat),
    readFile: vi.fn(actual.readFile),
  }
})

const workspace = mkdtempSync(join(tmpdir(), "openclaw-attachments-"))
const PNG_BYTES = Buffer.from("fake-png-payload")

// mockReset 会清掉 vi.fn(actual.xxx) 的默认实现：保存真实实现以便逐用例恢复，
// 避免 mockResolvedValueOnce 队列跨用例泄漏；工厂以真实实现构造，故必然存在。
const realStat = vi.mocked(stat).getMockImplementation()!
const realReadFile = vi.mocked(readFile).getMockImplementation()!

const writePng = (name: string): string => {
  const path = join(workspace, name)
  writeFileSync(path, PNG_BYTES)
  return path
}

const attachment = (path: string): OpenClawAttachmentFile => ({
  name: path.split("/").pop() ?? path,
  path,
  type: "image",
})

const fakeStat = (size: number): Awaited<ReturnType<typeof stat>> =>
  ({ isFile: () => true, size, mtimeMs: 1 }) as Awaited<ReturnType<typeof stat>>

describe("OpenClaw 主进程附件解析", () => {
  beforeEach(() => {
    vi.mocked(stat).mockReset()
    vi.mocked(stat).mockImplementation(realStat)
    vi.mocked(readFile).mockReset()
    vi.mocked(readFile).mockImplementation(realReadFile)
  })

  it("无附件时返回空数组且不触碰文件系统", async () => {
    await expect(resolveOpenClawAttachments(undefined)).resolves.toEqual([])
    await expect(resolveOpenClawAttachments([])).resolves.toEqual([])
    expect(stat).not.toHaveBeenCalled()
  })

  it("图片读取为 base64 并带 MIME 与文件名", async () => {
    const path = writePng("photo.png")
    const resolved = await resolveOpenClawAttachments([attachment(path)])

    expect(resolved).toEqual([
      {
        type: "image",
        mimeType: "image/png",
        fileName: "photo.png",
        content: PNG_BYTES.toString("base64"),
        sizeBytes: PNG_BYTES.byteLength,
      },
    ])
  })

  it("非图片扩展名被拒绝", async () => {
    const path = join(workspace, "report.pdf")
    writeFileSync(path, "pdf")
    await expect(resolveOpenClawAttachments([attachment(path)])).rejects.toThrow(
      /OPENCLAW_UNSUPPORTED_ATTACHMENT/,
    )
  })

  it("单张超过 6MB 被拒绝", async () => {
    const path = writePng("huge.png")
    vi.mocked(stat).mockResolvedValueOnce(fakeStat(OPENCLAW_MAX_IMAGE_BYTES + 1))

    await expect(resolveOpenClawAttachments([attachment(path)])).rejects.toThrow(
      /OPENCLAW_ATTACHMENT_TOO_LARGE/,
    )
  })

  it("累计超过单条总量上限被拒绝", async () => {
    const paths = ["total-a.png", "total-b.png", "total-c.png"].map(writePng)
    // 每张均未超单张上限，但三张累计越过 16MB 单条总量上限。
    const sizes = [
      OPENCLAW_MAX_IMAGE_BYTES,
      OPENCLAW_MAX_IMAGE_BYTES,
      OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES - OPENCLAW_MAX_IMAGE_BYTES * 2 + 1,
    ]
    for (const size of sizes) {
      vi.mocked(stat).mockResolvedValueOnce(fakeStat(size))
    }

    await expect(resolveOpenClawAttachments(paths.map(attachment))).rejects.toThrow(
      /OPENCLAW_ATTACHMENT_TOTAL_TOO_LARGE/,
    )
  })

  it("文件缺失时拒绝整条发送", async () => {
    await expect(
      resolveOpenClawAttachments([attachment(join(workspace, "missing.png"))]),
    ).rejects.toThrow(/OPENCLAW_ATTACHMENT_MISSING/)
  })

  it("同一附件在扇出中被重复请求时只读取一次", async () => {
    const path = writePng("cached.png")
    const first = await resolveOpenClawAttachments([attachment(path)])
    const second = await resolveOpenClawAttachments([attachment(path)])

    expect(first).toEqual(second)
    expect(readFile).toHaveBeenCalledTimes(1)
  })
})
