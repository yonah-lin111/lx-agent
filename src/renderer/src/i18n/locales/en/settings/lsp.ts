export const lsp = {
  lsp: "LSP Settings",
  lspTitle: "Language Server Protocol (LSP)",
  lspDesc: "Configure Language Server Protocol (LSP) services and custom paths",
  lspDoc: `### Language Server Protocol (LSP) Configuration

Provides **syntax analysis, error diagnostics, and code intelligence** for Agent tools and code editing across multiple programming languages.

#### 💡 Core Principles
- **Auto Detection & Probing**: The system scans system \`PATH\` for default server binaries and automatically attaches them when detected.
- **No Implicit Installation**: The app will never silently run global package managers in the background. Your environment remains strictly under your control.
- **Custom Binaries & Args**: Easily point to specific virtual environments (e.g., Conda, venv) or versioned Node binaries by providing custom absolute paths.

---

#### 🛠️ Default Supported Languages
- **TypeScript / JavaScript**: \`typescript-language-server\` (\`npm i -g typescript-language-server typescript\`)
- **Python**: \`pyright\` (\`npm i -g pyright\`)
- **JSON / HTML / CSS**: \`vscode-langservers-extracted\` (\`npm i -g vscode-langservers-extracted\`)

---

#### 📝 Custom Configuration Example
In \`~/.lx/config.json\` under \`agent.lsp\`:
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
  lspSearchPlaceholder: "Search LSP servers...",
  lspRefresh: "Refresh LSP Status",
  lspExplanation:
    "Configure and probe Language Server Protocol (LSP) servers. When a server is not detected, you can set a custom binary path or trigger manual installation. Implicit automatic installations are disabled.",
  lspNoMatches: "No matching LSP servers found",
  lspDetected: "Detected",
  lspNotDetected: "Not Detected",
  lspDefaultBin: "Default Binary",
  lspManualInstall: "Install",
  lspCopyInstallCommand: "Copy Install Command",
  lspCopyInstallSuccess: "Install command copied to clipboard",
  lspInstallSuccess: "{{name}} installed successfully",
  lspInstallFailed: "{{name}} installation failed",
  lspShowCustom: "Configure Custom Path & Args",
  lspHideCustom: "Hide Custom Config",
  lspCustomPath: "Custom Binary Path / Command",
  lspCustomPathPlaceholder: "e.g. /usr/local/bin/{{defaultBin}}",
  lspCustomArgs: "Custom Launch Args (space-separated)",
  lspDisabled: "Disabled",
}
