import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { getSessionDesignDir } from "../paths"
import { compileTailwindCss } from "./tailwindCompilerService"

export type FrontDesignStyleMode = "tailwindcss" | "css"

export interface SaveDesignResult {
  ok: boolean
  dir: string
  htmlPath: string
  cssPath: string
  jsPath: string
  error?: string
}

/**
 * 智能拆分 HTML 中的内嵌 <style> 和 <script>，构建独立的 HTML、CSS、JS
 */
export const splitHtmlAssets = (
  rawHtml: string,
  extraCss = "",
): {
  html: string
  css: string
  js: string
} => {
  let html = rawHtml
  const styleBlocks: string[] = []
  const scriptBlocks: string[] = []

  // 1. 提取所有 <style> 标签内容
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, content) => {
    if (content.trim()) {
      styleBlocks.push(content.trim())
    }
    return ""
  })

  // 2. 提取所有不带外部 src 的 <script> 标签内容
  html = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, content) => {
    if (content.trim()) {
      scriptBlocks.push(content.trim())
    }
    return ""
  })

  // 3. 组合 CSS
  const combinedCss = [extraCss.trim(), ...styleBlocks].filter(Boolean).join("\n\n")

  // 4. 组合 JS
  const combinedJs = scriptBlocks.filter(Boolean).join("\n\n")

  // 5. 将 ./style.css 和 ./script.js 相对引用注入到 html 中
  const linkTag = '<link rel="stylesheet" href="./style.css">'
  const scriptTag = '<script src="./script.js"></script>'

  if (html.includes("</head>")) {
    html = html.replace("</head>", `  ${linkTag}\n</head>`)
  } else if (html.includes("<body")) {
    html = `${linkTag}\n${html}`
  } else {
    html = `${linkTag}\n${html}`
  }

  if (html.includes("</body>")) {
    html = html.replace("</body>", `  ${scriptTag}\n</body>`)
  } else {
    html = `${html}\n${scriptTag}`
  }

  return {
    html,
    css: combinedCss,
    js: combinedJs,
  }
}

/**
 * 将设计稿按模式拆分并落盘到 ~/.lx/session/{sessionId}/design/{designId}/ 目录中
 */
export const saveFrontDesignToDisk = async (options: {
  sessionId: string
  designId: string
  html: string
  mode?: FrontDesignStyleMode
}): Promise<SaveDesignResult> => {
  const { sessionId, designId, html, mode = "tailwindcss" } = options
  const targetDir = getSessionDesignDir(sessionId, designId)

  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    let extraCss = ""
    if (mode === "tailwindcss") {
      extraCss = await compileTailwindCss(html)
    }

    const { html: indexHtml, css, js } = splitHtmlAssets(html, extraCss)

    const htmlPath = `${targetDir}/index.html`
    const cssPath = `${targetDir}/style.css`
    const jsPath = `${targetDir}/script.js`

    writeFileSync(htmlPath, indexHtml, "utf8")
    writeFileSync(cssPath, css, "utf8")
    writeFileSync(jsPath, js, "utf8")

    return {
      ok: true,
      dir: targetDir,
      htmlPath,
      cssPath,
      jsPath,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[FrontDesignService] Failed to save design to ${targetDir}:`, err)
    return {
      ok: false,
      dir: targetDir,
      htmlPath: `${targetDir}/index.html`,
      cssPath: `${targetDir}/style.css`,
      jsPath: `${targetDir}/script.js`,
      error: errorMsg,
    }
  }
}
