import { readFile, stat } from "node:fs/promises"
import type { ViewImageDetails } from "@shared/contracts/agent"
import { nativeImage } from "electron"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { resolveToCwd } from "./path-utils"

// detail=high 的长边上限。
export const MAX_DIMENSION_HIGH = 2048
// detail=original 的长边上限。
export const MAX_DIMENSION_ORIGINAL = 6000
// 原字节直传上限（超过则缩放/重编码）。
export const MAX_PASSTHROUGH_BYTES = 4 * 1024 * 1024
// 源文件硬上限（超过直接拒绝，避免解码超大文件）。
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024
// 重编码 JPEG 质量。
export const JPEG_QUALITY = 85

// 支持格式族（决定重编码目标格式）。
type ImageFamily = "png" | "jpeg" | "gif" | "bmp" | "webp" | "avif"

interface DetectedImageFormat {
  mimeType: string
  family: ImageFamily
}

// 按魔数探测图片格式（不信任扩展名）。
export const detectImageFormat = (buffer: Buffer): DetectedImageFormat | null => {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mimeType: "image/png", family: "png" }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", family: "jpeg" }
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString("latin1")
    if (header === "GIF87a" || header === "GIF89a") {
      return { mimeType: "image/gif", family: "gif" }
    }
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { mimeType: "image/bmp", family: "bmp" }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return { mimeType: "image/webp", family: "webp" }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("latin1") === "ftyp" &&
    buffer.subarray(8, 12).toString("latin1") === "avif"
  ) {
    return { mimeType: "image/avif", family: "avif" }
  }
  return null
}

// 重编码目标：PNG 族保持无损，其余压为 JPEG。
const encodeImage = (
  resized: Electron.NativeImage,
  family: ImageFamily,
): { data: Buffer; mimeType: string } => {
  if (family === "png" || family === "gif" || family === "bmp") {
    return { data: resized.toPNG(), mimeType: "image/png" }
  }
  return { data: resized.toJPEG(JPEG_QUALITY), mimeType: "image/jpeg" }
}

// 等比缩放尺寸计算：长边压缩到 maxDimension，短边按比例取整（最小 1px）。
const fitWithin = (
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } => {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxDimension) return { width, height }
  const scale = maxDimension / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// view_image 工具输入 schema。
const viewImageSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Path of the image file (relative to project root, or absolute)"),
  detail: z
    .enum(["high", "original"])
    .optional()
    .describe(
      "Image detail level. Defaults to `high` (long edge resized to at most 2048px); use `original` to preserve detail up to 6000px.",
    ),
})

// view_image 依赖：视觉能力门控（装配缝隙兜底）。
export interface ViewImageToolDeps {
  supportsImages?: () => boolean
}

const UNSUPPORTED_FORMAT_MESSAGE =
  "Unable to process image: unsupported or invalid image format (supported: PNG, JPEG, GIF, BMP, WebP, AVIF)."

/**
 * 创建 view_image 工具：读取项目内本地图片并投喂给视觉模型。
 *
 * 预处理双路径（详见 docs/agent/view-image.md）：
 * - 文件 ≤ 4MiB 且长边未超限：原字节直传（零重编码）；
 * - 需缩放或超过 4MiB：nativeImage 缩放后按格式族重编码（PNG 族→PNG，其余→JPEG）。
 */
export const createViewImageTool = (
  cwd: string,
  deps: ViewImageToolDeps = {},
): AgentTool<typeof viewImageSchema, { image: ViewImageDetails }> => ({
  name: "view_image",
  label: "View image",
  description:
    "View a local image file from the filesystem when visual inspection is needed. Use this for images already available on disk (screenshots, design mockups, diagrams).",
  inputSchema: viewImageSchema,
  executionMode: "parallel",
  execute: async (_toolCallId, params) => {
    if (deps.supportsImages && !deps.supportsImages()) {
      throw new Error(
        "view_image is not allowed because the current model does not support image inputs.",
      )
    }

    const absolutePath = resolveToCwd(params.path, cwd)
    if (!absolutePath) {
      throw new Error(`Unable to resolve image path: ${params.path}`)
    }

    let fileStat: Awaited<ReturnType<typeof stat>>
    try {
      fileStat = await stat(absolutePath)
    } catch {
      throw new Error(`Unable to locate image at ${absolutePath}: file not found.`)
    }
    if (!fileStat.isFile()) {
      throw new Error(`Unable to process image: ${absolutePath} is not a file.`)
    }
    if (fileStat.size > MAX_SOURCE_BYTES) {
      throw new Error(
        `Unable to process image: file exceeds the ${MAX_SOURCE_BYTES / (1024 * 1024)}MiB limit.`,
      )
    }

    const buffer = await readFile(absolutePath)
    const format = detectImageFormat(buffer)
    if (!format) {
      throw new Error(UNSUPPORTED_FORMAT_MESSAGE)
    }

    const image = nativeImage.createFromBuffer(buffer)
    if (image.isEmpty()) {
      throw new Error("Unable to process image: invalid or unsupported image data.")
    }

    const detail = params.detail ?? "high"
    const maxDimension = detail === "original" ? MAX_DIMENSION_ORIGINAL : MAX_DIMENSION_HIGH
    const sourceSize = image.getSize()
    const needsResize = Math.max(sourceSize.width, sourceSize.height) > maxDimension
    const exceedsPassthrough = buffer.length > MAX_PASSTHROUGH_BYTES

    let data: Buffer = buffer
    let mimeType = format.mimeType
    let width = sourceSize.width
    let height = sourceSize.height
    let resized = false

    if (needsResize || exceedsPassthrough) {
      const target = fitWithin(sourceSize.width, sourceSize.height, maxDimension)
      const resizedImage = needsResize
        ? image.resize({ width: target.width, height: target.height, quality: "better" })
        : image
      const encoded = encodeImage(resizedImage, format.family)
      data = encoded.data
      mimeType = encoded.mimeType
      width = target.width
      height = target.height
      resized = true
    }

    const details: ViewImageDetails = {
      path: absolutePath,
      mimeType,
      detail,
      width,
      height,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      resized,
      sizeBytes: data.length,
    }
    const sizeNote = resized
      ? `sent ${width}x${height} as ${mimeType}`
      : `sent original ${mimeType}`
    const summary = `Viewed image ${absolutePath} (source ${sourceSize.width}x${sourceSize.height}, detail=${detail}, ${sizeNote}).`

    return {
      content: [
        { type: "text", text: summary },
        { type: "image", data: data.toString("base64"), mimeType },
      ],
      details: { image: details },
    }
  },
})
