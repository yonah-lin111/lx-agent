import type {
  CustomCommandDetailItem,
  CustomCommandScope,
  CustomCommandType,
} from "@shared/contracts/customCommand"
import type { Project } from "@shared/project"
import { Folder, Globe, LayoutTemplate, Plus, SlidersHorizontal, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown/LxMarkdownEditor"
import type {
  MarkdownToolbarAction,
  MarkdownToolbarSelectContext,
} from "@/components/ui/LxMarkdown/types"
import { LxMenu } from "@/components/ui/LxMenu"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { LxSelect } from "@/components/ui/LxSelect"
import { useLxToast } from "@/components/ui/LxToast"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { isInsideMarkdownTemplateBlock } from "@/features/markdown/commands/markdownBlockCommands"
import { projectApi } from "@/features/project/api/projectApi"
import { customCommandApi } from "@/features/settings/api/customCommandApi"
import {
  CommandMetaFields,
  type CustomCommandFormState,
  DEFAULT_CUSTOM_COMMAND_FORM,
} from "@/features/settings/components/CommandMetaFields"
import { CommandNav } from "@/features/settings/components/CommandNav"
import { MarkdownBlockGuide } from "@/features/settings/components/MarkdownBlockGuide"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"

// 设置页视图：对话命令 / md 命令 / md 模板块说明。
type CustomCommandView = CustomCommandType | "blocks"

const draftStore: Record<string, CustomCommandFormState> = {}
const modifiedStore: Record<string, CustomCommandFormState> = {}

export const CustomCommandSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [activeView, setActiveView] = useState<CustomCommandView>("agentInput")
  const [selectedScope, setSelectedScope] = useState<CustomCommandScope>("user")
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [commands, setCommands] = useState<CustomCommandDetailItem[]>([])
  const [selectedCommandName, setSelectedCommandName] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [formData, setFormData] = useState<CustomCommandFormState>(DEFAULT_CUSTOM_COMMAND_FORM)
  const [isLoading, setIsLoading] = useState(false)
  // 命令行右键菜单状态：坐标、滚动关闭锚点与目标命令。
  const [menuState, setMenuState] = useState<{
    commandName: string
    x: number
    y: number
    anchor: HTMLElement | null
  } | null>(null)
  const [isConfirmingMenuDelete, setIsConfirmingMenuDelete] = useState(false)
  // 命令元数据字段默认折叠，由右栏头部按钮展开；新建草稿时自动展开。
  const [isMetaExpanded, setIsMetaExpanded] = useState(false)

  const isBlocksView = activeView === "blocks"
  // 命令视图下对应的命令类型（blocks 视图不加载命令，占位值不会被使用）。
  const commandType: CustomCommandType = activeView === "blocks" ? "agentInput" : activeView

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
    return `${commandType}:${selectedScope}:${effectiveProjectPath ?? "global"}`
  }, [commandType, selectedScope, effectiveProjectPath])

  const getCommandKey = useCallback(
    (name: string) => `${commandType}:${selectedScope}:${effectiveProjectPath ?? "global"}:${name}`,
    [commandType, selectedScope, effectiveProjectPath],
  )

  // 2. 加载命令列表
  const loadCommands = useCallback(
    async (targetSelectName?: string) => {
      if (isBlocksView) return
      if (selectedScope === "project" && !effectiveProjectPath) {
        setCommands([])
        return
      }
      setIsLoading(true)
      try {
        const list = await customCommandApi.list({
          type: commandType,
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
    [commandType, isBlocksView, selectedScope, effectiveProjectPath, toast, t],
  )

  useEffect(() => {
    void loadCommands()
  }, [loadCommands])

  // 3. 检查当前 context 下是否存在 draft
  useEffect(() => {
    setHasDraft(Boolean(draftStore[draftKey]))
  }, [draftKey])

  // 4. 当选择的命令变更时同步到表单
  useEffect(() => {
    if (isBlocksView) return
    if (isEditingDraft) {
      setFormData(draftStore[draftKey] || DEFAULT_CUSTOM_COMMAND_FORM)
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
      setFormData(draftStore[draftKey] || DEFAULT_CUSTOM_COMMAND_FORM)
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
      setFormData(DEFAULT_CUSTOM_COMMAND_FORM)
    }
  }, [
    commands,
    selectedCommandName,
    isEditingDraft,
    hasDraft,
    draftKey,
    getCommandKey,
    isBlocksView,
  ])

  // 5. 脏数据判定 (Dirty State)
  const isDirty = useMemo(() => {
    if (isBlocksView) return false
    if (isEditingDraft) {
      return (
        Boolean(formData.name.trim()) ||
        Boolean(formData.description.trim()) ||
        Boolean(formData.content.trimEnd())
      )
    }
    if (!selectedCommandName) return false
    const orig = commands.find((c) => c.name === selectedCommandName)
    if (!orig) return false

    return (
      formData.name.trim() !== orig.name ||
      formData.description.trim() !== (orig.description || "") ||
      formData.content.trimEnd() !== (orig.content || "").trimEnd() ||
      formData.argumentHint.trim() !== (orig.argumentHint || "") ||
      (commandType === "agentMD" && (formData.mdScope || "global") !== (orig.mdScope || "global"))
    )
  }, [isBlocksView, isEditingDraft, selectedCommandName, commands, formData, commandType])

  const [isSaving, setIsSaving] = useState(false)

  // 6. 保存逻辑引用绑定
  const handleSaveRef = useRef<() => Promise<void>>(async () => {})

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await handleSaveRef.current()
      toast.success(t("settings.customCommandSaveSuccess"))
    } catch {
      // toast already shown in handleSaveRef
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = useCallback((): void => {
    if (isEditingDraft) {
      delete draftStore[draftKey]
      setHasDraft(false)
      setIsEditingDraft(false)
      if (commands.length > 0) {
        setSelectedCommandName(commands[0].name)
      } else {
        setSelectedCommandName(null)
        setFormData(DEFAULT_CUSTOM_COMMAND_FORM)
      }
    } else if (selectedCommandName) {
      delete modifiedStore[getCommandKey(selectedCommandName)]
      const orig = commands.find((c) => c.name === selectedCommandName)
      if (orig) {
        setFormData({
          name: orig.name,
          description: orig.description,
          content: orig.content,
          argumentHint: orig.argumentHint || "",
          mdScope: orig.mdScope || "global",
        })
      }
    }
  }, [isEditingDraft, draftKey, commands, selectedCommandName, getCommandKey])

  useRegisterSettingsSection({
    section: "custom-commands",
    isDirty,
    isSaving,
    onSave: handleSave,
    onReset: handleReset,
  })

  handleSaveRef.current = async (): Promise<void> => {
    if (isBlocksView) return
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
      type: commandType,
      scope: selectedScope,
      projectPath: effectiveProjectPath,
      oldName: isEditingDraft ? undefined : (selectedCommandName ?? undefined),
      name: trimmedName,
      description: formData.description.trim(),
      content: formData.content.trimEnd(),
      argumentHint: formData.argumentHint.trim() ? formData.argumentHint.trim() : undefined,
      mdScope: commandType === "agentMD" ? formData.mdScope : undefined,
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

  // 内容编辑器重挂载标识：切换命令/草稿/作用域时重建编辑器，避免 undo 历史跨命令串扰。
  const editorKey = `${draftKey}:${isEditingDraft ? "draft" : (selectedCommandName ?? "empty")}`

  // 切换视图或作用域
  const handleViewChange = (value: string): void => {
    setActiveView(value as CustomCommandView)
    setIsEditingDraft(false)
    setSelectedCommandName(null)
  }

  const handleScopeChange = (value: string): void => {
    setSelectedScope(value as CustomCommandScope)
    setIsEditingDraft(false)
    setSelectedCommandName(null)
  }

  const handleStartCreate = (): void => {
    if (!draftStore[draftKey]) {
      draftStore[draftKey] = DEFAULT_CUSTOM_COMMAND_FORM
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
      setFormData(DEFAULT_CUSTOM_COMMAND_FORM)
    }
  }

  const handleDelete = async (name: string): Promise<void> => {
    try {
      const res = await customCommandApi.delete({
        type: commandType,
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

  // 右键菜单在切换目标或关闭时重置二次确认态。
  useEffect(() => {
    setIsConfirmingMenuDelete(false)
  }, [menuState])

  // 新建草稿必须展开字段表单，避免看不到命令名称等必填项。
  useEffect(() => {
    if (isEditingDraft) setIsMetaExpanded(true)
  }, [isEditingDraft])

  // 右键菜单删除：首次点击进入确认态，二次点击执行删除。
  const handleMenuDelete = (): void => {
    if (!menuState) return
    if (!isConfirmingMenuDelete) {
      setIsConfirmingMenuDelete(true)
      return
    }
    const name = menuState.commandName
    setMenuState(null)
    void handleDelete(name)
  }

  // 模板块插入下拉：选中即在光标处插入骨架；任务块全局可用，临时块 / 记录块仅限任务块内部。
  const toolbarActions = useMemo<MarkdownToolbarAction[]>(() => {
    const bodyOffset = (text: string): number => text.indexOf("\n\n") + 1
    const templateBlock = "&&& xxxTemplate --start 「title: 」\n\n&&& xxxTemplate --end"
    const suppleBlock = "+++ xxxTemplate --start 「title: 」\n\n+++ xxxTemplate --end"
    const logBlock = "%%% xxxTemplate --start 「title: 」\n\n%%% xxxTemplate --end"
    const requiresTemplateBlock = (context: MarkdownToolbarSelectContext): boolean =>
      isInsideMarkdownTemplateBlock(context.textBeforeCursor)

    return [
      {
        icon: LayoutTemplate,
        label: t("settings.customCommandInsertBlock"),
        alignRight: true,
        select: {
          placeholder: t("settings.customCommandInsertBlock"),
          options: [
            {
              label: t("settings.customCommandBlockTemplateName"),
              insertText: templateBlock,
              selectionOffset: bodyOffset(templateBlock),
            },
            ...(commandType === "agentMD"
              ? [
                  {
                    label: t("settings.customCommandBlockSuppleName"),
                    insertText: suppleBlock,
                    selectionOffset: bodyOffset(suppleBlock),
                    isAvailable: requiresTemplateBlock,
                  },
                  {
                    label: t("settings.customCommandBlockLogName"),
                    insertText: logBlock,
                    selectionOffset: bodyOffset(logBlock),
                    isAvailable: requiresTemplateBlock,
                  },
                ]
              : []),
          ],
        },
      },
    ]
  }, [t, commandType])

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

#### ${t("settings.customCommandMDBlocksTitle")}
- \`&&&\`: ${t("settings.customCommandMDTemplateBlockDesc")}
- \`+++\`: ${t("settings.customCommandMDSuppleBlockDesc")}
- \`%%%\`: ${t("settings.customCommandMDLogBlockDesc")}
`

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      {/* 顶部视图切换、说明与作用域选择栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-[150px] max-w-full">
            <LxSelect
              value={activeView}
              options={[
                { value: "agentInput", label: t("settings.customCommandViewChat") },
                { value: "agentMD", label: t("settings.customCommandViewMd") },
                { value: "blocks", label: t("settings.customCommandViewBlocks") },
              ]}
              onChange={(value) => handleViewChange(value)}
            />
          </div>
          {!isBlocksView && (
            <LxInfoTooltip
              markdown={commandType === "agentInput" ? agentInputInfoDoc : agentMDInfoDoc}
              placement="bottom"
            />
          )}
        </div>

        {!isBlocksView && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {selectedScope === "project" && (
              <div className="w-[180px] max-w-full">
                <LxSelect
                  value={selectedProjectId}
                  options={projects.map((p) => ({
                    value: p.id,
                    label: p.name,
                    isImported: p.isImported !== false,
                  }))}
                  placeholder={t("settings.customCommandSelectProject")}
                  onChange={(value) => {
                    setSelectedProjectId(value)
                    setSelectedCommandName(null)
                    setIsEditingDraft(false)
                  }}
                />
              </div>
            )}

            <div className="w-[150px] max-w-full">
              <LxSelect
                value={selectedScope}
                options={[
                  {
                    value: "user",
                    label: t("settings.customCommandGlobalScope"),
                    icon: <Globe className="h-3.5 w-3.5 text-sky-400" />,
                  },
                  {
                    value: "project",
                    label: t("settings.customCommandProjectScope"),
                    icon: <Folder className="h-3.5 w-3.5 text-amber-400" />,
                  },
                ]}
                onChange={(value) => handleScopeChange(value)}
              />
            </div>
          </div>
        )}
      </div>

      {isBlocksView ? (
        <MarkdownBlockGuide />
      ) : (
        /* 主体两栏布局：左侧命令列表，右侧编辑面板 */
        <div className="custom-scrollbar grid min-h-0 flex-1 gap-3 overflow-y-auto @[560px]:overflow-hidden @[560px]:grid-cols-[220px_minmax(0,1fr)]">
          <CommandNav
            commands={commands}
            selectedCommandName={selectedCommandName}
            isEditingDraft={isEditingDraft}
            hasDraft={hasDraft}
            draftName={formData.name}
            isLoading={isLoading}
            isCommandModified={(name) => Boolean(modifiedStore[getCommandKey(name)])}
            onSelectCommand={(name) => {
              setIsEditingDraft(false)
              setSelectedCommandName(name)
            }}
            onSelectDraft={() => {
              setIsEditingDraft(true)
              setSelectedCommandName(null)
            }}
            onDeleteDraft={handleDeleteDraft}
            onStartCreate={handleStartCreate}
            onOpenContextMenu={(commandName, x, y, anchor) =>
              setMenuState({ commandName, x, y, anchor })
            }
          />

          {/* 右侧表单编辑区 */}
          <div className="settings-item-card flex min-h-0 flex-1 flex-col rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
            {!selectedCommandName && !isEditingDraft && commands.length === 0 && !hasDraft ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-white/40">
                <p>{t("settings.customCommandsEmptyTip")}</p>
                <LxIconButton
                  iconOnly={false}
                  onClick={handleStartCreate}
                  textClass="text-white"
                  hoverBgClass="hover:bg-white/15"
                  className="rounded-[6px] bg-white/10 cursor-pointer"
                  icon={<Plus />}
                >
                  {t("settings.addCustomCommand")}
                </LxIconButton>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/8 pb-2">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-white">
                    <span className="truncate">
                      {isEditingDraft
                        ? t("settings.createCustomCommandTitle")
                        : t("settings.editCustomCommandTitle", {
                            name: selectedCommandName ?? "",
                          })}
                    </span>
                    {isDirty && (
                      <span
                        aria-label="Unsaved"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                      />
                    )}
                  </h3>
                  <LxIconButton
                    aria-label={t("settings.customCommandMetaExpand")}
                    title={{
                      content: isMetaExpanded
                        ? t("settings.customCommandMetaCollapse")
                        : t("settings.customCommandMetaExpand"),
                      placement: "bottom",
                    }}
                    highlighted={isMetaExpanded}
                    onClick={() => setIsMetaExpanded((prev) => !prev)}
                  >
                    <SlidersHorizontal />
                  </LxIconButton>
                </div>

                {/* 字段输入区：默认折叠，由头部按钮展开 */}
                {isMetaExpanded && (
                  <CommandMetaFields
                    activeTab={commandType}
                    formData={formData}
                    onChange={handleFormChange}
                  />
                )}

                {/* 内容编辑区：Markdown 编辑器撑满剩余高度 */}
                <div className="flex min-h-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1 text-xs text-white/60">
                    {t("settings.customCommandContent")}
                    <span className="text-rose-400">*</span>
                  </span>
                  <div className="flex min-h-[240px] flex-1 flex-col @[560px]:min-h-0">
                    <LxMarkdownEditor
                      key={editorKey}
                      initialContent={formData.content}
                      toolbarActions={toolbarActions}
                      onChange={(content) => handleFormChange((prev) => ({ ...prev, content }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <LxMenu
        ariaLabel={t("settings.customCommandMenu", { name: menuState?.commandName ?? "" })}
        anchor={menuState?.anchor ?? null}
        isOpen={menuState !== null}
        x={menuState?.x ?? 0}
        y={menuState?.y ?? 0}
        onClose={() => setMenuState(null)}
      >
        <LxMenuItem
          active={isConfirmingMenuDelete}
          danger
          leading={
            <Trash2
              className={`h-3.5 w-3.5 ${isConfirmingMenuDelete ? "text-white" : "text-rose-400/80"}`}
            />
          }
          onClick={handleMenuDelete}
        >
          {isConfirmingMenuDelete
            ? t("settings.customCommandConfirmDelete")
            : t("settings.customCommandDelete")}
        </LxMenuItem>
      </LxMenu>
    </div>
  )
}
