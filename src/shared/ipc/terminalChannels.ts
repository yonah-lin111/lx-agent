// 终端领域 IPC channel 常量与通道生成函数。
export const TERMINAL_CHANNELS = {
  create: "terminal:create",
  write: "terminal:write",
  resize: "terminal:resize",
  kill: "terminal:kill",
  getDesktopPath: "terminal:getDesktopPath",
  data: (id: string): string => `terminal:data:${id}`,
  exit: (id: string): string => `terminal:exit:${id}`,
} as const
