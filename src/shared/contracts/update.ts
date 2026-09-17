// 应用更新检查状态：main 进程为唯一状态源，renderer 只读消费。
export interface UpdateState {
  // 当前运行版本（package.json 的 version）。
  currentVersion: string
  // GitHub 最新 Release 版本（暂无 Release 时为 null）。
  latestVersion: string | null
  // 是否存在可升级版本。
  hasUpdate: boolean
  // 最新 Release 页面地址。
  releaseUrl: string | null
  // 最近一次检查完成时间（null 表示本次运行尚未检查）。
  checkedAt: number | null
  // 最近一次检查是否失败（网络、超时或限流）。
  failed: boolean
}

// 应用更新领域 preload API 契约。
export interface UpdateApi {
  update: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    onStateChanged: (handler: (state: UpdateState) => void) => () => void
  }
}
