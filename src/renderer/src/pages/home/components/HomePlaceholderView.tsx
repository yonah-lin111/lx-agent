import { History, Sparkles } from "lucide-react"
import { useTranslation } from "@/i18n"

export interface HomePlaceholderViewProps {
  type: "sessions" | "skills"
}

/**
 * 渲染主页新增标签页（全局会话、技能与工具）的占位骨架视图。
 */
export const HomePlaceholderView = ({ type }: HomePlaceholderViewProps): React.JSX.Element => {
  const { t } = useTranslation()

  const isSessions = type === "sessions"
  const Icon = isSessions ? History : Sparkles
  const iconColor = isSessions ? "text-purple-400" : "text-emerald-400"
  const iconBg = isSessions ? "bg-purple-500/10" : "bg-emerald-500/10"

  const title = isSessions ? t("home.sessions") : t("home.skills")
  const subtitle = isSessions ? t("home.sessionsSubtitle") : t("home.skillsSubtitle")
  const emptyTitle = isSessions ? t("home.sessionsEmptyTitle") : t("home.skillsEmptyTitle")
  const emptyDesc = isSessions ? t("home.sessionsEmptyDesc") : t("home.skillsEmptyDesc")

  return (
    <div className="home-placeholder-container flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 custom-scrollbar">
      {/* 顶部标题栏 */}
      <div className="mb-6 flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] ${iconBg} ${iconColor}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <h1 className="truncate text-base font-bold tracking-tight text-white">{title}</h1>
        </div>
        <p className="truncate text-xs text-white/50">{subtitle}</p>
      </div>

      {/* 空态居中展示区 */}
      <div className="home-placeholder-empty flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-[6px] border border-dashed border-white/10 bg-white/[0.01] p-8 text-center">
        <div
          className={`mb-3 flex h-12 w-12 items-center justify-center rounded-[8px] ${iconBg} ${iconColor}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-white/80">{emptyTitle}</h3>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/45">{emptyDesc}</p>
      </div>
    </div>
  )
}
