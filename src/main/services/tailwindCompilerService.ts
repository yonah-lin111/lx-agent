import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { compile } from "tailwindcss"

const require = createRequire(import.meta.url)

// 缓存编译器的 Promise 实例（tailwindcss v4 index.css 自包含规范）
let compilerPromise: ReturnType<typeof compile> | null = null

const getCompiler = (): ReturnType<typeof compile> => {
  if (!compilerPromise) {
    const indexCssPath = require.resolve("tailwindcss/index.css")
    const indexCss = readFileSync(indexCssPath, "utf8")
    compilerPromise = compile(indexCss)
  }
  return compilerPromise
}

/**
 * 从 HTML 字符串中提取可能的所有 CSS 类名及 utility 候选词
 */
export const extractTailwindCandidates = (html: string): string[] => {
  const candidates = new Set<string>()

  // 1. 提取 class="..." 或 className="..." 中的类名
  const classMatches = html.matchAll(/\bclass(?:Name)?\s*=\s*["']([^"']+)["']/g)
  for (const match of classMatches) {
    const classStr = match[1]?.trim()
    if (classStr) {
      for (const cls of classStr.split(/\s+/)) {
        if (cls) candidates.add(cls)
      }
    }
  }

  // 2. 补充提取可能作为动态工具类的属性标记
  const tokens = html.match(/[^\s"'`<>]+/g) || []
  for (const token of tokens) {
    const cleaned = token.replace(/^[([{<]+|[)\]}>,;]+$/g, "")
    if (cleaned && (cleaned.includes("-") || cleaned.includes(":") || cleaned.includes("["))) {
      candidates.add(cleaned)
    }
  }

  return Array.from(candidates)
}

/**
 * 实时编译 HTML 中使用的 Tailwind CSS 样式
 */
export const compileTailwindCss = async (html: string): Promise<string> => {
  if (!html || typeof html !== "string") return ""
  try {
    const compiler = await getCompiler()
    const candidates = extractTailwindCandidates(html)
    return compiler.build(candidates)
  } catch (err) {
    console.error("[TailwindCompiler] Failed to compile CSS for HTML:", err)
    return ""
  }
}
