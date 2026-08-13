import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import type { LspClient } from "@/agent/lsp/client"
import type { LspClientResult, LspManager } from "@/agent/lsp/lspManager"
import { createLspTool, type LspToolDeps } from "@/agent/tools/lsp"

// 记录调用参数并回放固定结果的桩 client。
class RecordingClient {
  calls: Array<{ method: string; args: unknown[] }> = []
  result: unknown = null

  async goToDefinition(filePath: string, line0: number, character0: number) {
    this.calls.push({ method: "goToDefinition", args: [filePath, line0, character0] })
    return this.result as never
  }
  async findReferences() {
    return []
  }
  async hover() {
    return this.result as never
  }
  async documentSymbol() {
    return null
  }
  async workspaceSymbol() {
    return null
  }
  async goToImplementation() {
    return null
  }
  async prepareCallHierarchy() {
    return null
  }
  async incomingCalls() {
    return null
  }
  async outgoingCalls() {
    return null
  }
}

const tempDirs: string[] = []
const makeTempCwd = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lx-lsp-tool-test-"))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 装配工具：getClient 桩 + 固定 sessionId。
const makeTool = (
  managerResult: LspClientResult,
  getSessionId: () => string | null = () => "s1",
): { tool: ReturnType<typeof createLspTool>; client: RecordingClient } => {
  const client = new RecordingClient()
  const manager = { getClient: async (): Promise<LspClientResult> => managerResult }
  const tool = createLspTool({
    lspManager: manager as unknown as LspManager,
    getSessionId,
    cwd: "/tmp/lx-cwd",
  } satisfies LspToolDeps)
  return { tool, client }
}

describe("createLspTool", () => {
  it("越界路径拒绝", async () => {
    const { tool } = makeTool({ error: "unused" })
    const result = await tool.execute("1", {
      operation: "goToDefinition",
      filePath: "../escape.ts",
      line: 1,
      character: 1,
    })
    expect(result.content[0]).toMatchObject({ type: "text" })
    expect((result.content[0] as { text: string }).text).toContain("拒绝访问项目目录之外的文件")
  })

  it("无活动会话返回错误", async () => {
    const { tool } = makeTool({ error: "unused" }, () => null)
    const result = await tool.execute("1", {
      operation: "goToDefinition",
      filePath: "a.ts",
      line: 1,
      character: 1,
    })
    expect((result.content[0] as { text: string }).text).toContain("无活动会话")
  })

  it("不支持语言 / 无启动器错误回灌", async () => {
    const { tool } = makeTool({ error: "语言 go 仅有扩展名映射，未提供 LSP server 启动器" })
    const result = await tool.execute("1", {
      operation: "goToDefinition",
      filePath: "a.go",
      line: 1,
      character: 1,
    })
    expect((result.content[0] as { text: string }).text).toContain("未提供 LSP server 启动器")
    expect((result as { details: { error?: string } }).details.error).toContain("未提供")
  })

  it("goToDefinition：0-based 转换 + 紧凑文本 + details 绝对路径", async () => {
    const cwd = makeTempCwd()
    mkdirSync(join(cwd, "src"), { recursive: true })
    writeFileSync(join(cwd, "src", "a.ts"), "export function source() {}\n")
    writeFileSync(join(cwd, "src", "target.ts"), "line1\nconst target = 42\nline3\n")
    const client = new RecordingClient()
    // 桩 client 直接返回固定 location（不经过 manager 语言判定）。
    client.result = {
      uri: pathToFileURL(join(cwd, "src", "target.ts")).toString(),
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 15 } },
    }
    const manager = {
      getClient: async (): Promise<LspClientResult> => ({ client: client as unknown as LspClient }),
    }
    const tool = createLspTool({
      lspManager: manager as unknown as LspManager,
      getSessionId: () => "s1",
      cwd,
    } satisfies LspToolDeps)

    const result = await tool.execute("1", {
      operation: "goToDefinition",
      filePath: "src/a.ts",
      line: 1,
      character: 1,
    })
    // 位置转 0-based 发给 client。
    expect(client.calls[0]?.args).toEqual([join(cwd, "src", "a.ts"), 0, 0])
    // 文本：操作 + 目标 + 相对路径行 + 行签名。
    expect((result.content[0] as { text: string }).text).toContain("goToDefinition src/a.ts:1:1")
    expect((result.content[0] as { text: string }).text).toContain(
      "src/target.ts:2:1|const target = 42",
    )
    // details：绝对路径 + 1-based。
    const details = (
      result as {
        details: {
          results: Array<{ filePath: string; line: number; character: number; label: string }>
        }
      }
    ).details
    expect(details.results).toEqual([
      {
        filePath: join(cwd, "src", "target.ts"),
        line: 2,
        character: 1,
        label: "const target = 42",
      },
    ])
  })

  it("hover：文本进 details.text，无位置行", async () => {
    const cwd = makeTempCwd()
    writeFileSync(join(cwd, "a.ts"), "const x = 1\n")
    const client = new RecordingClient()
    client.result = { contents: { kind: "markdown", value: "**类型**: `number`" } }
    const manager = {
      getClient: async (): Promise<LspClientResult> => ({ client: client as unknown as LspClient }),
    }
    const tool = createLspTool({
      lspManager: manager as unknown as LspManager,
      getSessionId: () => "s1",
      cwd,
    } satisfies LspToolDeps)
    const result = await tool.execute("1", {
      operation: "hover",
      filePath: "a.ts",
      line: 1,
      character: 1,
    })
    const details = result.details as { text?: string; results: unknown[] }
    expect(details.text).toBe("**类型**: `number`")
    expect(details.results).toEqual([])
  })

  it("请求异常回灌 error details", async () => {
    const cwd = makeTempCwd()
    writeFileSync(join(cwd, "a.ts"), "const x = 1\n")
    const manager = {
      getClient: async (): Promise<LspClientResult> => {
        return {
          client: {
            goToDefinition: async () => {
              throw new Error("boom")
            },
          } as unknown as LspClient,
        }
      },
    }
    const tool = createLspTool({
      lspManager: manager as unknown as LspManager,
      getSessionId: () => "s1",
      cwd,
    } satisfies LspToolDeps)
    const result = await tool.execute("1", {
      operation: "goToDefinition",
      filePath: "a.ts",
      line: 1,
      character: 1,
    })
    expect((result.content[0] as { text: string }).text).toContain("boom")
    expect((result.details as { error: string }).error).toBe("boom")
  })
})
