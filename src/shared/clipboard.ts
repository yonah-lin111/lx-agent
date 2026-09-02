// 剪贴板文件能力。
export interface ClipboardApi {
  getPathForFile: (file: File) => string
  saveClipboardImage: (buffer: ArrayBuffer, mimeType?: string) => Promise<string | null>
}
