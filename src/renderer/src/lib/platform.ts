/**
 * 判断当前运行环境是否为 macOS。
 */
export const isMacOS = (): boolean =>
  (typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh")) ||
  (typeof process !== "undefined" && process.platform === "darwin")

/**
 * 判断当前运行环境是否为 Windows。
 */
export const isWindows = (): boolean =>
  (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")) ||
  (typeof process !== "undefined" && process.platform === "win32")
