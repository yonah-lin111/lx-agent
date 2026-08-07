import type { FetchedProviderModel } from "@shared/settings"
import { net } from "electron"

// 单端点请求超时时间（毫秒）。
const FETCH_TIMEOUT_MS = 15_000

// 404/405 响应体截断长度：避免把几十 KB HTML 404 页整页保留到错误串里。
const ERROR_BODY_MAX_CHARS = 512

// 已知的「Anthropic 协议兼容子路径」后缀；按长度降序，最长前缀优先匹配。
// baseURL 命中这些后缀时，候选列表会追加「剥离后缀再拼 /v1/models / /models」的版本。
const KNOWN_COMPAT_SUFFIXES = [
  "/api/claudecode",
  "/api/anthropic",
  "/apps/anthropic",
  "/api/coding",
  "/claudecode",
  "/anthropic",
  "/step_plan",
  "/coding",
  "/claude",
] as const

// OpenAI 兼容的 /v1/models 响应格式。
type ModelsResponse = {
  data?: { id: string; owned_by?: string | null }[]
}

/**
 * 截断响应体到限制长度，避免 HTML 404 页占用错误串。
 */
const truncateBody = (body: string): string =>
  body.length <= ERROR_BODY_MAX_CHARS ? body : `${body.slice(0, ERROR_BODY_MAX_CHARS)}…`

/**
 * 判断 baseURL 是否以 OpenAI 风格的版本段 `/v{N}` 结尾（`N` 为一个或多个数字），
 * 例如 `/v1`、`.../paas/v4`。这类 URL 版本号已在路径中，模型端点应为
 * `{base}/models`，不能再补 `/v1`（智谱 Coding Plan 即 `.../coding/paas/v4`）。
 */
const endsWithVersionSegment = (url: string): boolean => {
  const last = url.slice(url.lastIndexOf("/") + 1)
  const digits = last.startsWith("v") ? last.slice(1) : ""
  return digits.length > 0 && /^[0-9]+$/.test(digits)
}

/**
 * 若 baseURL 以任一已知兼容子路径结尾，返回剥离后的剩余部分；否则 `null`。
 */
const stripCompatSuffix = (baseUrl: string): string | null => {
  for (const suffix of KNOWN_COMPAT_SUFFIXES) {
    if (baseUrl.endsWith(suffix)) {
      return baseUrl.slice(0, baseUrl.length - suffix.length)
    }
  }
  return null
}

/**
 * 构造「模型列表端点」的候选 URL 列表。
 *
 * 候选顺序：
 * 1. baseURL 拼 `/v1/models`；若已以版本段 `/v{N}` 结尾（`/v1`、智谱
 *    `/api/coding/paas/v4` 等），版本号已在路径里，改拼 `/models`
 * 2. 版本段非 `/v1`（如 `/v4`）时再追加 `/v1/models` 作为兜底次候选
 * 3. 若 baseURL 命中兼容子路径，剥离后缀再拼 `/v1/models`、`/models`
 *
 * 结果已去重且保持首次出现顺序。
 */
export const buildModelsUrlCandidates = (baseUrl: string): string[] => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "")
  if (!trimmed) return []

  const candidates: string[] = []

  if (endsWithVersionSegment(trimmed)) {
    candidates.push(`${trimmed}/models`)
    if (!trimmed.endsWith("/v1")) {
      candidates.push(`${trimmed}/v1/models`)
    }
  } else {
    candidates.push(`${trimmed}/v1/models`)
  }

  const stripped = stripCompatSuffix(trimmed)
  if (stripped) {
    const root = stripped.replace(/\/+$/, "")
    if (root && root.includes("://")) {
      candidates.push(`${root}/v1/models`)
      candidates.push(`${root}/models`)
    }
  }

  const unique: string[] = []
  for (const url of candidates) {
    if (!unique.includes(url)) unique.push(url)
  }
  return unique
}

/**
 * 获取供应商的可用模型列表。
 *
 * 使用 OpenAI 兼容的 GET /v1/models 端点，按候选列表顺序尝试。
 * 任一候选返回成功即解析 `{data:[{id, owned_by}]}` 并按 id 排序返回。
 */
export const fetchProviderModels = async (
  baseUrl: string,
  apiKey: string,
): Promise<FetchedProviderModel[]> => {
  if (!apiKey) {
    throw new Error("API Key is required to fetch models")
  }

  const candidates = buildModelsUrlCandidates(baseUrl)
  if (candidates.length === 0) {
    throw new Error("Base URL is empty")
  }

  let lastNotFoundError: string | null = null

  for (const url of candidates) {
    let response: Response
    try {
      response = await net.fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`Request timed out: ${message}`)
      }
      throw new Error(`Request failed: ${message}`)
    }

    const status = response.status
    if (status >= 200 && status < 300) {
      try {
        const payload = (await response.json()) as ModelsResponse
        const models = (payload.data ?? [])
          .map((model) => ({ id: model.id, ownedBy: model.owned_by ?? null }))
          .sort((a, b) => a.id.localeCompare(b.id))
        return models
      } catch {
        throw new Error("Failed to parse response")
      }
    }

    if (status === 404 || status === 405) {
      lastNotFoundError = `HTTP ${status}: ${truncateBody(await response.text())}`
      continue
    }

    throw new Error(`HTTP ${status}: ${truncateBody(await response.text())}`)
  }

  throw new Error(`All candidates failed: ${lastNotFoundError ?? "no candidates"}`)
}
