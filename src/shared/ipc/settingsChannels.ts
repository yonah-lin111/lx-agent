// 设置领域 IPC channel。
export const SETTINGS_CHANNELS = {
  getModelProviders: "settings:model-providers:get",
  saveModelProviders: "settings:model-providers:save",
  fetchModels: "settings:model-providers:fetch-models",
  getPermissionSettings: "settings:permissions:get",
  savePermissionSettings: "settings:permissions:save",
} as const
