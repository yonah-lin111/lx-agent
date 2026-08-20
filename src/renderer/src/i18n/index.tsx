import type { Locale } from "@shared/settings"
import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { subscribeSettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { en, type TranslationDictionary } from "./locales/en"
import { zh } from "./locales/zh"

const dictionaries: Record<Locale, TranslationDictionary> = {
  en,
  zh,
}

// 递归展开嵌套对象的 key 为点分隔路径，例如 "settings.title"
type DotNestedKeys<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: T[K] extends object
        ? `${K}.${DotNestedKeys<T[K]>}`
        : `${K}`
    }[keyof T & (string | number)]
  : never

export type TranslationKey = DotNestedKeys<TranslationDictionary>

export interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

/**
 * 根据点路径从字典对象中读取值。
 */
const getNestedValue = (obj: unknown, path: string): string | undefined => {
  const parts = path.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof current === "string" ? current : undefined
}

export interface I18nProviderProps {
  children: ReactNode
}

/**
 * 提供全局多语言能力的 Provider。
 */
export const I18nProvider = ({ children }: I18nProviderProps): React.JSX.Element => {
  const [locale, setLocaleState] = useState<Locale>("en")

  useEffect(() => {
    let isCurrent = true
    const loadSettings = async (): Promise<void> => {
      try {
        const uiSettings = await settingsApi.getUiSettings()
        if (isCurrent && uiSettings?.locale) {
          setLocaleState(uiSettings.locale)
        }
      } catch (err) {
        console.error("Failed to load ui locale", err)
      }
    }

    void loadSettings()

    const unsubscribe = subscribeSettingsChanged("ui", () => {
      void loadSettings()
    })

    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [])

  const setLocale = async (nextLocale: Locale): Promise<void> => {
    setLocaleState(nextLocale)
    try {
      await settingsApi.saveUiSettings({ locale: nextLocale })
    } catch (err) {
      console.error("Failed to save ui locale", err)
    }
  }

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = dictionaries[locale] ?? dictionaries.en
    let translation: string =
      getNestedValue(dict, key) ?? getNestedValue(dictionaries.en, key) ?? key

    if (params) {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        translation = translation.replace(new RegExp(`{{${paramKey}}}`, "g"), String(paramVal))
      })
    }

    return translation
  }

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

const defaultTranslate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
): string => {
  let translation: string = getNestedValue(dictionaries.en, key) ?? key
  if (params) {
    Object.entries(params).forEach(([paramKey, paramVal]) => {
      translation = translation.replace(new RegExp(`{{${paramKey}}}`, "g"), String(paramVal))
    })
  }
  return translation
}

const fallbackContext: I18nContextType = {
  locale: "en",
  setLocale: async () => {},
  t: defaultTranslate,
}

/**
 * 获取翻译函数和当前 locale 的 Hook。未在 Provider 内部时静默回退到默认英文，方便单测。
 */
export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext)
  return context ?? fallbackContext
}
