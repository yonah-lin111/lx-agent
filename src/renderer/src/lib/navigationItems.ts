import type { LucideIcon } from "lucide-react"
import { Boxes, Component, House, Settings } from "lucide-react"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// 全局底部导航项。
export const PRIMARY_NAVIGATION_ITEMS: Array<{
  icon: LucideIcon
  labelKey: "nav.home" | "nav.project" | "nav.ui" | "nav.settings"
  label: string
  path: string
  breadcrumbCategory: string
}> = [
  {
    icon: House,
    labelKey: "nav.home",
    label: "Home",
    path: PAGE_ROUTES.home,
    breadcrumbCategory: "HOME",
  },
  {
    icon: Boxes,
    labelKey: "nav.project",
    label: "Projects",
    path: PAGE_ROUTES.project,
    breadcrumbCategory: "PROJECT",
  },
  {
    icon: Component,
    labelKey: "nav.ui",
    label: "UI Preview",
    path: PAGE_ROUTES.ui,
    breadcrumbCategory: "UI",
  },
  {
    icon: Settings,
    labelKey: "nav.settings",
    label: "Settings",
    path: PAGE_ROUTES.settings,
    breadcrumbCategory: "SETTING",
  },
]
