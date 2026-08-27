import { readFileSync } from "node:fs"
import { z } from "zod"
import { getConfigPath } from "@/paths"
import type { AgentTool, AgentToolResult } from "../core/types"

// Exa 联网搜索 MCP 服务地址（无 Key 直连；带 Key 时附加查询参数）。
const EXA_MCP_URL = "https://mcp.exa.ai/mcp"
// Tavily 联网搜索服务地址。
const TAVILY_SEARCH_URL = "https://api.tavily.com/search"
// 单次搜索请求超时（ms）。
const WEB_SEARCH_TIMEOUT_MS = 25_000

// 无 Key 直连被拒绝的 provider，在配置 Key 前暂停重试。
const unavailableAnonymousProviders = new Set<WebSearchProvider>()

// 联网搜索工具输入 schema。
const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  numResults: z.number().int().min(1).max(10).optional(),
  type: z.enum(["auto", "fast", "deep"]).optional(),
})

type WebSearchProvider = "exa" | "tavily"
// 归一化搜索输入（默认值已落定）。
type NormalizedInput = { query: string; numResults: number; type: "auto" | "fast" | "deep" }

// 联网搜索配置（config.json `ai.webSearch` 节点）。
type WebSearchConfig = {
  exaApiKey: string
  tavilyApiKey: string
}

// 可注入的 Fetch 实现与配置读取器（便于测试）。
type Fetcher = typeof fetch
type WebSearchConfigResolver = () => WebSearchConfig

// MCP 文本内容项。
type McpTextContent = {
  type?: unknown
  text?: unknown
}

// MCP 调用响应。
type McpToolCallResponse = {
  result?: {
    content?: McpTextContent[]
  }
  error?: {
    message?: unknown
  }
}

// Tavily 搜索结果项。
type TavilySearchResult = {
  title?: unknown
  url?: unknown
  content?: unknown
}

// Tavily 搜索响应。
type TavilySearchResponse = {
  answer?: unknown
  results?: TavilySearchResult[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 读取 config.json 的 ai.webSearch 节点；缺失或非法时返回空 Key。
const readWebSearchConfig = (): WebSearchConfig => {
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), "utf8")) as unknown
    if (!isRecord(raw) || !isRecord(raw.ai)) return { exaApiKey: "", tavilyApiKey: "" }
    const webSearch = raw.ai.webSearch
    if (!isRecord(webSearch)) return { exaApiKey: "", tavilyApiKey: "" }
    return {
      exaApiKey: typeof webSearch.exaApiKey === "string" ? webSearch.exaApiKey : "",
      tavilyApiKey: typeof webSearch.tavilyApiKey === "string" ? webSearch.tavilyApiKey : "",
    }
  } catch {
    return { exaApiKey: "", tavilyApiKey: "" }
  }
}

/**
 * 判断请求是否因缺少认证信息被服务端拒绝。
 */
const isAuthenticationFailure = (error: unknown): boolean =>
  error instanceof Error && /\b(?:401|403)\b/.test(error.message)

/**
 * 从 JSON 或 SSE 格式的 MCP 响应中提取首个文本结果。
 */
const parseResponseText = (body: string): string | null => {
  const parsePayload = (payload: string): string | null => {
    try {
      const response = JSON.parse(payload) as McpToolCallResponse
      const errorMessage = response.error?.message
      if (typeof errorMessage === "string" && errorMessage.trim()) {
        throw new Error(errorMessage)
      }
      const content = response.result?.content ?? []
      const text = content.find(
        (item) => item.type === "text" && typeof item.text === "string",
      )?.text
      return typeof text === "string" && text.trim() ? text.trim() : null
    } catch (error) {
      if (error instanceof SyntaxError) return null
      throw error
    }
  }

  const direct = parsePayload(body.trim())
  if (direct) return direct

  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue
    const text = parsePayload(line.slice(6))
    if (text) return text
  }

  return null
}

/**
 * 将 Tavily 响应转换为与 Exa 一致的文本观察结果。
 */
const parseTavilyResponse = (body: string): string | null => {
  let response: TavilySearchResponse
  try {
    response = JSON.parse(body) as TavilySearchResponse
  } catch {
    return null
  }

  const sections: string[] = []
  if (typeof response.answer === "string" && response.answer.trim()) {
    sections.push(response.answer.trim())
  }

  const results = (response.results ?? []).flatMap((result, index) => {
    const title = typeof result.title === "string" ? result.title.trim() : ""
    const url = typeof result.url === "string" ? result.url.trim() : ""
    const content = typeof result.content === "string" ? result.content.trim() : ""
    const parts = [title || `Result ${index + 1}`, url, content].filter(Boolean)
    return parts.length ? [`${index + 1}. ${parts.join("\n")}`] : []
  })
  if (results.length) sections.push(results.join("\n\n"))

  return sections.length ? sections.join("\n\n") : null
}

/**
 * 创建超时受控且响应 run abort 的请求控制器，并在请求结束后释放定时器与监听。
 */
const createRequestController = (
  signal?: AbortSignal,
): { controller: AbortController; dispose: () => void } => {
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  signal?.addEventListener("abort", onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS)
  return {
    controller,
    dispose: () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
    },
  }
}

/**
 * 调用 Exa MCP 搜索服务并提取文本结果。
 */
const searchWithExa = async (
  input: NormalizedInput,
  apiKey: string,
  signal: AbortSignal | undefined,
  fetcher: Fetcher,
): Promise<string> => {
  const { controller, dispose } = createRequestController(signal)
  const url = apiKey ? `${EXA_MCP_URL}?exaApiKey=${encodeURIComponent(apiKey)}` : EXA_MCP_URL

  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: { ...input, livecrawl: "fallback" },
        },
      }),
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`Web search request failed (${response.status}): ${body.slice(0, 500)}`)
    }
    return parseResponseText(body) ?? "No search results found. Please try a different query."
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Web search request timed out")
    }
    throw error
  } finally {
    dispose()
  }
}

/**
 * 调用 Tavily 搜索服务并归一化结果文本。
 */
const searchWithTavily = async (
  input: NormalizedInput,
  apiKey: string,
  signal: AbortSignal | undefined,
  fetcher: Fetcher,
): Promise<string> => {
  const { controller, dispose } = createRequestController(signal)

  try {
    const response = await fetcher(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        max_results: input.numResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(
        `Tavily web search request failed (${response.status}): ${body.slice(0, 500)}`,
      )
    }
    return parseTavilyResponse(body) ?? "No search results found. Please try a different query."
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Tavily web search request timed out")
    }
    throw error
  } finally {
    dispose()
  }
}

// 全部 provider 失败时的英文失败提示（回灌模型，展示侧也读此语义）。
const WEB_SEARCH_FAILED_MESSAGE =
  "Web search failed. Please try again later or configure an Exa/Tavily API key in ~/.lx/config.json."

/**
 * 创建只读联网搜索工具：优先 Exa，失败回退 Tavily；无 Key 时保留匿名直连。
 */
export const createWebSearchTool = (
  fetcher: Fetcher = fetch,
  resolveConfig: WebSearchConfigResolver = () => readWebSearchConfig(),
): AgentTool<
  typeof webSearchInputSchema,
  { query: string; numResults: number; type: string; provider: WebSearchProvider }
> => ({
  name: "web_search",
  label: "Web search",
  description:
    "Search the public internet for current, external, or specialized domain information. Use when information is not present in local files or context. Keep search queries specific and split into multiple queries when needed.",
  inputSchema: webSearchInputSchema,
  execute: async (_toolCallId, params, signal) => {
    const { query, numResults = 8, type = "auto" } = params
    const { exaApiKey, tavilyApiKey } = resolveConfig()
    const providerKeys: Record<WebSearchProvider, string> = {
      exa: exaApiKey.trim(),
      tavily: tavilyApiKey.trim(),
    }
    for (const [provider, apiKey] of Object.entries(providerKeys) as Array<
      [WebSearchProvider, string]
    >) {
      if (apiKey) unavailableAnonymousProviders.delete(provider)
    }
    const providers = (Object.keys(providerKeys) as WebSearchProvider[]).filter(
      (provider) => providerKeys[provider] || !unavailableAnonymousProviders.has(provider),
    )
    if (providers.length === 0) {
      throw new Error(WEB_SEARCH_FAILED_MESSAGE)
    }
    // 固定优先 Exa，失败回退 Tavily。
    const orderedProviders = (["exa", "tavily"] as WebSearchProvider[]).filter((provider) =>
      providers.includes(provider),
    )
    const searchInput: NormalizedInput = { query, numResults, type }
    type SearchDetails = {
      query: string
      numResults: number
      type: string
      provider: WebSearchProvider
    }
    const search = async (provider: WebSearchProvider): Promise<AgentToolResult<SearchDetails>> => {
      try {
        const observation =
          provider === "exa"
            ? await searchWithExa(searchInput, providerKeys.exa, signal, fetcher)
            : await searchWithTavily(searchInput, providerKeys.tavily, signal, fetcher)
        return {
          content: [{ type: "text", text: observation }],
          details: { query, numResults, type, provider },
        }
      } catch (error) {
        if (!providerKeys[provider] && isAuthenticationFailure(error)) {
          unavailableAnonymousProviders.add(provider)
        }
        throw error
      }
    }

    for (const provider of orderedProviders) {
      try {
        return await search(provider)
      } catch {
        // 当前 provider 失败，继续尝试下一个。
      }
    }
    throw new Error(WEB_SEARCH_FAILED_MESSAGE)
  },
})
