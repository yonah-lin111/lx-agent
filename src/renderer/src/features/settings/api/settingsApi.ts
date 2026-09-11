import type { PermissionSettings } from "@shared/contracts/agent"
import type {
  CliId,
  CliLifecycleResult,
  CliSettings,
  CliVersionInfo,
  FetchedProviderModel,
  FetchModelsInput,
  HookSettings,
  LspServerDetailInfo,
  LspSettings,
  McpSettings,
  ModelProviderSettings,
  OpenClawSettings,
  SkillSettings,
  TranscribeAudioInput,
  TranscribeAudioResult,
  UiSettings,
  VoiceSettings,
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
  getHookSettings: (): Promise<HookSettings> => window.api.settings.getHookSettings(),
  saveHookSettings: (settings: HookSettings): Promise<HookSettings> =>
    window.api.settings.saveHookSettings(settings),
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
  getLspSettings: (): Promise<LspSettings> => window.api.settings.getLspSettings(),
  saveLspSettings: (settings: LspSettings): Promise<LspSettings> =>
    window.api.settings.saveLspSettings(settings),
  getLspStatus: (): Promise<LspServerDetailInfo[]> => window.api.settings.getLspStatus(),
  installLspServer: (packageName: string): Promise<boolean> =>
    window.api.settings.installLspServer(packageName),
  getMcpSettings: (): Promise<McpSettings> => window.api.settings.getMcpSettings(),
  saveMcpSettings: (settings: McpSettings): Promise<McpSettings> =>
    window.api.settings.saveMcpSettings(settings),
  reconnectMcp: (): Promise<void> => window.api.settings.reconnectMcp(),
  getSkillSettings: (): Promise<SkillSettings> => window.api.settings.getSkillSettings(),
  saveSkillSettings: (settings: SkillSettings): Promise<SkillSettings> =>
    window.api.settings.saveSkillSettings(settings),
  deleteSkill: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    window.api.settings.deleteSkill(filePath),
  getVoiceSettings: (): Promise<VoiceSettings> => window.api.settings.getVoiceSettings(),
  saveVoiceSettings: (settings: VoiceSettings): Promise<VoiceSettings> =>
    window.api.settings.saveVoiceSettings(settings),
  transcribeAudio: (input: TranscribeAudioInput): Promise<TranscribeAudioResult> =>
    window.api.settings.transcribeAudio(input),
  getOpenClawSettings: (): Promise<OpenClawSettings> => window.api.settings.getOpenClawSettings(),
  saveOpenClawSettings: (settings: OpenClawSettings): Promise<OpenClawSettings> =>
    window.api.settings.saveOpenClawSettings(settings),
}
