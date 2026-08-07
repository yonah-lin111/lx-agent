import type { LucideIcon } from "lucide-react"
import { Boxes, Component, House, Settings } from "lucide-react"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// 全局底部导航项。
export const PRIMARY_NAVIGATION_ITEMS: Array<{
  icon: LucideIcon
  label: string
  path: string
  breadcrumbCategory: string
}> = [
  { icon: House, label: "主页", path: PAGE_ROUTES.home, breadcrumbCategory: "HOME" },
  { icon: Boxes, label: "项目", path: PAGE_ROUTES.project, breadcrumbCategory: "PROJECT" },
  { icon: Component, label: "UI 组件", path: PAGE_ROUTES.ui, breadcrumbCategory: "UI" },
  { icon: Settings, label: "设置", path: PAGE_ROUTES.settings, breadcrumbCategory: "SETTING" },
]
