// 批注输入框主题：读取当前应用主题下 AgentInput 底栏的真实计算样式，供 iframe 沙箱内的浮层复用。
// iframe 内部看不到应用样式表，因此这里在应用侧取「计算值」再注入，像素主题等自定义主题无需在沙箱内重复实现。

// 批注输入框视觉参数（几何与配色）。
export interface AnnotationEditorTheme {
  borderWidth: string
  borderStyle: string
  borderColor: string
  borderColorStrong: string
  borderRadius: string
  backgroundColor: string
  backgroundImage: string
  backgroundRepeat: string
  imageRendering: string
  boxShadow: string
  fontFamily: string
  // 信息栏字体：跟随主题字体栈（像素主题下即等宽像素字体）。
  chipFontFamily: string
  color: string
  mutedColor: string
  placeholderColor: string
  buttonBorderWidth: string
  buttonBorderColor: string
  buttonRadius: string
  buttonShadow: string
}

// 兜底值：默认暗色主题下 AgentInput 底栏的实际观感。
export const FALLBACK_EDITOR_THEME: AnnotationEditorTheme = {
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "rgba(255, 255, 255, 0.1)",
  borderColorStrong: "rgba(255, 255, 255, 0.2)",
  borderRadius: "6px",
  backgroundColor: "#2a2a2a",
  backgroundImage: "",
  backgroundRepeat: "repeat",
  imageRendering: "auto",
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  chipFontFamily: "ui-monospace, monospace",
  color: "#fafafa",
  mutedColor: "rgba(255, 255, 255, 0.45)",
  placeholderColor: "rgba(255, 255, 255, 0.3)",
  buttonBorderWidth: "0px",
  buttonBorderColor: "transparent",
  buttonRadius: "9999px",
  buttonShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
}

// 透明底色视为未定义（浮层必须有实体表面）。
const isTransparent = (value: string): boolean =>
  !value || value === "transparent" || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(value)

// 读取主题 token，空值回退。
const readToken = (style: CSSStyleDeclaration | null, name: string, fallback: string): string => {
  if (!style) return fallback
  const value = style.getPropertyValue(name).trim()
  return value || fallback
}

// 离屏探针：用真实主题类名渲染不可见节点。基础样式即默认主题观感，主题内带 !important 的规则（像素主题）会自动覆盖。
const mountProbe = (className: string, tagName: "div" | "button"): HTMLElement => {
  const probe = document.createElement(tagName)
  if (className) probe.className = className
  probe.setAttribute("aria-hidden", "true")
  probe.style.position = "fixed"
  probe.style.top = "0"
  probe.style.left = "-10000px"
  probe.style.width = "240px"
  probe.style.height = "56px"
  probe.style.pointerEvents = "none"
  if (tagName === "div") {
    probe.style.border = `1px solid ${FALLBACK_EDITOR_THEME.borderColor}`
    probe.style.borderRadius = FALLBACK_EDITOR_THEME.borderRadius
    probe.style.backgroundColor = FALLBACK_EDITOR_THEME.backgroundColor
  }
  document.body.appendChild(probe)
  return probe
}

/**
 * 读取当前应用主题的批注输入框样式：缺失或取不到时逐项回退默认值。
 * 计算样式必须在探针仍挂载时读取（脱离文档后 getComputedStyle 会返回空值）。
 */
export const readAnnotationEditorTheme = (): AnnotationEditorTheme => {
  if (typeof document === "undefined" || !document.body) return { ...FALLBACK_EDITOR_THEME }

  let boxProbe: HTMLElement | null = null
  let buttonProbe: HTMLElement | null = null

  try {
    const rootStyle = window.getComputedStyle(document.documentElement)
    boxProbe = mountProbe("agent-input-container", "div")
    const boxStyle = window.getComputedStyle(boxProbe)
    buttonProbe = mountProbe("", "button")
    const buttonStyle = window.getComputedStyle(buttonProbe)

    const backgroundImage = boxStyle.backgroundImage === "none" ? "" : boxStyle.backgroundImage
    const boxShadow = boxStyle.boxShadow === "none" ? "" : boxStyle.boxShadow
    const borderWidth = boxStyle.borderTopWidth || FALLBACK_EDITOR_THEME.borderWidth
    const borderRadius = boxStyle.borderTopLeftRadius || FALLBACK_EDITOR_THEME.borderRadius
    // 直角主题（像素主题 --theme-radius-base: 0px）下按钮继承输入框的硬边描边。
    const isSquareTheme = borderRadius === "0px"
    const buttonShadow = buttonStyle.boxShadow === "none" ? "" : buttonStyle.boxShadow

    return {
      borderWidth: borderWidth === "0px" ? FALLBACK_EDITOR_THEME.borderWidth : borderWidth,
      borderStyle: boxStyle.borderTopStyle || FALLBACK_EDITOR_THEME.borderStyle,
      borderColor: boxStyle.borderTopColor || FALLBACK_EDITOR_THEME.borderColor,
      borderColorStrong: readToken(
        rootStyle,
        "--color-theme-border-strong",
        FALLBACK_EDITOR_THEME.borderColorStrong,
      ),
      borderRadius,
      backgroundColor: isTransparent(boxStyle.backgroundColor)
        ? FALLBACK_EDITOR_THEME.backgroundColor
        : boxStyle.backgroundColor,
      backgroundImage,
      backgroundRepeat: boxStyle.backgroundRepeat || FALLBACK_EDITOR_THEME.backgroundRepeat,
      imageRendering: boxStyle.imageRendering || FALLBACK_EDITOR_THEME.imageRendering,
      boxShadow: boxShadow || FALLBACK_EDITOR_THEME.boxShadow,
      fontFamily: rootStyle.fontFamily || FALLBACK_EDITOR_THEME.fontFamily,
      chipFontFamily: readToken(
        rootStyle,
        "--theme-font-family",
        FALLBACK_EDITOR_THEME.chipFontFamily,
      ),
      color: boxStyle.color || FALLBACK_EDITOR_THEME.color,
      mutedColor: readToken(
        rootStyle,
        "--color-theme-text-muted",
        FALLBACK_EDITOR_THEME.mutedColor,
      ),
      placeholderColor: readToken(
        rootStyle,
        "--color-theme-text-subtle",
        FALLBACK_EDITOR_THEME.placeholderColor,
      ),
      buttonBorderWidth: isSquareTheme ? borderWidth : "0px",
      buttonBorderColor: isSquareTheme
        ? boxStyle.borderTopColor || FALLBACK_EDITOR_THEME.borderColor
        : FALLBACK_EDITOR_THEME.buttonBorderColor,
      buttonRadius: isSquareTheme ? "0px" : FALLBACK_EDITOR_THEME.buttonRadius,
      buttonShadow: buttonShadow || FALLBACK_EDITOR_THEME.buttonShadow,
    }
  } catch {
    return { ...FALLBACK_EDITOR_THEME }
  } finally {
    boxProbe?.remove()
    buttonProbe?.remove()
  }
}
