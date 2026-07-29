import { useNavigate, useSearchParams } from "react-router-dom"
import { SETTINGS_SECTIONS } from "@/features/settings"

/**
 * 渲染设置页面专属左侧栏内容。
 */
export const SettingsLeftSideBar = (): React.JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex h-7 shrink-0 items-center justify-end px-1" />
      <nav
        className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2"
        aria-label="设置分区"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = activeSection === section.id
          return (
            <button
              key={section.id}
              type="button"
              className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
              }`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(`/settings?section=${section.id}`)}
            >
              {section.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
