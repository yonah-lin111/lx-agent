import type { NoteCard } from "@shared/contracts/noteCard"
import { Copy } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"

// 笔记卡片组件属性。
interface NoteCardProps {
  card: NoteCard
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}

/**
 * 渲染单张笔记卡片：固定高度、自适应宽度，悬停显示右上角操作按钮。
 */
export const NoteCardView = ({
  card,
  onEdit,
  onDelete,
  onCopy,
}: NoteCardProps): React.JSX.Element => (
  <article className="group flex h-[200px] w-full shrink-0 flex-col rounded-[6px] border border-white/5 bg-[#212121] p-3 transition-colors hover:border-white/15">
    <div className="flex items-start justify-between gap-2">
      <h3 className="min-w-0 truncate text-sm font-semibold text-white">
        {card.title || "无标题"}
      </h3>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <LxIconButton
          aria-label="编辑笔记"
          preset="edit"
          size="small"
          title={{ content: "编辑笔记", placement: "top" }}
          onClick={onEdit}
        />
        <LxIconButton
          aria-label="删除笔记"
          preset="delete"
          size="small"
          title={{
            content: "删除后无法恢复，确定删除这张卡片吗？",
            title: "删除笔记",
            placement: "top",
            onConfirm: onDelete,
          }}
        />
        <LxIconButton
          aria-label="复制笔记内容"
          size="small"
          title={{ content: "复制内容", placement: "top" }}
          onClick={onCopy}
        >
          <Copy className="h-3 w-3" />
        </LxIconButton>
      </div>
    </div>
    <p className="mt-2 line-clamp-3 text-xs leading-snug text-white/60">
      {card.content || "暂无内容"}
    </p>
    {card.tags.length > 0 && (
      <div className="mt-auto flex flex-wrap items-center gap-1">
        {card.tags.map((tag) => (
          <LxTag key={tag} size="small">
            {tag}
          </LxTag>
        ))}
      </div>
    )}
  </article>
)
