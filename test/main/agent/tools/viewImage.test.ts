import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

// 可控的 electron nativeImage mock（解码尺寸/编码产物由各用例注入）。
const mocks = vi.hoisted(() => ({
  createFromBuffer: vi.fn(),
  resize: vi.fn(),
  toPNG: vi.fn(() => Buffer.from("png-encoded")),
  toJPEG: vi.fn(() => Buffer.from("jpeg-encoded")),
}))

vi.mock("electron", () => ({
  nativeImage: { createFromBuffer: mocks.createFromBuffer },
}))

import {
  createViewImageTool,
  detectImageFormat,
  JPEG_QUALITY,
  MAX_DIMENSION_HIGH,
  MAX_DIMENSION_ORIGINAL,
  MAX_PASSTHROUGH_BYTES,
  MAX_SOURCE_BYTES,
} from "@/agent/tools/viewImage"

// 每个用例独立临时目录，用后清理。
const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-view-image-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  mocks.createFromBuffer.mockReset()
  mocks.resize.mockReset()
  mocks.toPNG.mockClear()
  mocks.toJPEG.mockClear()
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// 构造带真实魔数的图片字节：payload 仅用于区分内容，不做真实解码。
const pngBytes = (payload = 8): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(payload),
  ])
const jpegBytes = (payload = 8): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(payload)])

// 配置 nativeImage 解码结果与 resize 产物。
const mockNativeImage = (options: {
  width: number
  height: number
  isEmpty?: boolean
  resizedWidth?: number
  resizedHeight?: number
}): void => {
  const resized = {
    toPNG: mocks.toPNG,
    toJPEG: mocks.toJPEG,
  }
  mocks.resize.mockReturnValue(resized)
  mocks.createFromBuffer.mockReturnValue({
    isEmpty: () => options.isEmpty ?? false,
    getSize: () => ({ width: options.width, height: options.height }),
    resize: mocks.resize,
    toPNG: mocks.toPNG,
    toJPEG: mocks.toJPEG,
  })
}

const imageBlock = (content: Array<{ type: string }>) =>
  content.find((block) => block.type === "image")
const textBlock = (content: Array<{ type: string; text?: string }>) =>
  content.find((block) => block.type === "text")

describe("detectImageFormat", () => {
  it("按魔数识别 PNG / JPEG / GIF / BMP / WebP / AVIF", () => {
    expect(detectImageFormat(pngBytes())?.mimeType).toBe("image/png")
    expect(detectImageFormat(jpegBytes())?.mimeType).toBe("image/jpeg")
    expect(detectImageFormat(Buffer.from("GIF89a----"))?.mimeType).toBe("image/gif")
    expect(detectImageFormat(Buffer.from([0x42, 0x4d, 0x00, 0x00]))?.mimeType).toBe("image/bmp")
    expect(detectImageFormat(Buffer.from("RIFF0000WEBPVP8 "))?.mimeType).toBe("image/webp")
    expect(detectImageFormat(Buffer.from("0000ftypavif0000"))?.mimeType).toBe("image/avif")
  })

  it("SVG 与未知格式返回 null", () => {
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
      null,
    )
    expect(detectImageFormat(Buffer.from("plain text"))).toBe(null)
  })
})

describe("view_image 直传路径", () => {
  it("小图且未超限时原字节直传，零重编码", async () => {
    const cwd = await makeTmp()
    const bytes = pngBytes(64)
    await writeFile(join(cwd, "shot.png"), bytes)
    mockNativeImage({ width: 320, height: 200 })

    const tool = createViewImageTool(cwd)
    const result = await tool.execute("c1", { path: "shot.png" })

    expect(mocks.resize).not.toHaveBeenCalled()
    expect(imageBlock(result.content)).toMatchObject({
      type: "image",
      mimeType: "image/png",
      data: bytes.toString("base64"),
    })
    expect(result.details?.image).toMatchObject({
      path: join(cwd, "shot.png"),
      mimeType: "image/png",
      detail: "high",
      width: 320,
      height: 200,
      sourceWidth: 320,
      sourceHeight: 200,
      resized: false,
      sizeBytes: bytes.length,
    })
    expect(textBlock(result.content)?.text).toContain("detail=high")
  })

  it("绝对路径与相对路径均可解析", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "abs.png"), pngBytes())
    mockNativeImage({ width: 10, height: 10 })

    const tool = createViewImageTool(cwd)
    const result = await tool.execute("c1", { path: join(cwd, "abs.png") })
    expect(result.details?.image.path).toBe(join(cwd, "abs.png"))
  })
})

describe("view_image 重编码路径", () => {
  it("high 上限 2048：超限 PNG 等比缩放并保持 PNG", async () => {
    const cwd = await makeTmp()
    const bytes = pngBytes()
    await writeFile(join(cwd, "big.png"), bytes)
    mockNativeImage({ width: 4000, height: 2000 })

    const tool = createViewImageTool(cwd)
    const result = await tool.execute("c1", { path: "big.png" })

    expect(mocks.resize).toHaveBeenCalledWith({
      width: MAX_DIMENSION_HIGH,
      height: Math.round((2000 * MAX_DIMENSION_HIGH) / 4000),
      quality: "better",
    })
    expect(mocks.toPNG).toHaveBeenCalled()
    expect(mocks.toJPEG).not.toHaveBeenCalled()
    expect(result.details?.image).toMatchObject({
      width: MAX_DIMENSION_HIGH,
      height: Math.round((2000 * MAX_DIMENSION_HIGH) / 4000),
      sourceWidth: 4000,
      sourceHeight: 2000,
      resized: true,
      mimeType: "image/png",
    })
    expect(imageBlock(result.content)).toMatchObject({
      mimeType: "image/png",
      data: Buffer.from("png-encoded").toString("base64"),
    })
  })

  it("original 上限 6000：超限 JPEG 缩放并按 q85 重编码", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "big.jpg"), jpegBytes())
    mockNativeImage({ width: 8000, height: 4000 })

    const tool = createViewImageTool(cwd)
    const result = await tool.execute("c1", { path: "big.jpg", detail: "original" })

    expect(mocks.resize).toHaveBeenCalledWith({
      width: MAX_DIMENSION_ORIGINAL,
      height: Math.round((4000 * MAX_DIMENSION_ORIGINAL) / 8000),
      quality: "better",
    })
    expect(mocks.toJPEG).toHaveBeenCalledWith(JPEG_QUALITY)
    expect(result.details?.image).toMatchObject({
      detail: "original",
      width: 6000,
      height: 3000,
      mimeType: "image/jpeg",
      resized: true,
    })
  })

  it("尺寸未超限但超过 4MiB 直传上限时仅重编码不缩放", async () => {
    const cwd = await makeTmp()
    const bytes = Buffer.concat([pngBytes(0), Buffer.alloc(MAX_PASSTHROUGH_BYTES + 1)])
    await writeFile(join(cwd, "heavy.png"), bytes)
    mockNativeImage({ width: 800, height: 600 })

    const tool = createViewImageTool(cwd)
    const result = await tool.execute("c1", { path: "heavy.png" })

    expect(mocks.resize).not.toHaveBeenCalled()
    expect(mocks.toPNG).toHaveBeenCalled()
    expect(result.details?.image).toMatchObject({
      width: 800,
      height: 600,
      resized: true,
      mimeType: "image/png",
    })
  })

  it("GIF/BMP 族重编码目标为 PNG", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "anim.gif"), Buffer.from("GIF89a---------"))
    mockNativeImage({ width: 3000, height: 1000 })

    const tool = createViewImageTool(cwd)
    const result = await tool.execute("c1", { path: "anim.gif" })

    expect(mocks.toPNG).toHaveBeenCalled()
    expect(result.details?.image.mimeType).toBe("image/png")
  })
})

describe("view_image 错误分支", () => {
  it("文件不存在", async () => {
    const cwd = await makeTmp()
    const tool = createViewImageTool(cwd)
    await expect(tool.execute("c1", { path: "nope.png" })).rejects.toThrow(/file not found/)
  })

  it("目标不是文件", async () => {
    const cwd = await makeTmp()
    await mkdir(join(cwd, "dir.png"))
    const tool = createViewImageTool(cwd)
    await expect(tool.execute("c1", { path: "dir.png" })).rejects.toThrow(/is not a file/)
  })

  it("超过 20MiB 硬上限", async () => {
    const cwd = await makeTmp()
    const filePath = join(cwd, "huge.png")
    await writeFile(filePath, "x")
    await truncate(filePath, MAX_SOURCE_BYTES + 1)
    const tool = createViewImageTool(cwd)
    await expect(tool.execute("c1", { path: "huge.png" })).rejects.toThrow(/20MiB limit/)
    expect(mocks.createFromBuffer).not.toHaveBeenCalled()
  })

  it("SVG 等不支持格式直接报错", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const tool = createViewImageTool(cwd)
    await expect(tool.execute("c1", { path: "icon.svg" })).rejects.toThrow(
      /unsupported or invalid image format/,
    )
  })

  it("解码失败（nativeImage 空图）报错", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "broken.png"), pngBytes())
    mockNativeImage({ width: 0, height: 0, isEmpty: true })
    const tool = createViewImageTool(cwd)
    await expect(tool.execute("c1", { path: "broken.png" })).rejects.toThrow(
      /invalid or unsupported image data/,
    )
  })

  it("非视觉模型执行兜底报错且不读取文件", async () => {
    const cwd = await makeTmp()
    const tool = createViewImageTool(cwd, { supportsImages: () => false })
    await expect(tool.execute("c1", { path: "any.png" })).rejects.toThrow(
      /does not support image inputs/,
    )
    expect(mocks.createFromBuffer).not.toHaveBeenCalled()
  })
})
