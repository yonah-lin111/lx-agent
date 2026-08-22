import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Diagnostic } from "vscode-languageserver-types"
import {
  checkLspDiagnosticsFeedback,
  formatLspDiagnosticsForFeedback,
  type LspFeedbackDeps,
} from "@/agent/lsp/feedback"
import type { LspManager } from "@/agent/lsp/lspManager"
import { createEditTool } from "@/agent/tools/edit"
import { createWriteTool } from "@/agent/tools/write"

const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-diag-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

describe("LSP Diagnostics Feedback", () => {
  it("formatLspDiagnosticsForFeedback 格式化错误诊断行", () => {
    const diags: Diagnostic[] = [
      {
        range: { start: { line: 9, character: 4 }, end: { line: 9, character: 10 } },
        severity: 1,
        message: "Cannot find name 'foo'",
        code: 2304,
      },
      {
        range: { start: { line: 15, character: 0 }, end: { line: 15, character: 5 } },
        severity: 1,
        message: "Type 'string' is not assignable to type 'number'",
        code: "TS2322",
      },
    ]

    const formatted = formatLspDiagnosticsForFeedback("src/index.ts", diags)
    expect(formatted).toContain("[LSP Diagnostics after modification (2 errors)]:")
    expect(formatted).toContain("- src/index.ts:10:5: Cannot find name 'foo' (2304)")
    expect(formatted).toContain(
      "- src/index.ts:16:1: Type 'string' is not assignable to type 'number' (TS2322)",
    )
  })

  it("checkLspDiagnosticsFeedback 无 session 或无报错时静默", async () => {
    const res1 = await checkLspDiagnosticsFeedback("test.ts", "/abs/test.ts", "/abs")
    expect(res1.textSuffix).toBe("")
    expect(res1.errors).toEqual([])

    const mockLspManager = {
      getDiagnostics: vi.fn().mockResolvedValue([
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          severity: 2, // warning
          message: "Unused variable",
        },
      ]),
    } as unknown as LspManager

    const deps: LspFeedbackDeps = {
      lspManager: mockLspManager,
      getSessionId: () => "sess-1",
    }

    const res2 = await checkLspDiagnosticsFeedback("test.ts", "/abs/test.ts", "/abs", deps)
    expect(res2.textSuffix).toBe("")
    expect(res2.errors).toEqual([])
  })

  it("checkLspDiagnosticsFeedback 遇到 error 时返回诊断后缀", async () => {
    const mockLspManager = {
      getDiagnostics: vi.fn().mockResolvedValue([
        {
          range: { start: { line: 4, character: 2 }, end: { line: 4, character: 10 } },
          severity: 1, // error
          message: "Syntax error",
        },
      ]),
    } as unknown as LspManager

    const deps: LspFeedbackDeps = {
      lspManager: mockLspManager,
      getSessionId: () => "sess-1",
    }

    const res = await checkLspDiagnosticsFeedback("src/app.ts", "/abs/src/app.ts", "/abs", deps)
    expect(res.textSuffix).toContain("[LSP Diagnostics after modification (1 error)]:")
    expect(res.textSuffix).toContain("- src/app.ts:5:3: Syntax error")
    expect(res.errors.length).toBe(1)
  })

  it("write 工具在有 LSP error 时自动附加诊断到返回文本与 details", async () => {
    const cwd = await makeTmp()
    const mockLspManager = {
      getDiagnostics: vi.fn().mockResolvedValue([
        {
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
          severity: 1,
          message: "Identifier expected",
        },
      ]),
    } as unknown as LspManager

    const write = createWriteTool(cwd, {
      lspManager: mockLspManager,
      getSessionId: () => "s1",
    })

    const w = await write.execute("t1", { path: "bad.ts", content: "const = 1;" })
    expect(toolText(w)).toContain("已写入")
    expect(toolText(w)).toContain("[LSP Diagnostics after modification (1 error)]:")
    expect(toolText(w)).toContain("- bad.ts:2:1: Identifier expected")
    expect((w.details as any)?.diagnostics).toBeDefined()
  })

  it("edit 工具在有 LSP error 时自动附加诊断到返回文本与 details", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "code.ts"), "const x: number = 10;\n")
    const mockLspManager = {
      getDiagnostics: vi.fn().mockResolvedValue([
        {
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 7 } },
          severity: 1,
          message: "Type 'string' is not assignable to type 'number'",
        },
      ]),
    } as unknown as LspManager

    const edit = createEditTool(cwd, {
      lspManager: mockLspManager,
      getSessionId: () => "s1",
    })

    const e = await edit.execute("t1", {
      path: "code.ts",
      edits: [{ oldText: "10", newText: "'hello'" }],
    })
    expect(toolText(e)).toContain("已替换 1 处内容")
    expect(toolText(e)).toContain("[LSP Diagnostics after modification (1 error)]:")
    expect(toolText(e)).toContain("Type 'string' is not assignable to type 'number'")
    expect((e.details as any)?.diagnostics).toBeDefined()
  })
})
