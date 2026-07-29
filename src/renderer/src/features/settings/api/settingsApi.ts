import type { ModelProviderSettings } from "@shared/settings"

// 设置 feature 的 preload API 访问入口。
export const settingsApi = {
  getModelProviders: (): Promise<ModelProviderSettings> => window.api.settings.getModelProviders(),
  saveModelProviders: (settings: ModelProviderSettings): Promise<ModelProviderSettings> =>
    window.api.settings.saveModelProviders(settings),
}
