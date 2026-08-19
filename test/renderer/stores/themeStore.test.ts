// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { applyThemeToDom, getInitialTheme, useAppTheme } from "@/stores/themeStore"

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

  it("should read stored theme from localStorage", () => {
    localStorage.setItem("lx_app_theme", "minecraft")
    expect(getInitialTheme()).toBe("minecraft")

    localStorage.setItem("lx_app_theme", "default")
    expect(getInitialTheme()).toBe("default")
  })

  it("should apply theme to documentElement attribute", () => {
    applyThemeToDom("minecraft")
    expect(document.documentElement.getAttribute("data-theme")).toBe("minecraft")

    applyThemeToDom("default")
    expect(document.documentElement.getAttribute("data-theme")).toBe("default")
  })

  it("should update theme state and persist to localStorage and DOM", () => {
    const { result } = renderHook(() => useAppTheme())
    expect(result.current.theme).toBe("default")

    act(() => {
      result.current.setTheme("minecraft")
    })

    expect(result.current.theme).toBe("minecraft")
    expect(localStorage.getItem("lx_app_theme")).toBe("minecraft")
    expect(document.documentElement.getAttribute("data-theme")).toBe("minecraft")
  })
})
