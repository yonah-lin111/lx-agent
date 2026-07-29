import { useSearchParams } from "react-router-dom"
import {
  ModelProviderSettings,
  ModelSettings,
  SETTINGS_SECTIONS,
} from "@/features/settings"

/**
 * 渲染设置页面。
 */
export const SettingsPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id

  return (
    <section className="min-w-0 flex-1 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {activeSection === "models" ? <ModelSettings /> : null}
      {activeSection === "providers" ? <ModelProviderSettings /> : null}
    </section>
  )
}
