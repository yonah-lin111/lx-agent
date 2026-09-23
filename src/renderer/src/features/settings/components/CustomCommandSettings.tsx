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
  MarkdownToolbarSelectOption,
} from "@/components/ui/LxMarkdown/types"
import { LxMenu } from "@/components/ui/LxMenu"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { LxSelect } from "@/components/ui/LxSelect"
import { useLxToast } from "@/components/ui/LxToast"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import {
  buildAgentBlockSource,
  extractAgentBlockBody,
  injectCustomTemplateBlockIds,
  isInsideMarkdownTemplateBlock,
  normalizeAgentBlockBody,
} from "@/features/markdown/commands/markdownBlockCommands"
import { agentBlockPreviewExtensions } from "@/features/markdown/extensions/markdownAgentBlockPreview"
import { projectApi } from "@/features/project/api/projectApi"
import { customCommandApi } from "@/features/settings/api/customCommandApi"
import {
  CommandMetaFields,
  type CustomCommandFormState,
  DEFAULT_CUSTOM_COMMAND_FORM,
} from "@/features/settings/components/CommandMetaFields"
import { CommandNav } from "@/features/settings/components/CommandNav"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"

// 设置页视图：对话命令 / md 命令 / md 模板块。
type CustomCommandView = CustomCommandType | "blocks"

const draftStore: Record<string, CustomCommandFormState> = {}
const modifiedStore: Record<string, CustomCommandFormState> = {}

// 表单状态 ← 命令条目；模板块正文先规范化（剥离误粘贴的起止行并提取 title）。
const toFormState = (item: CustomCommandDetailItem): CustomCommandFormState => {
  if (item.type === "agentBlock") {
    const normalized = normalizeAgentBlockBody(item.content, item.blockType || "template")
    return {
      name: item.name,
      description: item.description,
      content: normalized.content,
      argumentHint: item.argumentHint || "",
      mdScope: item.mdScope || "global",
      blockType: item.blockType || "template",
      title: item.title || normalized.title || "",
    }
  }

  return {
    name: item.name,
    description: item.description,
    content: item.content,
    argumentHint: item.argumentHint || "",
    mdScope: item.mdScope || "global",
    blockType: item.blockType || "template",
    title: item.title || "",
  }
}

export const CustomCommandSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [activeView, setActiveView] = useState<CustomCommandView>("agentInput")
  const [selectedScope, setSelectedScope] = useState<CustomCommandScope>("user")
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [commands, setCommands] = useState<CustomCommandDetailItem[]>([])
  // 模板块库（user + project 全部），供编辑器工具栏"插入模板块"下拉使用。
  const [blockCommands, setBlockCommands] = useState<CustomCommandDetailItem[]>([])
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
  // 当前视图对应的命令类型：blocks 视图管理 agentBlock 类型的模板块条目。
  const commandType: CustomCommandType = isBlocksView ? "agentBlock" : activeView

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

  // 2. 加载当前视图的命令 / 模板块列表
  const loadCommands = useCallback(
    async (targetSelectName?: string) => {
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
    [commandType, selectedScope, effectiveProjectPath, toast, t],
  )

  useEffect(() => {
    void loadCommands()
  }, [loadCommands])

  // 2.1 加载全部模板块（user + project）供编辑器工具栏下拉使用。
  useEffect(() => {
    customCommandApi
      .list({ type: "agentBlock", projectPath: effectiveProjectPath })
      .then(setBlockCommands)
      .catch(() => {})
  }, [effectiveProjectPath])

  // 3. 检查当前 context 下是否存在 draft
  useEffect(() => {
    setHasDraft(Boolean(draftStore[draftKey]))
  }, [draftKey])

  // 4. 当选择的命令变更时同步到表单
  useEffect(() => {
    if (isEditingDraft) {
      setFormData(draftStore[draftKey] || DEFAULT_CUSTOM_COMMAND_FORM)
      return
    }
    const current = commands.find((c) => c.name === selectedCommandName)
    if (current) {
      const modKey = getCommandKey(current.name)
      setFormData(modifiedStore[modKey] ?? toFormState(current))
    } else if (hasDraft && !selectedCommandName) {
      setIsEditingDraft(true)
      setFormData(draftStore[draftKey] || DEFAULT_CUSTOM_COMMAND_FORM)
    } else if (commands.length > 0) {
      const first = commands[0]
      setSelectedCommandName(first.name)
      const modKey = getCommandKey(first.name)
      setFormData(modifiedStore[modKey] ?? toFormState(first))
    } else {
      setSelectedCommandName(null)
      setFormData(DEFAULT_CUSTOM_COMMAND_FORM)
    }
  }, [commands, selectedCommandName, isEditingDraft, hasDraft, draftKey, getCommandKey])

  // 5. 脏数据判定 (Dirty State)
  const isDirty = useMemo(() => {
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
      (commandType === "agentInput" &&
        formData.argumentHint.trim() !== (orig.argumentHint || "")) ||
      (commandType === "agentMD" &&
        (formData.argumentHint.trim() !== (orig.argumentHint || "") ||
          (formData.mdScope || "global") !== (orig.mdScope || "global"))) ||
      (commandType === "agentBlock" &&
        ((formData.blockType || "template") !== (orig.blockType || "template") ||
          formData.title.trim() !== (orig.title || "")))
    )
  }, [isEditingDraft, selectedCommandName, commands, formData, commandType])

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
        setFormData(toFormState(orig))
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
    const trimmedName = formData.name.trim()
    if (!trimmedName) {
      toast.error(t("settings.customCommandNameRequired"))
      throw new Error("Command name is required")
    }
    if (selectedScope === "project" && !effectiveProjectPath) {
      toast.error(t("settings.customCommandProjectPathRequired"))
      throw new Error("Project path is required")
    }

    // 模板块正文规范化：剥离误粘贴的块起止行并提取 title，避免脏数据在插入时双重包裹。
    const isAgentBlock = commandType === "agentBlock"
    const normalized = isAgentBlock
      ? normalizeAgentBlockBody(formData.content.trimEnd(), formData.blockType)
      : null

    const result = await customCommandApi.save({
      type: commandType,
      scope: selectedScope,
      projectPath: effectiveProjectPath,
      oldName: isEditingDraft ? undefined : (selectedCommandName ?? undefined),
      name: trimmedName,
      description: formData.description.trim(),
      content: normalized ? normalized.content : formData.content.trimEnd(),
      argumentHint: formData.argumentHint.trim() ? formData.argumentHint.trim() : undefined,
      mdScope: commandType === "agentMD" ? formData.mdScope : undefined,
      blockType: isAgentBlock ? formData.blockType : undefined,
      title: isAgentBlock ? formData.title.trim() || normalized?.title || "" : undefined,
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

  // blocks 视图编辑器内容：完整块源码（起止行由表单驱动、只读；结束行 id 以占位装饰显示）。
  const blockPreviewContent = useMemo(() => {
    if (!isBlocksView) return formData.content
    return buildAgentBlockSource({
      name: formData.name.trim() || "xxxTemplate",
      title: formData.title,
      blockType: formData.blockType,
      content: formData.content,
    })
  }, [isBlocksView, formData.name, formData.title, formData.blockType, formData.content])

  // 编辑器内容变更：blocks 视图从完整源码提取正文（起止行受只读保护，理论上恒可提取）。
  const handleEditorChange = (text: string): void => {
    if (!isBlocksView) {
      handleFormChange((prev) => ({ ...prev, content: text }))
      return
    }
    const body = extractAgentBlockBody(text, formData.blockType)
    if (body === null) return
    handleFormChange((prev) => ({ ...prev, content: body }))
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

  // 编辑器工具栏插入下拉：内置骨架 + 我的模板块（按分组列出）；选中即在光标处插入，自动注入唯一 id。
  const toolbarActions = useMemo<MarkdownToolbarAction[]>(() => {
    // md 模板块视图：编辑器内容由 Block Type / Name / Title 驱动渲染，不提供插入下拉。
    if (isBlocksView) return []

    const requiresTemplateBlock = (context: MarkdownToolbarSelectContext): boolean =>
      isInsideMarkdownTemplateBlock(context.textBeforeCursor)
    // 骨架插入时生成唯一 id，并把光标落在块内空行。
    const buildSkeleton = (blockText: string) => (): { text: string; selectionOffset: number } => {
      const injected = injectCustomTemplateBlockIds(blockText)
      return { text: injected, selectionOffset: injected.indexOf("\n\n") + 1 }
    }

    const builtinGroup = t("settings.customCommandBlockGroupBuiltin")
    const customGroup = t("settings.customCommandBlockGroupCustom")
    const templateBlock = "&&& xxxTemplate --start 「title: 」\n\n&&& xxxTemplate --end"
    const suppleBlock = "+++ xxxTemplate --start 「title: 」\n\n+++ xxxTemplate --end"
    const logBlock = "%%% xxxTemplate --start 「title: 」\n\n%%% xxxTemplate --end"

    const options: MarkdownToolbarSelectOption[] = [
      {
        group: builtinGroup,
        label: t("settings.customCommandBlockTemplateName"),
        insertText: buildSkeleton(templateBlock),
      },
    ]
    // 临时块 / 记录块仅限任务块内部，故只在 md 命令视图提供。
    if (commandType === "agentMD") {
      options.push(
        {
          group: builtinGroup,
          label: t("settings.customCommandBlockSuppleName"),
          insertText: buildSkeleton(suppleBlock),
          isAvailable: requiresTemplateBlock,
        },
        {
          group: builtinGroup,
          label: t("settings.customCommandBlockLogName"),
          insertText: buildSkeleton(logBlock),
          isAvailable: requiresTemplateBlock,
        },
      )
    }

    // 我的模板块：任务块全局可用，临时块 / 记录块仅限任务块内部。
    for (const block of blockCommands) {
      const marker =
        block.blockType === "supple" ? "+++" : block.blockType === "log" ? "%%%" : "&&&"
      // 正文可能已含起止行（用户直接粘贴完整块），先规范化避免双重包裹。
      const normalized = normalizeAgentBlockBody(block.content, block.blockType || "template")
      const title = block.title?.trim() || normalized.title || ""
      const titlePart = title ? ` 「title: ${title}」` : ""
      const blockText = `${marker} ${block.name} --start${titlePart}\n${normalized.content}\n${marker} ${block.name} --end`
      options.push({
        group: customGroup,
        label: block.name,
        insertText: buildSkeleton(blockText),
        isAvailable: block.blockType === "template" ? undefined : requiresTemplateBlock,
      })
    }

    return [
      {
        icon: LayoutTemplate,
        label: t("settings.customCommandInsertBlock"),
        alignRight: true,
        select: {
          placeholder: t("settings.customCommandInsertBlock"),
          options,
        },
      },
    ]
  }, [t, commandType, blockCommands, isBlocksView])

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

  const viewInfoDoc = isBlocksView
    ? t("settings.customBlocksDoc")
    : commandType === "agentInput"
      ? agentInputInfoDoc
      : agentMDInfoDoc

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
          <LxInfoTooltip markdown={viewInfoDoc} placement="bottom" />
        </div>

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
      </div>

      {/* 主体两栏布局：左侧列表，右侧编辑面板 */}
      <div className="custom-scrollbar grid min-h-0 flex-1 gap-3 overflow-y-auto @[560px]:overflow-hidden @[560px]:grid-cols-[220px_minmax(0,1fr)]">
        <CommandNav
          commands={commands}
          selectedCommandName={selectedCommandName}
          isEditingDraft={isEditingDraft}
          hasDraft={hasDraft}
          draftName={formData.name}
          isLoading={isLoading}
          listLabel={
            isBlocksView ? t("settings.customBlocksList") : t("settings.customCommandsList")
          }
          emptyLabel={
            isBlocksView ? t("settings.customBlocksEmpty") : t("settings.customCommandsEmpty")
          }
          addLabel={isBlocksView ? t("settings.addCustomBlock") : t("settings.addCustomCommand")}
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
              <p>
                {isBlocksView
                  ? t("settings.customBlocksEmptyTip")
                  : t("settings.customCommandsEmptyTip")}
              </p>
              <LxIconButton
                iconOnly={false}
                onClick={handleStartCreate}
                textClass="text-white"
                hoverBgClass="hover:bg-white/15"
                className="rounded-[6px] bg-white/10 cursor-pointer"
                icon={<Plus />}
              >
                {isBlocksView ? t("settings.addCustomBlock") : t("settings.addCustomCommand")}
              </LxIconButton>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/8 pb-2">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-white">
                  <span className="truncate">
                    {isEditingDraft
                      ? isBlocksView
                        ? t("settings.createCustomBlockTitle")
                        : t("settings.createCustomCommandTitle")
                      : isBlocksView
                        ? t("settings.editCustomBlockTitle", { name: selectedCommandName ?? "" })
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
                  {isBlocksView
                    ? t("settings.customCommandBlockContent")
                    : t("settings.customCommandContent")}
                  <span className="text-rose-400">*</span>
                </span>
                <div className="flex min-h-[240px] flex-1 flex-col @[560px]:min-h-0">
                  <LxMarkdownEditor
                    key={editorKey}
                    initialContent={blockPreviewContent}
                    toolbarActions={toolbarActions}
                    extraExtensions={isBlocksView ? agentBlockPreviewExtensions : undefined}
                    onChange={handleEditorChange}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
