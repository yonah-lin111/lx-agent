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
    <nav className="flex h-full flex-col gap-1 pt-8" aria-label="设置分区">
      {SETTINGS_SECTIONS.map((section) => {
        const isActive = activeSection === section.id
        return (
          <button
            key={section.id}
            type="button"
            className={`rounded-[6px] px-3 py-2 text-left text-sm transition-colors ${
              isActive ? "bg-white text-black" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => navigate(`/settings?section=${section.id}`)}
          >
            {section.label}
          </button>
        )
      })}
    </nav>
  )
}
