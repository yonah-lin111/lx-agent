import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import { useOpenClawConfig } from "@/features/openclaw/hooks/useOpenClawConfig"
import { useOpenClawOfficeStore } from "@/features/openclaw/openclawOfficeStore"

/**
 * 面包屑中的当前办公区段（由 HeaderSideBar 在 OpenClaw 路由下渲染）。
 * 未选中或配置中已不存在该办公区时返回 null，避免暴露裸 id。
 */
export const OpenClawBreadcrumb = (): React.JSX.Element | null => {
  const selectedInstanceId = useOpenClawOfficeStore((state) => state.selectedInstanceId)
  const { instances } = useOpenClawConfig()
  const officeName = selectedInstanceId ? instances[selectedInstanceId]?.name : undefined
  if (!officeName) return null

  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate">
      <LxTag
        size="small"
        bgClass="border-white/10 bg-white/5"
        textClass="text-white/40"
        className="header-breadcrumb-slash shrink-0 shadow-xs"
      >
        /
      </LxTag>
      <LxTag
        size="small"
        bgClass="border-white/10 bg-white/5"
        textClass="text-white"
        className="header-breadcrumb-part min-w-0 shadow-xs"
      >
        {officeName}
      </LxTag>
    </span>
  )
}
