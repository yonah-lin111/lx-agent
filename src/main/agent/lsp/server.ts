import { existsSync } from "node:fs"
import { dirname, join, relative } from "node:path"

// LSP server 启动器规格（resolveServer 产物）。
export interface LspServerSpec {
  language: string
  command: string
  args: string[]
  // workspace root 探测 marker（沿文件向上找最近的 marker 目录）。
  rootMarkers: string[]
}

// 各启动器的 root 探测 marker（优先找项目配置文件，回退 .git）。
const SERVER_ROOT_MARKERS: Record<string, string[]> = {
  typescript: ["tsconfig.json", "jsconfig.json", "package.json", ".git"],
  json: ["package.json", ".git"],
  html: ["package.json", ".git"],
  css: ["package.json", ".git"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", ".git"],
}

// 从文件目录向上查找最近的 marker 目录（对齐 opencode StrictNearestRoot）；
// 一路找到文件系统根仍未命中时回退到会话 cwd。
export const findWorkspaceRoot = (filePath: string, markers: string[], cwd: string): string => {
  let directory = dirname(filePath)
  for (;;) {
    for (const marker of markers) {
      if (existsSync(join(directory, marker))) return directory
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return cwd
}

// 解析语言 → server 启动器；无启动器的语言返回 null（错误由调用方回灌）。
export const resolveServer = (language: string): LspServerSpec | null => {
  switch (language) {
    case "typescript":
    case "typescriptreact":
    case "javascript":
    case "javascriptreact": {
      // typescript-language-server v5 已移除 --tsserver-path，改为从 workspace root 自动探测本地 tsserver。
      return {
        language,
        command: "typescript-language-server",
        args: ["--stdio"],
        rootMarkers: SERVER_ROOT_MARKERS.typescript,
      }
    }
    case "json":
      return {
        language,
        command: "vscode-json-language-server",
        args: ["--stdio"],
        rootMarkers: SERVER_ROOT_MARKERS.json,
      }
    case "html":
      return {
        language,
        command: "vscode-html-language-server",
        args: ["--stdio"],
        rootMarkers: SERVER_ROOT_MARKERS.html,
      }
    case "css":
    case "scss":
    case "less":
      return {
        language,
        command: "vscode-css-language-server",
        args: ["--stdio"],
        rootMarkers: SERVER_ROOT_MARKERS.css,
      }
    case "python":
      return {
        language,
        command: "pyright-langserver",
        args: ["--stdio"],
        rootMarkers: SERVER_ROOT_MARKERS.python,
      }
    default:
      return null
  }
}

// 供测试断言：相对路径展示（工具内容文本用，超界保留绝对路径）。
export const displayPath = (absolutePath: string, cwd: string): string => {
  const rel = relative(cwd, absolutePath)
  return rel && !rel.startsWith("..") ? rel : absolutePath
}
