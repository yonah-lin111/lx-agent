// 应用更新领域 IPC channel。
export const UPDATE_CHANNELS = {
  getState: "update:state:get",
  check: "update:check",
  // main → renderer：检查完成后推送最新状态。
  stateChanged: "update:state-changed",
} as const
