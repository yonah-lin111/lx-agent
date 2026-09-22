import { MessageSquarePlus, Send, SquarePen, Trash2 } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import type { DesignAnnotation } from "@/pages/front-design/types"

export interface FrontDesignAnnotationsPanelProps {
  annotations: DesignAnnotation[]
  onSend: (ids?: string[]) => void
  onEdit: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onHighlight: (id: string | null) => void
}

/**
 * FrontDesignAnnotationsPanel - 右侧批注坞：列出画布批注，支持逐条编辑/发送与批量回流 Agent。
 */
export const FrontDesignAnnotationsPanel = ({
  annotations,
  onSend,
  onEdit,
  onRemove,
  onClear,
  onHighlight,
}: FrontDesignAnnotationsPanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <aside
      className="front-design-annotations flex h-full w-[280px] shrink-0 flex-col border-l"
      style={{
        backgroundColor: "var(--color-theme-surface)",
        borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))",
      }}
    >
      {/* 头部：标题与计数 */}
      <div
        className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-2.5"
        style={{ borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))" }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-pink-400" />
          <span className="truncate text-xs font-semibold text-white/80">
            {t("frontDesign.reviewPanelTitle")}
          </span>
          <span className="shrink-0 rounded-[4px] bg-white/10 px-1.5 font-mono text-xs text-white/50">
            {annotations.length}
          </span>
        </div>
        {annotations.length > 0 && (
          <LxIconButton
            size="small"
            onClick={onClear}
            aria-label={t("frontDesign.reviewClear")}
            title={{ content: t("frontDesign.reviewClear"), placement: "bottom" }}
          >
            <Trash2 className="text-white/40 hover:text-rose-400" />
          </LxIconButton>
        )}
      </div>

      {/* 批注清单 */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
        {annotations.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-white/35">
            {t("frontDesign.reviewPanelEmpty")}
          </div>
        ) : (
          <div className="space-y-1">
            {annotations.map((annotation) => (
              <div
                key={annotation.id}
                onMouseEnter={() => onHighlight(annotation.id)}
                onMouseLeave={() => onHighlight(null)}
                className="rounded-[6px] border border-white/5 bg-black/20 px-2 py-1.5 transition-colors hover:border-pink-500/25"
              >
                <div className="flex items-start gap-1.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-pink-500/20 font-mono text-xs font-semibold text-pink-300">
                    {annotation.index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-pink-300/70">
                      {annotation.description || annotation.selector}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-white/80">
                      {annotation.comment}
                    </p>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-end gap-0.5">
                  <LxIconButton
                    size="small"
                    preset="edit"
                    onClick={() => onEdit(annotation.id)}
                    aria-label={t("frontDesign.reviewEdit")}
                    title={{ content: t("frontDesign.reviewEdit"), placement: "top" }}
                  >
                    <SquarePen />
                  </LxIconButton>
                  <LxIconButton
                    size="small"
                    onClick={() => onSend([annotation.id])}
                    aria-label={t("frontDesign.reviewSend")}
                    title={{ content: t("frontDesign.reviewSend"), placement: "top" }}
                  >
                    <Send />
                  </LxIconButton>
                  <LxIconButton
                    size="small"
                    preset="delete"
                    onClick={() => onRemove(annotation.id)}
                    aria-label={t("frontDesign.reviewDelete")}
                    title={{ content: t("frontDesign.reviewDelete"), placement: "top" }}
                  >
                    <Trash2 />
                  </LxIconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部：批量回流 */}
      <div
        className="flex h-10 shrink-0 items-center justify-end gap-1.5 border-t px-2"
        style={{ borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))" }}
      >
        <LxIconButton
          size="small"
          disabled={annotations.length === 0}
          onClick={() => onSend()}
          icon={<Send />}
          textClass="text-pink-300"
          hoverBgClass="hover:bg-pink-500/20"
          className="border border-pink-500/30 bg-pink-500/10"
        >
          <span className="text-xs font-medium">
            {t("frontDesign.reviewSendAll", { count: annotations.length })}
          </span>
        </LxIconButton>
      </div>
    </aside>
  )
}
