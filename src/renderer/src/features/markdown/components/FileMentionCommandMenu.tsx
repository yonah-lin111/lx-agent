import { Braces, FileText, Folder } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownTemplateFileKind } from "@/features/markdown/commands/markdownTemplateFileCommands"
import {
  getVariableTag,
  type MarkdownVariableEntry,
} from "@/features/markdown/commands/markdownVariableCommands"
import type { MarkdownFileMentionEntry } from "@/features/markdown/types"
import { getMentionDirectoryTag } from "@/features/project/utils"
import { useTranslation } from "@/i18n"

// 模板块文件快捷输入候选来源对应的图标颜色（@ 提及面板不使用）。
const templateFileKindIconColors: Record<MarkdownTemplateFileKind, string> = {
  currentMention: "text-[#eab308]",
  referenceMention: "text-violet-300",
  referFile: "text-sky-300",
  referFolder: "text-[#d97706]",
}

// 文件提及面板属性。
interface FileMentionCommandMenuProps {
  files?: MarkdownFileMentionEntry[]
  // 字母快捷输入面板附加的页面变量候选（@ 提及面板不使用）。
  variables?: MarkdownVariableEntry[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  // 面板语义标签。
  label?: string
  // 选项 DOM id 前缀，避免多种文件面板并存时 id 冲突。
  idPrefix?: string
  onSelect?: (file: MarkdownFileMentionEntry) => void
  onSelectVariable?: (variable: MarkdownVariableEntry) => void
}

// 选项 DOM id：按来源类型分段，避免同路径多来源并存时 id 冲突。
const getOptionId = (idPrefix: string, file: MarkdownFileMentionEntry): string =>
  `${idPrefix}-${file.source}-${file.templateKind ? `${file.templateKind}-` : ""}${file.mentionPath}`

/**
 * 渲染 Markdown 编辑器的项目文件命令面板（@ 提及 / 模板块文件快捷输入）。
 */
export const FileMentionCommandMenu = ({
  files,
  variables = [],
  activeIndex = 0,
  position,
  visible = false,
  label = "项目文件提及",
  idPrefix = "markdown-file-mention",
  onSelect,
  onSelectVariable,
}: FileMentionCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = files && position ? { position, activeIndex, files, variables } : null

  return (
    <LxCommandPanel
      ariaActiveDescendant={(data) => {
        const activeFile = data.files[data.activeIndex] ?? data.files[0]
        return activeFile ? getOptionId(idPrefix, activeFile) : undefined
      }}
      ariaLabel={label}
      className="markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data={panelData}
      scrollActiveItem
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.files.map((file, index) => {
            const normalizedPath = file.path.replace(/\/$/, "")
            const slashIndex = normalizedPath.lastIndexOf("/")
            const name = normalizedPath.slice(slashIndex + 1)
            const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
            const referenceProjectName = file.projectPath?.split("/").filter(Boolean).at(-1)
            const Icon = file.isDirectory ? Folder : FileText
            const iconClassName = file.templateKind
              ? templateFileKindIconColors[file.templateKind]
              : file.source === "reference"
                ? "text-violet-300"
                : "text-[#eab308]"
            const isActive = index === displayData.activeIndex
            const optionId = getOptionId(idPrefix, file)
            const directoryTag = getMentionDirectoryTag(file.path)

            return (
              <LxCommandPanelItem
                key={optionId}
                active={isActive}
                className="relative flex min-h-11 px-2 py-1 text-xs"
                id={optionId}
                index={index}
                onSelect={() => onSelect?.(file)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-h-8 items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${iconClassName}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div
                          className={`min-w-0 flex-1 truncate ${isActive ? "text-white" : "text-white/75"}`}
                        >
                          {file.isDirectory ? `${name}/` : name}
                        </div>
                        {file.source === "reference" && (
                          <LxTag
                            bgClass="border-violet-400/20 bg-violet-400/10 text-violet-300"
                            className="pointer-events-none shrink-0"
                            size="small"
                          >
                            {referenceProjectName ?? "refer-project"}
                          </LxTag>
                        )}
                        {directoryTag && (
                          <LxTag
                            bgClass={directoryTag.bgClass}
                            className="pointer-events-none shrink-0"
                            size="small"
                          >
                            {directoryTag.label}
                          </LxTag>
                        )}
                        {file.source === "current" && file.worktreeName && (
                          <LxTag
                            bgClass="border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                            className="pointer-events-none shrink-0"
                            size="small"
                          >
                            {file.worktreeName}
                          </LxTag>
                        )}
                      </div>
                      {directory && (
                        <div className="truncate text-[12px] text-white/40">{directory}</div>
                      )}
                    </div>
                  </div>
                </div>
              </LxCommandPanelItem>
            )
          })}
          {displayData.variables.map((variable, variableIndex) => {
            const index = displayData.files.length + variableIndex
            const isActive = index === displayData.activeIndex
            const preview = variable.value.replaceAll("\n", " ").trim()

            return (
              <LxCommandPanelItem
                key={`variable-${variable.name}`}
                active={isActive}
                className="group relative flex min-h-11 flex-col justify-center px-2 py-1"
                index={index}
                onSelect={() => onSelectVariable?.(variable)}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-amber-400/10 text-amber-300">
                    <Braces className="h-3 w-3" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="shrink-0 font-mono text-[13px] font-medium text-white">
                      {variable.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/45">
                      {preview || t("markdown.variableNoPreview")}
                    </span>
                  </span>
                  <LxTag
                    bgClass="border-sky-400/20 bg-sky-400/10 text-sky-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    {getVariableTag(variable.name)}
                  </LxTag>
                  <LxTag
                    bgClass="bg-white/10 text-white/60"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    var
                  </LxTag>
                </div>
                {isActive && (
                  <div className="mt-1 max-h-28 overflow-y-auto break-words whitespace-pre-wrap rounded border border-white/5 bg-black/20 p-1.5 font-mono text-[11px] text-white/60">
                    {variable.value || t("markdown.variableNoPreview")}
                  </div>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
