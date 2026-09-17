import { Copy, File, FileText, Folder, Import, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { SkillTreeEntry } from "./skillDrafts"

// Skill 文件树属性。
export interface SkillFileTreeProps {
  entries: SkillTreeEntry[]
  selectedPath: string
  skillMdDirty: boolean
  isLoading: boolean
  canImport: boolean
  onSelect: (relativePath: string) => void
  onCreateFile: () => void
  onImport: () => void
  onRename: (relativePath: string) => void
  onDuplicate: (relativePath: string) => void
  onDelete: (relativePath: string) => void
}

// 文件行左侧缩进（按目录深度递增）。
const indentStyle = (depth: number): React.CSSProperties => ({ paddingLeft: 8 + depth * 12 })

/**
 * 渲染 Skill 目录的文件树（SKILL.md 固定项 + references/scripts/assets 等附加文件）。
 */
export const SkillFileTree = ({
  entries,
  selectedPath,
  skillMdDirty,
  isLoading,
  canImport,
  onSelect,
  onCreateFile,
  onImport,
  onRename,
  onDuplicate,
  onDelete,
}: SkillFileTreeProps): React.JSX.Element => {
  const { t } = useTranslation()

  const rows: React.JSX.Element[] = []
  const renderedDirs = new Set<string>()

  // SKILL.md 固定行（不可重命名/删除，正文由编辑器 meta 流程保存）。
  rows.push(
    <div
      key="SKILL.md"
      role="button"
      tabIndex={0}
      data-selected={selectedPath === "SKILL.md" ? "true" : undefined}
      onClick={() => onSelect("SKILL.md")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect("SKILL.md")
        }
      }}
      style={indentStyle(0)}
      className={`group flex cursor-pointer items-center gap-1.5 rounded-[6px] py-1 pr-1 text-xs ${
        selectedPath === "SKILL.md"
          ? "bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
          : "text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.04))]"
      }`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-sky-400" />
      <span className="truncate font-mono">SKILL.md</span>
      {skillMdDirty ? (
        <span aria-label="Unsaved" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
      ) : null}
    </div>,
  )

  for (const entry of entries) {
    const segments = entry.relativePath.split("/")
    const fileDepth = segments.length - 1

    // 目录分组行：按路径层级惰性插入。
    let prefix = ""
    for (let i = 0; i < fileDepth; i++) {
      prefix = prefix ? `${prefix}/${segments[i]}` : segments[i]
      if (renderedDirs.has(prefix)) continue
      renderedDirs.add(prefix)
      rows.push(
        <div
          key={`dir:${prefix}`}
          style={indentStyle(i)}
          className="flex items-center gap-1.5 py-1 pr-1 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]"
        >
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{segments[i]}</span>
        </div>,
      )
    }

    const isSelected = selectedPath === entry.relativePath
    rows.push(
      <div
        key={entry.relativePath}
        role="button"
        tabIndex={0}
        data-selected={isSelected ? "true" : undefined}
        onClick={() => onSelect(entry.relativePath)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(entry.relativePath)
          }
        }}
        style={indentStyle(fileDepth)}
        className={`group flex cursor-pointer items-center gap-1.5 rounded-[6px] py-1 pr-1 text-xs ${
          isSelected
            ? "bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
            : "text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.04))]"
        }`}
      >
        <File className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono">{segments[segments.length - 1]}</span>
        {entry.isDirty ? (
          <span aria-label="Unsaved" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        ) : null}
        <div
          className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <LxTooltip content={t("settings.skillsFileRename")} placement="top">
            <LxIconButton
              variant="ghost"
              showHoverBg={false}
              aria-label={t("settings.skillsFileRename")}
              onClick={() => onRename(entry.relativePath)}
            >
              <Pencil />
            </LxIconButton>
          </LxTooltip>
          <LxTooltip content={t("settings.skillsFileDuplicate")} placement="top">
            <LxIconButton
              variant="ghost"
              showHoverBg={false}
              aria-label={t("settings.skillsFileDuplicate")}
              onClick={() => onDuplicate(entry.relativePath)}
            >
              <Copy />
            </LxIconButton>
          </LxTooltip>
          <LxTooltip
            title={t("settings.skillsConfirmDeleteFileTitle")}
            content={t("settings.skillsConfirmDeleteFileContent", { path: entry.relativePath })}
            placement="top"
            onConfirm={() => onDelete(entry.relativePath)}
          >
            <LxIconButton
              variant="ghost"
              showHoverBg={false}
              hoverTextClass="hover:text-rose-400"
              aria-label={t("common.delete")}
            >
              <Trash2 />
            </LxIconButton>
          </LxTooltip>
        </div>
      </div>,
    )
  }

  return (
    <div className="flex min-h-0 w-[190px] shrink-0 flex-col border-r border-[var(--color-theme-border,rgba(255,255,255,0.06))]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-2 py-1.5">
        <span className="text-xs font-medium text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
          {t("settings.skillsFiles")} ({entries.length + 1})
        </span>
        <div className="flex items-center gap-0.5">
          <LxTooltip content={t("settings.skillsFileCreate")} placement="top">
            <LxIconButton
              preset="add"
              aria-label={t("settings.skillsFileCreate")}
              onClick={onCreateFile}
            >
              <Plus />
            </LxIconButton>
          </LxTooltip>
          <LxTooltip
            content={
              canImport ? t("settings.skillsFileImport") : t("settings.skillsFileImportDisabled")
            }
            placement="top"
          >
            <LxIconButton
              aria-label={t("settings.skillsFileImport")}
              disabled={!canImport}
              className={canImport ? "" : "opacity-30"}
              onClick={() => canImport && onImport()}
            >
              <Import />
            </LxIconButton>
          </LxTooltip>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="flex h-20 items-center justify-center text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          rows
        )}
      </div>
    </div>
  )
}
