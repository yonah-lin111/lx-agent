import type { AgentTool } from "../core/types"

/**
 * 工具注册表：注册、激活集管理、cwd 绑定。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool<any>>()
  private activeNames: string[] = []
  readonly cwd: string

  constructor(cwd: string) {
    this.cwd = cwd
  }

  // 注册工具；重名抛错。
  register(tool: AgentTool<any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool name already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  // 按名称激活工具集；未知名抛错。
  setActive(names: string[]): void {
    for (const name of names) {
      if (!this.tools.has(name)) {
        throw new Error(`Unknown tool name: ${name}`)
      }
    }
    this.activeNames = [...names]
  }

  // 当前激活工具集。
  getActive(): AgentTool<any>[] {
    return this.activeNames.map((name) => this.tools.get(name)!).filter(Boolean)
  }

  // 全部已注册工具。
  getAll(): AgentTool<any>[] {
    return [...this.tools.values()]
  }
}
