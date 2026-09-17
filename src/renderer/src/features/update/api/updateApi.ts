import type { UpdateState } from "@shared/contracts/update"

// 状态尚未就绪时的占位结果（preload API 缺失，例如测试环境）。
const EMPTY_STATE: UpdateState = {
  currentVersion: "",
  latestVersion: null,
  hasUpdate: false,
  releaseUrl: null,
  checkedAt: null,
  failed: false,
}

/**
 * 隔离应用更新状态对 Electron preload API 的直接依赖。
 */
export const updateApi = {
  getState: (): Promise<UpdateState> =>
    window?.api?.update?.getState?.() ?? Promise.resolve(EMPTY_STATE),
  check: (): Promise<UpdateState> => window?.api?.update?.check?.() ?? Promise.resolve(EMPTY_STATE),
  onStateChanged: (handler: (state: UpdateState) => void): (() => void) =>
    window?.api?.update?.onStateChanged?.(handler) ?? (() => {}),
}
