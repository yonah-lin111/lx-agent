import type { StreamFn } from "./types"

let defaultStreamFn: StreamFn | undefined

/**
 * 配置 Agent 与低层循环在未显式传入 streamFn 时使用的默认实现。
 */
export function setDefaultStreamFn(streamFn: StreamFn | undefined): void {
  defaultStreamFn = streamFn
}

/**
 * 获取默认 streamFn，未配置时抛错。
 */
export function getDefaultStreamFn(): StreamFn {
  if (!defaultStreamFn) {
    throw new Error(
      "No default stream function configured. Pass streamFn explicitly or call setDefaultStreamFn().",
    )
  }
  return defaultStreamFn
}
