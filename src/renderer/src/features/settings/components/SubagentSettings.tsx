import {
  type ModelProviderSettings,
  RESERVED_SUBAGENT_ROLE_NAMES,
  SUBAGENT_MAX_CONCURRENCY_LIMIT,
  SUBAGENT_MAX_DEPTH_LIMIT,
  SUBAGENT_ROLE_NAME_PATTERN,
  type SubagentBuiltinRoleInfo,
  type SubagentRoleConfig,
} from "@shared/settings"
import { AlertTriangle, Edit2, Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxModal } from "@/components/ui/LxModal"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { settingsApi } from "../api/settingsApi"
import { useRegisterSettingsSection } from "../hooks/settingsDraftStore"
import { useSubagentSettings } from "../hooks/useSubagentSettings"
import { notifySettingsChanged } from "../settingsChangeNotifier"

// 下拉 portal 默认 zIndex 50，须高于 LxModal（999999）与 LxTooltip（999999）才不被遮挡。
const MODAL_SELECT_Z_INDEX = 1000000

// 工具输入解析：逐行去空白，去重并丢弃空行。
const parseToolsInput = (raw: string): string[] => {
  const tools: string[] = []
  const seen = new Set<string>()
  for (const line of raw.split("\n")) {
    const tool = line.trim()
    if (!tool || seen.has(tool)) continue
    seen.add(tool)
    tools.push(tool)
  }
  return tools
}

// 数字输入解析：空返回 null，非法返回 undefined（保持原值），越界收敛到上限。
const parseBoundInt = (raw: string, min: number, max: number): number | null | undefined => {
  const text = raw.trim()
  if (!text) return null
  const parsed = Number(text)
  if (!Number.isInteger(parsed) || parsed < min) return undefined
  return Math.min(parsed, max)
}

/**
 * 渲染子代理角色与全局治理设置。
 */
export const SubagentSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const { settings, setSettings, isLoading, loadFailed, isDirty, save, reset } =
    useSubagentSettings()

  const [builtins, setBuiltins] = useState<SubagentBuiltinRoleInfo[]>([])
  const [providerSettings, setProviderSettings] = useState<ModelProviderSettings | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formInstructions, setFormInstructions] = useState("")
  const [formModelProvider, setFormModelProvider] = useState("")
  const [formModelModel, setFormModelModel] = useState("")
  const [formTools, setFormTools] = useState("")
  const [formError, setFormError] = useState("")

  useEffect(() => {
    void settingsApi
      .getSubagentBuiltins()
      .then(setBuiltins)
      .catch((err) => console.error("[SubagentSettings] Failed to load built-in roles:", err))
  }, [])

  useEffect(() => {
    void settingsApi
      .getModelProviders()
      .then(setProviderSettings)
      .catch((err) => console.error("[SubagentSettings] Failed to load model providers:", err))
  }, [])

  const providers = providerSettings?.providers ?? {}
  const enabledProviders = useMemo(
    () => new Set(providerSettings?.enabledProviders ?? []),
    [providerSettings],
  )

  // Provider 选项：仅启用项 + 当前选中项（避免编辑已有配置时选项缺失）。
  const buildProviderOptions = (selected: string): { value: string; label: string }[] =>
    Object.values(providers)
      .filter((provider) => enabledProviders.has(provider.id) || provider.id === selected)
      .map((provider) => ({ value: provider.id, label: provider.name || provider.id }))

  const modelOptions = (providerId: string): { value: string; label: string }[] =>
    Object.values(providers[providerId]?.models ?? {}).map((model) => ({
      value: model.id,
      label: model.name,
    }))

  const roleEntries = useMemo(() => Object.entries(settings.roles), [settings.roles])

  const handleDefaultProviderChange = (provider: string): void => {
    setSettings((current) => {
      const next = { ...current }
      if (!provider) {
        delete next.defaultModel
        return next
      }
      const model = Object.values(providers[provider]?.models ?? {})[0]?.id ?? ""
      if (model) next.defaultModel = { provider, model }
      else delete next.defaultModel
      return next
    })
  }

  const handleDefaultModelChange = (model: string): void => {
    setSettings((current) =>
      current.defaultModel && model
        ? { ...current, defaultModel: { ...current.defaultModel, model } }
        : current,
    )
  }

  const handleMaxConcurrentChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    const parsed = parseBoundInt(event.target.value, 1, SUBAGENT_MAX_CONCURRENCY_LIMIT)
    if (parsed === undefined) return
    setSettings((current) => {
      const next = { ...current }
      if (parsed === null) delete next.maxConcurrent
      else next.maxConcurrent = parsed
      return next
    })
  }

  const handleMaxDepthChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    const parsed = parseBoundInt(event.target.value, 1, SUBAGENT_MAX_DEPTH_LIMIT)
    if (parsed === undefined) return
    setSettings((current) => ({ ...current, maxDepth: parsed ?? 1 }))
  }

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      await save()
      notifySettingsChanged("subagents")
    } catch (err) {
      console.error("[SubagentSettings] Failed to save settings:", err)
      toast.error(t("settings.saveFailed"))
      throw err
    }
  }, [save, t, toast])

  useRegisterSettingsSection({
    section: "subagents",
    isDirty,
    onSave: handleSave,
    onReset: reset,
  })

  const handleOpenAdd = (): void => {
    setEditingName(null)
    setFormName("")
    setFormDescription("")
    setFormInstructions("")
    setFormModelProvider("")
    setFormModelModel("")
    setFormTools("")
    setFormError("")
    setModalOpen(true)
  }

  const handleOpenEdit = (name: string, config: SubagentRoleConfig): void => {
    setEditingName(name)
    setFormName(name)
    setFormDescription(config.description)
    setFormInstructions(config.instructions ?? "")
    setFormModelProvider(config.model?.provider ?? "")
    setFormModelModel(config.model?.model ?? "")
    setFormTools((config.tools ?? []).join("\n"))
    setFormError("")
    setModalOpen(true)
  }

  const handleDelete = (name: string): void => {
    setSettings((current) => {
      const nextRoles = { ...current.roles }
      delete nextRoles[name]
      return { ...current, roles: nextRoles }
    })
  }

  const handleConfirm = (): void => {
    const name = formName.trim()
    if (!SUBAGENT_ROLE_NAME_PATTERN.test(name)) {
      setFormError(t("settings.subagentsNameInvalid"))
      return
    }
    if ((RESERVED_SUBAGENT_ROLE_NAMES as readonly string[]).includes(name)) {
      setFormError(t("settings.subagentsNameReserved"))
      return
    }
    if (name !== editingName && Object.prototype.hasOwnProperty.call(settings.roles, name)) {
      setFormError(t("settings.subagentsNameDuplicate"))
      return
    }
    const description = formDescription.trim()
    if (!description) {
      setFormError(t("settings.subagentsDescriptionRequired"))
      return
    }

    const config: SubagentRoleConfig = { description }
    if (formInstructions.trim()) config.instructions = formInstructions.trim()
    if (formModelProvider && formModelModel) {
      config.model = { provider: formModelProvider, model: formModelModel }
    }
    const tools = parseToolsInput(formTools)
    if (tools.length > 0) config.tools = tools

    setSettings((current) => {
      const nextRoles: Record<string, SubagentRoleConfig> = {}
      for (const [key, value] of Object.entries(current.roles)) {
        if (editingName !== null && key === editingName) nextRoles[name] = config
        else nextRoles[key] = value
      }
      if (editingName === null) nextRoles[name] = config
      return { ...current, roles: nextRoles }
    })
    setModalOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t("settings.loadingSettings")}</span>
      </div>
    )
  }

  return (
    <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {loadFailed ? (
        <div className="flex items-center gap-1.5 rounded-[4px] bg-red-500/15 p-2 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{t("settings.loadSettingsFailed")}</span>
        </div>
      ) : null}

      {/* 全局治理卡片 */}
      <div className="settings-item-card flex flex-col gap-3 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-3">
        <h3 className="text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.85))]">
          {t("settings.subagentsGlobal")}
        </h3>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
              {t("settings.subagentsDefaultModel")}
            </span>
            <div className="grid gap-2">
              <LxSelect
                size="small"
                value={settings.defaultModel?.provider ?? ""}
                options={[
                  { value: "", label: t("settings.subagentsInheritModel") },
                  ...buildProviderOptions(settings.defaultModel?.provider ?? ""),
                ]}
                onChange={handleDefaultProviderChange}
              />
              <LxSelect
                size="small"
                value={settings.defaultModel?.model ?? ""}
                options={modelOptions(settings.defaultModel?.provider ?? "")}
                disabled={
                  !settings.defaultModel?.provider ||
                  modelOptions(settings.defaultModel?.provider ?? "").length === 0
                }
                onChange={handleDefaultModelChange}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
              {t("settings.subagentsMaxConcurrent")}
            </span>
            <LxInput
              type="number"
              min={1}
              max={SUBAGENT_MAX_CONCURRENCY_LIMIT}
              size="xs"
              aria-label={t("settings.subagentsMaxConcurrent")}
              value={settings.maxConcurrent ?? ""}
              onChange={handleMaxConcurrentChange}
            />
            <span className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
              {t("settings.subagentsMaxConcurrentHint")}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
              {t("settings.subagentsMaxDepth")}
            </span>
            <LxInput
              type="number"
              min={1}
              max={SUBAGENT_MAX_DEPTH_LIMIT}
              size="xs"
              aria-label={t("settings.subagentsMaxDepth")}
              value={settings.maxDepth ?? 1}
              onChange={handleMaxDepthChange}
            />
          </div>
        </div>
      </div>

      {/* 内置角色只读列表 */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.85))]">
          {t("settings.subagentsBuiltins")}
        </h3>
        <div className="flex flex-col gap-2">
          {builtins.map((role) => (
            <div
              key={role.name}
              className="flex flex-col gap-1.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.9))]">
                  {role.name}
                </span>
                <LxTag size="small" color="sky">
                  {t("settings.subagentsBuiltinTag")}
                </LxTag>
              </div>
              <p className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                {role.description}
              </p>
              <p className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                <span>{t("settings.subagentsTools")}:</span>{" "}
                <span className="font-mono">
                  {role.tools && role.tools.length > 0
                    ? role.tools.join(", ")
                    : t("settings.subagentsInheritTools")}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 用户自定义角色列表 */}
      <div className="flex flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h3 className="text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.85))]">
            {t("settings.subagentsUserRoles")}
          </h3>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.15))] bg-[var(--color-theme-surface,rgba(255,255,255,0.04))] px-2.5 py-1.5 text-xs text-[var(--color-theme-text,rgba(255,255,255,0.8))] transition-colors hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t("settings.subagentsAddRole")}</span>
          </button>
        </div>

        {roleEntries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
            {t("settings.subagentsNoRoles")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {roleEntries.map(([name, config]) => (
              <div
                key={name}
                className="flex flex-col gap-1.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.9))]">
                    {name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <LxIconButton
                      preset="default"
                      size="small"
                      onClick={() => handleOpenEdit(name, config)}
                      title={{ content: t("settings.edit"), placement: "top" }}
                      aria-label={t("settings.edit")}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-white/70" />
                    </LxIconButton>
                    <LxIconButton
                      preset="default"
                      size="small"
                      onClick={() => handleDelete(name)}
                      title={{ content: t("settings.delete"), placement: "top" }}
                      aria-label={t("settings.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400/80 hover:text-red-400" />
                    </LxIconButton>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                  {config.description}
                </p>
                <p className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                  <span>{t("settings.subagentsModel")}:</span>{" "}
                  <span>
                    {config.model
                      ? `${config.model.provider}/${config.model.model}`
                      : t("settings.subagentsInheritModel")}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                  <span>{t("settings.subagentsTools")}:</span>{" "}
                  <span className="font-mono">
                    {config.tools?.length
                      ? config.tools.join(", ")
                      : t("settings.subagentsInheritTools")}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <LxModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingName ? t("settings.subagentsEditRole") : t("settings.subagentsAddRole")}
        width="520px"
      >
        <div className="flex flex-col gap-3.5 p-1 text-xs text-white/80">
          {formError ? (
            <div className="flex items-center gap-1.5 rounded-[4px] bg-red-500/15 p-2 text-xs text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.subagentsName")} *</span>
            <LxInput
              size="sm"
              placeholder={t("settings.subagentsNamePlaceholder")}
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value)
                setFormError("")
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">
              {t("settings.subagentsDescription")} *
            </span>
            <LxInput
              size="sm"
              placeholder={t("settings.subagentsDescriptionPlaceholder")}
              value={formDescription}
              onChange={(e) => {
                setFormDescription(e.target.value)
                setFormError("")
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.subagentsInstructions")}</span>
            <LxInput
              size="sm"
              multiline
              placeholder={t("settings.subagentsInstructionsPlaceholder")}
              value={formInstructions}
              onChange={(e) => setFormInstructions(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.subagentsModel")}</span>
            <div className="grid gap-2">
              <LxSelect
                size="small"
                zIndex={MODAL_SELECT_Z_INDEX}
                value={formModelProvider}
                options={[
                  { value: "", label: t("settings.subagentsInheritModel") },
                  ...buildProviderOptions(formModelProvider),
                ]}
                onChange={(provider) => {
                  setFormModelProvider(provider)
                  const model = Object.values(providers[provider]?.models ?? {})[0]?.id ?? ""
                  setFormModelModel(model)
                }}
              />
              <LxSelect
                size="small"
                zIndex={MODAL_SELECT_Z_INDEX}
                value={formModelModel}
                options={modelOptions(formModelProvider)}
                disabled={!formModelProvider || modelOptions(formModelProvider).length === 0}
                onChange={(model) => setFormModelModel(model)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.subagentsTools")}</span>
            <LxInput
              size="sm"
              multiline
              placeholder={t("settings.subagentsToolsPlaceholder")}
              value={formTools}
              onChange={(e) => setFormTools(e.target.value)}
            />
            <span className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
              {t("settings.subagentsToolsHint")}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-[6px] border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
            >
              {t("settings.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-[6px] border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              {t("settings.confirm")}
            </button>
          </div>
        </div>
      </LxModal>
    </div>
  )
}
