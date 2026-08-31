import type {
  CustomCommandDetailItem,
  CustomCommandScope,
  CustomCommandType,
} from "@shared/contracts/customCommand"
import type { Project } from "@shared/project"
import { Folder, Globe, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectApi } from "@/features/project/api/projectApi"
import { useTranslation } from "@/i18n"
import { customCommandApi } from "../api/customCommandApi"
import { settingsDirtyStore } from "../hooks/settingsDirtyStore"
import { notifySettingsChanged } from "../settingsChangeNotifier"

interface CustomCommandFormState {
  name: string
  description: string
  content: string
  argumentHint: string
  mdScope: "global" | "template"
}

const DEFAULT_FORM: CustomCommandFormState = {
  name: "",
  description: "",
  content: "",
  argumentHint: "",
  mdScope: "global",
}

const draftStore: Record<string, CustomCommandFormState> = {}
const modifiedStore: Record<string, CustomCommandFormState> = {}

// 模块级清空所有缓存函数注册到全局 settingsDirtyStore，确保无论在哪个 Tab 点击重置都能彻底清空
settingsDirtyStore.registerClearCacheHandler(() => {
  for (const key of Object.keys(draftStore)) {
    delete draftStore[key]
  }
  for (const key of Object.keys(modifiedStore)) {
    delete modifiedStore[key]
  }
})

export const CustomCommandSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [activeTab, setActiveTab] = useState<CustomCommandType>("agentInput")
  const [selectedScope, setSelectedScope] = useState<CustomCommandScope>("user")
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [commands, setCommands] = useState<CustomCommandDetailItem[]>([])
  const [selectedCommandName, setSelectedCommandName] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [formData, setFormData] = useState<CustomCommandFormState>(DEFAULT_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [resetRevision, setResetRevision] = useState(0)

  // 1. 初始化拉取项目列表（仅包含有效 filesystem path 的项目）
  useEffect(() => {
    projectApi
      .listProjects()
      .then((list) => {
        const fsProjects = list.filter((p) => Boolean(p.path && p.path.trim()))
        setProjects(fsProjects)

        // 默认优先选中当前 active 会话绑定的项目
        const currentBinding = sessionListStore.getCurrentSessionBinding()
        if (currentBinding?.projectId) {
          const found = fsProjects.find((p) => p.id === currentBinding.projectId)
          if (found) {
            setSelectedProjectId(found.id)
            return
          }
        }
        if (fsProjects.length > 0) {
          setSelectedProjectId(fsProjects[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId)
  }, [projects, selectedProjectId])

  const effectiveProjectPath = useMemo(() => {
    return selectedScope === "project" ? currentProject?.path : undefined
  }, [selectedScope, currentProject])

  const draftKey = useMemo(() => {
    return `${activeTab}:${selectedScope}:${effectiveProjectPath ?? "global"}`
  }, [activeTab, selectedScope, effectiveProjectPath])

  const getCommandKey = useCallback(
    (name: string) => `${activeTab}:${selectedScope}:${effectiveProjectPath ?? "global"}:${name}`,
    [activeTab, selectedScope, effectiveProjectPath],
  )

  // 2. 加载命令列表
  const loadCommands = useCallback(
    async (targetSelectName?: string) => {
      if (selectedScope === "project" && !effectiveProjectPath) {
        setCommands([])
        return
      }
      setIsLoading(true)
      try {
        const list = await customCommandApi.list({
          type: activeTab,
          scope: selectedScope,
          projectPath: effectiveProjectPath,
        })
        setCommands(list)
        if (targetSelectName) {
          const match = list.find((c) => c.name === targetSelectName)
          if (match) {
            setSelectedCommandName(match.name)
            setIsEditingDraft(false)
          }
        }
      } catch {
        toast.error(t("settings.customCommandsLoadFailed"))
      } finally {
        setIsLoading(false)
      }
    },
    [activeTab, selectedScope, effectiveProjectPath, toast, t],
  )

  useEffect(() => {
    void loadCommands()
  }, [loadCommands, resetRevision])

  // 3. 检查当前 context 下是否存在 draft
  useEffect(() => {
    setHasDraft(Boolean(draftStore[draftKey]))
  }, [draftKey, resetRevision])

  // 4. 当选择的命令变更时同步到表单
  useEffect(() => {
    if (isEditingDraft) {
      setFormData(draftStore[draftKey] || DEFAULT_FORM)
      return
    }
    const current = commands.find((c) => c.name === selectedCommandName)
    if (current) {
      const modKey = getCommandKey(current.name)
      const cachedModified = modifiedStore[modKey]
      if (cachedModified) {
        setFormData(cachedModified)
      } else {
        setFormData({
          name: current.name,
          description: current.description,
          content: current.content,
          argumentHint: current.argumentHint || "",
          mdScope: current.mdScope || "global",
        })
      }
    } else if (hasDraft && !selectedCommandName) {
      setIsEditingDraft(true)
      setFormData(draftStore[draftKey] || DEFAULT_FORM)
    } else if (commands.length > 0) {
      const first = commands[0]
      setSelectedCommandName(first.name)
      const modKey = getCommandKey(first.name)
      const cachedModified = modifiedStore[modKey]
      if (cachedModified) {
        setFormData(cachedModified)
      } else {
        setFormData({
          name: first.name,
          description: first.description,
          content: first.content,
          argumentHint: first.argumentHint || "",
          mdScope: first.mdScope || "global",
        })
      }
    } else {
      setSelectedCommandName(null)
      setFormData(DEFAULT_FORM)
    }
  }, [
    commands,
    selectedCommandName,
    isEditingDraft,
    hasDraft,
    draftKey,
    getCommandKey,
    resetRevision,
  ])

  // 5. 脏数据判定 (Dirty State)
  const isDirty = useMemo(() => {
    if (isEditingDraft) {
      return (
        Boolean(formData.name.trim()) ||
        Boolean(formData.description.trim()) ||
        Boolean(formData.content.trim())
      )
    }
    if (!selectedCommandName) return false
    const orig = commands.find((c) => c.name === selectedCommandName)
    if (!orig) return false

    return (
      formData.name.trim() !== orig.name ||
      formData.description.trim() !== (orig.description || "") ||
      formData.content.trim() !== (orig.content || "") ||
      (activeTab === "agentInput" && formData.argumentHint.trim() !== (orig.argumentHint || "")) ||
      (activeTab === "agentMD" && (formData.mdScope || "global") !== (orig.mdScope || "global"))
    )
  }, [isEditingDraft, selectedCommandName, commands, formData, activeTab])

  // 全局是否有任何未保存的改动（包含其他分类下的 Draft 或已修改项）
  const hasAnyCustomCommandDirty = useMemo(() => {
    const hasAnyDraft = Object.values(draftStore).some((d) =>
      Boolean(d.name.trim() || d.description.trim() || d.content.trim()),
    )
    const hasAnyModified = Object.keys(modifiedStore).length > 0
    return isDirty || hasDraft || hasAnyDraft || hasAnyModified
  }, [isDirty, hasDraft])

  useEffect(() => {
    settingsDirtyStore.setSectionDirty("custom-commands", hasAnyCustomCommandDirty)
  }, [hasAnyCustomCommandDirty])

  // 6. 保存与重置逻辑引用绑定
  const handleSaveRef = useRef<() => Promise<void>>(async () => {})
  const handleResetRef = useRef<() => void>(() => {})

  handleResetRef.current = (): void => {
    // 彻底清空所有内存草稿与已修改记录
    for (const key of Object.keys(draftStore)) {
      delete draftStore[key]
    }
    for (const key of Object.keys(modifiedStore)) {
      delete modifiedStore[key]
    }
    setHasDraft(false)
    setIsEditingDraft(false)
    setResetRevision((prev) => prev + 1)
    if (commands.length > 0) {
      const first = commands[0]
      setSelectedCommandName(first.name)
      setFormData({
        name: first.name,
        description: first.description,
        content: first.content,
        argumentHint: first.argumentHint || "",
        mdScope: first.mdScope || "global",
      })
    } else {
      setSelectedCommandName(null)
      setFormData(DEFAULT_FORM)
    }
    settingsDirtyStore.setSectionDirty("custom-commands", false)
  }

  handleSaveRef.current = async (): Promise<void> => {
    const trimmedName = formData.name.trim()
    if (!trimmedName) {
      toast.error(t("settings.customCommandNameRequired"))
      throw new Error("Command name is required")
    }
    if (selectedScope === "project" && !effectiveProjectPath) {
      toast.error(t("settings.customCommandProjectPathRequired"))
      throw new Error("Project path is required")
    }

    const result = await customCommandApi.save({
      type: activeTab,
      scope: selectedScope,
      projectPath: effectiveProjectPath,
      oldName: isEditingDraft ? undefined : (selectedCommandName ?? undefined),
      name: trimmedName,
      description: formData.description.trim(),
      content: formData.content.trim(),
      argumentHint: activeTab === "agentInput" ? formData.argumentHint.trim() : undefined,
      mdScope: activeTab === "agentMD" ? formData.mdScope : undefined,
    })

    if (!result.ok) {
      toast.error(result.error || t("settings.customCommandSaveFailed"))
      throw new Error(result.error)
    }

    delete draftStore[draftKey]
    if (selectedCommandName) {
      delete modifiedStore[getCommandKey(selectedCommandName)]
    }
    delete modifiedStore[getCommandKey(result.item.name)]

    setHasDraft(false)
    setIsEditingDraft(false)
    setSelectedCommandName(result.item.name)
    notifySettingsChanged("customCommands")
    await loadCommands(result.item.name)
  }

  useEffect(() => {
    const unregisterSave = settingsDirtyStore.registerSaveHandler("custom-commands", () =>
      handleSaveRef.current(),
    )
    const unregisterReset = settingsDirtyStore.registerResetHandler("custom-commands", () =>
      handleResetRef.current(),
    )
    return () => {
      unregisterSave()
      unregisterReset()
    }
  }, [])

  // 切换分类或作用域
  const handleTabChange = (val: string): void => {
    setActiveTab(val as CustomCommandType)
    setIsEditingDraft(false)
    setSelectedCommandName(null)
  }

  const handleScopeChange = (val: string): void => {
    setSelectedScope(val as CustomCommandScope)
    setIsEditingDraft(false)
    setSelectedCommandName(null)
  }

  const handleStartCreate = (): void => {
    if (!draftStore[draftKey]) {
      draftStore[draftKey] = DEFAULT_FORM
    }
    setHasDraft(true)
    setIsEditingDraft(true)
    setSelectedCommandName(null)
    setFormData(draftStore[draftKey])
  }

  const handleFormChange = (
    updater: (prev: CustomCommandFormState) => CustomCommandFormState,
  ): void => {
    setFormData((prev) => {
      const next = updater(prev)
      if (isEditingDraft) {
        draftStore[draftKey] = next
        setHasDraft(true)
      } else if (selectedCommandName) {
        const modKey = getCommandKey(selectedCommandName)
        modifiedStore[modKey] = next
      }
      return next
    })
  }

  const handleDeleteDraft = (): void => {
    delete draftStore[draftKey]
    setHasDraft(false)
    setIsEditingDraft(false)
    if (commands.length > 0) {
      setSelectedCommandName(commands[0].name)
    } else {
      setSelectedCommandName(null)
      setFormData(DEFAULT_FORM)
    }
  }

  const handleDelete = async (name: string): Promise<void> => {
    try {
      const res = await customCommandApi.delete({
        type: activeTab,
        scope: selectedScope,
        name,
        projectPath: effectiveProjectPath,
      })
      if (!res.ok) {
        toast.error(res.error || t("settings.customCommandDeleteFailed"))
        return
      }
      delete modifiedStore[getCommandKey(name)]
      toast.success(t("settings.customCommandDeleteSuccess"))
      notifySettingsChanged("customCommands")
      if (selectedCommandName === name) {
        setSelectedCommandName(null)
      }
      await loadCommands()
    } catch {
      toast.error(t("settings.customCommandDeleteFailed"))
    }
  }

  const agentInputInfoDoc = `### ${t("settings.customCommandAgentInputHelpTitle")}
${t("settings.customCommandAgentInputHelpDesc")}

#### ${t("settings.customCommandMacroTitle")}
- \`$1, $2, ...\`: ${t("settings.customCommandMacroPositional")}
- \`$@\` / \`$ARGUMENTS\`: ${t("settings.customCommandMacroAll")}
- \`\${1:-default}\`: ${t("settings.customCommandMacroDefault")}
- \`\${@:2}\`: ${t("settings.customCommandMacroSlice")}
`

  const agentMDInfoDoc = `### ${t("settings.customCommandAgentMDHelpTitle")}
${t("settings.customCommandAgentMDHelpDesc")}

#### ${t("settings.customCommandMDScopeTitle")}
- **Global**: ${t("settings.customCommandMDGlobalScopeDesc")}
- **Template**: ${t("settings.customCommandMDTemplateScopeDesc")}
`

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      {/* 顶部分类 Tab 与作用域切换栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-2">
          <div className="custom-command-tab-group flex items-center rounded-[6px] border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              data-active={activeTab === "agentInput"}
              className={`rounded-[4px] px-3 py-1 text-xs transition-colors ${
                activeTab === "agentInput"
                  ? "bg-white/10 text-white font-medium shadow-xs"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => handleTabChange("agentInput")}
            >
              {t("settings.customCommandAgentInputTab")}
            </button>
            <button
              type="button"
              data-active={activeTab === "agentMD"}
              className={`rounded-[4px] px-3 py-1 text-xs transition-colors ${
                activeTab === "agentMD"
                  ? "bg-white/10 text-white font-medium shadow-xs"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => handleTabChange("agentMD")}
            >
              {t("settings.customCommandAgentMDTab")}
            </button>
          </div>
          <LxInfoTooltip
            markdown={activeTab === "agentInput" ? agentInputInfoDoc : agentMDInfoDoc}
            placement="bottom"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedScope === "project" && (
            <div className="w-[180px]">
              <LxSelect
                value={selectedProjectId}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                placeholder={t("settings.customCommandSelectProject")}
                onChange={(val) => {
                  setSelectedProjectId(val)
                  setSelectedCommandName(null)
                  setIsEditingDraft(false)
                }}
              />
            </div>
          )}

          <div className="custom-command-tab-group flex items-center rounded-[6px] border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              data-active={selectedScope === "user"}
              className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                selectedScope === "user"
                  ? "bg-white/10 text-white font-medium shadow-xs"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => handleScopeChange("user")}
            >
              <Globe className="h-3.5 w-3.5 text-sky-400" />
              {t("settings.customCommandGlobalScope")}
            </button>
            <button
              type="button"
              data-active={selectedScope === "project"}
              className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                selectedScope === "project"
                  ? "bg-white/10 text-white font-medium shadow-xs"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => handleScopeChange("project")}
            >
              <Folder className="h-3.5 w-3.5 text-amber-400" />
              {t("settings.customCommandProjectScope")}
            </button>
          </div>
        </div>
      </div>

      {/* 主体两栏布局：左侧命令列表，右侧编辑面板 */}
      <div className="grid min-h-0 flex-1 gap-3 @[600px]:grid-cols-[220px_minmax(0,1fr)]">
        {/* 左侧列表 */}
        <div className="settings-item-card flex min-h-0 flex-col rounded-[6px] border border-white/8 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/8 p-2">
            <span className="text-xs font-medium text-white/70">
              {t("settings.customCommandsList")} ({commands.length + (hasDraft ? 1 : 0)})
            </span>
            <LxIconButton
              preset="add"
              size="small"
              aria-label={t("settings.addCustomCommand")}
              title={{ content: t("settings.addCustomCommand"), placement: "top" }}
              onClick={handleStartCreate}
            >
              <Plus className="h-3.5 w-3.5" />
            </LxIconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
            {isLoading ? (
              <div className="py-4 text-center text-xs text-white/40">{t("common.loading")}</div>
            ) : commands.length === 0 && !hasDraft ? (
              <div className="py-6 text-center text-xs text-white/40">
                {t("settings.customCommandsEmpty")}
              </div>
            ) : (
              <>
                {/* 草稿项：只要 hasDraft 存在就常驻列表，不随查看其它命令而消失 */}
                {hasDraft && (
                  <div
                    role="button"
                    tabIndex={0}
                    className={`group flex items-center justify-between rounded-[4px] px-2 py-1.5 text-xs transition-colors cursor-pointer ${
                      isEditingDraft
                        ? "bg-white/10 text-white font-medium"
                        : "text-emerald-400 hover:bg-white/5"
                    }`}
                    onClick={() => {
                      setIsEditingDraft(true)
                      setSelectedCommandName(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setIsEditingDraft(true)
                        setSelectedCommandName(null)
                      }
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="text-emerald-400/60 font-mono">/</span>
                      <span className="truncate italic">
                        {formData.name.trim() || t("settings.newCustomCommandDraft")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <LxTag size="small" bgClass="bg-emerald-500/20 text-emerald-300">
                        Draft
                      </LxTag>
                      <button
                        type="button"
                        aria-label={t("common.delete")}
                        className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteDraft()
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}

                {commands.map((cmd) => {
                  const isSelected = !isEditingDraft && cmd.name === selectedCommandName
                  const isItemModified = Boolean(modifiedStore[getCommandKey(cmd.name)])
                  return (
                    <div
                      key={cmd.name}
                      role="button"
                      tabIndex={0}
                      className={`group flex items-center justify-between rounded-[4px] px-2 py-1.5 text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-white/10 text-white font-medium"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                      onClick={() => {
                        setIsEditingDraft(false)
                        setSelectedCommandName(cmd.name)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setIsEditingDraft(false)
                          setSelectedCommandName(cmd.name)
                        }
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="text-white/40 font-mono">/</span>
                        <span className="truncate font-mono">{cmd.name}</span>
                        {isItemModified && (
                          <span
                            aria-label="Modified"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <LxTooltip
                          title={t("common.delete")}
                          content={t("settings.confirmDeleteCustomCommand", { name: cmd.name })}
                          onConfirm={() => void handleDelete(cmd.name)}
                          placement="top"
                        >
                          <button
                            type="button"
                            aria-label={t("common.delete")}
                            className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </LxTooltip>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* 右侧表单编辑区（已移除组件内部保存按钮，统一由全局 Header 保存） */}
        <div className="settings-item-card flex min-h-0 flex-1 flex-col rounded-[6px] border border-white/8 bg-white/[0.02] p-3 overflow-y-auto custom-scrollbar">
          {!selectedCommandName && !isEditingDraft && commands.length === 0 && !hasDraft ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-white/40">
              <p>{t("settings.customCommandsEmptyTip")}</p>
              <button
                type="button"
                className="inline-flex items-center rounded-[6px] bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 transition-colors"
                onClick={handleStartCreate}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("settings.addCustomCommand")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/8 pb-2">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <span>
                    {isEditingDraft
                      ? t("settings.createCustomCommandTitle")
                      : t("settings.editCustomCommandTitle", {
                          name: selectedCommandName ?? "",
                        })}
                  </span>
                  {isDirty && (
                    <span aria-label="Unsaved" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </h3>
              </div>

              {/* 字段输入区 */}
              <div className="grid gap-3 @[500px]:grid-cols-2">
                <label className="grid gap-1 text-xs text-white/60">
                  <span className="flex items-center gap-1">
                    {t("settings.customCommandName")}
                    <span className="text-rose-400">*</span>
                  </span>
                  <LxInput
                    placeholder="e.g. reviewCode"
                    prefix={<span className="text-white/40 font-mono">/</span>}
                    value={formData.name}
                    onChange={(e) =>
                      handleFormChange((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </label>

                <label className="grid gap-1 text-xs text-white/60">
                  <span>{t("settings.customCommandDescription")}</span>
                  <LxInput
                    placeholder={t("settings.customCommandDescriptionPlaceholder")}
                    value={formData.description}
                    onChange={(e) =>
                      handleFormChange((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />
                </label>

                {activeTab === "agentInput" ? (
                  <label className="grid gap-1 text-xs text-white/60 @[500px]:col-span-2">
                    <span className="flex items-center gap-1">
                      {t("settings.customCommandArgumentHint")}
                      <LxInfoTooltip
                        markdown={`\`argument-hint\`: ${t("settings.customCommandArgumentHintHelp")}`}
                      />
                    </span>
                    <LxInput
                      placeholder="e.g. [feature] [branch]"
                      value={formData.argumentHint}
                      onChange={(e) =>
                        handleFormChange((prev) => ({
                          ...prev,
                          argumentHint: e.target.value,
                        }))
                      }
                    />
                  </label>
                ) : (
                  <label className="grid gap-1 text-xs text-white/60 @[500px]:col-span-2">
                    <span className="flex items-center gap-1">
                      {t("settings.customCommandMDScope")}
                      <LxInfoTooltip
                        markdown={`**global**: ${t("settings.customCommandMDGlobalScopeDesc")}\n\n**template**: ${t("settings.customCommandMDTemplateScopeDesc")}`}
                      />
                    </span>
                    <LxSelect
                      value={formData.mdScope}
                      options={[
                        { value: "global", label: t("settings.customCommandScopeGlobal") },
                        {
                          value: "template",
                          label: t("settings.customCommandScopeTemplateOnly"),
                        },
                      ]}
                      onChange={(val) =>
                        handleFormChange((prev) => ({
                          ...prev,
                          mdScope: val as "global" | "template",
                        }))
                      }
                    />
                  </label>
                )}

                <label className="grid gap-1 text-xs text-white/60 @[500px]:col-span-2">
                  <span className="flex items-center gap-1">
                    {t("settings.customCommandContent")}
                    <span className="text-rose-400">*</span>
                  </span>
                  <LxInput
                    multiline
                    rows={12}
                    className="font-mono text-xs"
                    placeholder={t("settings.customCommandContentPlaceholder")}
                    value={formData.content}
                    onChange={(e) =>
                      handleFormChange((prev) => ({ ...prev, content: e.target.value }))
                    }
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
