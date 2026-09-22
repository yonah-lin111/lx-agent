// 设计预览文档构建：把设计稿 HTML 编译为可直接挂到 iframe srcDoc 的沙箱文档（纯函数）。
// 主预览与对照窗共用，保证两窗的主题覆盖、沙箱守卫与 Tailwind 注入完全一致。

import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"
import { buildPreviewErrorGuardScript } from "@/pages/front-design/utils/previewGuard"

export interface BuildPreviewDocumentOptions {
  effectiveMode: "light" | "dark"
  // 已编译的 Tailwind CSS，空串表示不注入。
  compiledTailwindCss?: string
  // 是否注入运行时错误采集守卫：对照窗等只读预览可关闭。
  withErrorGuard?: boolean
}

/**
 * 仅在 `<html>` 标签上增删 dark 类名；全文档正则替换会误伤组件上的 `dark:` 变体类名。
 */
export const applyHtmlThemeClass = (source: string, dark: boolean): string => {
  const tagMatch = source.match(/<html\b[^>]*>/i)
  if (!tagMatch) return source
  const tag = tagMatch[0]
  const classMatch = tag.match(/class=["']([^"']*)["']/i)
  const classes = (classMatch?.[1] ?? "").split(/\s+/).filter((name) => name && name !== "dark")
  if (dark) classes.push("dark")
  const nextTag = classes.length
    ? classMatch
      ? tag.replace(/class=["'][^"']*["']/i, `class="${classes.join(" ")}"`)
      : tag.replace(/\s*>$/, ` class="${classes.join(" ")}">`)
    : tag.replace(/\s*class=["'][^"']*["']/i, "")
  return source.replace(tag, () => nextTag)
}

/**
 * 构建注入主题覆盖、沙箱守卫与 Tailwind 样式后的完整沙箱文档。
 */
export const buildPreviewDocument = (
  html: string,
  { effectiveMode, compiledTailwindCss = "", withErrorGuard = true }: BuildPreviewDocumentOptions,
): string => {
  if (!html || typeof html !== "string") return ""
  const baseDoc = sanitizeHtmlDocument(html, { allowScripts: true })

  const colorSchemeCss =
    effectiveMode === "dark"
      ? ":root { color-scheme: dark; } html { color-scheme: dark; background-color: #0b0f19; color: #f3f4f6; }"
      : ":root { color-scheme: light; } html { color-scheme: light; background-color: #ffffff; color: #111827; }"

  // 仅清除浏览器默认外边距：padding/height 强制归零会覆盖设计稿在 body 上的内边距与高度策略。
  const resetOverrides = `
      ${colorSchemeCss}
      html, body {
        margin: 0 !important;
        min-height: 100% !important;
        box-sizing: border-box !important;
      }
    `
  const styleTag = `<style id="lx-front-design-theme-override">${resetOverrides}</style>`
  const twStyleTag = compiledTailwindCss
    ? `<style id="lx-front-design-tailwind-compiled">${compiledTailwindCss}</style>`
    : ""
  const sandboxGuardScript = `<script id="lx-sandbox-guard">try{Object.defineProperty(window,'parent',{get:()=>null,set:()=>{},configurable:false});Object.defineProperty(window,'top',{get:()=>null,set:()=>{},configurable:false});Object.defineProperty(window,'frameElement',{get:()=>null,set:()=>{},configurable:false});Object.defineProperty(window,'opener',{get:()=>null,set:()=>{},configurable:false});if('electron' in window){try{delete window.electron;}catch(e){}}window.open=()=>null;}catch(e){}</script>`
  // 错误采集守卫必须早于设计稿自身脚本执行，因此与沙箱守卫同级注入 head。
  const errorGuardScript = withErrorGuard ? buildPreviewErrorGuardScript() : ""

  // 根据模式为 <html> 标签注入或移除 dark 类名
  const docWithTheme = applyHtmlThemeClass(baseDoc, effectiveMode === "dark")

  const injectedHead = `${sandboxGuardScript}\n${errorGuardScript}\n${styleTag}\n${twStyleTag}`
  if (docWithTheme.includes("</head>")) {
    return docWithTheme.replace("</head>", `${injectedHead}</head>`)
  }
  return `${injectedHead}${docWithTheme}`
}
