import { existsSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { saveFrontDesignToDisk, splitHtmlAssets } from "@/services/frontDesignService"

describe("frontDesignService", () => {
  const testSessionId = "test-session-service-1"
  const testDesignId = "test-design-service-1"
  const sessionBaseDir = join(homedir(), ".lx", "session", testSessionId)

  afterEach(() => {
    if (existsSync(sessionBaseDir)) {
      rmSync(sessionBaseDir, { recursive: true, force: true })
    }
  })

  it("splitHtmlAssets 能智能拆分 style、script 并注入相对引用", () => {
    const rawHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    .hero { color: red; }
  </style>
</head>
<body>
  <div class="hero">Hello</div>
  <script>
    console.log("init");
  </script>
</body>
</html>`

    const { html, css, js } = splitHtmlAssets(rawHtml, ".extra { padding: 1rem; }")

    expect(html).toContain('<link rel="stylesheet" href="./style.css">')
    expect(html).toContain('<script src="./script.js"></script>')
    expect(html).not.toContain(".hero { color: red; }")
    expect(html).not.toContain('console.log("init");')

    expect(css).toContain(".extra { padding: 1rem; }")
    expect(css).toContain(".hero { color: red; }")
    expect(js).toContain('console.log("init");')
  })

  it("saveFrontDesignToDisk 在 tailwindcss 模式下生成三件套文件到指定目录", async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body class="bg-zinc-900 text-white p-4">
  <div class="flex items-center gap-2">
    <h1 class="text-xl font-bold">Tailwind Title</h1>
  </div>
  <script>
    window.addEventListener("load", () => console.log("mounted"));
  </script>
</body>
</html>`

    const res = await saveFrontDesignToDisk({
      sessionId: testSessionId,
      designId: testDesignId,
      html,
      mode: "tailwindcss",
    })

    expect(res.ok).toBe(true)
    expect(existsSync(res.htmlPath)).toBe(true)
    expect(existsSync(res.cssPath)).toBe(true)
    expect(existsSync(res.jsPath)).toBe(true)

    const savedHtml = readFileSync(res.htmlPath, "utf8")
    const savedCss = readFileSync(res.cssPath, "utf8")
    const savedJs = readFileSync(res.jsPath, "utf8")

    expect(savedHtml).toContain('<link rel="stylesheet" href="./style.css">')
    expect(savedHtml).toContain('<script src="./script.js"></script>')
    expect(savedJs).toContain('console.log("mounted")')
    // Tailwind CSS 编译后的样式应包含部分工具类或基础规则
    expect(savedCss.length).toBeGreaterThan(0)
  })

  it("saveFrontDesignToDisk 在 css 模式下抽离原生 style 并落盘", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    .custom-box { width: 100px; height: 100px; background: blue; }
  </style>
</head>
<body>
  <div class="custom-box">Box</div>
</body>
</html>`

    const res = await saveFrontDesignToDisk({
      sessionId: testSessionId,
      designId: "test-design-css",
      html,
      mode: "css",
    })

    expect(res.ok).toBe(true)
    expect(existsSync(res.htmlPath)).toBe(true)
    const savedCss = readFileSync(res.cssPath, "utf8")
    expect(savedCss).toContain(".custom-box")
    expect(savedCss).toContain("background: blue")
  })
})
