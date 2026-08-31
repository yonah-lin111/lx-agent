import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import c from "highlight.js/lib/languages/c"
import cpp from "highlight.js/lib/languages/cpp"
import csharp from "highlight.js/lib/languages/csharp"
import css from "highlight.js/lib/languages/css"
import go from "highlight.js/lib/languages/go"
import java from "highlight.js/lib/languages/java"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import php from "highlight.js/lib/languages/php"
import plaintext from "highlight.js/lib/languages/plaintext"
import python from "highlight.js/lib/languages/python"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"

// 语言别名与文件扩展名到 hljs 语言名的统一映射（代码块 fence 与 diff 高亮复用）。
const languageAliases: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  cxx: "cpp",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "xml",
  html: "xml",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  markdown: "markdown",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  sql: "sql",
  svg: "xml",
  ts: "typescript",
  tsx: "typescript",
  vue: "xml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
}

hljs.registerLanguage("bash", bash)
hljs.registerLanguage("c", c)
hljs.registerLanguage("cpp", cpp)
hljs.registerLanguage("csharp", csharp)
hljs.registerLanguage("css", css)
hljs.registerLanguage("go", go)
hljs.registerLanguage("java", java)
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("json", json)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("php", php)
hljs.registerLanguage("plaintext", plaintext)
hljs.registerLanguage("python", python)
hljs.registerLanguage("rust", rust)
hljs.registerLanguage("sql", sql)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("yaml", yaml)

// 将语言名/别名归一化为已注册的 hljs 语言名。
const normalizeLanguage = (language: string): string =>
  languageAliases[language.toLowerCase()] ?? language.toLowerCase()

/**
 * 生成语法高亮 HTML（hljs 已转义内容），未注册语言按纯文本转义处理。
 */
export const highlightCode = (content: string, language: string | null | undefined): string => {
  if (typeof content !== "string") return ""
  const normalized = normalizeLanguage(language ?? "")
  if (!hljs.getLanguage(normalized)) {
    return hljs.highlight(content, { language: "plaintext", ignoreIllegals: true }).value
  }
  return hljs.highlight(content, { language: normalized, ignoreIllegals: true }).value
}

/**
 * 根据文件名后缀推断代码语言（无法推断返回 null）。
 */
export const languageFromFileName = (fileName: string): string | null => {
  const extension = fileName.split(".").pop()
  if (!extension || extension === fileName) return null
  const normalized = normalizeLanguage(extension)
  return hljs.getLanguage(normalized) ? normalized : null
}
