import type { CreateNoteCardInput, NoteCard } from "@shared/contracts/noteCard"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown/LxMarkdownEditor"
import { LxModal } from "@/components/ui/LxModal"
import { LxTag } from "@/components/ui/LxTag"

// 单张卡片标签数量上限。
const MAX_TAGS = 6

// 笔记卡片弹窗属性。
interface NoteCardModalProps {
  isOpen: boolean
  // 编辑目标卡片；null 表示新增。
  card: NoteCard | null
  isSaving: boolean
  onClose: () => void
  onSave: (input: CreateNoteCardInput) => void
}

/**
 * 新增/编辑笔记卡片弹窗：标题、Markdown 内容与标签。
 */
export const NoteCardModal = ({
  isOpen,
  card,
  isSaving,
  onClose,
  onSave,
}: NoteCardModalProps): React.JSX.Element => {
  const [draftTitle, setDraftTitle] = useState("")
  const [draftContent, setDraftContent] = useState("")
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  // 弹窗打开时用目标卡片初始化草稿。
  useEffect(() => {
    if (!isOpen) return
    setDraftTitle(card?.title ?? "")
    setDraftContent(card?.content ?? "")
    setDraftTags(card?.tags ?? [])
    setTagInput("")
  }, [isOpen, card])

  const isDirty =
    draftTitle !== (card?.title ?? "") ||
    draftContent !== (card?.content ?? "") ||
    JSON.stringify(draftTags) !== JSON.stringify(card?.tags ?? [])

  const handleAddTag = (): void => {
    const trimmed = tagInput.trim()
    if (!trimmed || draftTags.includes(trimmed) || draftTags.length >= MAX_TAGS) return
    setDraftTags([...draftTags, trimmed])
    setTagInput("")
  }

  const handleSave = (): void => {
    onSave({ title: draftTitle.trim(), content: draftContent, tags: draftTags })
  }

  return (
    <LxModal isOpen={isOpen} title={card ? "编辑笔记" : "新增笔记"} onClose={onClose} width={560}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/40">标题</label>
          <LxInput
            value={draftTitle}
            placeholder="笔记标题"
            onChange={(event) => setDraftTitle(event.target.value)}
          />
        </div>
        <div className="flex h-[260px] flex-col gap-1">
          <label className="shrink-0 text-xs text-white/40">内容</label>
          <div className="min-h-0 flex-1">
            <LxMarkdownEditor
              key={card?.id ?? "new"}
              initialContent={card?.content ?? ""}
              isSaved={!isDirty}
              onSave={handleSave}
              onChange={setDraftContent}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/40">标签</label>
          {draftTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {draftTags.map((tag) => (
                <LxTag
                  key={tag}
                  suffix={
                    <span
                      aria-label={`移除标签 ${tag}`}
                      role="button"
                      className="flex cursor-pointer items-center justify-center text-current opacity-60 transition-all hover:text-rose-400 hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDraftTags(draftTags.filter((current) => current !== tag))
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </span>
                  }
                >
                  {tag}
                </LxTag>
              ))}
            </div>
          )}
          <LxInput
            disabled={draftTags.length >= MAX_TAGS}
            placeholder={
              draftTags.length >= MAX_TAGS
                ? `最多可添加 ${MAX_TAGS} 个标签`
                : "输入标签后按回车确认"
            }
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleAddTag()
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <LxIconButton preset="save" iconOnly={false} disabled={isSaving} onClick={handleSave}>
            保存
          </LxIconButton>
        </div>
      </div>
    </LxModal>
  )
}
