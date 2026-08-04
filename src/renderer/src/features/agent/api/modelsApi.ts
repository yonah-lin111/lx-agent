import type { ModelProviderSettings } from "@shared/settings"

// Agent feature 对模型 Provider 设置的访问层。
export const modelsApi = {
  getProviders: (): Promise<ModelProviderSettings> => window.api.settings.getModelProviders(),
}
