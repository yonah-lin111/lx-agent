// @vitest-environment node

import type { OpenClawAttachmentFile } from "@shared/contracts/openclaw"
import { OPENCLAW_MAX_IMAGE_BYTES } from "@shared/contracts/openclaw"
import { describe, expect, it } from "vitest"
import {
  appendOpenClawAttachments,
  clipboardHasAttachableImage,
  extensionFromName,
  formatAttachmentSize,
} from "@/features/openclaw/attachments"

const attachment = (path: string, sizeBytes?: number): OpenClawAttachmentFile => ({
  name: path.split("/").pop() ?? path,
  path,
  type: "image",
  ...(sizeBytes !== undefined ? { sizeBytes } : {}),
})

// jsdom 之外的 Node 环境没有 DataTransfer：用鸭子对象模拟剪贴板事件负载。
const createClipboardData = (files: { name: string; type: string }[]): DataTransfer =>
  ({
    files,
    items: files.map((file) => ({ kind: "file", type: file.type })),
  }) as unknown as DataTransfer

describe("OpenClaw 附件工具", () => {
  it("extensionFromName 取最后一段扩展名并统一小写", () => {
    expect(extensionFromName("/tmp/a/b/Photo.PNG")).toBe("png")
    expect(extensionFromName("capture.webp")).toBe("webp")
    expect(extensionFromName("no-extension")).toBe("")
  })

  it("formatAttachmentSize 按 B/KB/MB 分档", () => {
    expect(formatAttachmentSize(512)).toBe("512 B")
    expect(formatAttachmentSize(2048)).toBe("2.0 KB")
    expect(formatAttachmentSize(3 * 1024 * 1024)).toBe("3.0 MB")
  })

  it("按 path 去重并忽略重复添加", () => {
    const existing = [attachment("/tmp/a.png", 1024)]
    const result = appendOpenClawAttachments(existing, [
      { name: "a.png", path: "/tmp/a.png", sizeBytes: 1024 },
    ])
    expect(result.files).toHaveLength(1)
    expect(result.rejection).toBeNull()
  })

  it("非图片扩展名被跳过并报告 unsupported", () => {
    const result = appendOpenClawAttachments([], [{ name: "report.pdf", path: "/tmp/report.pdf" }])
    expect(result.files).toHaveLength(0)
    expect(result.rejection).toBe("unsupported")
  })

  it("同批次中合法图片与非法文件共存时，仅跳过非法项", () => {
    const result = appendOpenClawAttachments(
      [],
      [
        { name: "doc.pdf", path: "/tmp/doc.pdf" },
        { name: "b.png", path: "/tmp/b.png", sizeBytes: 1024 },
      ],
    )
    expect(result.files.map((file) => file.path)).toEqual(["/tmp/b.png"])
    expect(result.rejection).toBe("unsupported")
  })

  it("单张超过 6MB 被拒", () => {
    const result = appendOpenClawAttachments(
      [],
      [{ name: "big.png", path: "/tmp/big.png", sizeBytes: OPENCLAW_MAX_IMAGE_BYTES + 1 }],
    )
    expect(result.files).toHaveLength(0)
    expect(result.rejection).toBe("image-too-large")
  })

  it("累计超过单条总量上限被拒", () => {
    // 既有 15MB，追加 2MB 后越过 16MB 单条总量上限（追加项本身未超单张上限）。
    const existing = [
      attachment("/tmp/a.png", OPENCLAW_MAX_IMAGE_BYTES),
      attachment("/tmp/b.png", OPENCLAW_MAX_IMAGE_BYTES),
      attachment("/tmp/c.png", 3 * 1024 * 1024),
    ]
    const result = appendOpenClawAttachments(existing, [
      { name: "d.png", path: "/tmp/d.png", sizeBytes: 2 * 1024 * 1024 },
    ])
    expect(result.files).toHaveLength(3)
    expect(result.rejection).toBe("total-too-large")
  })

  it("未知大小的候选（剪贴板文本路径）跳过大小预校验，交由主进程兜底", () => {
    const result = appendOpenClawAttachments(
      [],
      [{ name: "unknown.png", path: "/tmp/unknown.png" }],
    )
    expect(result.files).toEqual([{ name: "unknown.png", path: "/tmp/unknown.png", type: "image" }])
    expect(result.rejection).toBeNull()
  })

  it("clipboardHasAttachableImage 识别图片文件、无路径截图与非图片文件", () => {
    expect(clipboardHasAttachableImage(createClipboardData([{ name: "a.png", type: "" }]))).toBe(
      true,
    )
    // 纯内存截图只出现在 items 中（无 files 条目）。
    const screenshot = {
      files: [],
      items: [{ kind: "file", type: "image/png" }],
    } as unknown as DataTransfer
    expect(clipboardHasAttachableImage(screenshot)).toBe(true)
    expect(
      clipboardHasAttachableImage(
        createClipboardData([{ name: "a.pdf", type: "application/pdf" }]),
      ),
    ).toBe(false)
    expect(clipboardHasAttachableImage(null)).toBe(false)
  })
})
