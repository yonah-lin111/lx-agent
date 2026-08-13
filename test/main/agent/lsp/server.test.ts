import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { displayPath, findWorkspaceRoot, resolveServer } from "@/agent/lsp/server"

// 测试用临时目录（结束后清理）。
const tempDirs: string[] = []
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lx-lsp-server-test-"))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("resolveServer", () => {
  it("TS/JS 系列 → typescript-language-server + --stdio", () => {
    for (const language of ["typescript", "typescriptreact", "javascript", "javascriptreact"]) {
      const spec = resolveServer(language)
      expect(spec?.command).toBe("typescript-language-server")
      expect(spec?.args[0]).toBe("--stdio")
    }
  })

  it("本地存在 typescript/lib/tsserver.js 时仍只传 --stdio（v5 已移除 --tsserver-path）", () => {
    const dir = makeTempDir()
    mkdirSync(join(dir, "node_modules", "typescript", "lib"), { recursive: true })
    writeFileSync(join(dir, "node_modules", "typescript", "lib", "tsserver.js"), "")
    const spec = resolveServer("typescript")
    expect(spec?.args).toEqual(["--stdio"])
  })

  it("JSON/HTML/CSS 系列 → vscode-langservers-extracted 各子命令", () => {
    expect(resolveServer("json")?.command).toBe("vscode-json-language-server")
    expect(resolveServer("html")?.command).toBe("vscode-html-language-server")
    expect(resolveServer("css")?.command).toBe("vscode-css-language-server")
    expect(resolveServer("scss")?.command).toBe("vscode-css-language-server")
    expect(resolveServer("less")?.command).toBe("vscode-css-language-server")
  })

  it("Python → pyright-langserver", () => {
    expect(resolveServer("python")?.command).toBe("pyright-langserver")
  })

  it("无启动器语言（go/rust 等）返回 null", () => {
    expect(resolveServer("go")).toBeNull()
    expect(resolveServer("rust")).toBeNull()
    expect(resolveServer("vue")).toBeNull()
  })
})

describe("findWorkspaceRoot", () => {
  it("沿文件向上找最近的 marker 目录", () => {
    const root = makeTempDir()
    const nested = join(root, "a", "b")
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(root, "tsconfig.json"), "{}")
    // marker 在 root，文件在更深处：命中 root。
    expect(findWorkspaceRoot(join(nested, "x.ts"), ["tsconfig.json", ".git"], root)).toBe(root)
    // 深层 marker 优先于浅层（最近 marker）。
    writeFileSync(join(nested, "package.json"), "{}")
    expect(
      findWorkspaceRoot(join(nested, "x.ts"), ["tsconfig.json", "package.json", ".git"], root),
    ).toBe(nested)
  })

  it("未命中任何 marker 回退 cwd", () => {
    const root = makeTempDir()
    const nested = join(root, "a")
    mkdirSync(nested, { recursive: true })
    expect(findWorkspaceRoot(join(nested, "x.ts"), ["tsconfig.json", ".git"], root)).toBe(root)
  })
})

describe("displayPath", () => {
  it("cwd 内返回相对路径，越界返回绝对路径", () => {
    const cwdDir = makeTempDir()
    expect(displayPath(join(cwdDir, "src", "a.ts"), cwdDir)).toBe("src/a.ts")
    expect(displayPath("/outside/x.ts", cwdDir)).toBe("/outside/x.ts")
  })
})
