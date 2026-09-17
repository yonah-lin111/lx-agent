import type { InstructionFileInfo } from "@shared/contracts/agent"
import type { Project } from "@shared/project"
import { Check, Copy, FileText, Folder, Globe, Loader2, Lock, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown/LxMarkdownEditor"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectApi } from "@/features/project/api/projectApi"
import { instructionApi } from "@/features/settings/api/instructionApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { useTranslation } from "@/i18n"

// AGENTS.md 设置分区：系统提示词（用户级）与项目提示词。
type AgentsMdTab = "system" | "project"

// 顶部 Tab 按钮样式。
const tabButtonClass = (active: boolean): string =>
  `flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-xs transition-colors cursor-pointer ${
    active ? "bg-white/10 text-white font-medium shadow-xs" : "text-white/60 hover:text-white"
  }`

// 草稿集合：null 表示未修改（跟随基线）。
interface InstructionDrafts {
  user: string | null
  projects: Record<string, string | null>
}

/**
 * 渲染 AGENTS.md 指令文件设置视图（系统提示词 / 项目提示词）。
 */
export const AgentsMdSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [activeTab, setActiveTab] = useState<AgentsMdTab>("system")
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [userInfo, setUserInfo] = useState<InstructionFileInfo | null>(null)
  const [projectInfos, setProjectInfos] = useState<Record<string, InstructionFileInfo>>({})
  const [drafts, setDrafts] = useState<InstructionDrafts>({ user: null, projects: {} })
  const [loadingUser, setLoadingUser] = useState(true)
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({})
  const [copiedPath, setCopiedPath] = useState(false)

  // 1. 初始化：项目列表（仅 filesystem 项目）与用户级指令文件
  useEffect(() => {
    projectApi
      .listProjects()
      .then((list) => {
        const fsProjects = list.filter((p) => Boolean(p.path && p.path.trim()))
        setProjects(fsProjects)
        const binding = sessionListStore.getCurrentSessionBinding()
        const bound = binding?.projectId
          ? fsProjects.find((p) => p.id === binding.projectId)
          : undefined
        setSelectedProjectId(bound?.id ?? fsProjects[0]?.id ?? "")
      })
      .catch(() => {})

    instructionApi
      .get("user")
      .then(setUserInfo)
      .catch((err) => {
        console.error("[AgentsMdSettings] Failed to load user instruction:", err)
        toast.error(t("settings.loadSettingsFailed"))
      })
      .finally(() => setLoadingUser(false))
  }, [toast, t])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  )

  // 2. 按需加载项目级指令文件
  useEffect(() => {
    const projectPath = selectedProject?.path
    if (!projectPath || projectInfos[selectedProjectId]) return
    setLoadingProjects((prev) => ({ ...prev, [selectedProjectId]: true }))
    instructionApi
      .get("project", projectPath)
      .then((info) => {
        setProjectInfos((prev) => ({ ...prev, [selectedProjectId]: info }))
      })
      .catch((err) => {
        console.error("[AgentsMdSettings] Failed to load project instruction:", err)
        toast.error(t("settings.loadSettingsFailed"))
      })
      .finally(() => {
        setLoadingProjects((prev) => ({ ...prev, [selectedProjectId]: false }))
      })
  }, [selectedProject, selectedProjectId, projectInfos, toast, t])

  // 当前视图的目标与基线正文
  const activeInfo = activeTab === "system" ? userInfo : projectInfos[selectedProjectId]
  const activeDraft = activeTab === "system" ? drafts.user : drafts.projects[selectedProjectId]
  const baseline = activeInfo?.content ?? ""
  const editorValue = activeDraft ?? baseline
  const isLoading =
    activeTab === "system" ? loadingUser : Boolean(loadingProjects[selectedProjectId])

  // 任一目标存在未保存草稿即视为脏（避免切换 Tab 时静默丢失）
  const isDirty = useMemo(() => {
    if (drafts.user !== null && drafts.user !== (userInfo?.content ?? "")) return true
    for (const [projectId, draft] of Object.entries(drafts.projects)) {
      if (draft !== null && draft !== (projectInfos[projectId]?.content ?? "")) return true
    }
    return false
  }, [drafts, userInfo, projectInfos])

  // 3. 保存全部脏目标
  const handleSave = useCallback(async (): Promise<void> => {
    if (drafts.user !== null && drafts.user !== (userInfo?.content ?? "")) {
      const info = await instructionApi.save({ scope: "user", content: drafts.user })
      setUserInfo(info)
      setDrafts((prev) => ({ ...prev, user: null }))
    }
    for (const [projectId, draft] of Object.entries(drafts.projects)) {
      if (draft === null || draft === (projectInfos[projectId]?.content ?? "")) continue
      const project = projects.find((p) => p.id === projectId)
      if (!project?.path) continue
      const info = await instructionApi.save({
        scope: "project",
        projectPath: project.path,
        content: draft,
      })
      setProjectInfos((prev) => ({ ...prev, [projectId]: info }))
      setDrafts((prev) => ({
        ...prev,
        projects: { ...prev.projects, [projectId]: null },
      }))
    }
  }, [drafts, userInfo, projectInfos, projects])

  const handleReset = useCallback((): void => {
    setDrafts({ user: null, projects: {} })
  }, [])

  useRegisterSettingsSection({
    section: "agents-md",
    isDirty,
    onSave: handleSave,
    onReset: handleReset,
  })

  // 编辑器内保存（Ctrl+S）：失败时给出提示，成功后交给全局状态刷新
  const handleEditorSave = useCallback((): void => {
    void handleSave().catch((err) => {
      console.error("[AgentsMdSettings] Save failed:", err)
      toast.error(t("settings.saveFailed"))
    })
  }, [handleSave, toast, t])

  const handleDraftChange = useCallback(
    (value: string): void => {
      if (activeTab === "system") {
        setDrafts((prev) => ({ ...prev, user: value }))
        return
      }
      setDrafts((prev) => ({
        ...prev,
        projects: { ...prev.projects, [selectedProjectId]: value },
      }))
    },
    [activeTab, selectedProjectId],
  )

  const handleCopyFallback = useCallback((): void => {
    const fallbackContent = activeInfo?.fallback?.content ?? ""
    handleDraftChange(fallbackContent)
  }, [activeInfo, handleDraftChange])

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

  const editorKey =
    activeTab === "system" ? "agents-md:user" : `agents-md:project:${selectedProjectId}`

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      {/* 顶部 Tab 与项目选择栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="custom-command-tab-group flex items-center gap-1">
          <button
            type="button"
            data-active={activeTab === "system"}
            className={tabButtonClass(activeTab === "system")}
            onClick={() => setActiveTab("system")}
          >
            <Globe className="h-3.5 w-3.5 text-sky-400" />
            {t("settings.agentsMdSystemTab")}
          </button>
          <button
            type="button"
            data-active={activeTab === "project"}
            className={tabButtonClass(activeTab === "project")}
            onClick={() => setActiveTab("project")}
          >
            <Folder className="h-3.5 w-3.5 text-amber-400" />
            {t("settings.agentsMdProjectTab")}
          </button>
        </div>

        {activeTab === "project" && projects.length > 0 ? (
          <div className="w-[200px]">
            <LxSelect
              value={selectedProjectId}
              options={projectOptions}
              placeholder={t("settings.agentsMdSelectProject")}
              onChange={(val) => setSelectedProjectId(val)}
            />
          </div>
        ) : null}
      </div>

      {/* 主体两栏布局：左侧目标列表，右侧编辑面板 */}
      <div className="grid min-h-0 flex-1 gap-3 @[600px]:grid-cols-[240px_minmax(0,1fr)]">
        {/* 左侧列表 */}
        <div className="settings-item-card flex min-h-0 flex-col rounded-[6px] border border-white/8 bg-white/[0.02]">
          {activeTab === "system" ? (
            <div className="flex min-h-0 flex-1 flex-col p-1.5">
              <div className="flex flex-col gap-1 rounded-[6px] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.18))] bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] p-2 text-left">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  <span className="truncate text-xs font-medium text-[var(--color-theme-text,#ffffff)]">
                    {t("settings.agentsMdGlobalFile")}
                  </span>
                  <LxTag size="small" color={userInfo?.exists ? "emerald" : "gray"}>
                    {userInfo?.exists
                      ? t("settings.agentsMdConfigured")
                      : t("settings.agentsMdNotCreated")}
                  </LxTag>
                </div>
                <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))]">
                  {userInfo?.path ?? ""}
                </span>
              </div>
            </div>
          ) : (
            <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
              {projects.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/40">
                  {t("settings.agentsMdNoProjects")}
                </div>
              ) : (
                projects.map((project) => {
                  const isSelected = project.id === selectedProjectId
                  const info = projectInfos[project.id]
                  const projectDirty =
                    drafts.projects[project.id] !== null &&
                    drafts.projects[project.id] !== (info?.content ?? "")
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`flex w-full flex-col gap-1 rounded-[6px] border p-2 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "border-[var(--color-theme-border-strong,rgba(255,255,255,0.18))] bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
                          : "border-transparent text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] hover:border-[var(--color-theme-border,rgba(255,255,255,0.06))] hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.04))]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Folder className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-xs font-medium">{project.name}</span>
                        {projectDirty ? (
                          <span
                            aria-label="Unsaved"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                          />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <LxTag size="small" color={info?.exists ? "emerald" : "gray"}>
                          {info?.exists
                            ? t("settings.agentsMdConfigured")
                            : t("settings.agentsMdNotCreated")}
                        </LxTag>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* 右侧编辑面板 */}
        <div className="settings-item-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/8 bg-white/[0.02]">
          {activeTab === "project" && !selectedProject ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-white/40">
              <FileText className="h-8 w-8 text-white/20" />
              <span>{t("settings.agentsMdSelectHint")}</span>
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center gap-1.5 text-xs text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 路径与只读上级指令信息带 */}
              <div className="flex shrink-0 flex-col gap-2 border-b border-white/8 p-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-white/40">
                    {t("settings.agentsMdFilePath")}:
                  </span>
                  <span className="truncate font-mono text-xs text-white/60">
                    {activeInfo?.path ?? ""}
                  </span>
                  <LxIconButton
                    aria-label={t("common.copy")}
                    title={{
                      content: copiedPath ? t("common.copied") : t("common.copy"),
                      placement: "top",
                    }}
                    onClick={() => activeInfo && handleCopyPath(activeInfo.path)}
                  >
                    {copiedPath ? <Check className="text-emerald-400" /> : <Copy />}
                  </LxIconButton>
                </div>

                {activeInfo && activeInfo.chain.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-white/40">
                      {t("settings.agentsMdReadonlyChain")}:
                    </span>
                    {activeInfo.chain.map((entry) => (
                      <div key={entry.path} className="flex items-center gap-1.5 pl-1">
                        <Lock className="h-3 w-3 shrink-0 text-white/30" />
                        <span className="truncate font-mono text-xs text-white/45">
                          {entry.path}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeInfo?.fallback ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-amber-500/20 bg-amber-500/10 px-2 py-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="min-w-0 flex-1 text-xs leading-relaxed text-amber-200/90">
                      {t("settings.agentsMdFallbackHint", { path: activeInfo.fallback.path })}
                    </span>
                    <LxIconButton
                      iconOnly={false}
                      icon={<Copy className="h-3.5 w-3.5" />}
                      aria-label={t("settings.agentsMdFallbackCopy")}
                      onClick={handleCopyFallback}
                      className="shrink-0 rounded-[6px] border border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                    >
                      <span className="text-xs">{t("settings.agentsMdFallbackCopy")}</span>
                    </LxIconButton>
                  </div>
                ) : null}
              </div>

              {/* Markdown 编辑器 */}
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <LxMarkdownEditor
                  key={editorKey}
                  initialContent={editorValue}
                  onChange={handleDraftChange}
                  onSave={handleEditorSave}
                  isSaved={!isDirty}
                  showSaveStatus
                  showLineNumbers
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
