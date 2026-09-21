// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { buildDesignOutline } from "@/features/agent/utils/designOutline"
import { synthesizeDesignUpdate } from "@/features/agent/utils/designSynthesizer"

const sampleHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>Console</title><style>body { margin: 0 }</style></head>
<body class="min-h-screen flex items-center justify-center">
  <main class="w-full max-w-2xl space-y-3">
    <header class="flex items-center justify-between">
      <h1 class="text-xl">智能实例与部署</h1>
      <button type="button">新建节点</button>
    </header>
    <div class="space-y-3.5">
      <details name="cluster-group" open>
        <summary>Cluster-Tokyo-01</summary>
        <div class="accordion-content">负载 24%</div>
      </details>
      <details name="cluster-group">
        <summary>DB-Replica-Postgres</summary>
        <div class="accordion-content">延迟 1.2ms</div>
      </details>
      <details name="cluster-group">
        <summary>事件驱动 Webhook 路由</summary>
        <div class="accordion-content">99.98% 成功率</div>
      </details>
    </div>
    <footer><p>点击卡片展开</p></footer>
  </main>
  <script>console.log("x")</script>
  <svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" /></svg>
</body>
</html>`

describe("buildDesignOutline", () => {
  it("生成的选择器全部可在同一份 HTML 上命中", () => {
    const outline = buildDesignOutline(sampleHtml)
    const selectors = outline
      .split("\n")
      .map((line) => /^- (.+?) — /.exec(line.trim())?.[1])
      .filter((value): value is string => Boolean(value))

    expect(selectors.length).toBeGreaterThan(3)
    const doc = new DOMParser().parseFromString(sampleHtml, "text/html")
    for (const selector of selectors) {
      expect(doc.querySelector(selector), `selector missed: ${selector}`).not.toBeNull()
    }
  })

  it("列出结构节点并带缩进、标签与文本预览", () => {
    const outline = buildDesignOutline(sampleHtml)

    expect(outline).toContain("- body > main:nth-child(1) — main.w-full")
    expect(outline).toContain(
      "body > main:nth-child(1) > div:nth-child(2) > details:nth-child(3) — details",
    )
    expect(outline).toContain("事件驱动 Webhook 路由")
    expect(outline).toContain("  - body > main:nth-child(1) > header:nth-child(1)")
  })

  it("排除 script/style/svg 等噪声节点", () => {
    const outline = buildDesignOutline(sampleHtml)

    expect(outline).not.toContain("script")
    expect(outline).not.toContain("svg")
    expect(outline).not.toContain("path")
  })

  it("内容叶子不再下钻，容器继续展开", () => {
    const outline = buildDesignOutline(sampleHtml)

    expect(outline).toContain("> summary:nth-child(1) — summary")
    expect(outline).not.toContain("> summary:nth-child(1) > ")
    expect(outline).toContain("> div:nth-child(2) > details:nth-child(1)")
  })

  it("遵守深度与条目上限", () => {
    const shallow = buildDesignOutline(sampleHtml, { maxDepth: 1 })
    const shallowLines = shallow.split("\n")

    expect(shallowLines).toHaveLength(1)
    expect(shallowLines[0].startsWith("- body > main:nth-child(1)")).toBe(true)

    expect(buildDesignOutline(sampleHtml, { maxEntries: 3 }).split("\n")).toHaveLength(3)
  })

  it("空内容或无 DOM 结构时返回空字符串", () => {
    expect(buildDesignOutline("")).toBe("")
    expect(buildDesignOutline("<body></body>")).toBe("")
  })
})

describe("大纲选择器与 <front_design_update> 补丁联动", () => {
  it("用大纲选择器替换第 3 张卡片后，其余结构保持原样", () => {
    const outline = buildDesignOutline(sampleHtml)
    const selector =
      /^\s*- (body > main:nth-child\(1\) > div:nth-child\(2\) > details:nth-child\(3\)) — /m.exec(
        outline,
      )?.[1]
    expect(selector).toBeTruthy()

    const fragment = `<details name="cluster-group" class="group"><summary>分布式存储与备份容灾</summary><div class="accordion-content">三副本同步</div></details>`
    const result = synthesizeDesignUpdate(sampleHtml, selector as string, fragment)

    expect(result.ok).toBe(true)
    const patched = result.synthesizedHtml as string
    expect(patched).toContain("分布式存储与备份容灾")
    expect(patched).not.toContain("事件驱动 Webhook 路由")
    expect(patched).toContain("Cluster-Tokyo-01")
    expect(patched).toContain("DB-Replica-Postgres")
    expect(patched).toContain("点击卡片展开")
    expect(patched).toContain('lang="zh-CN"')
  })
})
