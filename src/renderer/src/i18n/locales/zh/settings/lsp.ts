export const lsp = {
  lsp: "LSP 设置",
  lspTitle: "语言服务协议 (LSP)",
  lspDesc: "管理代码语言服务协议 (LSP) 服务的安装探测与自定义路径配置",
  lspDoc: `### 语言服务协议 (LSP) 服务配置

为代码编辑与 Agent 工具提供跨语言的**语法分析、错误诊断与代码智能**能力。

#### 💡 核心机制
- **自动探测与装配**：系统会自动在系统的 \`PATH\` 中探测对应的默认可执行文件。若检测到已安装，将自动启用。
- **无隐式安装**：系统不会在后台隐式执行全局安装命令，环境完全受控。
- **自定义路径与参数**：若使用特定虚拟环境（如 Conda/venv）或特定 Node 版本，可指定绝对路径和参数。

---

#### 🛠️ 默认支持语言与服务
- **TypeScript / JavaScript**: \`typescript-language-server\` (\`npm i -g typescript-language-server typescript\`)
- **Python**: \`pyright\` (\`npm i -g pyright\`)
- **JSON / HTML / CSS**: \`vscode-langservers-extracted\` (\`npm i -g vscode-langservers-extracted\`)

---

#### 📝 自定义配置示例
在 \`~/.lx/config/agent.json\` 的 \`agent.lsp\` 节点中：
\`\`\`json
{
  "agent": {
    "lsp": {
      "python": {
        "enabled": true,
        "customPath": "/Users/user/.venv/bin/pyright-langserver",
        "args": ["--stdio"]
      },
      "typescript": {
        "enabled": true,
        "customPath": "/usr/local/bin/typescript-language-server",
        "args": ["--stdio"]
      }
    }
  }
}
\`\`\``,
  lspSearchPlaceholder: "搜索 LSP 服务...",
  lspRefresh: "刷新 LSP 状态",
  lspExplanation:
    "配置与检测语言服务协议 (LSP) 服务。未检测到服务时可配置自定义路径或手动触发安装，系统不会进行隐式自动安装。",
  lspNoMatches: "未找到匹配的 LSP 服务",
  lspDetected: "已检测到",
  lspNotDetected: "未检测到",
  lspDefaultBin: "默认二进制",
  lspManualInstall: "安装",
  lspCopyInstallCommand: "复制安装命令",
  lspCopyInstallSuccess: "安装命令已复制到剪贴板",
  lspInstallSuccess: "{{name}} 安装成功",
  lspInstallFailed: "{{name}} 安装失败",
  lspShowCustom: "配置自定义路径与参数",
  lspHideCustom: "收起自定义配置",
  lspCustomPath: "自定义二进制路径 / 命令",
  lspCustomPathPlaceholder: "例如：/usr/local/bin/{{defaultBin}}",
  lspCustomArgs: "自定义启动参数 (以空格分隔)",
  lspDisabled: "已禁用",
}
