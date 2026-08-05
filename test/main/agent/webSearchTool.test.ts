import { describe, expect, it } from "vitest"
import { createWebSearchTool } from "@/agent/tools/webSearch"

const EXA_URL = "https://mcp.exa.ai/mcp"
const TAVILY_URL = "https://api.tavily.com/search"

// 模拟 Response 对象（仅暴露 execute 用到的字段）。
const fakeResponse = (body: string, ok = true, status = 200): Response =>
  ({ ok, status, text: async () => body }) as unknown as Response

// 按请求 URL 分发的模拟 fetch（忽略查询参数，便于同时覆盖带 Key 与匿名请求）。
const makeFetcher = (handlers: Record<string, (body: unknown) => Response>): typeof fetch =>
  (async (url, init) => {
    const target = String(url).split("?")[0]!
    const handler = handlers[target]
    if (!handler) throw new Error(`Unexpected request: ${target}`)
    return handler(JSON.parse(String(init?.body ?? "{}")))
  }) as typeof fetch

const exaHandler =
  (text = "exa result") =>
  (_body: unknown): Response =>
    fakeResponse(JSON.stringify({ result: { content: [{ type: "text", text }] } }))

const tavilyHandler =
  (text = "tavily result") =>
  (_body: unknown): Response =>
    fakeResponse(JSON.stringify({ answer: text, results: [] }))

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

describe("web_search 工具", () => {
  it("参数校验：空 query / 越界 numResults 拒绝", () => {
    const tool = createWebSearchTool(fetch, () => ({ exaApiKey: "", tavilyApiKey: "" }))
    expect(tool.inputSchema.safeParse({ query: "   " }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ query: "x", numResults: 0 }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ query: "x", numResults: 11 }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ query: "x", type: "deep" }).success).toBe(true)
  })

  it("优先 Exa：Exa 成功直接返回", async () => {
    const fetcher = makeFetcher({ [EXA_URL]: exaHandler("exa says hi") })
    const tool = createWebSearchTool(fetcher, () => ({
      exaApiKey: "k-exa",
      tavilyApiKey: "k-tavily",
    }))
    const result = await tool.execute("t1", { query: "react", numResults: 5 })
    expect(toolText(result)).toBe("exa says hi")
    expect(result.details).toMatchObject({ provider: "exa", query: "react" })
  })

  it("Exa 失败回退 Tavily", async () => {
    const fetcher = makeFetcher({
      [EXA_URL]: () => {
        throw new Error("network down")
      },
      [TAVILY_URL]: tavilyHandler("tavily says hi"),
    })
    const tool = createWebSearchTool(fetcher, () => ({
      exaApiKey: "k-exa",
      tavilyApiKey: "k-tavily",
    }))
    const result = await tool.execute("t1", { query: "vue" })
    expect(toolText(result)).toBe("tavily says hi")
    expect(result.details).toMatchObject({ provider: "tavily" })
  })

  it("两个 provider 都失败返回英文失败提示", async () => {
    const fetcher = makeFetcher({
      [EXA_URL]: () => {
        throw new Error("network down")
      },
      [TAVILY_URL]: () => {
        throw new Error("network down")
      },
    })
    const tool = createWebSearchTool(fetcher, () => ({
      exaApiKey: "k-exa",
      tavilyApiKey: "k-tavily",
    }))
    await expect(tool.execute("t1", { query: "svelte" })).rejects.toThrow(/Web search failed/)
  })

  it("无 Key 仍发起请求，优先 Exa 且匿名", async () => {
    let tavilyCalled = false
    const fetcher = makeFetcher({
      [EXA_URL]: exaHandler("anonymous exa ok"),
      [TAVILY_URL]: () => {
        tavilyCalled = true
        return tavilyHandler("should not be called")({})
      },
    })
    const tool = createWebSearchTool(fetcher, () => ({ exaApiKey: "", tavilyApiKey: "" }))
    const result = await tool.execute("t1", { query: "latest tailwind" })
    expect(toolText(result)).toBe("anonymous exa ok")
    expect(tavilyCalled).toBe(false)
    // 匿名请求 URL 无 exaApiKey 查询参数（handler 按裸 URL 命中即证明未拼 Key）。
  })

  it("无 Key 且 Exa 拒绝（401）后暂停重试，回退 Tavily；后续不再请求 Exa", async () => {
    let exaCalls = 0
    const fetcher = makeFetcher({
      [EXA_URL]: () => {
        exaCalls += 1
        return fakeResponse("unauthorized", false, 401)
      },
      [TAVILY_URL]: tavilyHandler("tavily saves the day"),
    })
    const tool = createWebSearchTool(fetcher, () => ({ exaApiKey: "", tavilyApiKey: "" }))

    const first = await tool.execute("t1", { query: "q1" })
    expect(toolText(first)).toBe("tavily saves the day")
    expect(first.details).toMatchObject({ provider: "tavily" })

    const second = await tool.execute("t1", { query: "q2" })
    expect(toolText(second)).toBe("tavily saves the day")
    expect(exaCalls).toBe(1)
  })
})
