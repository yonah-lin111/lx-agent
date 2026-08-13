import { DomUtils, parseDocument } from "htmlparser2"
import TurndownService from "turndown"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "./truncate"

// 原始响应硬上限（超限抛错，防恶意 URL 返回超大内容）。
const WEBFETCH_MAX_BYTES = 5 * 1024 * 1024 // 5MB
// 默认请求超时（秒）与上限。
const DEFAULT_TIMEOUT_S = 30
const MAX_TIMEOUT_S = 120

// webfetch 工具输入 schema。
const webfetchInputSchema = z.object({
  url: z.string().min(1).max(2048).describe("要拉取的 URL（必须 http/https）"),
  format: z
    .enum(["text", "markdown", "html"])
    .optional()
    .describe("返回格式：text/markdown/html（默认 markdown）"),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_S)
    .optional()
    .describe("请求超时（秒，默认 30）"),
})

type WebFetchFormat = "text" | "markdown" | "html"
// 可注入的 Fetch 实现（便于测试）。
type Fetcher = typeof fetch

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
    throw new Error("Invalid URL: 请输入合法的 http/https 地址。")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("WebFetch only supports http/https URLs.")
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("WebFetch blocked: 私网/内网地址不可访问。")
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

// 判断 host 是否为私网/内网地址（字符串判定，不做 DNS 解析）。
const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  // 主机名字面量。
  if (host === "localhost" || host.endsWith(".localhost")) return true
  // IPv6 回环 / 未指定。
  if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1" || host === "0:0:0:0:0:0:0:0") {
    return true
  }
  // IPv4 映射的 IPv6（::ffff:a.b.c.d）。
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (mapped) {
    const parts = mapped[1]!.split(".").map(Number)
    return isPrivateIpv4([parts[0]!, parts[1]!, parts[2]!, parts[3]!])
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

/**
 * 创建 webfetch 工具：拉取 URL 原文（HTML→markdown/text），补 web_search「只能搜不能拉原文」的空缺。
 * 只读无副作用，executionMode: parallel；进门控集（GATED_BUILTIN_TOOLS）且独立阻断私网地址。
 */
export const createWebFetchTool = (
  fetcher: Fetcher = fetch,
): AgentTool<typeof webfetchInputSchema, WebFetchDetails> => ({
  name: "webfetch",
  label: "抓取网页",
  description:
    "抓取指定 URL 的网页内容并转为 markdown/text，用于读取 web_search 命中结果的原文。" +
    "仅支持 http/https 公网地址（私网地址被阻断）。HTML 页面默认转为 markdown；纯文本/JSON 原样返回。",
  inputSchema: webfetchInputSchema,
  executionMode: "parallel",
  execute: async (_toolCallId, params, signal) => {
    const { url, format = "markdown", timeout = DEFAULT_TIMEOUT_S } = params
    parseHttpUrl(url) // 仅校验 scheme 与私网；非法时抛错（error toolResult 回灌模型）。
    const { controller, dispose } = createRequestController(signal, timeout * 1000)
    try {
      const response = await fetcher(url, {
        signal: controller.signal,
        redirect: "follow",
      })
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
      const content = truncated.truncated
        ? `${truncated.content}\n\n[内容已截断（原 ${truncated.totalBytes} 字节）]`
        : truncated.content
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
