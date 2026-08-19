// 终端分屏方向：horizontal 表示左右并排（Cmd+D），vertical 表示上下并排（Cmd+Shift+D）。
export type SplitDirection = "horizontal" | "vertical"

// 分屏叶子节点：承载一个具体的终端 Pane。
export interface SplitLeafNode {
  type: "leaf"
  paneId: string
}

// 分屏容器节点：将空间沿水平或垂直方向一分为二。
export interface SplitContainerNode {
  type: "split"
  id: string
  direction: SplitDirection
  children: [SplitNode, SplitNode]
  ratio?: number
}

// 二叉分屏树节点联合类型。
export type SplitNode = SplitLeafNode | SplitContainerNode

// 单个终端视口 Pane 数据结构。
export interface TerminalPaneItem {
  // Pane 唯一 ID（对应一个独立的 PTY 进程）。
  id: string
  // 终端启动工作目录。
  cwd?: string
  // 关联项目 ID。
  projectId?: string
  // 关联条目 ID。
  itemId?: string
  // 创建时间戳。
  createdAt: number
}

// 终端标签页项数据结构（包含二叉分屏树与 Pane 映射表）。
export interface TerminalTabItem {
  // 终端 Tab 唯一 ID。
  id: string
  // 标签标题（默认由编号或工作区命名）。
  title: string
  // 用户自定义标签标题。
  customTitle?: string
  // 当前 Tab 下包含的所有分屏 Pane 字典表。
  panes: Record<string, TerminalPaneItem>
  // 二叉分屏树根节点。
  rootNode: SplitNode
  // 当前 Tab 下处于焦点的 Pane ID。
  activePaneId: string
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
