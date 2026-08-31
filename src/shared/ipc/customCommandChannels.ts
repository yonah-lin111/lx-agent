// 自定义命令领域 IPC 通道
export const CUSTOM_COMMAND_CHANNELS = {
  list: "customCommand:list",
  save: "customCommand:save",
  delete: "customCommand:delete",
} as const
