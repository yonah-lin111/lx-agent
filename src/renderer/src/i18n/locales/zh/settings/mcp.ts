export const mcp = {
  mcp: "MCP 服务",
  mcpTitle: "Model Context Protocol (MCP) 服务",
  mcpDesc: "配置与管理模型上下文协议 (MCP) 扩展服务器及环境变量",
  mcpDoc: `### 模型上下文协议 (MCP) 服务配置

通过开放的 **MCP 协议**为 Agent 接入外部数据源、本地工具及自动化脚本。

#### 💡 核心机制
- **Stdio 进程通信**：Agent 启动子进程并通过标准输入输出与 MCP Server 进行双向通信。
- **动态工具发现**：连接成功后，Agent 会自动拉取所有暴露的 Tools 并注册到运行时工具箱。
- **热重连与隔离**：保存配置后自动重新加载并连接，单个 Server 失败不会影响其他服务。

---

#### ⚙️ 配置字段说明
- **服务名称 (ID)**：唯一标识，用于生成隔离的工具名前缀（如 \`filesystem_read_file\`）。
- **可执行命令**：启动进程命令（如 \`npx\`, \`node\`, \`python\`, \`docker\` 等）。
- **命令参数**：传递给进程的参数（空格分隔）。
- **环境变量**：注入进程的环境变量（如 API Token）。
- **工作目录**：进程运行目录（默认继承主工作区）。

---

#### 📝 常用 MCP 服务示例

**1. 本地文件系统 (Filesystem)**
\`\`\`json
{
  "filesystem": {
    "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/Users/user/projects"]
  }
}
\`\`\`

**2. GitHub 服务**
\`\`\`json
{
  "github": {
    "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
    "environment": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxx"
    }
  }
}
\`\`\`

**3. SQLite 数据库服务**
\`\`\`json
{
  "sqlite": {
    "command": ["uvx", "mcp-server-sqlite", "--db-path", "/path/to/database.db"]
  }
}
\`\`\``,
  mcpSearchPlaceholder: "搜索 MCP 服务...",
  mcpReconnectAll: "重连所有 MCP 服务",
  mcpExplanation:
    "配置与管理 Model Context Protocol (MCP) 服务。Agent 将自动加载已连接服务的工具集并支持动态重连。",
  mcpNoMatches: "未找到匹配的 MCP 服务",
  mcpNoServers: "暂未配置 MCP 服务",
  mcpAddServer: "添加 MCP 服务",
  mcpEditServer: "编辑 MCP 服务",
  mcpConnected: "已连接",
  mcpConnecting: "连接中...",
  mcpFailed: "连接失败",
  mcpTools: "个工具",
  mcpCommand: "命令",
  mcpEnvCount: "配置了 {{count}} 个环境变量",
  mcpRegisteredTools: "查看已注册工具 ({{count}})",
  mcpServerName: "服务名称 (ID)",
  mcpExecutableCommand: "可执行命令",
  mcpArgs: "命令参数 (以空格分隔)",
  mcpCwd: "工作目录 (CWD)",
  mcpCwdPlaceholder: "留空默认继承主目录",
  mcpEnvironment: "环境变量",
  mcpAddEnvRow: "添加环境变量",
  mcpTimeout: "超时时间 (毫秒)",
  mcpNameRequired: "服务名称不能为空",
  mcpCommandRequired: "可执行命令不能为空",
  mcpNameDuplicate: "服务名称已存在",
  mcpDeleteSuccess: "已删除 {{name}}",
  mcpReconnectSuccess: "MCP 服务重连成功",
  mcpReconnectFailed: "MCP 服务重连失败",
  mcpPresetsTitle: "推荐预设",
  mcpPresetBadge: "预设",
  mcpPresetContext7Desc: "为任意框架提供最新的库文档与代码示例",
  mcpPresetCodegraphDesc: "本地代码知识图谱，加速代码导航与评审",
  mcpPresetCodebaseMemoryDesc: "为 AI Agent 提供持久化代码库记忆与架构图谱",
  mcpPresetInstalled: "已安装",
  mcpPresetNotInstalled: "未安装",
  mcpPresetInstall: "安装",
  mcpPresetInstalling: "安装中...",
  mcpPresetEnable: "启用",
  mcpPresetNeedsInstall: "请先安装后再启用",
  mcpPresetNeedsNode: "需要先安装 Node.js (npx)",
  mcpPresetInstallSuccess: "{{name}} 安装成功",
  mcpPresetInstallFailed: "{{name}} 安装失败",
  mcpPresetCopyInstallCommand: "复制安装命令",
  mcpPresetCopySuccess: "安装命令已复制",
  mcpPresetHomepage: "官网",
}
