import { shell } from "electron"

/**
 * 判断是否为可交给系统浏览器打开的 http/https 链接。
 */
export const isExternalHttpUrl = (url: string): boolean => {
  try {
    const protocol = new URL(url).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/**
 * 用系统默认浏览器打开外部链接（跨平台）；非 http/https 一律忽略。
 */
export const openExternalUrl = async (url: string): Promise<void> => {
  if (!isExternalHttpUrl(url)) return
  try {
    await shell.openExternal(url)
  } catch (error) {
    console.error("[externalLinkService] Failed to open external url:", error)
  }
}
