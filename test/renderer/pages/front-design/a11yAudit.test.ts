// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { buildElementPathSelector, runA11yAudit } from "@/pages/front-design/utils/a11yAudit"

// 构造带 lang 的独立文档。
const createDoc = (body: string, lang: string | null = "en"): Document => {
  const doc = document.implementation.createHTMLDocument("preview")
  if (lang) {
    doc.documentElement.setAttribute("lang", lang)
  }
  doc.body.innerHTML = body
  return doc
}

// 审计桩：默认全部可见、尺寸充足，按元素覆盖样式。
const createAuditOptions = (overrides?: {
  styles?: Map<Element, Record<string, string>>
  sizes?: Map<Element, { width: number; height: number }>
  defaultSize?: { width: number; height: number }
}) => {
  const styles = overrides?.styles ?? new Map<Element, Record<string, string>>()
  const sizes = overrides?.sizes ?? new Map<Element, { width: number; height: number }>()

  return {
    getComputedStyle: (element: Element): CSSStyleDeclaration =>
      ({
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fontSize: "16px",
        fontWeight: "400",
        display: "block",
        visibility: "visible",
        opacity: "1",
        ...(styles.get(element) ?? {}),
      }) as unknown as CSSStyleDeclaration,
    measure: (element: Element) =>
      sizes.get(element) ?? overrides?.defaultSize ?? { width: 120, height: 40 },
  }
}

describe("可用性审计", () => {
  it("图片缺少 alt 时报告，alt 为空串或存在时不报告", () => {
    const doc = createDoc(`<img src="a.png"><img src="b.png" alt="描述"><img src="c.png" alt="">`)
    const findings = runA11yAudit(doc, createAuditOptions())
    expect(findings.filter((item) => item.rule === "alt")).toHaveLength(1)
  })

  it("role=presentation 的装饰图不报告", () => {
    const doc = createDoc(`<img src="a.png" role="presentation">`)
    expect(runA11yAudit(doc, createAuditOptions())).toHaveLength(0)
  })

  it("交互元素无可访问名称时报告", () => {
    const doc = createDoc(
      `<button></button><button>保存</button><button aria-label="关闭"></button><a href="#"></a>`,
    )
    const findings = runA11yAudit(doc, createAuditOptions())
    expect(findings.filter((item) => item.rule === "accessible-name")).toHaveLength(2)
  })

  it("文本对比度不足时报告并携带实测值", () => {
    const doc = createDoc(`<p>低对比文本</p><span>正常文本</span>`)
    const paragraph = doc.querySelector("p")
    const options = createAuditOptions({
      styles: new Map([[paragraph as Element, { color: "rgb(120, 120, 120)" }]]),
    })
    const findings = runA11yAudit(doc, options).filter((item) => item.rule === "contrast")
    expect(findings).toHaveLength(1)
    expect(findings[0].selector).toBe("body:nth-child(2)>p:nth-child(1)")
    expect(findings[0].values?.threshold).toBe("4.5")
    expect(Number(findings[0].values?.ratio)).toBeLessThan(4.5)
  })

  it("大字使用 3:1 阈值", () => {
    const doc = createDoc(`<h1>标题</h1>`)
    const heading = doc.querySelector("h1")
    const options = createAuditOptions({
      styles: new Map([[heading as Element, { color: "rgb(120, 120, 120)", fontSize: "32px" }]]),
    })
    expect(runA11yAudit(doc, options).filter((item) => item.rule === "contrast")).toHaveLength(0)
  })

  it("点击区小于 24×24px 时报告，行内链接豁免", () => {
    const doc = createDoc(`<button>小</button><button>大</button><a href="#">行内链接</a>`)
    const small = doc.querySelector("button")
    const options = createAuditOptions({
      sizes: new Map([[small as Element, { width: 18, height: 18 }]]),
      defaultSize: { width: 40, height: 40 },
    })
    const styles = new Map<Element, Record<string, string>>()
    const link = doc.querySelector("a")
    styles.set(link as Element, { display: "inline" })

    const findings = runA11yAudit(doc, {
      ...options,
      getComputedStyle: (element: Element) => {
        const base = options.getComputedStyle(element)
        const override = styles.get(element)
        return override ? ({ ...base, ...override } as unknown as CSSStyleDeclaration) : base
      },
    })
    const targetFindings = findings.filter((item) => item.rule === "target-size")
    expect(targetFindings).toHaveLength(1)
    expect(targetFindings[0].values?.width).toBe(18)
    expect(targetFindings[0].values?.min).toBe(24)
  })

  it("表单控件缺少关联 label 时报告", () => {
    const doc = createDoc(
      `<input id="name"><label for="name">姓名</label><input id="city" aria-label="城市"><textarea id="note"></textarea>`,
    )
    const findings = runA11yAudit(doc, createAuditOptions())
    const labelFindings = findings.filter((item) => item.rule === "form-label")
    expect(labelFindings).toHaveLength(1)
    expect(labelFindings[0].selector).toContain("textarea")
  })

  it("文档缺少 lang 属性时报告", () => {
    const doc = createDoc(`<p>hi</p>`, null)
    const findings = runA11yAudit(doc, createAuditOptions())
    expect(findings.filter((item) => item.rule === "lang")).toHaveLength(1)
  })

  it("跳过预览自身注入节点", () => {
    const doc = createDoc(
      `<div id="lx-design-annotation-layer"><img src="pin.png"></div><div id="lx-front-design-theme-override"><button></button></div>`,
    )
    expect(runA11yAudit(doc, createAuditOptions())).toHaveLength(0)
  })

  it("路径选择器无属性注入且可被 querySelector 命中", () => {
    const doc = createDoc(`<main><h1>标题</h1></main>`)
    const selector = buildElementPathSelector(doc.querySelector("h1") as Element)
    expect(selector).toBe("body:nth-child(2)>main:nth-child(1)>h1:nth-child(1)")
    expect(doc.querySelector(selector)).toBe(doc.querySelector("h1"))
  })

  it("单规则最多 5 条、总计最多 20 条", () => {
    const images = Array.from({ length: 8 }, (_, index) => `<img src="${index}.png">`).join("")
    const doc = createDoc(images)
    const findings = runA11yAudit(doc, createAuditOptions())
    expect(findings.filter((item) => item.rule === "alt")).toHaveLength(5)
    expect(findings.length).toBeLessThanOrEqual(20)
  })
})
