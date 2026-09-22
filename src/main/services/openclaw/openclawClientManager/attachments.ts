import { readFile, stat } from "node:fs/promises"
import {
  isOpenClawImageExtension,
  OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES,
  OPENCLAW_MAX_IMAGE_BYTES,
  type OpenClawAttachmentFile,
} from "@shared/contracts/openclaw"

// 网关 agent 请求中的附件条目（content 为 base64，服务端按内容嗅探 MIME）。
export interface OpenClawGatewayAttachment {
  type: "image"
  mimeType: string
  fileName: string
  content: string
  sizeBytes: number
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

export const resolveAttachmentExtension = (file: OpenClawAttachmentFile): string => {
  const normalized = file.name.trim() || file.path.trim()
  const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"))
  const baseName = normalized.slice(slashIndex + 1)
  const dotIndex = baseName.lastIndexOf(".")
  return dotIndex < 0 ? "" : baseName.slice(dotIndex + 1).toLowerCase()
}

// 扇出场景下同一附件会被多个目标会话重复读取：按 (path, mtimeMs, size) 缓存 base64，
// 以固定预算做 FIFO 淘汰，避免 N 倍磁盘读取与编码。
const attachmentCache = new Map<string, { content: string; bytes: number }>()
const ATTACHMENT_CACHE_BUDGET_BYTES = 32 * 1024 * 1024
let attachmentCacheBytes = 0

const readAttachmentContent = async (
  filePath: string,
  mtimeMs: number,
  sizeBytes: number,
): Promise<string> => {
  const cacheKey = `${filePath}\u0000${mtimeMs}\u0000${sizeBytes}`
  const cached = attachmentCache.get(cacheKey)
  if (cached) return cached.content

  const buffer = await readFile(filePath)
  const content = buffer.toString("base64")
  attachmentCache.set(cacheKey, { content, bytes: buffer.byteLength })
  attachmentCacheBytes += buffer.byteLength
  for (const [key, entry] of attachmentCache) {
    if (attachmentCacheBytes <= ATTACHMENT_CACHE_BUDGET_BYTES) break
    attachmentCache.delete(key)
    attachmentCacheBytes -= entry.bytes
  }
  return content
}

/**
 * 校验并读取附件：仅图片、单张 ≤ 6MB、单条总量 ≤ 16MB，任一不满足即抛错拒绝整条发送。
 */
export const resolveOpenClawAttachments = async (
  files: OpenClawAttachmentFile[] | undefined,
): Promise<OpenClawGatewayAttachment[]> => {
  if (!files || files.length === 0) return []

  const resolved: OpenClawGatewayAttachment[] = []
  let totalBytes = 0
  for (const file of files) {
    const extension = resolveAttachmentExtension(file)
    if (!isOpenClawImageExtension(extension)) {
      throw new Error(
        `OPENCLAW_UNSUPPORTED_ATTACHMENT: ${file.name || file.path} is not a supported image`,
      )
    }

    const info = await stat(file.path).catch(() => null)
    if (!info || !info.isFile()) {
      throw new Error(`OPENCLAW_ATTACHMENT_MISSING: ${file.path}`)
    }
    if (info.size > OPENCLAW_MAX_IMAGE_BYTES) {
      throw new Error(
        `OPENCLAW_ATTACHMENT_TOO_LARGE: ${file.name || file.path} exceeds the image size limit`,
      )
    }
    totalBytes += info.size
    if (totalBytes > OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new Error(
        "OPENCLAW_ATTACHMENT_TOTAL_TOO_LARGE: attachments exceed the per-message total limit",
      )
    }

    resolved.push({
      type: "image",
      mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
      fileName: file.name || file.path.split(/[\\/]/).pop() || "attachment",
      content: await readAttachmentContent(file.path, info.mtimeMs, info.size),
      sizeBytes: info.size,
    })
  }
  return resolved
}
