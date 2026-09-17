import type { SkillItem } from "@shared/contracts/agent"
import { Folder, Globe, Loader2, Plus, Search, Trash2 } from "lucide-react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { hasEditChanges, type SkillEdit } from "./skillDrafts"

// Skill 列表属性。
export interface SkillListPaneProps {
  skills: SkillItem[]
  loading: boolean
  searchQuery: string
  createActive: boolean
  createName: string
  selectedSkillName: string | null
  disabledSkills: string[]
  edits: Record<string, SkillEdit>
  onSearchChange: (value: string) => void
  onSelect: (name: string) => void
  onSelectDraft: () => void
  onCreate: () => void
  onToggleDisabled: (name: string, enabled: boolean) => void
  onDelete: (skill: SkillItem) => void
}

/**
 * 渲染 Skill 列表（含新建草稿项、搜索、启停开关与删除）。
 */
export const SkillListPane = ({
  skills,
  loading,
  searchQuery,
  createActive,
  createName,
  selectedSkillName,
  disabledSkills,
  edits,
  onSearchChange,
  onSelect,
  onSelectDraft,
  onCreate,
  onToggleDisabled,
  onDelete,
}: SkillListPaneProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="settings-item-card flex min-h-0 flex-1 flex-col rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] p-2">
        <span className="text-xs font-medium text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
          {t("settings.skills")} ({skills.length + (createActive ? 1 : 0)})
        </span>
        <LxIconButton
          preset="add"
          aria-label={t("settings.skillsCreate")}
          title={{ content: t("settings.skillsCreate"), placement: "top" }}
          onClick={onCreate}
        >
          <Plus />
        </LxIconButton>
      </div>

      <div className="shrink-0 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] p-1.5">
        <LxInput
          prefix={
            <Search className="h-3.5 w-3.5 text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))]" />
          }
          placeholder={t("settings.skillsSearchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            {createActive ? (
              <div
                role="button"
                tabIndex={0}
                data-selected="true"
                onClick={onSelectDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelectDraft()
                  }
                }}
                className="flex cursor-pointer flex-col gap-1 rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-2 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium italic text-emerald-300">
                    {createName.trim() || t("settings.skillsNewDraft")}
                  </span>
                  <LxTag size="small" bgClass="bg-emerald-500/20 text-emerald-300">
                    Draft
                  </LxTag>
                </div>
              </div>
            ) : null}

            {skills.length === 0 && !createActive ? (
              <div className="py-8 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                {t("settings.skillsNoSkills")}
              </div>
            ) : (
              skills.map((skill) => {
                const isSelected = !createActive && skill.name === selectedSkillName
                const isDisabled = disabledSkills.includes(skill.name)
                const dirty = hasEditChanges(edits[skill.baseDir])

                return (
                  <div
                    key={skill.baseDir}
                    role="button"
                    tabIndex={0}
                    data-selected={isSelected ? "true" : undefined}
                    onClick={() => onSelect(skill.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onSelect(skill.name)
                      }
                    }}
                    className={`group flex cursor-pointer flex-col gap-1 rounded-[6px] border px-2 py-1.5 text-left transition-colors ${
                      isSelected
                        ? "border-[var(--color-theme-border-strong,rgba(255,255,255,0.18))] bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
                        : "border-transparent text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] hover:border-[var(--color-theme-border,rgba(255,255,255,0.06))] hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.04))]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-[var(--color-theme-text,#ffffff)]">
                          {skill.displayName || skill.name}
                        </span>
                        {dirty ? (
                          <span
                            aria-label="Unsaved"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                          />
                        ) : null}
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LxTooltip
                          content={isDisabled ? t("common.enable") : t("common.disable")}
                          placement="top"
                        >
                          <label
                            className="inline-flex cursor-pointer items-center p-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <LxCheckbox
                              checked={!isDisabled}
                              onChange={(checked) => onToggleDisabled(skill.name, checked)}
                            />
                          </label>
                        </LxTooltip>

                        <LxTooltip
                          title={t("settings.skillsConfirmDeleteTitle")}
                          content={
                            skill.isGlobal
                              ? t("settings.skillsConfirmDeleteContent", { name: skill.name })
                              : t("settings.skillsConfirmDeleteProjectContent", {
                                  name: skill.name,
                                })
                          }
                          placement="top"
                          onConfirm={() => onDelete(skill)}
                        >
                          <LxIconButton
                            aria-label={t("common.delete")}
                            className="text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))] hover:text-rose-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 />
                          </LxIconButton>
                        </LxTooltip>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {skill.isGlobal ? (
                        <LxTag size="small" color="gray">
                          <Globe className="mr-0.5 inline h-2.5 w-2.5" />
                          {t("settings.skillsScopeGlobal")}
                        </LxTag>
                      ) : (
                        <LxTag size="small" color="blue">
                          <Folder className="mr-0.5 inline h-2.5 w-2.5" />
                          {t("settings.skillsScopeProject")}
                        </LxTag>
                      )}
                      <LxTag size="small" color={skill.sourceKind === "agents" ? "purple" : "sky"}>
                        {skill.sourceKind === "agents" ? ".agents" : "lx"}
                      </LxTag>
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
          </>
        )}
      </div>
    </div>
  )
}
