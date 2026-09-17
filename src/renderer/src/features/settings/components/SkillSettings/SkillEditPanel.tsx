import type { SkillItem, SkillTargetRoot } from "@shared/contracts/agent"
import { Check, Copy, Loader2, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown/LxMarkdownEditor"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { SkillMetaDraft } from "./skillDrafts"

// Skill 编辑面板属性（新建与编辑共用）。
export interface SkillEditPanelProps {
  createMode: boolean
  meta: SkillMetaDraft
  onMetaChange: (patch: Partial<SkillMetaDraft>) => void
  metaExpanded: boolean
  onToggleMeta: () => void
  renameWarning: string | null
  targetRoot: SkillTargetRoot
  onTargetRootChange: (value: SkillTargetRoot) => void
  resolvedRootPath: string
  skill: SkillItem | null
  skillEnabled: boolean
  onToggleEnabled: (enabled: boolean) => void
  onDeleteSkill: (() => void) | null
  onCopyPath: () => void
  copiedPath: boolean
  fileRail: React.ReactNode
  editorKey: string
  editorValue: string
  editorSaved: boolean
  isEditorLoading: boolean
  editorError: string | null
  onEditorChange: (content: string) => void
  onEditorSave: () => void
}

/**
 * 渲染 Skill 元数据（可折叠）、文件树侧栏与正文 Markdown 编辑器。
 */
export const SkillEditPanel = ({
  createMode,
  meta,
  onMetaChange,
  metaExpanded,
  onToggleMeta,
  renameWarning,
  targetRoot,
  onTargetRootChange,
  resolvedRootPath,
  skill,
  skillEnabled,
  onToggleEnabled,
  onDeleteSkill,
  onCopyPath,
  copiedPath,
  fileRail,
  editorKey,
  editorValue,
  editorSaved,
  isEditorLoading,
  editorError,
  onEditorChange,
  onEditorSave,
}: SkillEditPanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="settings-item-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))]">
      {/* 头部：标题与操作 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-3 py-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--color-theme-text,#ffffff)]">
          <span className="truncate">
            {createMode ? t("settings.skillsCreateTitle") : meta.displayName || meta.name}
          </span>
          {!createMode && meta.displayName ? (
            <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))]">
              ({meta.name})
            </span>
          ) : null}
        </h3>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!createMode && skill ? (
            <>
              <label className="flex cursor-pointer items-center gap-2">
                <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                  {skillEnabled ? t("common.enabled") : t("common.disabled")}
                </span>
                <LxCheckbox
                  checked={skillEnabled}
                  onChange={(checked) => onToggleEnabled(checked)}
                />
              </label>
              {onDeleteSkill ? (
                <LxTooltip
                  title={t("settings.skillsConfirmDeleteTitle")}
                  content={t("settings.skillsConfirmDeleteContent", { name: skill.name })}
                  placement="bottom"
                  onConfirm={onDeleteSkill}
                >
                  <LxIconButton
                    aria-label={t("common.delete")}
                    className="text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))] hover:text-rose-400"
                  >
                    <Trash2 />
                  </LxIconButton>
                </LxTooltip>
              ) : null}
            </>
          ) : null}

          <LxIconButton
            aria-label={t("settings.skillsMetaExpand")}
            title={{
              content: metaExpanded
                ? t("settings.skillsMetaCollapse")
                : t("settings.skillsMetaExpand"),
              placement: "bottom",
            }}
            highlighted={metaExpanded}
            onClick={onToggleMeta}
          >
            <SlidersHorizontal />
          </LxIconButton>
        </div>
      </div>

      {/* 元数据：折叠时显示描述与路径摘要 */}
      {metaExpanded ? (
        <div className="grid shrink-0 gap-3 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] p-3 @[600px]:grid-cols-2">
          <label className="grid gap-1 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
            <span className="flex items-center gap-1">
              {t("settings.skillsName")}
              <span className="text-rose-400">*</span>
            </span>
            <LxInput
              placeholder="e.g. pdf-processing"
              value={meta.name}
              onChange={(e) => onMetaChange({ name: e.target.value })}
            />
          </label>

          <label className="grid gap-1 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
            <span className="flex items-center gap-1">{t("settings.skillsDisplayName")}</span>
            <LxInput
              placeholder={t("settings.skillsDisplayNamePlaceholder")}
              value={meta.displayName}
              onChange={(e) => onMetaChange({ displayName: e.target.value })}
            />
          </label>

          <label className="grid gap-1 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))] @[600px]:col-span-2">
            <span className="flex items-center gap-1">
              {t("settings.skillsDescription")}
              <span className="text-rose-400">*</span>
            </span>
            <LxInput
              placeholder={t("settings.skillsDescriptionPlaceholder")}
              value={meta.description}
              onChange={(e) => onMetaChange({ description: e.target.value })}
            />
          </label>

          <label className="grid gap-1 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))] @[600px]:col-span-2">
            <span>{t("settings.skillsShortDescription")}</span>
            <LxInput
              placeholder={t("settings.skillsShortDescriptionPlaceholder")}
              value={meta.shortDescription}
              onChange={(e) => onMetaChange({ shortDescription: e.target.value })}
            />
          </label>

          <div className="flex items-center gap-2 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
            <LxCheckbox
              checked={meta.disableModelInvocation}
              onChange={(checked) => onMetaChange({ disableModelInvocation: checked })}
            />
            <span>{t("settings.skillsDisableModelInvocation")}</span>
          </div>

          {createMode ? (
            <div className="grid gap-1 text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
              <span>{t("settings.skillsTargetRoot")}</span>
              <LxSelect
                value={targetRoot}
                options={[
                  { value: "lx", label: t("settings.skillsTargetRootLx") },
                  { value: "agents", label: t("settings.skillsTargetRootAgents") },
                ]}
                onChange={(val) => onTargetRootChange(val as SkillTargetRoot)}
              />
              <span className="truncate font-mono text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                {resolvedRootPath}
              </span>
            </div>
          ) : null}

          {renameWarning ? (
            <div className="flex items-center gap-1.5 rounded-[6px] border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200/90 @[600px]:col-span-2">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="min-w-0 flex-1 break-all">{renameWarning}</span>
            </div>
          ) : null}

          {!createMode && skill ? (
            <div className="flex items-center gap-2 @[600px]:col-span-2">
              <span className="shrink-0 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                {t("settings.skillsFilePath")}:
              </span>
              <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                {skill.filePath}
              </span>
              <LxIconButton
                aria-label={t("common.copy")}
                title={{
                  content: copiedPath ? t("common.copied") : t("common.copy"),
                  placement: "top",
                }}
                onClick={onCopyPath}
              >
                {copiedPath ? <Check className="text-emerald-400" /> : <Copy />}
              </LxIconButton>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.55))]">
            {meta.description || "—"}
          </span>
          {!createMode && skill ? (
            <>
              <span className="max-w-[40%] truncate font-mono text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                {skill.filePath}
              </span>
              <LxIconButton
                aria-label={t("common.copy")}
                title={{
                  content: copiedPath ? t("common.copied") : t("common.copy"),
                  placement: "top",
                }}
                onClick={onCopyPath}
              >
                {copiedPath ? <Check className="text-emerald-400" /> : <Copy />}
              </LxIconButton>
            </>
          ) : null}
        </div>
      )}

      {/* 主体：文件树侧栏 + 正文编辑器 */}
      <div className="flex min-h-0 flex-1">
        {fileRail}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {isEditorLoading ? (
            <div className="flex h-full items-center justify-center gap-1.5 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("settings.skillsLoadingContent")}
            </div>
          ) : editorError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
              {editorError}
            </div>
          ) : (
            <LxMarkdownEditor
              key={editorKey}
              initialContent={editorValue}
              onChange={onEditorChange}
              onSave={onEditorSave}
              isSaved={editorSaved}
              showSaveStatus
            />
          )}
        </div>
      </div>
    </div>
  )
}
