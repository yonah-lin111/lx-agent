export interface SynthesizeUpdateResult {
  ok: boolean
  synthesizedHtml?: string
  error?: string
}

export interface ExtractedTargetContextResult {
  ok: boolean
  globalContext?: string
  targetElementHtml?: string
  error?: string
}

export interface ElementSelectorResult {
  selector: string
  description: string
  injectedAttr?: { name: string; value: string }
}

/**
 * 使用 DOMParser 安全执行 DOM 树定向子树替换，生成完整合法的 HTML 文档快照。
 */
export const synthesizeDesignUpdate = (
  baseHtml: string,
  targetSelector: string,
  newFragmentHtml: string,
): SynthesizeUpdateResult => {
  if (typeof window === "undefined" || !window.DOMParser) {
    return { ok: false, error: "DOMParser is not available in current environment" }
  }

  if (!baseHtml || !baseHtml.trim()) {
    return { ok: false, error: "Base HTML is empty" }
  }

  if (!targetSelector || !targetSelector.trim()) {
    return { ok: false, error: "Target selector is empty" }
  }

  if (!newFragmentHtml || !newFragmentHtml.trim()) {
    return { ok: false, error: "Replacement fragment HTML is empty" }
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(baseHtml, "text/html")

    // 归一化选择器并去除属性内嵌引号，容错多余的 # 前缀
    const cleanedTargetSelector = targetSelector.trim().replace(/^#+/, "#")
    let normalizedSelector = cleanedTargetSelector.replace(
      /\[\s*([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\]\s]+)["']?\s*\]/g,
      "[$1=$2]",
    )

    // 若选择器为纯标识符且存在对应 ID 节点，自动适配为 ID 选择器
    if (
      !normalizedSelector.startsWith("#") &&
      !normalizedSelector.startsWith("[") &&
      !normalizedSelector.startsWith(".") &&
      /^[a-zA-Z0-9_-]+$/.test(normalizedSelector)
    ) {
      if (doc.getElementById(normalizedSelector)) {
        normalizedSelector = `#${normalizedSelector}`
      }
    }

    // 定位目标节点
    let targetNode: Element | null = null
    let syntaxError: Error | null = null
    const candidateSelectors = Array.from(
      new Set([targetSelector.trim(), cleanedTargetSelector, normalizedSelector]),
    )

    for (const sel of candidateSelectors) {
      try {
        targetNode = doc.querySelector(sel)
        if (targetNode) break
      } catch (err: any) {
        syntaxError = err
      }
    }

    if (syntaxError && !targetNode) {
      return { ok: false, error: `Invalid selector syntax: ${targetSelector}` }
    }

    // 容灾回退：若客户端动态注入的 data-design-id 丢失，依据新片段的 tagName + class 精确回退匹配
    if (!targetNode && /\[data-design-id=/i.test(normalizedSelector)) {
      const fragmentDoc = parser.parseFromString(newFragmentHtml, "text/html")
      const fragRoot = fragmentDoc.body.firstElementChild
      if (fragRoot) {
        const tagName = fragRoot.tagName.toLowerCase()
        const classAttr = fragRoot.getAttribute("class")?.trim()
        if (classAttr) {
          const candidates = doc.querySelectorAll(`${tagName}[class="${classAttr}"]`)
          if (candidates.length === 1) {
            targetNode = candidates[0]
          }
        }
      }
    }

    if (!targetNode) {
      return { ok: false, error: `Target node not found for selector: ${targetSelector}` }
    }

    // 解析新片段：包含 head 与 body 内生成的子节点（如携带内联 style 或 link）
    const fragmentDoc = parser.parseFromString(newFragmentHtml, "text/html")
    const headChildren = Array.from(fragmentDoc.head?.childNodes || [])
    const bodyChildren = Array.from(fragmentDoc.body?.childNodes || [])
    const allFragmentChildren = [...headChildren, ...bodyChildren]

    if (allFragmentChildren.length === 0) {
      return { ok: false, error: "Fragment did not produce any valid DOM nodes" }
    }

    // 将新节点导入目标文档
    const frag = doc.createDocumentFragment()
    for (const child of allFragmentChildren) {
      frag.appendChild(doc.importNode(child, true))
    }

    targetNode.replaceWith(frag)

    // 序列化导出完整的 HTML 结构
    let serialized = doc.documentElement.outerHTML
    const hasDoctype = /<!doctype\s+html/i.test(baseHtml)
    if (hasDoctype && !/<!doctype\s+html/i.test(serialized)) {
      serialized = `<!DOCTYPE html>\n${serialized}`
    }

    return { ok: true, synthesizedHtml: serialized }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * 从基准 HTML 中提取全局样式环境与指定选择器节点的 outerHTML，供提示词分层切片注入使用。
 */
export const extractDesignTargetContext = (
  html: string,
  targetSelector: string,
): ExtractedTargetContextResult => {
  if (typeof window === "undefined" || !window.DOMParser) {
    return { ok: false, error: "DOMParser unavailable" }
  }

  if (!html || !targetSelector) {
    return { ok: false, error: "HTML or selector missing" }
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")

    let targetNode: Element | null = null
    const cleanedTargetSelector = targetSelector.trim().replace(/^#+/, "#")
    const candidateSelectors = Array.from(
      new Set([
        targetSelector.trim(),
        cleanedTargetSelector,
        /^[a-zA-Z0-9_-]+$/.test(targetSelector.trim()) ? `#${targetSelector.trim()}` : null,
      ]),
    ).filter(Boolean) as string[]

    for (const sel of candidateSelectors) {
      try {
        targetNode = doc.querySelector(sel)
        if (targetNode) break
      } catch {
        // continue
      }
    }

    if (!targetNode) {
      return { ok: false, error: `Target element not found: ${targetSelector}` }
    }

    const htmlClasses = doc.documentElement?.className || ""
    const bodyClasses = doc.body?.className || ""
    const isDark = htmlClasses.includes("dark") || bodyClasses.includes("dark")
    const title = doc.title || ""

    const globalContext = [
      `theme: ${isDark ? "dark" : "light"}`,
      htmlClasses ? `html_classes: "${htmlClasses}"` : null,
      bodyClasses ? `body_classes: "${bodyClasses}"` : null,
      title ? `title: "${title}"` : null,
    ]
      .filter(Boolean)
      .join("; ")

    return {
      ok: true,
      globalContext,
      targetElementHtml: targetNode.outerHTML,
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * 为 DOM 元素生成稳定、唯一的 CSS 选择器及简明描述，若无唯一标识则自动分配并挂载 data-design-id。
 */
export const generateElementSelector = (element: Element): ElementSelectorResult => {
  const tagName = element.tagName.toLowerCase()

  // 1. 优先使用语义 ID
  if (element.id && element.id.trim()) {
    return {
      selector: `#${element.id.trim()}`,
      description: `${tagName}#${element.id.trim()}`,
    }
  }

  // 2. 其次使用已有 data-section 属性
  const dataSection = element.getAttribute("data-section")
  if (dataSection && dataSection.trim()) {
    const cleanSection = dataSection.trim()
    const sectionSelector = /^[a-zA-Z0-9_-]+$/.test(cleanSection)
      ? `[data-section=${cleanSection}]`
      : `[data-section='${cleanSection}']`
    return {
      selector: sectionSelector,
      description: `${tagName}${sectionSelector}`,
    }
  }

  // 3. 再次使用已有 data-design-id 属性
  const existingDesignId = element.getAttribute("data-design-id")
  if (existingDesignId && existingDesignId.trim()) {
    const cleanDesignId = existingDesignId.trim()
    const designIdSelector = /^[a-zA-Z0-9_-]+$/.test(cleanDesignId)
      ? `[data-design-id=${cleanDesignId}]`
      : `[data-design-id='${cleanDesignId}']`
    return {
      selector: designIdSelector,
      description: `${tagName}`,
    }
  }

  // 4. 无唯一标识时，动态分配并注入唯一的 data-design-id
  const generatedId = `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  element.setAttribute("data-design-id", generatedId)

  return {
    selector: `[data-design-id=${generatedId}]`,
    description: `${tagName}`,
    injectedAttr: { name: "data-design-id", value: generatedId },
  }
}
