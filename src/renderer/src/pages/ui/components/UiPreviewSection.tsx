import type React from "react"

// 预览分区属性。
interface UiPreviewSectionProps {
  title: string
  description: string
  children: React.ReactNode
}

/**
 * 渲染单个 UI 组件示例分区。
 */
export const UiPreviewSection = ({
  title,
  description,
  children,
}: UiPreviewSectionProps): React.JSX.Element => (
  <div className="ui-preview-section flex flex-col gap-2">
    <div className="flex flex-col gap-0.5">
      <h3 className="ui-preview-section-title text-sm font-semibold text-white/80">{title}</h3>
      <p className="ui-preview-section-description text-xs text-white/40">{description}</p>
    </div>
    <div className="ui-preview-section-card rounded-[6px] border border-white/5 bg-black/30 p-4">
      {children}
    </div>
  </div>
)
