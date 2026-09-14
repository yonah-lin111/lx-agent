import { lookup } from "node:dns/promises"
import { DomUtils, parseDocument } from "htmlparser2"
import TurndownService from "turndown"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import type { SessionDeps } from "./read"
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "./truncate"

// 原始响应硬上限（超限抛错，防恶意 URL 返回超大内容）。
const WEBFETCH_MAX_BYTES = 5 * 1024 * 1024 // 5MB
// 默认请求超时（秒）与上限。
const DEFAULT_TIMEOUT_S = 30
const MAX_TIMEOUT_S = 120
// 重定向最大跟随跳数（超限抛错，防重定向链绕过 SSRF 校验）。
const MAX_REDIRECTS = 5
// 需手动跟随的重定向状态码。
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])

// webfetch 工具输入 schema。
const webfetchInputSchema = z.object({
  url: z.string().min(1).max(2048).describe("URL to fetch (must be http/https)"),
  format: z
    .enum(["text", "markdown", "html"])
    .optional()
    .describe("Return format: text/markdown/html (defaults to markdown)"),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_S)
    .optional()
    .describe("Request timeout in seconds (default 30)"),
})

type WebFetchFormat = "text" | "markdown" | "html"
// 可注入的 Fetch 实现（便于测试）。
type Fetcher = typeof fetch
// DNS 解析结果（仅需地址与协议族）。
interface ResolvedAddress {
  address: string
  family: number
}
// 可注入的 DNS 解析器（默认 dns.lookup；测试注入以避免真实 DNS）。
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>

// webfetch 工具结果 details（UI/审计，不进模型上下文）。
interface WebFetchDetails {
  url: string
  format: WebFetchFormat
  contentType: string | null
  provider: "webfetch"
}

// 解析并校验 URL：仅 http/https，且 host 非私网/内网地址（SSRF 防护，独立于权限门控）。
const parseHttpUrl = (raw: string): URL => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("Invalid URL: please provide a valid http/https URL.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("WebFetch only supports http/https URLs.")
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("WebFetch blocked: Private/internal network addresses are not allowed.")
  }
  return url
}

// IPv4 私网/保留段判定（含回环、链路本地、CGNAT、基准段等非公网地址）。
const isPrivateIpv4 = (parts: [number, number, number, number]): boolean => {
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true // 169.254.0.0/16 链路本地
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 198 && b === 18) return true // 198.18.0.0/15 基准段
  return false
}

// 展开 IPv6 地址为 8 组 16 位数值（支持 :: 压缩、内嵌 IPv4、scope 后缀）；非法返回 null。
const expandIpv6 = (raw: string): number[] | null => {
  const host =
    raw
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .split("%")[0] ?? ""
  if (!host.includes(":")) return null
  const segments = host.split("::")
  if (segments.length > 2) return null
  const parseGroups = (segment: string | undefined): number[] | null => {
    const groups: number[] = []
    for (const item of segment ? segment.split(":") : []) {
      if (item.includes(".")) {
        const octets = item.split(".").map(Number)
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
          return null
        }
        groups.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null
      groups.push(Number.parseInt(item, 16))
    }
    return groups
  }
  const head = parseGroups(segments[0])
  const tail = parseGroups(segments[1])
  if (!head || !tail) return null
  // 无 :: 压缩时必须是完整的 8 组。
  if (segments.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  if (fill < 1) return null
  return [...head, ...new Array<number>(fill).fill(0), ...tail]
}

// IPv6 私网/保留段判定（回环、未指定、ULA、链路本地、组播、6to4/映射的内网 IPv4）。
const isPrivateIpv6 = (groups: number[]): boolean => {
  const [first = 0, second = 0] = groups
  const sixth = groups[5] ?? 0
  const seventh = groups[6] ?? 0
  const eighth = groups[7] ?? 0
  // ::1 回环与 :: 未指定。
  if (groups.slice(0, 7).every((group) => group === 0) && eighth <= 1) return true
  // ::ffff:a.b.c.d IPv4 映射。
  if (groups.slice(0, 5).every((group) => group === 0) && sixth === 0xffff) {
    return isPrivateIpv4([
      (seventh >> 8) & 0xff,
      seventh & 0xff,
      (eighth >> 8) & 0xff,
      eighth & 0xff,
    ])
  }
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 唯一本地地址
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 链路本地
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 组播
  if (first === 0x2002) {
    // 2002::/16 6to4 内嵌 IPv4。
    const third = groups[2] ?? 0
    return isPrivateIpv4([(second >> 8) & 0xff, second & 0xff, (third >> 8) & 0xff, third & 0xff])
  }
  return false
}

// 判断 host 是否为私网/内网地址（IP 字面量字符串判定，不做 DNS 解析）。
const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  // 主机名字面量。
  if (host === "localhost" || host.endsWith(".localhost")) return true
  // IPv6 字面量（含 IPv4 映射/6to4 形式）。
  if (host.includes(":")) {
    const groups = expandIpv6(host)
    return groups !== null && isPrivateIpv6(groups)
  }
  // 纯 IPv4。
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    return isPrivateIpv4([Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]), Number(ipv4[4])])
  }
  return false
}

// 由 ArrayBuffer 按 content-type charset 解码为文本（失败回退 utf-8）。
const decodeBody = (buffer: ArrayBuffer, contentType: string | null): string => {
  const charset = /charset=([^;]+)/i
    .exec(contentType ?? "")?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "")
  try {
    return new TextDecoder(charset || "utf-8").decode(buffer)
  } catch {
    return new TextDecoder("utf-8").decode(buffer)
  }
}

// HTML → markdown（turndown）。
const htmlToMarkdown = (html: string): string => {
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" })
  return turndown.turndown(html)
}

// HTML → 纯文本（htmlparser2 提取文本节点）。
const htmlToText = (html: string): string => DomUtils.textContent(parseDocument(html))

// 按 format + content-type 分派转换：HTML 内容走 turndown/htmlparser2，其余（markdown/纯文本/JSON）原样返回。
const convertBody = (body: string, contentType: string | null, format: WebFetchFormat): string => {
  const isHtml = /text\/html|application\/xhtml/i.test(contentType ?? "")
  if (format === "html" || !isHtml) return body
  return format === "markdown" ? htmlToMarkdown(body) : htmlToText(body)
}

// 创建超时受控且响应 run abort 的请求控制器。
const createRequestController = (
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { controller: AbortController; dispose: () => void } => {
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  signal?.addEventListener("abort", onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    controller,
    dispose: () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
    },
  }
}

// 默认 DNS 解析器：返回 host 的全部 A/AAAA 记录。
const defaultHostResolver: HostResolver = (hostname) => lookup(hostname, { all: true })

// DNS 解析 host 并校验所有地址均为公网（防 DNS rebinding 到私网/元数据地址）。
const assertPublicResolvedHost = async (url: URL, resolveHost: HostResolver): Promise<void> => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  let addresses: ResolvedAddress[]
  try {
    addresses = await resolveHost(hostname)
  } catch {
    return // 解析失败交由 fetch 抛真实网络错误，保持错误语义。
  }
  if (addresses.some((entry) => isPrivateHost(entry.address))) {
    throw new Error("WebFetch blocked: Private/internal network addresses are not allowed.")
  }
}

// 手动跟随重定向：逐跳校验 Location（scheme/私网/DNS），限制跳数，所有跳复用同一 signal。
const fetchFollowingRedirects = async (
  fetcher: Fetcher,
  initial: URL,
  signal: AbortSignal,
  resolveHost: HostResolver,
): Promise<Response> => {
  let current = initial
  for (let followCount = 0; ; followCount += 1) {
    await assertPublicResolvedHost(current, resolveHost)
    const response = await fetcher(current.toString(), { signal, redirect: "manual" })
    const location = REDIRECT_STATUS_CODES.has(response.status)
      ? response.headers.get("location")
      : null
    if (!location) return response
    if (followCount >= MAX_REDIRECTS) {
      throw new Error(`WebFetch request exceeded ${MAX_REDIRECTS} redirects.`)
    }
    // 相对 Location 相对当前 URL 解析后复用同一套校验。
    current = parseHttpUrl(new URL(location, current).toString())
  }
}

/**
 * 创建 webfetch 工具：拉取 URL 原文（HTML→markdown/text），补 web_search「只能搜不能拉原文」的空缺。
 * 只读无副作用，executionMode: parallel；进门控集（GATED_BUILTIN_TOOLS）且独立阻断私网地址。
 * 重定向手动逐跳校验（scheme/私网/DNS），避免 302 绕过 SSRF 防护。
 */
export const createWebFetchTool = (
  fetcher: Fetcher = fetch,
  sessionDeps?: SessionDeps,
  resolveHost: HostResolver = defaultHostResolver,
): AgentTool<typeof webfetchInputSchema, WebFetchDetails> => ({
  name: "webfetch",
  label: "Fetch webpage",
  description:
    "Fetch content of a webpage from a given URL and convert to markdown/text. " +
    "Only public http/https URLs are supported (private network addresses are blocked). HTML is converted to markdown by default; plain text/JSON is returned as-is.",
  inputSchema: webfetchInputSchema,
  executionMode: "parallel",
  execute: async (toolCallId, params, signal) => {
    const { url, format = "markdown", timeout = DEFAULT_TIMEOUT_S } = params
    const initial = parseHttpUrl(url) // 校验 scheme 与私网字面量；非法时抛错（error toolResult 回灌模型）。
    const { controller, dispose } = createRequestController(signal, timeout * 1000)
    try {
      const response = await fetchFollowingRedirects(
        fetcher,
        initial,
        controller.signal,
        resolveHost,
      )
      const contentType = response.headers.get("content-type")
      if (!response.ok) {
        throw new Error(`WebFetch request failed (${response.status}).`)
      }
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > WEBFETCH_MAX_BYTES) {
        throw new Error(`WebFetch response exceeds ${WEBFETCH_MAX_BYTES / (1024 * 1024)}MB limit.`)
      }
      const body = decodeBody(buffer, contentType)
      const converted = convertBody(body, contentType, format)
      const truncated = truncateHead(converted, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      })
      const sessionId = sessionDeps?.getSessionId?.() ?? undefined
      const { text: content } = spillManager.handleTruncation(converted, truncated, {
        sessionId,
        toolCallId,
        customActionHint:
          "Use 'read' tool with offset/limit to inspect specific sections of the scraped page.",
      })
      return {
        content: [{ type: "text", text: content }],
        details: { url, format, contentType, provider: "webfetch" },
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("WebFetch request timed out.")
      }
      throw error
    } finally {
      dispose()
    }
  },
})
