import type { SkillItem } from "@shared/contracts/agent"
import type { Project } from "@shared/project"
import {
  Check,
  Copy,
  Folder,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxModal } from "@/components/ui/LxModal"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectApi } from "@/features/project/api/projectApi"
import { useTranslation } from "@/i18n"
import { settingsApi } from "../api/settingsApi"
import { settingsDirtyStore } from "../hooks/settingsDirtyStore"
import { notifySettingsChanged, subscribeSettingsChanged } from "../settingsChangeNotifier"

export const SkillSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [disabledSkills, setDisabledSkills] = useState<string[]>([])
  const [initialDisabled, setInitialDisabled] = useState<string[] | null>(null)
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null)
  const [contentCache, setContentCache] = useState<Record<string, string>>({})
  const [loadingContent, setLoadingContent] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SkillItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)

  // 1. 初始化拉取项目列表
  useEffect(() => {
    projectApi
      .listProjects()
      .then((list) => {
        const fsProjects = list.filter((p) => Boolean(p.path && p.path.trim()))
        setProjects(fsProjects)

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

  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  )

  const effectiveCwd = currentProject?.path || undefined

  // 2. 加载 Skill 列表与配置数据
  const loadData = useCallback(
    async (force = false) => {
      try {
        if (force) setRefreshing(true)
        else setLoading(true)

        const [skillList, config] = await Promise.all([
          window.api.agent.listSkills(effectiveCwd, force),
          settingsApi.getSkillSettings(),
        ])

        setSkills(skillList)
        setDisabledSkills(config.disabled)
        setInitialDisabled([...config.disabled])

        if (force) {
          setContentCache({})
        }

        // 默认选中首个 Skill
        if (skillList.length > 0) {
          setSelectedSkillName((prev) => {
            if (prev && skillList.some((s) => s.name === prev)) return prev
            return skillList[0].name
          })
        } else {
          setSelectedSkillName(null)
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

  const handleRefresh = async () => {
    await loadData(true)
    toast.success(t("settings.skillsRefreshed"))
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 订阅其他组件引起的 skills 变更
  useEffect(() => {
    return subscribeSettingsChanged("skills", () => {
      void loadData()
    })
  }, [loadData])

  // 3. 脏检查与 DirtyStore 注册
  const isDirty = useMemo(() => {
    if (!initialDisabled) return false
    const currentSorted = [...disabledSkills].sort()
    const initialSorted = [...initialDisabled].sort()
    if (currentSorted.length !== initialSorted.length) return true
    return currentSorted.some((val, idx) => val !== initialSorted[idx])
  }, [disabledSkills, initialDisabled])

  useEffect(() => {
    settingsDirtyStore.setSectionDirty("skills", isDirty)
  }, [isDirty])

  useEffect(() => {
    const unregisterSave = settingsDirtyStore.registerSaveHandler("skills", async () => {
      const saved = await settingsApi.saveSkillSettings({ disabled: disabledSkills })
      setDisabledSkills(saved.disabled)
      setInitialDisabled([...saved.disabled])
      settingsDirtyStore.setSectionDirty("skills", false)
      notifySettingsChanged("skills")
    })

    const unregisterReset = settingsDirtyStore.registerResetHandler("skills", () => {
      if (initialDisabled) {
        setDisabledSkills([...initialDisabled])
      }
      settingsDirtyStore.setSectionDirty("skills", false)
    })

    return () => {
      unregisterSave()
      unregisterReset()
    }
  }, [disabledSkills, initialDisabled])

  // 4. 获取当前选中的 Skill 对象及正文
  const selectedSkill = useMemo(
    () => skills.find((s) => s.name === selectedSkillName) ?? null,
    [skills, selectedSkillName],
  )

  useEffect(() => {
    if (!selectedSkill) return
    const name = selectedSkill.name
    if (contentCache[name] !== undefined) return

    setLoadingContent(true)
    window.api.agent
      .getSkillContent(name, effectiveCwd)
      .then((content) => {
        setContentCache((prev) => ({ ...prev, [name]: content || "" }))
      })
      .catch((err) => {
        console.error("[SkillSettings] Failed to load skill content:", err)
        setContentCache((prev) => ({ ...prev, [name]: "" }))
      })
      .finally(() => {
        setLoadingContent(false)
      })
  }, [selectedSkill, effectiveCwd, contentCache])

  // 5. 启用/禁用切换
  const handleToggleDisabled = (skillName: string, enabled: boolean) => {
    setDisabledSkills((prev) => {
      if (enabled) {
        return prev.filter((name) => name !== skillName)
      }
      if (!prev.includes(skillName)) {
        return [...prev, skillName]
      }
      return prev
    })
  }

  // 6. 物理删除（移入废纸篓）
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await settingsApi.deleteSkill(deleteTarget.filePath)
      if (res.success) {
        toast.success(t("settings.skillsDeleteSuccess", { name: deleteTarget.name }))
        setDeleteTarget(null)
        if (selectedSkillName === deleteTarget.name) {
          setSelectedSkillName(null)
        }
        setContentCache((prev) => {
          const next = { ...prev }
          delete next[deleteTarget.name]
          return next
        })
        notifySettingsChanged("skills")
        await loadData()
      } else {
        toast.error(res.error || t("settings.skillsDeleteFailed"))
      }
    } catch (err) {
      console.error("[SkillSettings] Delete failed:", err)
      toast.error(t("settings.skillsDeleteFailed"))
    } finally {
      setDeleting(false)
    }
  }

  // 7. 过滤列表
  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return skills
    return skills.filter((s) => {
      const nameMatch = s.name.toLowerCase().includes(q)
      const displayMatch = s.displayName?.toLowerCase().includes(q)
      const descMatch = s.description.toLowerCase().includes(q)
      return nameMatch || displayMatch || descMatch
    })
  }, [skills, searchQuery])

  // 项目下拉框选项
  const projectOptions: LxSelectOption[] = useMemo(() => {
    return [
      { label: t("settings.skillsAllProjects"), value: "" },
      ...projects.map((p) => ({
        label: p.name || p.path,
        value: p.id,
      })),
    ]
  }, [projects, t])

  const selectedSkillContent = selectedSkill ? contentCache[selectedSkill.name] : ""
  const previewHtml = useMemo(() => {
    if (!selectedSkillContent) return ""
    return markdownRenderer.render(selectedSkillContent)
  }, [selectedSkillContent])

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 1500)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-3 gap-3">
      {/* 顶部工具条：搜索与项目选择 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] pb-3">
        <div className="flex min-w-[200px] max-w-sm flex-1 items-center gap-2">
          <LxInput
            size="small"
            prefix={
              <Search className="h-3.5 w-3.5 text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))]" />
            }
            placeholder={t("settings.skillsSearchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <LxIconButton
            preset="default"
            size="small"
            aria-label={t("common.refresh")}
            title={{ content: t("common.refresh"), placement: "bottom" }}
            disabled={refreshing || loading}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-white" : ""}`} />
          </LxIconButton>
        </div>

        {projects.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))]">
              {t("settings.skillsSelectProject")}:
            </span>
            <div className="w-48">
              <LxSelect
                size="small"
                options={projectOptions}
                value={selectedProjectId}
                onChange={(val) => setSelectedProjectId(val)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* 主体两栏布局：左侧 Skill 列表，右侧参考详情 */}
      <div className="grid min-h-0 flex-1 gap-3 grid-cols-[280px_minmax(0,1fr)]">
        {/* 左侧列表 */}
        <div className="flex min-h-0 flex-col rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] p-2">
            <span className="text-xs font-medium text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
              {t("settings.skills")} ({filteredSkills.length})
            </span>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                {t("common.loading")}
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                {t("settings.skillsNoSkills")}
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const isSelected = skill.name === selectedSkillName
                const isDisabled = disabledSkills.includes(skill.name)

                return (
                  <div
                    key={skill.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSkillName(skill.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setSelectedSkillName(skill.name)
                      }
                    }}
                    className={`group flex flex-col gap-1 rounded-[6px] border p-2 transition-colors cursor-pointer text-left ${
                      isSelected
                        ? "border-[var(--color-theme-border-strong,rgba(255,255,255,0.18))] bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
                        : "border-transparent text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] hover:border-[var(--color-theme-border,rgba(255,255,255,0.06))] hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.04))]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-xs font-medium text-[var(--color-theme-text,#ffffff)]">
                        {skill.displayName || skill.name}
                      </span>
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LxTooltip
                          content={isDisabled ? t("common.enable") : t("common.disable")}
                          placement="top"
                        >
                          <span>
                            <LxCheckbox
                              checked={!isDisabled}
                              onChange={(checked) => handleToggleDisabled(skill.name, checked)}
                            />
                          </span>
                        </LxTooltip>

                        {skill.isGlobal ? (
                          <LxIconButton
                            size="small"
                            aria-label={t("common.delete")}
                            title={{ content: t("common.delete"), placement: "top" }}
                            onClick={() => setDeleteTarget(skill)}
                            className="text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))] hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </LxIconButton>
                        ) : (
                          <LxTooltip
                            content={t("settings.skillsCannotDeleteProject")}
                            placement="top"
                          >
                            <span className="cursor-not-allowed">
                              <LxIconButton
                                size="small"
                                aria-label={t("common.delete")}
                                disabled
                                className="opacity-30"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </LxIconButton>
                            </span>
                          </LxTooltip>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {skill.isGlobal ? (
                        <LxTag size="small" color="gray">
                          <Globe className="h-2.5 w-2.5 mr-0.5 inline" />
                          {t("settings.skillsScopeGlobal")}
                        </LxTag>
                      ) : (
                        <LxTag size="small" color="blue">
                          <Folder className="h-2.5 w-2.5 mr-0.5 inline" />
                          {t("settings.skillsScopeProject")}
                        </LxTag>
                      )}

                      {isDisabled ? (
                        <LxTag size="small" color="rose">
                          {t("common.disabled")}
                        </LxTag>
                      ) : null}
                    </div>

                    <p className="line-clamp-2 text-[11px] leading-tight text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))]">
                      {skill.shortDescription || skill.description}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 右侧详情 / 参考面板 */}
        <div className="flex min-h-0 flex-1 flex-col rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] overflow-hidden">
          {!selectedSkill ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
              <Sparkles className="h-8 w-8 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.2))]" />
              <span>{t("settings.skillsSelectHint")}</span>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              {/* 详情头部 */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-[var(--color-theme-text,#ffffff)]">
                      {selectedSkill.displayName || selectedSkill.name}
                    </h3>
                    {selectedSkill.displayName ? (
                      <span className="font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))]">
                        ({selectedSkill.name})
                      </span>
                    ) : null}

                    {selectedSkill.isGlobal ? (
                      <LxTag size="small" color="gray">
                        <Globe className="h-2.5 w-2.5 mr-0.5 inline" />
                        {t("settings.skillsScopeGlobal")}
                      </LxTag>
                    ) : (
                      <LxTag size="small" color="blue">
                        <Folder className="h-2.5 w-2.5 mr-0.5 inline" />
                        {t("settings.skillsScopeProject")}
                      </LxTag>
                    )}

                    {selectedSkill.disableModelInvocation ? (
                      <LxTag size="small" color="amber">
                        {t("settings.skillsDisableModelInvocation")}
                      </LxTag>
                    ) : null}
                  </div>

                  <p className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] leading-relaxed">
                    {selectedSkill.description}
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                      {t("settings.skillsFilePath")}:
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))] truncate max-w-md">
                      {selectedSkill.filePath}
                    </span>
                    <LxTooltip
                      content={copiedPath ? t("common.copied") : t("common.copy")}
                      placement="top"
                    >
                      <LxIconButton
                        size="small"
                        aria-label={t("common.copy")}
                        onClick={() => handleCopyPath(selectedSkill.filePath)}
                      >
                        {copiedPath ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </LxIconButton>
                    </LxTooltip>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                    {disabledSkills.includes(selectedSkill.name)
                      ? t("common.disabled")
                      : t("common.enabled")}
                  </span>
                  <LxCheckbox
                    checked={!disabledSkills.includes(selectedSkill.name)}
                    onChange={(checked) => handleToggleDisabled(selectedSkill.name, checked)}
                  />
                </div>
              </div>

              {/* 参考内容预览区 */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-4 py-2 bg-[var(--color-theme-surface,rgba(255,255,255,0.01))]">
                  <span className="text-xs font-medium text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                    {t("settings.skillsContentPreview")}
                  </span>
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                  {loadingContent ? (
                    <div className="flex h-32 items-center justify-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      {t("settings.skillsLoadingContent")}
                    </div>
                  ) : selectedSkillContent ? (
                    <LxMarkdownPreview
                      html={previewHtml}
                      className="px-0"
                      contentClassName="py-0 text-xs"
                    />
                  ) : (
                    <div className="py-12 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.3))]">
                      {t("settings.skillsNoContent")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认 Modal */}
      <LxModal
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={t("settings.skillsConfirmDeleteTitle")}
        description={
          deleteTarget
            ? t("settings.skillsConfirmDeleteContent", { name: deleteTarget.name })
            : undefined
        }
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onConfirm={handleConfirmDelete}
        confirmDisabled={deleting}
      />
    </div>
  )
}
