import type { PermissionSettings } from "@shared/contracts/agent"
import type {
  FetchedProviderModel,
  FetchModelsInput,
  ModelProviderSettings,
  UiSettings,
} from "@shared/settings"

// 设置 feature 的 preload API 访问入口。
export const settingsApi = {
  getModelProviders: (): Promise<ModelProviderSettings> => window.api.settings.getModelProviders(),
  saveModelProviders: (settings: ModelProviderSettings): Promise<ModelProviderSettings> =>
    window.api.settings.saveModelProviders(settings),
  fetchModels: (input: FetchModelsInput): Promise<FetchedProviderModel[]> =>
    window.api.settings.fetchModels(input),
  getPermissionSettings: (): Promise<PermissionSettings> =>
    window.api.settings.getPermissionSettings(),
  savePermissionSettings: (settings: PermissionSettings): Promise<PermissionSettings> =>
    window.api.settings.savePermissionSettings(settings),
  getUiSettings: (): Promise<UiSettings> => window.api.settings.getUiSettings(),
  saveUiSettings: (settings: UiSettings): Promise<UiSettings> =>
    window.api.settings.saveUiSettings(settings),
}
