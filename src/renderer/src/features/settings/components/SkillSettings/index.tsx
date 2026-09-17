import type { SkillFileEntry, SkillItem, SkillTargetRoot } from "@shared/contracts/agent"
import type { Project } from "@shared/project"
import { validateSkillName, validateSkillRelativePath } from "@shared/skillPaths"
import { Folder, Globe, RefreshCw, Sparkles } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { useLxToast } from "@/components/ui/LxToast"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectApi } from "@/features/project/api/projectApi"
import { useRecentItemsStore } from "@/features/project/recentItemsStore"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { skillApi } from "@/features/settings/api/skillApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import {
  notifySettingsChanged,
  subscribeSettingsChanged,
} from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"
import { SkillEditPanel } from "./SkillEditPanel"
import { SkillFileTree } from "./SkillFileTree"
import { SkillListPane } from "./SkillListPane"
import { SkillPathModal } from "./SkillPathModal"
import {
  hasEditChanges,
  isMetaChanged,
  mergeSkillTree,
  resolveFileOrigin,
  type SkillMetaDraft,
  type SkillTreeEntry,
  toMetaDraft,
  useSkillDraftStore,
} from "./skillDrafts"

// Skill 作用域 Tab：全局或项目。
type SkillScopeTab = "global" | "project"

// 路径输入弹窗状态。
interface PathModalState {
  mode: "create" | "rename" | "duplicate"
  initialValue: string
}

// 判断文件是否位于指定根目录之下（跨平台分隔符）。
const isInsidePath = (filePath: string, rootPath: string): boolean => {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "")
  return filePath.startsWith(`${normalizedRoot}/`) || filePath.startsWith(`${normalizedRoot}\\`)
}

// 为复制文件生成默认的新路径。
const suggestCopyPath = (relativePath: string): string => {
  const slashIndex = relativePath.lastIndexOf("/")
  const dir = slashIndex >= 0 ? relativePath.slice(0, slashIndex + 1) : ""
  const fileName = slashIndex >= 0 ? relativePath.slice(slashIndex + 1) : relativePath
  const dotIndex = fileName.lastIndexOf(".")
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ""
  return `${dir}${stem}-copy${extension}`
}

// 顶部 Tab 按钮样式。
const scopeTabClass = (active: boolean): string =>
  `flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-xs transition-colors cursor-pointer ${
    active ? "bg-white/10 text-white font-medium shadow-xs" : "text-white/60 hover:text-white"
  }`

/**
 * 渲染 Skill 设置视图：列表、文件树与元数据/正文编辑（统一由全局保存栏落盘）。
 */
export const SkillSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [scope, setScope] = useState<SkillScopeTab>("global")
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [disabledSkills, setDisabledSkills] = useState<string[]>([])
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [diskFiles, setDiskFiles] = useState<SkillFileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [selectedFilePath, setSelectedFilePath] = useState("SKILL.md")
  const [contentsCache, setContentsCache] = useState<Record<string, string>>({})
  const [contentErrors, setContentErrors] = useState<Record<string, string>>({})
  const [loadingContent, setLoadingContent] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const [metaExpanded, setMetaExpanded] = useState(false)
  const [pathModal, setPathModal] = useState<PathModalState | null>(null)

  const baselineDisabledRef = useRef<string | null>(null)

  const createDraft = useSkillDraftStore((state) => state.createDraft)
  const edits = useSkillDraftStore((state) => state.edits)
  const createMode = createDraft !== null

  // 新建草稿必须展开元数据表单；已有 Skill 默认折叠以留出编辑器空间。
  useEffect(() => {
    if (createMode) setMetaExpanded(true)
  }, [createMode])

  // 1. 初始化项目列表（仅 filesystem 项目）并解析默认选中项目
  useEffect(() => {
    void Promise.all([projectApi.listProjects(), projectApi.list().catch(() => [])]).then(
      ([list, items]) => {
        const fsProjects = list.filter((p) => Boolean(p.path && p.path.trim()))
        setProjects(fsProjects)

        let candidateId: string | null | undefined =
          agentTabStore.getActiveTab()?.draftBinding?.projectId
        if (!candidateId) {
          const activeTab = agentTabStore.getActiveTab()
          if (activeTab?.sessionId) {
            candidateId = sessionListStore
              .getSessions()
              .find((s) => s.id === activeTab.sessionId)?.projectId
          }
        }
        if (!candidateId) {
          candidateId = sessionListStore.getCurrentSessionBinding()?.projectId
        }
        if (!candidateId) {
          for (const id of useRecentItemsStore.getState().ids) {
            const item = items.find((it) => it.id === id)
            if (item?.projectId) {
              candidateId = item.projectId
              break
            }
          }
        }
        // 命中有效项目则选中，否则回退到第一个项目（项目作用域需要明确的编辑对象）
        const resolvedId =
          candidateId && fsProjects.some((p) => p.id === candidateId)
            ? candidateId
            : (fsProjects[0]?.id ?? "")
        setSelectedProjectId(resolvedId)
      },
    )
  }, [])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  )
  const effectiveCwd = scope === "project" ? selectedProject?.path : undefined

  // 2. 加载 Skill 列表与启停配置
  const loadData = useCallback(
    async (force = false) => {
      try {
        if (force) setRefreshing(true)
        else setLoading(true)
        const [skillList, config] = await Promise.all([
          skillApi.list(effectiveCwd, force),
          settingsApi.getSkillSettings(),
        ])
        setSkills(skillList)
        setDisabledSkills(config.disabled)
        if (baselineDisabledRef.current === null || force) {
          baselineDisabledRef.current = JSON.stringify(config.disabled)
        }
      } catch (err) {
        console.error("[SkillSettings] Failed to load skill data:", err)
        toast.error(t("settings.loadSettingsFailed"))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [effectiveCwd, t, toast],
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 订阅其他组件引起的 skills 变更
  useEffect(() => {
    return subscribeSettingsChanged("skills", () => {
      void loadData()
    })
  }, [loadData])

  const handleRefresh = async (): Promise<void> => {
    await loadData(true)
    toast.success(t("settings.skillsRefreshed"))
  }

  // 3. 当前作用域内的 Skill 列表
  const scopedSkills = useMemo(() => {
    if (scope === "global") return skills.filter((skill) => skill.isGlobal)
    const projectPath = selectedProject?.path
    if (!projectPath) return []
    return skills.filter((skill) => !skill.isGlobal && isInsidePath(skill.filePath, projectPath))
  }, [skills, scope, selectedProject])

  useEffect(() => {
    if (scopedSkills.length === 0) {
      setSelectedSkillName(null)
      return
    }
    setSelectedSkillName((prev) =>
      prev && scopedSkills.some((skill) => skill.name === prev) ? prev : scopedSkills[0].name,
    )
  }, [scopedSkills])

  const filteredSkills = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return scopedSkills
    return scopedSkills.filter((skill) => {
      const nameMatch = skill.name.toLowerCase().includes(query)
      const displayMatch = skill.displayName?.toLowerCase().includes(query)
      const descMatch = skill.description.toLowerCase().includes(query)
      return nameMatch || displayMatch || descMatch
    })
  }, [scopedSkills, searchQuery])

  const selectedSkill = useMemo(
    () => (createMode ? null : (scopedSkills.find((s) => s.name === selectedSkillName) ?? null)),
    [createMode, scopedSkills, selectedSkillName],
  )
  const activeBaseDir = selectedSkill?.baseDir
  const activeEdit = activeBaseDir ? edits[activeBaseDir] : undefined

  // 切换 Skill / 作用域时回到 SKILL.md
  useEffect(() => {
    setSelectedFilePath("SKILL.md")
  }, [selectedSkillName, scope, selectedProjectId])

  // 4. 加载选中 Skill 的磁盘文件树
  const loadDiskFiles = useCallback(
    async (baseDir: string | undefined) => {
      if (!baseDir) {
        setDiskFiles([])
        return
      }
      setLoadingFiles(true)
      try {
        setDiskFiles(await skillApi.listFiles(baseDir))
      } catch (err) {
        console.error("[SkillSettings] Failed to list skill files:", err)
        toast.error(t("settings.skillsLoadFilesFailed"))
        setDiskFiles([])
      } finally {
        setLoadingFiles(false)
      }
    },
    [t, toast],
  )

  useEffect(() => {
    void loadDiskFiles(activeBaseDir)
  }, [activeBaseDir, loadDiskFiles])

  const treeEntries: SkillTreeEntry[] = useMemo(() => {
    if (createDraft) {
      return Object.keys(createDraft.files)
        .filter((relativePath) => relativePath !== "SKILL.md")
        .sort((a, b) => a.localeCompare(b))
        .map((relativePath) => ({
          relativePath,
          isVirtual: true,
          isDirty: createDraft.files[relativePath] !== "",
        }))
    }
    return mergeSkillTree(diskFiles, activeEdit)
  }, [createDraft, diskFiles, activeEdit])

  // 5. 按需加载当前文件正文
  const cacheKey = `${activeBaseDir ?? "draft"}::${selectedFilePath}`
  // 原始路径（origin）：内容草稿与磁盘读写都以它为准，展示路径由 moves 映射。
  const activeOrigin = createDraft
    ? selectedFilePath
    : resolveFileOrigin(activeEdit, selectedFilePath)
  const isVirtualFile = useMemo(
    () =>
      createDraft
        ? createDraft.files[selectedFilePath] !== undefined
        : (treeEntries.find((entry) => entry.relativePath === selectedFilePath)?.isVirtual ??
          false),
    [createDraft, treeEntries, selectedFilePath],
  )

  useEffect(() => {
    if (createMode || !activeBaseDir || !selectedSkill) return
    if (activeEdit?.files[activeOrigin] !== undefined) return
    if (contentsCache[cacheKey] !== undefined || contentErrors[cacheKey] !== undefined) return
    if (isVirtualFile) return

    setLoadingContent(true)
    // SKILL.md 走 getSkillContent（剥离 frontmatter，避免把元数据当正文回写）；其他文件直接读文本。
    const request =
      activeOrigin === "SKILL.md"
        ? skillApi
            .getContent(selectedSkill.name, effectiveCwd)
            .then((content) => ({ ok: true as const, content: content ?? "" }))
        : skillApi.readFile(activeBaseDir, activeOrigin)
    request
      .then((result) => {
        if (result.ok) {
          setContentsCache((prev) => ({ ...prev, [cacheKey]: result.content }))
        } else {
          setContentErrors((prev) => ({ ...prev, [cacheKey]: result.error }))
        }
      })
      .catch((err) => {
        console.error("[SkillSettings] Failed to read skill file:", err)
        setContentErrors((prev) => ({ ...prev, [cacheKey]: t("settings.skillsLoadContentFailed") }))
      })
      .finally(() => setLoadingContent(false))
  }, [
    createMode,
    activeBaseDir,
    selectedSkill,
    activeEdit,
    activeOrigin,
    selectedFilePath,
    contentsCache,
    contentErrors,
    cacheKey,
    isVirtualFile,
    effectiveCwd,
    t,
  ])

  const draftFileContent = createDraft
    ? createDraft.files[selectedFilePath]
    : activeEdit?.files[activeOrigin]
  const editorBaseline = contentsCache[cacheKey] ?? ""
  const editorValue = draftFileContent ?? editorBaseline
  const editorSaved = draftFileContent === undefined
  const editorError = contentErrors[cacheKey] ?? null

  // 6. 脏数据判定：新建草稿 + 全部 Skill 修改 + 启停列表
  const isDirty = useMemo(() => {
    if (createMode) return true
    if (Object.values(edits).some(hasEditChanges)) return true
    return JSON.stringify(disabledSkills) !== baselineDisabledRef.current
  }, [createMode, edits, disabledSkills])

  // 7. 保存全部草稿
  const handleSave = useCallback(async (): Promise<void> => {
    const projectPath = scope === "project" ? selectedProject?.path : undefined
    const state = useSkillDraftStore.getState()

    // 7.1 新建草稿
    if (state.createDraft) {
      const draft = state.createDraft
      const trimmedName = draft.meta.name.trim()
      const nameError = validateSkillName(trimmedName)
      if (nameError) throw new Error(nameError)
      if (!draft.meta.description.trim()) throw new Error("Skill description is required.")
      if (scope === "project" && !projectPath) {
        throw new Error("Project path is required for project skills.")
      }

      const result = await skillApi.save({
        scope: scope === "project" ? "project" : "user",
        projectPath,
        targetRoot: draft.targetRoot,
        name: trimmedName,
        description: draft.meta.description.trim(),
        displayName: draft.meta.displayName.trim() || undefined,
        shortDescription: draft.meta.shortDescription.trim() || undefined,
        disableModelInvocation: draft.meta.disableModelInvocation,
        content: draft.files["SKILL.md"] ?? "",
      })
      if (!result.ok) throw new Error(result.error)

      for (const [relativePath, content] of Object.entries(draft.files)) {
        if (relativePath === "SKILL.md") continue
        const written = await skillApi.writeFile(result.baseDir, relativePath, content)
        if (!written.ok) throw new Error(written.error)
      }
      state.cancelCreate()
    }

    // 7.2 已有 Skill 修改
    for (const [baseDir, edit] of Object.entries(state.edits)) {
      if (!hasEditChanges(edit)) continue
      const current = skills.find((skill) => skill.baseDir === baseDir)
      if (!current) continue
      const trimmedName = edit.meta.name.trim()
      const nameError = validateSkillName(trimmedName)
      if (nameError) throw new Error(nameError)
      if (!edit.meta.description.trim()) throw new Error("Skill description is required.")

      const saved = await skillApi.save({
        scope: current.isGlobal ? "user" : "project",
        targetRoot: current.sourceKind === "agents" ? "agents" : "lx",
        originalDir: baseDir,
        originalName: edit.originalMeta.name,
        name: trimmedName,
        description: edit.meta.description.trim(),
        displayName: edit.meta.displayName.trim() || undefined,
        shortDescription: edit.meta.shortDescription.trim() || undefined,
        disableModelInvocation: edit.meta.disableModelInvocation,
        content: edit.files["SKILL.md"],
      })
      if (!saved.ok) throw new Error(saved.error)

      for (const relativePath of edit.deleted) {
        const removed = await skillApi.deleteFile(saved.baseDir, relativePath)
        if (!removed.ok) throw new Error(removed.error)
      }
      for (const [from, to] of Object.entries(edit.moves)) {
        const moved = await skillApi.moveFile(saved.baseDir, from, to)
        if (!moved.ok) throw new Error(moved.error)
      }
      for (const [origin, content] of Object.entries(edit.files)) {
        if (origin === "SKILL.md") continue
        // 内容以 origin 为键；写入目标使用移动后的展示路径。
        const targetPath = edit.moves[origin] ?? origin
        const written = await skillApi.writeFile(saved.baseDir, targetPath, content)
        if (!written.ok) throw new Error(written.error)
      }
      state.discardEdit(baseDir)
    }

    // 7.3 启停列表
    if (JSON.stringify(disabledSkills) !== baselineDisabledRef.current) {
      const saved = await settingsApi.saveSkillSettings({ disabled: disabledSkills })
      setDisabledSkills(saved.disabled)
      baselineDisabledRef.current = JSON.stringify(saved.disabled)
    }

    notifySettingsChanged("skills")
    setContentsCache({})
    setContentErrors({})
    await loadData(true)
  }, [scope, selectedProject, skills, disabledSkills, loadData])

  const handleReset = useCallback((): void => {
    useSkillDraftStore.getState().discardAll()
    if (baselineDisabledRef.current !== null) {
      setDisabledSkills(JSON.parse(baselineDisabledRef.current))
    }
  }, [])

  useRegisterSettingsSection({
    section: "skills",
    isDirty,
    onSave: handleSave,
    onReset: handleReset,
  })

  const handleEditorSave = useCallback((): void => {
    void handleSave().catch((err) => {
      console.error("[SkillSettings] Save failed:", err)
      toast.error(t("settings.saveFailed"))
    })
  }, [handleSave, toast, t])

  // 8. 编辑操作
  const handleSelectSkill = (name: string): void => {
    setSelectedSkillName(name)
  }

  const handleBeginCreate = (): void => {
    useSkillDraftStore.getState().beginCreate("lx")
    setSelectedSkillName(null)
    setSelectedFilePath("SKILL.md")
  }

  const handleMetaChange = (patch: Partial<SkillMetaDraft>): void => {
    if (createDraft) {
      useSkillDraftStore.getState().updateCreateMeta(patch)
      return
    }
    if (!selectedSkill) return
    const state = useSkillDraftStore.getState()
    state.ensureEdit(selectedSkill.baseDir, toMetaDraft(selectedSkill))
    state.updateEditMeta(selectedSkill.baseDir, patch)
  }

  const handleEditorChange = (content: string): void => {
    if (createDraft) {
      useSkillDraftStore.getState().updateCreateFile(selectedFilePath, content)
      return
    }
    if (!selectedSkill) return
    const state = useSkillDraftStore.getState()
    state.ensureEdit(selectedSkill.baseDir, toMetaDraft(selectedSkill))
    const changed = isVirtualFile || content !== editorBaseline
    state.updateEditFile(selectedSkill.baseDir, selectedFilePath, content, changed)
  }

  const handleToggleDisabled = (skillName: string, enabled: boolean): void => {
    setDisabledSkills((prev) => {
      if (enabled) return prev.filter((name) => name !== skillName)
      return prev.includes(skillName) ? prev : [...prev, skillName]
    })
  }

  const handleDeleteSkill = async (target: SkillItem): Promise<void> => {
    try {
      const result = await skillApi.delete(target.filePath)
      if (!result.success) {
        toast.error(result.error || t("settings.skillsDeleteFailed"))
        return
      }
      toast.success(t("settings.skillsDeleteSuccess", { name: target.name }))
      useSkillDraftStore.getState().discardEdit(target.baseDir)
      if (selectedSkillName === target.name) setSelectedSkillName(null)
      setContentsCache({})
      setContentErrors({})
      notifySettingsChanged("skills")
      await loadData(true)
    } catch (err) {
      console.error("[SkillSettings] Delete failed:", err)
      toast.error(t("settings.skillsDeleteFailed"))
    }
  }

  const handleConfirmDeleteFile = (relativePath: string): void => {
    if (createDraft) {
      useSkillDraftStore.getState().removeCreateFile(relativePath)
    } else if (selectedSkill) {
      const state = useSkillDraftStore.getState()
      state.ensureEdit(selectedSkill.baseDir, toMetaDraft(selectedSkill))
      state.deleteEditFile(selectedSkill.baseDir, relativePath)
    }
    if (selectedFilePath === relativePath) setSelectedFilePath("SKILL.md")
  }

  const handleImportFiles = async (): Promise<void> => {
    if (!selectedSkill) return
    try {
      const result = await skillApi.importFiles(
        selectedSkill.baseDir,
        "",
        t("settings.skillsFileImport"),
      )
      if (!result.ok) {
        toast.error(result.error || t("settings.skillsFileImportFailed"))
        return
      }
      if (result.files.length === 0) return
      toast.success(t("settings.skillsFileImportSuccess", { count: result.files.length }))
      await loadDiskFiles(selectedSkill.baseDir)
    } catch (err) {
      console.error("[SkillSettings] Import failed:", err)
      toast.error(t("settings.skillsFileImportFailed"))
    }
  }

  // 路径是否已被占用（用于新建/重命名校验；以展示路径为准）。
  const isFilePathTaken = (relativePath: string): boolean => {
    if (relativePath === "SKILL.md") return true
    if (createDraft) return createDraft.files[relativePath] !== undefined
    return treeEntries.some((entry) => entry.relativePath === relativePath)
  }

  const validateTargetPath = (value: string): string | null =>
    validateSkillRelativePath(value) ??
    (isFilePathTaken(value) ? t("settings.skillsFileExists") : null)

  // 读取展示路径对应的当前内容（草稿优先，其次缓存，最后磁盘）。
  const readCurrentContent = async (displayPath: string): Promise<string> => {
    if (createDraft) return createDraft.files[displayPath] ?? ""
    const origin = resolveFileOrigin(activeEdit, displayPath)
    const cachedDraft = activeEdit?.files[origin]
    if (cachedDraft !== undefined) return cachedDraft
    const cached = contentsCache[`${activeBaseDir ?? "draft"}::${displayPath}`]
    if (cached !== undefined) return cached
    if (!activeBaseDir) return ""
    const result = await skillApi.readFile(activeBaseDir, origin)
    return result.ok ? result.content : ""
  }

  const handlePathModalConfirm = async (value: string): Promise<void> => {
    const modal = pathModal
    setPathModal(null)
    if (!modal || !value) return
    const state = useSkillDraftStore.getState()

    if (modal.mode === "create") {
      if (createDraft) {
        state.addCreateFile(value)
      } else if (selectedSkill) {
        state.ensureEdit(selectedSkill.baseDir, toMetaDraft(selectedSkill))
        state.addEditFile(selectedSkill.baseDir, value, "")
      }
      setSelectedFilePath(value)
      return
    }

    if (modal.mode === "rename") {
      const from = modal.initialValue
      if (createDraft) {
        const content = createDraft.files[from] ?? ""
        state.removeCreateFile(from)
        state.addCreateFile(value)
        state.updateCreateFile(value, content)
      } else if (selectedSkill) {
        state.ensureEdit(selectedSkill.baseDir, toMetaDraft(selectedSkill))
        state.moveEditFile(selectedSkill.baseDir, from, value)
      }
      setSelectedFilePath(value)
      return
    }

    // duplicate：以当前内容在新路径创建副本
    const content = await readCurrentContent(modal.initialValue)
    if (createDraft) {
      state.addCreateFile(value)
      state.updateCreateFile(value, content)
    } else if (selectedSkill) {
      state.ensureEdit(selectedSkill.baseDir, toMetaDraft(selectedSkill))
      state.addEditFile(selectedSkill.baseDir, value, content)
    }
    setSelectedFilePath(value)
  }

  const handleCopyPath = (path: string): void => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 1500)
    })
  }

  const projectOptions: LxSelectOption<string>[] = useMemo(
    () => projects.map((p) => ({ label: p.name || p.path || p.id, value: p.id })),
    [projects],
  )

  const resolvedRootPath = useMemo(() => {
    if (!createDraft) return ""
    if (scope === "project") {
      const base = selectedProject?.path ?? ""
      return createDraft.targetRoot === "agents" ? `${base}/.agents/skills` : `${base}/.lx/skills`
    }
    return createDraft.targetRoot === "agents" ? "~/.agents/skills" : "~/.lx/skills"
  }, [createDraft, scope, selectedProject])

  const renameWarning = useMemo(() => {
    if (!activeEdit || !isMetaChanged(activeEdit)) return null
    const nextName = activeEdit.meta.name.trim()
    if (!nextName || nextName === activeEdit.originalMeta.name) return null
    return t("settings.skillsRenameWarning", {
      from: activeEdit.originalMeta.name,
      to: nextName,
    })
  }, [activeEdit, t])

  const activeMeta = createMode
    ? (createDraft?.meta ?? null)
    : selectedSkill
      ? (activeEdit?.meta ?? toMetaDraft(selectedSkill))
      : null

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      {/* 顶部作用域切换与项目选择 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="custom-command-tab-group flex items-center gap-1">
          <button
            type="button"
            data-active={scope === "global"}
            className={scopeTabClass(scope === "global")}
            onClick={() => setScope("global")}
          >
            <Globe className="h-3.5 w-3.5 text-sky-400" />
            {t("settings.customCommandGlobalScope")}
          </button>
          <button
            type="button"
            data-active={scope === "project"}
            className={scopeTabClass(scope === "project")}
            onClick={() => setScope("project")}
          >
            <Folder className="h-3.5 w-3.5 text-amber-400" />
            {t("settings.customCommandProjectScope")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {scope === "project" && projects.length > 0 ? (
            <div className="w-[180px]">
              <LxSelect
                value={selectedProjectId}
                options={projectOptions}
                placeholder={t("settings.skillsSelectProject")}
                onChange={(val) => setSelectedProjectId(val)}
              />
            </div>
          ) : null}
          <LxIconButton
            preset="default"
            aria-label={t("common.refresh")}
            title={{ content: t("common.refresh"), placement: "bottom" }}
            disabled={refreshing || loading}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className={refreshing ? "animate-spin text-white" : ""} />
          </LxIconButton>
        </div>
      </div>

      {/* 主体两栏布局：左侧 Skill 列表，右侧编辑面板（文件树内嵌侧栏） */}
      <div className="grid min-h-0 flex-1 gap-3 @[700px]:grid-cols-[260px_minmax(0,1fr)]">
        <SkillListPane
          skills={filteredSkills}
          loading={loading}
          searchQuery={searchQuery}
          createActive={createMode}
          createName={createDraft?.meta.name ?? ""}
          selectedSkillName={selectedSkillName}
          disabledSkills={disabledSkills}
          edits={edits}
          onSearchChange={setSearchQuery}
          onSelect={handleSelectSkill}
          onSelectDraft={() => setSelectedSkillName(null)}
          onCreate={handleBeginCreate}
          onToggleDisabled={handleToggleDisabled}
          onDelete={(skill) => void handleDeleteSkill(skill)}
        />

        {(createMode && createDraft) || (selectedSkill && activeMeta) ? (
          <SkillEditPanel
            createMode={createMode}
            meta={(createMode && createDraft ? createDraft.meta : activeMeta) as SkillMetaDraft}
            onMetaChange={handleMetaChange}
            metaExpanded={createMode || metaExpanded}
            onToggleMeta={() => setMetaExpanded((prev) => !prev)}
            renameWarning={renameWarning}
            targetRoot={createDraft?.targetRoot ?? "lx"}
            onTargetRootChange={(value: SkillTargetRoot) =>
              useSkillDraftStore.getState().setCreateTargetRoot(value)
            }
            resolvedRootPath={resolvedRootPath}
            skill={selectedSkill}
            skillEnabled={selectedSkill ? !disabledSkills.includes(selectedSkill.name) : true}
            onToggleEnabled={(enabled) =>
              selectedSkill && handleToggleDisabled(selectedSkill.name, enabled)
            }
            onDeleteSkill={selectedSkill ? () => void handleDeleteSkill(selectedSkill) : null}
            onCopyPath={() => selectedSkill && handleCopyPath(selectedSkill.filePath)}
            copiedPath={copiedPath}
            fileRail={
              <SkillFileTree
                entries={treeEntries}
                selectedPath={selectedFilePath}
                skillMdDirty={
                  createMode
                    ? (createDraft?.files["SKILL.md"] ?? "") !== ""
                    : activeEdit?.files["SKILL.md"] !== undefined
                }
                isLoading={loadingFiles}
                canImport={!createMode && Boolean(selectedSkill)}
                onSelect={setSelectedFilePath}
                onCreateFile={() => setPathModal({ mode: "create", initialValue: "" })}
                onImport={() => void handleImportFiles()}
                onRename={(relativePath) =>
                  setPathModal({ mode: "rename", initialValue: relativePath })
                }
                onDuplicate={(relativePath) =>
                  setPathModal({ mode: "duplicate", initialValue: suggestCopyPath(relativePath) })
                }
                onDelete={handleConfirmDeleteFile}
              />
            }
            editorKey={`${activeBaseDir ?? "draft"}::${selectedFilePath}`}
            editorValue={editorValue}
            editorSaved={editorSaved}
            isEditorLoading={loadingContent}
            editorError={editorError}
            onEditorChange={handleEditorChange}
            onEditorSave={handleEditorSave}
          />
        ) : (
          <div className="settings-item-card flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-6 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
            <Sparkles className="h-8 w-8 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.2))]" />
            <span>{t("settings.skillsSelectHint")}</span>
          </div>
        )}
      </div>

      <SkillPathModal
        isOpen={pathModal !== null}
        title={
          pathModal?.mode === "create"
            ? t("settings.skillsFileCreate")
            : pathModal?.mode === "rename"
              ? t("settings.skillsFileRename")
              : t("settings.skillsFileDuplicate")
        }
        initialValue={pathModal?.initialValue ?? ""}
        placeholder="references/api-errors.md"
        validate={validateTargetPath}
        onClose={() => setPathModal(null)}
        onConfirm={(value) => void handlePathModalConfirm(value)}
      />
    </div>
  )
}
