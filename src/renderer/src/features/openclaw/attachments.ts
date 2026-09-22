import {
  isOpenClawImageExtension,
  OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES,
  OPENCLAW_MAX_FILE_BYTES,
  OPENCLAW_MAX_IMAGE_BYTES,
  type OpenClawAttachmentFile,
} from "@shared/contracts/openclaw"

// 候选附件来源：文件选择器 File 与剪贴板（磁盘文件/截图落盘/文件夹）。
export interface OpenClawAttachmentCandidate {
  name: string
  path: string
  // 剪贴板纯文本路径与 file:// URI 无法获知大小，交由主进程兜底校验。
  sizeBytes?: number
  isFolder?: boolean
}

export type OpenClawAttachmentRejection =
  | "folder"
  | "image-too-large"
  | "file-too-large"
  | "total-too-large"

export const formatAttachmentSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export const extensionFromName = (nameOrPath: string): string => {
  const slashIndex = Math.max(nameOrPath.lastIndexOf("/"), nameOrPath.lastIndexOf("\\"))
  const baseName = nameOrPath.slice(slashIndex + 1)
  const dotIndex = baseName.lastIndexOf(".")
  return dotIndex < 0 ? "" : baseName.slice(dotIndex + 1).toLowerCase()
}

const totalAttachmentBytes = (files: OpenClawAttachmentFile[]): number =>
  files.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)

/**
 * 剪贴板是否含可附加的文件：无文件时返回 false，交由编辑器默认文本粘贴处理。
 */
export const clipboardHasAttachableFiles = (data: DataTransfer | null): boolean => {
  if (!data) return false
  if (data.files.length > 0) return true
  // 纯内存截图（无物理路径）只出现在 items 中。
  return Array.from(data.items).some((item) => item.kind === "file")
}

/**
 * 追加附件：按 path 去重；文件夹与超限候选被跳过并返回首个拒绝原因（不影响同批次合法项）。
 */
export const appendOpenClawAttachments = (
  existing: OpenClawAttachmentFile[],
  candidates: OpenClawAttachmentCandidate[],
): { files: OpenClawAttachmentFile[]; rejection: OpenClawAttachmentRejection | null } => {
  const files = [...existing]
  let totalBytes = totalAttachmentBytes(files)
  let rejection: OpenClawAttachmentRejection | null = null

  for (const candidate of candidates) {
    if (files.some((file) => file.path === candidate.path)) continue

    if (candidate.isFolder) {
      rejection ??= "folder"
      continue
    }

    const isImage = isOpenClawImageExtension(extensionFromName(candidate.name || candidate.path))
    const sizeBytes = candidate.sizeBytes
    if (sizeBytes !== undefined) {
      if (isImage && sizeBytes > OPENCLAW_MAX_IMAGE_BYTES) {
        rejection ??= "image-too-large"
        continue
      }
      if (!isImage && sizeBytes > OPENCLAW_MAX_FILE_BYTES) {
        rejection ??= "file-too-large"
        continue
      }
      if (totalBytes + sizeBytes > OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES) {
        rejection ??= "total-too-large"
        continue
      }
      totalBytes += sizeBytes
    }

    files.push({
      name: candidate.name,
      path: candidate.path,
      type: isImage ? "image" : "text",
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    })
  }

  return { files, rejection }
}
