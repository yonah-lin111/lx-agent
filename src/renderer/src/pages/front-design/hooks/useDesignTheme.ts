import { useCallback, useEffect, useMemo, useState } from "react"

export type FrontDesignPageTheme = "system" | "light" | "dark"

const FRONT_DESIGN_THEME_KEY = "lx_front_design_theme"

/**
 * 获取本地持久化的设计页面主题，默认为 system
 */
const getInitialDesignTheme = (): FrontDesignPageTheme => {
  try {
    const saved = localStorage.getItem(FRONT_DESIGN_THEME_KEY) as FrontDesignPageTheme | null
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved
    }
  } catch {
    // ignore
  }
  return "system"
}

/**
 * 设计画布主题域：主题持久化、系统深浅色订阅与实际显式模式计算。
 */
export const useDesignTheme = (): {
  pageTheme: FrontDesignPageTheme
  setPageTheme: (theme: FrontDesignPageTheme) => void
  effectiveMode: "light" | "dark"
} => {
  const [pageTheme, setPageThemeState] = useState<FrontDesignPageTheme>(getInitialDesignTheme)

  // 监听系统深浅色偏好（用于 system 模式计算实际色彩模式）
  const [isSystemDark, setIsSystemDark] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
    }
    return true
  })

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = (e: MediaQueryListEvent): void => setIsSystemDark(e.matches)
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  const setPageTheme = useCallback((nextTheme: FrontDesignPageTheme) => {
    setPageThemeState(nextTheme)
    try {
      localStorage.setItem(FRONT_DESIGN_THEME_KEY, nextTheme)
    } catch {
      // ignore
    }
  }, [])

  // 计算当前画布的实际显式模式：light 或 dark
  const effectiveMode = useMemo<"light" | "dark">(() => {
    if (pageTheme === "system") {
      return isSystemDark ? "dark" : "light"
    }
    return pageTheme
  }, [pageTheme, isSystemDark])

  return { pageTheme, setPageTheme, effectiveMode }
}
