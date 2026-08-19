// 终端领域 preload API 契约与数据结构。

// 终端创建参数。
export interface CreateTerminalOptions {
  // 终端唯一标识。
  id: string
  // 初始工作目录。
  cwd?: string
  // 初始列数。
  cols?: number
  // 初始行数。
  rows?: number
  // 环境变量覆盖。
  env?: Record<string, string>
}

// 终端创建结果。
export interface CreateTerminalResult {
  success: boolean
  id: string
  error?: string
}

// 终端退出事件。
export interface TerminalExitEvent {
  exitCode: number
  signal?: number
}

// 终端标签页元数据。
export interface TerminalTab {
  id: string
  title: string
  customTitle?: string
  cwd?: string
  projectId?: string
  itemId?: string
  createdAt: number
}

// 终端领域 Preload API。
export interface TerminalApi {
  terminal: {
    // 创建新 PTY 终端实例。
    create: (options: CreateTerminalOptions) => Promise<CreateTerminalResult>
    // 向指定终端写入输入数据。
    write: (id: string, data: string) => Promise<void>
    // 调整指定终端的视口尺寸。
    resize: (id: string, cols: number, rows: number) => Promise<void>
    // 关闭/终止指定终端实例。
    kill: (id: string) => Promise<void>
    // 获取桌面目录路径作为默认兜底工作目录。
    getDesktopPath: () => Promise<string>
    // 检查指定终端实例是否存在运行中的子进程任务。
    hasRunningProcess: (id: string) => Promise<boolean>
    // 监听指定终端的数据输出事件。
    onData: (id: string, handler: (data: string) => void) => () => void
    // 监听指定终端的退出事件。
    onExit: (id: string, handler: (event: TerminalExitEvent) => void) => () => void
  }
}
