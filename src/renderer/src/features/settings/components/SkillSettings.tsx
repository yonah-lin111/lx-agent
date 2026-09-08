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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectApi } from "@/features/project/api/projectApi"
import { useRecentItemsStore } from "@/features/project/recentItemsStore"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import {
  notifySettingsChanged,
  subscribeSettingsChanged,
} from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"

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
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null)
  const [contentCache, setContentCache] = useState<Record<string, string>>({})
  const [loadingContent, setLoadingContent] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)

  const baselineDisabledRef = useRef<string | null>(null)

  const isDirty = useMemo(() => {
    if (baselineDisabledRef.current === null) return false
    return JSON.stringify(disabledSkills) !== baselineDisabledRef.current
  }, [disabledSkills])

  const handleSave = useCallback(async (): Promise<void> => {
    const saved = await settingsApi.saveSkillSettings({ disabled: disabledSkills })
    setDisabledSkills(saved.disabled)
    baselineDisabledRef.current = JSON.stringify(saved.disabled)
    notifySettingsChanged("skills")
  }, [disabledSkills])

  const handleReset = useCallback((): void => {
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

  // 1. 初始化拉取项目列表并解析默认选中的当前项目
  useEffect(() => {
    void Promise.all([projectApi.listProjects(), projectApi.list().catch(() => [])]).then(
      ([list, items]) => {
        const fsProjects = list.filter((p) => Boolean(p.path && p.path.trim()))
        setProjects(fsProjects)

        // 优先级 1：当前活跃 Tab 绑定的项目（草稿或会话）
        const activeTab = agentTabStore.getActiveTab()
        let candidateId: string | null | undefined = activeTab?.draftBinding?.projectId
        if (!candidateId && activeTab?.sessionId) {
          const session = sessionListStore.getSessions().find((s) => s.id === activeTab.sessionId)
          candidateId = session?.projectId
        }
        if (!candidateId) {
          candidateId = sessionListStore.getCurrentSessionBinding()?.projectId
        }

        // 优先级 2：最近访问的项目条目所属项目
        if (!candidateId) {
          const recentIds = useRecentItemsStore.getState().ids
          for (const id of recentIds) {
            const item = items.find((it) => it.id === id)
            if (item?.projectId) {
              candidateId = item.projectId
              break
            }
          }
        }

        // 命中有效项目则选中，否则默认全部项目 ("")
        if (candidateId && fsProjects.some((p) => p.id === candidateId)) {
          setSelectedProjectId(candidateId)
        } else {
          setSelectedProjectId("")
        }
      },
    )
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
        if (baselineDisabledRef.current === null || force) {
          baselineDisabledRef.current = JSON.stringify(config.disabled)
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

  // 5. 启用/禁用切换：更新本地草稿
  const handleToggleDisabled = (skillName: string, enabled: boolean) => {
    const nextDisabled = enabled
      ? disabledSkills.filter((name) => name !== skillName)
      : disabledSkills.includes(skillName)
        ? disabledSkills
        : [...disabledSkills, skillName]
    setDisabledSkills(nextDisabled)
  }

  // 6. 物理删除（移入废纸篓）
  const handleConfirmDelete = async (target: SkillItem) => {
    try {
      const res = await settingsApi.deleteSkill(target.filePath)
      if (res.success) {
        toast.success(t("settings.skillsDeleteSuccess", { name: target.name }))
        if (selectedSkillName === target.name) {
          setSelectedSkillName(null)
        }
        setContentCache((prev) => {
          const next = { ...prev }
          delete next[target.name]
          return next
        })
        // 同步清除已删除项的 disabled 状态
        const nextDisabled = disabledSkills.filter((name) => name !== target.name)
        if (nextDisabled.length !== disabledSkills.length) {
          setDisabledSkills(nextDisabled)
          void settingsApi.saveSkillSettings({ disabled: nextDisabled })
        }
        notifySettingsChanged("skills")
        await loadData()
      } else {
        toast.error(res.error || t("settings.skillsDeleteFailed"))
      }
    } catch (err) {
      console.error("[SkillSettings] Delete failed:", err)
      toast.error(t("settings.skillsDeleteFailed"))
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
  const projectOptions: LxSelectOption<string>[] = useMemo(() => {
    return [
      { label: t("settings.skillsAllProjects"), value: "" },
      ...projects.map((p) => ({
        label: p.name || p.path || p.id || "",
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
            size="sm"
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
        <div className="settings-item-card settings-skill-list-card flex min-h-0 flex-col rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))]">
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
                    data-selected={isSelected ? "true" : undefined}
                    onClick={() => setSelectedSkillName(skill.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setSelectedSkillName(skill.name)
                      }
                    }}
                    className={`settings-skill-item group flex flex-col gap-1 rounded-[6px] border p-2 transition-colors cursor-pointer text-left ${
                      isSelected
                        ? "settings-skill-item-active active border-[var(--color-theme-border-strong,rgba(255,255,255,0.18))] bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
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
                          <label
                            className="inline-flex items-center cursor-pointer p-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <LxCheckbox
                              checked={!isDisabled}
                              onChange={(checked) => void handleToggleDisabled(skill.name, checked)}
                            />
                          </label>
                        </LxTooltip>

                        {skill.isGlobal ? (
                          <LxTooltip
                            title={t("settings.skillsConfirmDeleteTitle")}
                            content={t("settings.skillsConfirmDeleteContent", { name: skill.name })}
                            placement="top"
                            onConfirm={() => void handleConfirmDelete(skill)}
                          >
                            <LxIconButton
                              size="small"
                              aria-label={t("common.delete")}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))] hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </LxIconButton>
                          </LxTooltip>
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
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 右侧详情 / 参考面板 */}
        <div className="settings-item-card settings-skill-detail-card flex min-h-0 flex-1 flex-col rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] overflow-hidden">
          {!selectedSkill ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
              <Sparkles className="h-8 w-8 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.2))]" />
              <span>{t("settings.skillsSelectHint")}</span>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              {/* 详情头部 */}
              <div className="settings-skill-detail-header flex shrink-0 flex-col gap-2 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] p-4">
                {/* 顶部标题行与启用状态 */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
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

                  <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                    <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                      {disabledSkills.includes(selectedSkill.name)
                        ? t("common.disabled")
                        : t("common.enabled")}
                    </span>
                    <LxCheckbox
                      checked={!disabledSkills.includes(selectedSkill.name)}
                      onChange={(checked) => void handleToggleDisabled(selectedSkill.name, checked)}
                    />
                  </label>
                </div>

                {/* 描述内容：占满卡片宽度并限制最大高度可滚动 */}
                {selectedSkill.description ? (
                  <div className="custom-scrollbar max-h-24 overflow-y-auto pr-1 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] leading-relaxed">
                    {selectedSkill.description}
                  </div>
                ) : null}

                {/* 路径与复制 */}
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] shrink-0">
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

              {/* 参考内容预览区 */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="settings-skill-preview-header flex shrink-0 items-center justify-between border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-4 py-2 bg-[var(--color-theme-surface,rgba(255,255,255,0.01))]">
                  <span className="text-xs font-medium text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                    {t("settings.skillsContentPreview")}
                  </span>
                </div>

                <div className="settings-skill-preview-body custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                  {loadingContent ? (
                    <div className="flex h-32 items-center justify-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      {t("settings.skillsLoadingContent")}
                    </div>
                  ) : selectedSkillContent ? (
                    <LxMarkdownPreview
                      previewMode="preview"
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
    </div>
  )
}
