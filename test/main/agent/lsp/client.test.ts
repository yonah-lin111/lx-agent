import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { LspClient } from "@/agent/lsp/client"
import type { LspServerSpec } from "@/agent/lsp/server"

// fake LSP server 绝对路径（随测试文件走 node_modules 解析）。
const FAKE_SERVER = fileURLToPath(new URL("./fixtures/fake-server.mjs", import.meta.url))

const fakeSpec = (): LspServerSpec => ({
  language: "typescript",
  command: process.execPath,
  args: [FAKE_SERVER],
  rootMarkers: [],
})

// didOpen 测试需要真实文件（客户端读取内容发送）。
const tempDirs: string[] = []
const makeTempFile = (name: string, content: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "lx-lsp-client-test-"))
  tempDirs.push(dir)
  const filePath = join(dir, name)
  writeFileSync(filePath, content)
  return filePath
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("LspClient", () => {
  it("initialize + 请求往返：位置参数 0-based 原样透传（工具层负责转换）", async () => {
    const client = new LspClient(fakeSpec(), { requestTimeoutMs: 2_000 })
    await client.initialize("file:///tmp/root")
    const result = await client.goToDefinition("/tmp/a.ts", 4, 2)
    // fake server 回显 textDocument.uri 与 position。
    expect(result).toEqual({
      uri: "file:///tmp/a.ts",
      range: { start: { line: 4, character: 2 }, end: { line: 4, character: 3 } },
    })
    await client.shutdown()
  })

  it("文档请求前自动发送 didOpen（无 didOpen 时服务器返回空）", async () => {
    const filePath = makeTempFile("a.ts", "export function source() {}\n")
    const client = new LspClient(fakeSpec(), { requestTimeoutMs: 2_000 })
    await client.initialize("file:///tmp/root")
    // fake server 仅对 didOpen 过的文档返回符号。
    const symbols = await client.documentSymbol(filePath)
    expect(Array.isArray(symbols) && symbols.length > 0).toBe(true)
    expect((symbols as Array<{ name: string }>)[0]?.name).toBe("opened-symbol")
    await client.shutdown()
  })

  it("首连 “No Project” 竞态自动重试成功", async () => {
    const filePath = makeTempFile("a.ts", "export function source() {}\n")
    // 经 process.env 传给子进程（LspClient 构造时复制 env）。
    process.env.FAKE_LSP_NOPROJECT = "1"
    const client = new LspClient(fakeSpec(), { requestTimeoutMs: 2_000 })
    delete process.env.FAKE_LSP_NOPROJECT
    await client.initialize("file:///tmp/root")
    // 第一次 documentSymbol 抛 "No Project"，客户端重试后返回符号。
    const symbols = await client.documentSymbol(filePath)
    expect((symbols as Array<{ name: string }>)[0]?.name).toBe("opened-symbol")
    await client.shutdown()
  })

  it("spawn 失败（命令不存在）时 initialize 立即 reject", async () => {
    const client = new LspClient(
      { language: "typescript", command: "lx-no-such-lsp-binary", args: [], rootMarkers: [] },
      { initTimeoutMs: 5_000 },
    )
    await expect(client.initialize("file:///tmp/root")).rejects.toThrow(/lx-no-such-lsp-binary/)
    expect(client.isCrashed).toBe(true)
    await client.shutdown()
  })

  it("server 不响应时请求超时 reject", async () => {
    // 经 process.env 传给子进程（LspClient 构造时复制 env）。
    process.env.FAKE_LSP_HANG = "1"
    const client = new LspClient(fakeSpec(), { requestTimeoutMs: 100 })
    delete process.env.FAKE_LSP_HANG
    await client.initialize("file:///tmp/root")
    await expect(client.goToDefinition("/tmp/a.ts", 1, 1)).rejects.toThrow(/超时/)
    await client.shutdown()
  })

  it("shutdown 幂等（重复调用不抛错）", async () => {
    const client = new LspClient(fakeSpec(), { requestTimeoutMs: 2_000 })
    await client.initialize("file:///tmp/root")
    await client.shutdown()
    await client.shutdown()
  })
})
