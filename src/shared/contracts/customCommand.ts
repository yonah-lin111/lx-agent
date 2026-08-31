// 自定义命令领域类型定义与 IPC 契约

export type CustomCommandType = "agentInput" | "agentMD"
export type CustomCommandScope = "user" | "project"

// AgentInput 对话命令配置
export interface AgentInputCommandData {
  name: string
  description: string
  argumentHint?: string
  content: string
}

// AgentMD Markdown 模板命令配置
export interface AgentMDCommandData {
  name: string
  description: string
  scope: "global" | "template"
  content: string
}

// 自定义命令条目（包含元数据与具体内容）
export interface CustomCommandDetailItem {
  name: string
  type: CustomCommandType
  scope: CustomCommandScope
  filePath: string
  description: string
  content: string
  argumentHint?: string // 仅 agentInput
  mdScope?: "global" | "template" // 仅 agentMD
}

export interface SaveCustomCommandInput {
  type: CustomCommandType
  scope: CustomCommandScope
  projectPath?: string // scope === "project" 时必须提供
  oldName?: string // 存在则为修改/重命名，不存在则为新建
  name: string
  description: string
  content: string
  argumentHint?: string // 仅 agentInput
  mdScope?: "global" | "template" // 仅 agentMD
}

export interface DeleteCustomCommandInput {
  type: CustomCommandType
  scope: CustomCommandScope
  name: string
  projectPath?: string
}

export interface ListCustomCommandsInput {
  type?: CustomCommandType
  scope?: CustomCommandScope
  projectPath?: string
}

// CustomCommand IPC 接口定义
export interface CustomCommandApi {
  customCommand: {
    list: (input?: ListCustomCommandsInput) => Promise<CustomCommandDetailItem[]>
    save: (
      input: SaveCustomCommandInput,
    ) => Promise<{ ok: true; item: CustomCommandDetailItem } | { ok: false; error: string }>
    delete: (
      input: DeleteCustomCommandInput,
    ) => Promise<{ ok: true } | { ok: false; error: string }>
  }
}
