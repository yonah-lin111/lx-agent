// 终端标签页项数据结构。
export interface TerminalTabItem {
  // 终端唯一 ID。
  id: string
  // 标签标题（默认由编号或工作区命名）。
  title: string
  // 用户自定义标签标题。
  customTitle?: string
  // 终端启动工作目录。
  cwd?: string
  // 关联项目 ID。
  projectId?: string
  // 关联条目 ID。
  itemId?: string
  // 创建时间戳。
  createdAt: number
}

// 终端状态配置。
export interface TerminalState {
  // 标签列表。
  tabs: TerminalTabItem[]
  // 当前激活的标签 ID。
  activeTabId: string | null
  // 累计创建计数（用于生成自增默认标题）。
  terminalCounter: number
}
