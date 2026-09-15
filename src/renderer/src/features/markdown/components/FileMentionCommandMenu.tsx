import { FileText, Folder } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownTemplateFileKind } from "@/features/markdown/commands/markdownTemplateFileCommands"
import type { MarkdownFileMentionEntry } from "@/features/markdown/types"
import { getMentionDirectoryTag } from "@/features/project/utils"

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
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  // 面板语义标签。
  label?: string
  // 选项 DOM id 前缀，避免多种文件面板并存时 id 冲突。
  idPrefix?: string
  onSelect?: (file: MarkdownFileMentionEntry) => void
}

// 选项 DOM id：按来源类型分段，避免同路径多来源并存时 id 冲突。
const getOptionId = (idPrefix: string, file: MarkdownFileMentionEntry): string =>
  `${idPrefix}-${file.source}-${file.templateKind ? `${file.templateKind}-` : ""}${file.mentionPath}`

/**
 * 渲染 Markdown 编辑器的项目文件命令面板（@ 提及 / 模板块文件快捷输入）。
 */
export const FileMentionCommandMenu = ({
  files,
  activeIndex = 0,
  position,
  visible = false,
  label = "项目文件提及",
  idPrefix = "markdown-file-mention",
  onSelect,
}: FileMentionCommandMenuProps): React.JSX.Element | null => {
  const panelData = files && position ? { position, activeIndex, files } : null

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
        </>
      )}
    </LxCommandPanel>
  )
}
