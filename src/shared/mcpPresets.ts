// MCP 预设 id。
export type McpPresetId = "context7" | "codegraph" | "codebase-memory-mcp"

// 预设安装类型：npx 随 npm 运行时提供；npm-global 需要全局安装。
export type McpPresetInstallKind = "npx" | "npm-global"

// MCP 预设定义（main 探测/安装与 renderer 渲染共用）。
export interface McpPresetDefinition {
  id: McpPresetId
  // 品牌展示名（不翻译）。
  displayName: string
  // 预设 MCP server 启动命令。
  command: string[]
  installKind: McpPresetInstallKind
  // 安装状态探测目标二进制。
  probeBin: string
  // 全局安装命令（installKind = npm-global 时提供）。
  installCommand?: string
  homepage: string
}

// 内置 MCP 预设清单。
export const MCP_PRESETS: readonly McpPresetDefinition[] = [
  {
    id: "context7",
    displayName: "Context7",
    command: ["npx", "-y", "@upstash/context7-mcp@latest"],
    installKind: "npx",
    probeBin: "npx",
    homepage: "https://github.com/upstash/context7",
  },
  {
    id: "codegraph",
    displayName: "CodeGraph",
    command: ["codegraph", "serve", "--mcp"],
    installKind: "npm-global",
    probeBin: "codegraph",
    installCommand: "npm i -g @colbymchenry/codegraph@latest",
    homepage: "https://github.com/colbymchenry/codegraph",
  },
  {
    id: "codebase-memory-mcp",
    displayName: "Codebase Memory",
    command: ["codebase-memory-mcp"],
    installKind: "npm-global",
    probeBin: "codebase-memory-mcp",
    installCommand: "npm i -g codebase-memory-mcp@latest",
    homepage: "https://github.com/DeusData/codebase-memory-mcp",
  },
]

// 预设写入 MCP 配置的默认启动超时（毫秒）。
export const MCP_PRESET_DEFAULT_TIMEOUT = 30_000

// 预设安装状态（main 二进制探测结果）。
export interface McpPresetStatusItem {
  id: McpPresetId
  installed: boolean
  detectedPath: string | null
}

// 预设安装结果（detail 为命令输出摘要，用于失败排查）。
export interface McpPresetInstallResult {
  success: boolean
  detail?: string
}
