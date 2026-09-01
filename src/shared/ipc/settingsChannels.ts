// 设置领域 IPC channel。
export const SETTINGS_CHANNELS = {
  getModelProviders: "settings:model-providers:get",
  saveModelProviders: "settings:model-providers:save",
  fetchModels: "settings:model-providers:fetch-models",
  getPermissionSettings: "settings:permissions:get",
  savePermissionSettings: "settings:permissions:save",
  getUiSettings: "settings:ui:get",
  saveUiSettings: "settings:ui:save",
  getCliSettings: "settings:cli:get",
  saveCliSettings: "settings:cli:save",
  getCliVersions: "settings:cli:get-versions",
  runCliLifecycleAction: "settings:cli:run-lifecycle-action",
} as const

