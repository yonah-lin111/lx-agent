import { useEffect, useState } from "react"

export type AppTheme = "default" | "minecraft"

const THEME_STORAGE_KEY = "lx_app_theme"
const VALID_THEMES: readonly AppTheme[] = ["default", "minecraft"]

/**
 * 获取当前持久化的主题配置，默认为 default。
 */
export const getInitialTheme = (): AppTheme => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null
    if (saved && VALID_THEMES.includes(saved)) {
      return saved
    }
  } catch (error) {
    console.error("Failed to read theme from localStorage", error)
  }
  return "default"
}

/**
 * 将主题属性应用到 document.documentElement。
 */
export const applyThemeToDom = (theme: AppTheme): void => {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("data-theme", theme)
}

// 读取 documentElement 上的当前主题，回退到持久化配置。
const readThemeFromDom = (): AppTheme => {
  if (typeof document === "undefined") return getInitialTheme()
  const attribute = document.documentElement.getAttribute("data-theme")
  if (attribute && VALID_THEMES.includes(attribute as AppTheme)) return attribute as AppTheme
  return getInitialTheme()
}

/**
 * 订阅 documentElement 的 data-theme 变化，供需要按主题切换渲染参数的组件使用。
 */
export const useAppThemeValue = (): AppTheme => {
  const [theme, setTheme] = useState<AppTheme>(readThemeFromDom)

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readThemeFromDom()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

/**
 * 管理与切换应用主题。
 */
export const useAppTheme = (): {
  theme: AppTheme
  setTheme: (nextTheme: AppTheme) => void
  toggleTheme: () => void
} => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme)

  useEffect(() => {
    applyThemeToDom(theme)
  }, [theme])

  const setTheme = (nextTheme: AppTheme): void => {
    setThemeState(nextTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch (error) {
      console.error("Failed to save theme to localStorage", error)
    }
    applyThemeToDom(nextTheme)
  }

  const toggleTheme = (): void => {
    const nextIndex = (VALID_THEMES.indexOf(theme) + 1) % VALID_THEMES.length
    setTheme(VALID_THEMES[nextIndex] ?? "default")
  }

  return {
    theme,
    setTheme,
    toggleTheme,
  }
}
