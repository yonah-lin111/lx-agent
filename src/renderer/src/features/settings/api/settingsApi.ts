import type { PermissionSettings } from "@shared/contracts/agent"
import type {
  CliId,
  CliLifecycleResult,
  CliSettings,
  CliVersionInfo,
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
  getCliSettings: (): Promise<CliSettings> => window.api.settings.getCliSettings(),
  saveCliSettings: (settings: CliSettings): Promise<CliSettings> =>
    window.api.settings.saveCliSettings(settings),
  getCliVersions: (options?: { force?: boolean }): Promise<CliVersionInfo[]> =>
    window.api.settings.getCliVersions(options),
  runCliLifecycleAction: (
    cliId: CliId,
    action: "install" | "update",
  ): Promise<CliLifecycleResult> => window.api.settings.runCliLifecycleAction(cliId, action),
}

