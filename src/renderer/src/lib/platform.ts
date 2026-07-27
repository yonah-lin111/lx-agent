// 当前浏览器用户代理。
const userAgent = navigator.userAgent

/**
 * 判断当前运行环境是否为 macOS。
 */
export const isMacOS = (): boolean => userAgent.includes("Macintosh")

/**
 * 判断当前运行环境是否为 Windows。
 */
export const isWindows = (): boolean => userAgent.includes("Windows")
