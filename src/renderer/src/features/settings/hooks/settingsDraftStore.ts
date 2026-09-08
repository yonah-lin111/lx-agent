import { useEffect, useRef } from "react"
import { create } from "zustand"

// 设置分区控制器接口：各 Tab 需提供脏数据判定、保存与重置操作。
export interface SettingsSectionController {
  isDirty: boolean
  isSaving: boolean
  error?: string | null
  save: () => Promise<void>
  reset: () => void
}

// 设置草稿协调状态定义。
interface SettingsDraftState {
  activeSection: string
  isDirty: boolean
  isSaving: boolean
  error: string | null
  controller: SettingsSectionController | null

  setActiveSection: (section: string) => void
  registerController: (section: string, controller: SettingsSectionController) => void
  unregisterController: (section: string) => void
  setDirty: (isDirty: boolean) => void
  setSaving: (isSaving: boolean) => void
  setError: (error: string | null) => void
  save: () => Promise<boolean>
  reset: () => void
}

/**
 * 设置草稿与脏数据协调 Store。
 */
export const useSettingsDraftStore = create<SettingsDraftState>((set, get) => ({
  activeSection: "general",
  isDirty: false,
  isSaving: false,
  error: null,
  controller: null,

  setActiveSection: (section: string): void => {
    set({
      activeSection: section,
      isDirty: false,
      isSaving: false,
      error: null,
      controller: null,
    })
  },

  registerController: (section: string, controller: SettingsSectionController): void => {
    set((state) => {
      if (state.activeSection === section) {
        return {
          controller,
          isDirty: controller.isDirty,
          isSaving: controller.isSaving,
          error: controller.error ?? null,
        }
      }
      return state
    })
  },

  unregisterController: (section: string): void => {
    set((state) => {
      if (state.activeSection === section) {
        return {
          controller: null,
          isDirty: false,
          isSaving: false,
          error: null,
        }
      }
      return state
    })
  },

  setDirty: (isDirty: boolean): void => set({ isDirty }),
  setSaving: (isSaving: boolean): void => set({ isSaving }),
  setError: (error: string | null): void => set({ error }),

  save: async (): Promise<boolean> => {
    const { controller, isSaving } = get()
    if (!controller || isSaving) return false
    set({ isSaving: true, error: null })
    try {
      await controller.save()
      set({ isSaving: false, isDirty: false, error: null })
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ isSaving: false, error: errorMsg })
      return false
    }
  },

  reset: (): void => {
    const { controller } = get()
    if (!controller) return
    controller.reset()
    set({ isDirty: false, error: null })
  },
}))

// 分区注册参数接口。
export interface UseRegisterSettingsSectionOptions {
  section: string
  isDirty: boolean
  isSaving?: boolean
  error?: string | null
  onSave: () => Promise<void>
  onReset: () => void
}

/**
 * 注册当前设置分区的状态与操作到草稿协调 Store。
 */
export const useRegisterSettingsSection = ({
  section,
  isDirty,
  isSaving = false,
  error = null,
  onSave,
  onReset,
}: UseRegisterSettingsSectionOptions): void => {
  const register = useSettingsDraftStore((state) => state.registerController)
  const unregister = useSettingsDraftStore((state) => state.unregisterController)

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onResetRef = useRef(onReset)
  onResetRef.current = onReset

  useEffect(() => {
    register(section, {
      isDirty,
      isSaving,
      error,
      save: () => onSaveRef.current(),
      reset: () => onResetRef.current(),
    })
  }, [section, isDirty, isSaving, error, register])

  useEffect(() => {
    return () => {
      unregister(section)
    }
  }, [section, unregister])
}
