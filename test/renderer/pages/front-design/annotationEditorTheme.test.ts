// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  FALLBACK_EDITOR_THEME,
  readAnnotationEditorTheme,
} from "@/pages/front-design/utils/annotationEditorTheme"

const createRootStyle = (tokens: Record<string, string>): CSSStyleDeclaration =>
  ({
    fontFamily: "Pixel Mono",
    getPropertyValue: (name: string) => tokens[name] ?? "",
  }) as unknown as CSSStyleDeclaration

const createProbeStyle = (values: Record<string, string>): CSSStyleDeclaration =>
  ({
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    backgroundRepeat: "repeat",
    imageRendering: "auto",
    borderTopWidth: "0px",
    borderTopStyle: "none",
    borderTopColor: "rgb(0, 0, 0)",
    borderTopLeftRadius: "6px",
    boxShadow: "none",
    color: "rgb(255, 255, 255)",
    getPropertyValue: () => "",
    ...values,
  }) as unknown as CSSStyleDeclaration

describe("批注输入框主题读取", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("取不到主题值时逐项回退默认值，且不抛异常", () => {
    const theme = readAnnotationEditorTheme()
    // backgroundImage 允许为空（无底纹主题），其余字段都必须有可用值
    for (const [key, value] of Object.entries(theme)) {
      if (key === "backgroundImage") continue
      expect(value, `字段 ${key} 不应为空`).toBeTruthy()
    }
    expect(theme.backgroundImage).toBe("")
  })

  it("像素主题：直角、马赛克底纹、浮雕与按钮描边被完整读出", () => {
    vi.spyOn(window, "getComputedStyle")
      .mockReturnValueOnce(
        createRootStyle({
          "--color-theme-border-strong": "#64647c",
          "--color-theme-text-muted": "#a6a6bc",
          "--color-theme-text-subtle": "#727288",
          "--theme-font-family": "Pixel Mono, monospace",
        }),
      )
      .mockReturnValueOnce(
        createProbeStyle({
          backgroundColor: "rgb(34, 34, 50)",
          backgroundImage: "url(mosaic.svg)",
          imageRendering: "pixelated",
          borderTopWidth: "2px",
          borderTopStyle: "solid",
          borderTopColor: "rgb(0, 0, 0)",
          borderTopLeftRadius: "0px",
          boxShadow:
            "inset 2px 2px 0px 0px rgba(255, 255, 255, 0.12), 3px 3px 0px 0px rgb(0, 0, 0)",
        }),
      )
      .mockReturnValueOnce(
        createProbeStyle({
          borderTopWidth: "2px",
          borderTopColor: "rgb(0, 0, 0)",
          boxShadow: "3px 3px 0px 0px rgb(0, 0, 0)",
        }),
      )

    const theme = readAnnotationEditorTheme()

    expect(theme.borderWidth).toBe("2px")
    expect(theme.borderColor).toBe("rgb(0, 0, 0)")
    expect(theme.borderRadius).toBe("0px")
    expect(theme.backgroundColor).toBe("rgb(34, 34, 50)")
    expect(theme.backgroundImage).toBe("url(mosaic.svg)")
    expect(theme.imageRendering).toBe("pixelated")
    expect(theme.boxShadow).toContain("inset 2px 2px 0px 0px")
    expect(theme.fontFamily).toBe("Pixel Mono")
    expect(theme.chipFontFamily).toBe("Pixel Mono, monospace")
    expect(theme.borderColorStrong).toBe("#64647c")
    expect(theme.placeholderColor).toBe("#727288")
    expect(theme.mutedColor).toBe("#a6a6bc")
    // 直角主题下按钮同样保持硬边并带描边
    expect(theme.buttonRadius).toBe("0px")
    expect(theme.buttonBorderWidth).toBe("2px")
    expect(theme.buttonShadow).toContain("3px 3px 0px 0px")
  })

  it("默认主题：无边框探针回退到 1px 描边与圆角按钮", () => {
    vi.spyOn(window, "getComputedStyle")
      .mockReturnValueOnce(createRootStyle({}))
      .mockReturnValueOnce(createProbeStyle({}))
      .mockReturnValueOnce(createProbeStyle({}))

    const theme = readAnnotationEditorTheme()

    expect(theme.borderWidth).toBe(FALLBACK_EDITOR_THEME.borderWidth)
    expect(theme.borderRadius).toBe(FALLBACK_EDITOR_THEME.borderRadius)
    expect(theme.backgroundColor).toBe(FALLBACK_EDITOR_THEME.backgroundColor)
    expect(theme.backgroundImage).toBe("")
    expect(theme.buttonBorderWidth).toBe("0px")
    expect(theme.buttonRadius).toBe("9999px")
  })
})
