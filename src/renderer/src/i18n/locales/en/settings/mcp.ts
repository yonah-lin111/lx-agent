export const mcp = {
  mcp: "MCP Servers",
  mcpTitle: "Model Context Protocol (MCP) Servers",
  mcpDesc: "Configure Model Context Protocol (MCP) server integrations and environment",
  mcpDoc: `### Model Context Protocol (MCP) Configuration

Connect external data sources, local development tools, and custom scripts to your Agent using the open **MCP standard**.

#### 💡 Core Mechanism
- **Stdio IPC Transport**: The Agent launches MCP servers as subprocesses communicating over standard I/O streams.
- **Dynamic Tool Discovery**: Upon connection, all tools advertised by the server are automatically imported into the Agent runtime toolset.
- **Live Reload & Fault Isolation**: Modifying and saving configurations triggers an instant hot-reconnect. Failures in one server will not disrupt other integrations.

---

#### ⚙️ Configuration Fields
- **Server Name (ID)**：Unique key used to namespace tools (e.g. \`filesystem_read_file\`).
- **Executable Command**：Process binary (e.g., \`npx\`, \`node\`, \`python\`, \`docker\`).
- **Command Arguments**：Arguments passed to the process (space-separated).
- **Environment Variables**：Key-value pairs injected into the server process.
- **Working Directory (CWD)**：Working directory (defaults to home workspace).

---

#### 📝 Common MCP Examples

**1. Local Filesystem Server**
\`\`\`json
{
  "filesystem": {
    "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/Users/user/projects"]
  }
}
\`\`\`

**2. GitHub Server**
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

**3. SQLite Database Server**
\`\`\`json
{
  "sqlite": {
    "command": ["uvx", "mcp-server-sqlite", "--db-path", "/path/to/database.db"]
  }
}
\`\`\``,
  mcpSearchPlaceholder: "Search MCP servers...",
  mcpReconnectAll: "Reconnect All MCP Servers",
  mcpExplanation:
    "Configure and manage Model Context Protocol (MCP) servers. The Agent dynamically loads tools from connected servers and supports live reloading.",
  mcpNoMatches: "No matching MCP servers found",
  mcpNoServers: "No MCP servers configured yet",
  mcpAddServer: "Add MCP Server",
  mcpEditServer: "Edit MCP Server",
  mcpConnected: "Connected",
  mcpConnecting: "Connecting...",
  mcpFailed: "Connection Failed",
  mcpTools: "tools",
  mcpCommand: "Command",
  mcpEnvCount: "{{count}} environment variables configured",
  mcpRegisteredTools: "Registered Tools ({{count}})",
  mcpServerName: "Server Name (ID)",
  mcpExecutableCommand: "Executable Command",
  mcpArgs: "Command Args (space-separated)",
  mcpCwd: "Working Directory (CWD)",
  mcpCwdPlaceholder: "Leave blank to default to home directory",
  mcpEnvironment: "Environment Variables",
  mcpAddEnvRow: "Add Variable",
  mcpTimeout: "Timeout (ms)",
  mcpNameRequired: "Server name is required",
  mcpCommandRequired: "Executable command is required",
  mcpNameDuplicate: "Server name already exists",
  mcpDeleteSuccess: "Deleted {{name}}",
  mcpReconnectSuccess: "MCP servers reconnected successfully",
  mcpReconnectFailed: "Failed to reconnect MCP servers",
  mcpPresetsTitle: "Recommended Presets",
  mcpPresetBadge: "Preset",
  mcpPresetContext7Desc: "Up-to-date library documentation and code examples for any framework",
  mcpPresetCodegraphDesc: "Local code knowledge graph for faster code navigation and review",
  mcpPresetCodebaseMemoryDesc: "Persistent codebase memory and architecture graph for AI agents",
  mcpPresetInstalled: "Installed",
  mcpPresetNotInstalled: "Not Installed",
  mcpPresetInstall: "Install",
  mcpPresetInstalling: "Installing...",
  mcpPresetEnable: "Enable",
  mcpPresetNeedsInstall: "Install it before enabling",
  mcpPresetNeedsNode: "Node.js (npx) is required, please install it first",
  mcpPresetInstallSuccess: "{{name}} installed successfully",
  mcpPresetInstallFailed: "Failed to install {{name}}",
  mcpPresetCopyInstallCommand: "Copy install command",
  mcpPresetCopySuccess: "Install command copied",
  mcpPresetHomepage: "Homepage",
}
