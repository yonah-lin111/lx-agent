import { File, FileText, Folder, Import, Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { SkillFileMenu } from "./SkillFileMenu"
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

// 右键菜单状态。
interface FileMenuState {
  path: string
  x: number
  y: number
  anchor: HTMLElement
}

// 行缩进：与 LxNavItem 的 depth 阶梯保持一致（depth 从 1 起算）。
const indentForDepth = (depth: number): React.CSSProperties => ({
  marginLeft: 10 + Math.max(depth - 1, 0) * 12,
})

// 选中/默认文字样式。
const rowClass = (isSelected: boolean): string =>
  isSelected
    ? "bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] text-[var(--color-theme-text,#ffffff)]"
    : "text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]"

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
  const [fileMenu, setFileMenu] = useState<FileMenuState | null>(null)

  const rows: React.JSX.Element[] = []
  const renderedDirs = new Set<string>()

  /**
   * 打开文件行的右键菜单。
   */
  const openFileMenu = (event: React.MouseEvent, relativePath: string): void => {
    event.preventDefault()
    setFileMenu({
      path: relativePath,
      x: event.clientX,
      y: event.clientY,
      anchor: event.currentTarget as HTMLElement,
    })
  }

  // SKILL.md 固定行（不可重命名/删除，正文由编辑器 meta 流程保存）。
  rows.push(
    <LxNavItem
      key="SKILL.md"
      size="small"
      level={3}
      depth={1}
      aria-current={selectedPath === "SKILL.md" ? "true" : undefined}
      data-selected={selectedPath === "SKILL.md" ? "true" : undefined}
      className={rowClass(selectedPath === "SKILL.md")}
      onClick={() => onSelect("SKILL.md")}
      prefix={<FileText className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
      suffix={
        skillMdDirty ? (
          <span aria-label="Unsaved" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        ) : null
      }
    >
      <span className="min-w-0 flex-1 truncate font-mono">SKILL.md</span>
    </LxNavItem>,
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
          style={indentForDepth(i + 1)}
          className="flex h-6 items-center gap-1.5 px-2 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]"
        >
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{segments[i]}</span>
        </div>,
      )
    }

    const isSelected = selectedPath === entry.relativePath
    rows.push(
      <LxNavItem
        key={entry.relativePath}
        size="small"
        level={3}
        depth={fileDepth + 1}
        aria-current={isSelected ? "true" : undefined}
        data-selected={isSelected ? "true" : undefined}
        data-menu-open={fileMenu?.path === entry.relativePath ? "true" : undefined}
        className={rowClass(isSelected)}
        onClick={() => onSelect(entry.relativePath)}
        onContextMenu={(event) => openFileMenu(event, entry.relativePath)}
        prefix={<File className="h-3.5 w-3.5 shrink-0" />}
        suffix={
          entry.isDirty ? (
            <span aria-label="Unsaved" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          ) : null
        }
      >
        <span className="min-w-0 flex-1 truncate font-mono">{segments[segments.length - 1]}</span>
      </LxNavItem>,
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

      <SkillFileMenu
        isOpen={fileMenu !== null}
        anchor={fileMenu?.anchor ?? null}
        title={fileMenu?.path ?? ""}
        x={fileMenu?.x ?? 0}
        y={fileMenu?.y ?? 0}
        onRename={() => {
          const path = fileMenu?.path
          setFileMenu(null)
          if (path) onRename(path)
        }}
        onDuplicate={() => {
          const path = fileMenu?.path
          setFileMenu(null)
          if (path) onDuplicate(path)
        }}
        onDelete={() => {
          const path = fileMenu?.path
          setFileMenu(null)
          if (path) onDelete(path)
        }}
        onClose={() => setFileMenu(null)}
      />
    </div>
  )
}
