import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  type SettingsSectionController,
  useSettingsDraftStore,
} from "@/features/settings/hooks/settingsDraftStore"

describe("settingsDraftStore", () => {
  beforeEach(() => {
    useSettingsDraftStore.getState().setActiveSection("general")
  })

  it("初始状态为未被修改 (Clean)", () => {
    const state = useSettingsDraftStore.getState()
    expect(state.activeSection).toBe("general")
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.error).toBeNull()
    expect(state.controller).toBeNull()
  })

  it("当注册的分区与 activeSection 一致时，同步 dirty 状态", () => {
    const mockController: SettingsSectionController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    }

    useSettingsDraftStore.getState().registerController("general", mockController)

    const state = useSettingsDraftStore.getState()
    expect(state.isDirty).toBe(true)
    expect(state.controller).toBe(mockController)
  })

  it("当注册的分区与 activeSection 不一致时，忽略注册", () => {
    const mockController: SettingsSectionController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: vi.fn(),
      reset: vi.fn(),
    }

    useSettingsDraftStore.getState().registerController("models", mockController)

    const state = useSettingsDraftStore.getState()
    expect(state.isDirty).toBe(false)
    expect(state.controller).toBeNull()
  })

  it("执行 save 时调用 controller.save 并恢复 Clean 状态", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined)
    const mockController: SettingsSectionController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: saveMock,
      reset: vi.fn(),
    }

    useSettingsDraftStore.getState().registerController("general", mockController)
    expect(useSettingsDraftStore.getState().isDirty).toBe(true)

    const success = await useSettingsDraftStore.getState().save()
    expect(success).toBe(true)
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(useSettingsDraftStore.getState().isDirty).toBe(false)
    expect(useSettingsDraftStore.getState().isSaving).toBe(false)
    expect(useSettingsDraftStore.getState().error).toBeNull()
  })

  it("执行 save 失败时记录 error 且不清除 isDirty", async () => {
    const saveMock = vi.fn().mockRejectedValue(new Error("Disk write error"))
    const mockController: SettingsSectionController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: saveMock,
      reset: vi.fn(),
    }

    useSettingsDraftStore.getState().registerController("general", mockController)

    const success = await useSettingsDraftStore.getState().save()
    expect(success).toBe(false)
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(useSettingsDraftStore.getState().error).toBe("Disk write error")
  })

  it("执行 reset 时调用 controller.reset 并恢复 Clean 状态", () => {
    const resetMock = vi.fn()
    const mockController: SettingsSectionController = {
      isDirty: true,
      isSaving: false,
      error: "Previous error",
      save: vi.fn(),
      reset: resetMock,
    }

    useSettingsDraftStore.getState().registerController("general", mockController)
    useSettingsDraftStore.getState().reset()

    expect(resetMock).toHaveBeenCalledTimes(1)
    expect(useSettingsDraftStore.getState().isDirty).toBe(false)
    expect(useSettingsDraftStore.getState().error).toBeNull()
  })

  it("setActiveSection 切换分区时重置状态与控制器", () => {
    const mockController: SettingsSectionController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: vi.fn(),
      reset: vi.fn(),
    }

    useSettingsDraftStore.getState().registerController("general", mockController)
    expect(useSettingsDraftStore.getState().isDirty).toBe(true)

    useSettingsDraftStore.getState().setActiveSection("models")
    const state = useSettingsDraftStore.getState()
    expect(state.activeSection).toBe("models")
    expect(state.isDirty).toBe(false)
    expect(state.controller).toBeNull()
  })
})
