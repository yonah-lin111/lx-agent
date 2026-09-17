// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  applyThemeToDom,
  getInitialTheme,
  useAppTheme,
  useAppThemeValue,
} from "@/stores/themeStore"

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute("data-theme")
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute("data-theme")
  })

  it("should default to default theme when localStorage is empty", () => {
    expect(getInitialTheme()).toBe("default")
  })

  it("should read stored theme from localStorage and fallback on invalid theme", () => {
    localStorage.setItem("lx_app_theme", "pixel")
    expect(getInitialTheme()).toBe("pixel")

    localStorage.setItem("lx_app_theme", "invalid_theme_name")
    expect(getInitialTheme()).toBe("default")

    localStorage.setItem("lx_app_theme", "default")
    expect(getInitialTheme()).toBe("default")
  })

  it("主题标识为 pixel：pixel 有效，旧标识 minecraft 落盘时回退默认", () => {
    localStorage.setItem("lx_app_theme", "pixel")
    expect(getInitialTheme()).toBe("pixel")

    localStorage.setItem("lx_app_theme", "minecraft")
    expect(getInitialTheme()).toBe("default")
  })

  it("should apply theme to documentElement attribute", () => {
    applyThemeToDom("pixel")
    expect(document.documentElement.getAttribute("data-theme")).toBe("pixel")

    applyThemeToDom("default")
    expect(document.documentElement.getAttribute("data-theme")).toBe("default")
  })

  it("should update theme state and persist to localStorage and DOM", () => {
    const { result } = renderHook(() => useAppTheme())
    expect(result.current.theme).toBe("default")

    act(() => {
      result.current.setTheme("pixel")
    })

    expect(result.current.theme).toBe("pixel")
    expect(localStorage.getItem("lx_app_theme")).toBe("pixel")
    expect(document.documentElement.getAttribute("data-theme")).toBe("pixel")

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe("default")
  })

  it("useAppThemeValue 跟随 documentElement 的 data-theme 变化", async () => {
    applyThemeToDom("default")
    const { result } = renderHook(() => useAppThemeValue())
    expect(result.current).toBe("default")

    await act(async () => {
      applyThemeToDom("pixel")
    })
    expect(result.current).toBe("pixel")
  })

  it("useAppThemeValue 属性缺失时回退到持久化主题", () => {
    localStorage.setItem("lx_app_theme", "pixel")
    const { result } = renderHook(() => useAppThemeValue())
    expect(result.current).toBe("pixel")
  })
})
