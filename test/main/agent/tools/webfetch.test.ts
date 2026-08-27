import { describe, expect, it } from "vitest"
import { createWebFetchTool } from "@/agent/tools/webfetch"

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

// 模拟 Response（仅暴露 execute 用到的字段）。
const fakeResponse = (
  body: string,
  opts: { contentType?: string | null; ok?: boolean; status?: number } = {},
): Response => {
  const { contentType = "text/html", ok = true, status = 200 } = opts
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response
}

const htmlBody = "<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>"

describe("webfetch 工具", () => {
  it("参数校验：url 必填、format/timeout 枚举与范围", () => {
    const tool = createWebFetchTool(fetch)
    expect(tool.inputSchema.safeParse({}).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: "https://x.com", format: "xml" }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: "https://x.com", timeout: 0 }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: "https://x.com", timeout: 121 }).success).toBe(false)
    expect(
      tool.inputSchema.safeParse({ url: "https://x.com", format: "markdown", timeout: 30 }).success,
    ).toBe(true)
  })

  it("executionMode 为 parallel（只读无副作用）", () => {
    expect(createWebFetchTool(fetch).executionMode).toBe("parallel")
  })

  it("阻断私网/内网地址（SSRF），不发起请求", async () => {
    const hosts = [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://100.64.0.1/",
      "http://localhost/",
      "http://[::1]/",
    ]
    let fetchCalls = 0
    const tool = createWebFetchTool((async () => {
      fetchCalls += 1
      return fakeResponse("should not fetch")
    }) as typeof fetch)
    for (const url of hosts) {
      await expect(tool.execute("t1", { url })).rejects.toThrow(/Private\/internal network addresses are not allowed|私网|内网/)
    }
    expect(fetchCalls).toBe(0)
  })

  it("拒绝非 http/https scheme", async () => {
    const tool = createWebFetchTool(fetch)
    await expect(tool.execute("t1", { url: "ftp://example.com/x" })).rejects.toThrow(/http\/https/)
    await expect(tool.execute("t1", { url: "file:///etc/passwd" })).rejects.toThrow(/http\/https/)
  })

  it("HTML → markdown（turndown）", async () => {
    const tool = createWebFetchTool((async () => fakeResponse(htmlBody)) as typeof fetch)
    const result = await tool.execute("t1", { url: "https://example.com", format: "markdown" })
    expect(toolText(result)).toContain("# Title")
    expect(toolText(result)).toContain("Hello")
    expect(result.details).toMatchObject({ url: "https://example.com", provider: "webfetch" })
  })

  it("HTML → text（htmlparser2 提取文本）", async () => {
    const tool = createWebFetchTool((async () => fakeResponse(htmlBody)) as typeof fetch)
    const result = await tool.execute("t1", { url: "https://example.com", format: "text" })
    const text = toolText(result)
    expect(text).toContain("Title")
    expect(text).toContain("Hello world")
    expect(text).not.toContain("<h1>")
  })

  it("纯文本 content-type 原样返回（不转换）", async () => {
    const tool = createWebFetchTool((async () =>
      fakeResponse("plain text\nline2", { contentType: "text/plain" })) as typeof fetch)
    const result = await tool.execute("t1", { url: "https://example.com", format: "markdown" })
    expect(toolText(result)).toBe("plain text\nline2")
  })

  it("format=html 返回原始 HTML", async () => {
    const tool = createWebFetchTool((async () => fakeResponse(htmlBody)) as typeof fetch)
    const result = await tool.execute("t1", { url: "https://example.com", format: "html" })
    expect(toolText(result)).toContain("<h1>Title</h1>")
  })

  it("超 5MB 响应抛错", async () => {
    const big = "x".repeat(5 * 1024 * 1024 + 1)
    const tool = createWebFetchTool((async () => fakeResponse(big)) as typeof fetch)
    await expect(tool.execute("t1", { url: "https://example.com" })).rejects.toThrow(/5MB/)
  })

  it("非 2xx 状态抛错", async () => {
    const tool = createWebFetchTool((async () =>
      fakeResponse("not found", { status: 404, ok: false })) as typeof fetch)
    await expect(tool.execute("t1", { url: "https://example.com" })).rejects.toThrow(/404/)
  })
})
