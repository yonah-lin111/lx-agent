import { Loader2, Palette, Trash2 } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { useTranslation } from "@/i18n"

export interface FrontDesignLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染前端设计页面专属左侧栏内容：展示设计历史列表并支持自由切换。
 */
export const FrontDesignLeftSideBar = ({
  isCollapsed = false,
}: FrontDesignLeftSideBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { designs, activeDesignId } = useFrontDesign()

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2">
          {designs.map((d) => {
            const isActive = d.id === activeDesignId
            return (
              <LxIconButton
                key={d.id}
                highlighted={isActive}
                onClick={() => frontDesignStore.setActiveDesignId(d.id)}
                aria-label={d.title || t("frontDesign.title")}
                title={{ content: d.title || t("frontDesign.title"), placement: "right" }}
              >
                {d.isStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-400" />
                ) : (
                  <Palette className={`h-3.5 w-3.5 ${isActive ? "text-pink-400" : ""}`} />
                )}
              </LxIconButton>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      {/* 头部导航与标题 */}
      <div className="flex h-8 shrink-0 items-center justify-between px-3 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white/80">{t("frontDesign.historyList")}</span>
          <span className="rounded-[4px] bg-white/10 px-1.5 py-0.2 text-[10px] text-white/50">
            {designs.length}
          </span>
        </div>
        {designs.length > 0 && (
          <LxIconButton
            size="small"
            onClick={() => frontDesignStore.clear()}
            aria-label={t("frontDesign.clearHistory")}
            title={{ content: t("frontDesign.clearHistory"), placement: "bottom" }}
          >
            <Trash2 className="h-3.5 w-3.5 text-white/40 hover:text-red-400" />
          </LxIconButton>
        )}
      </div>

      {/* 列表内容 */}
      <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {designs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-white/35">
            {t("frontDesign.noDesigns")}
          </div>
        ) : (
          designs.map((d) => {
            const isActive = d.id === activeDesignId
            const formattedTime = d.updatedAt
              ? new Date(d.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : ""

            return (
              <div
                key={d.id}
                onClick={() => frontDesignStore.setActiveDesignId(d.id)}
                className={`group flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-2 text-xs transition-colors cursor-pointer border ${
                  isActive
                    ? "bg-pink-500/15 border-pink-500/30 text-white font-medium shadow-sm"
                    : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] ${
                      isActive
                        ? "bg-pink-500/20 text-pink-400"
                        : "bg-white/5 text-white/40 group-hover:text-white/70"
                    }`}
                  >
                    {d.isStreaming ? (
                      <Loader2 className="h-3 w-3 animate-spin text-pink-400" />
                    ) : (
                      <Palette className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs">{d.title || t("frontDesign.title")}</span>
                    {formattedTime && (
                      <span className="text-[10px] text-white/40">{formattedTime}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                  <LxIconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      frontDesignStore.removeDesign(d.id)
                    }}
                    aria-label={t("frontDesign.deleteDesign")}
                    title={{ content: t("frontDesign.deleteDesign"), placement: "top" }}
                  >
                    <Trash2 className="h-3 w-3 text-white/40 hover:text-red-400" />
                  </LxIconButton>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
