import type React from "react"
import { useState } from "react"

import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxLoadingOverlay 组件。
 */
export const LxLoadingOverlayDemo = (): React.JSX.Element => {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection title="加载遮罩" description="在定位容器内展示，具备最短展示时间与淡出动画">
        <div className="relative flex h-48 flex-col overflow-hidden rounded-[6px] border border-white/5">
          <div className="flex flex-1 items-center justify-center text-xs text-white/30">
            定位容器
          </div>
          <LxLoadingOverlay isLoading={isLoading} text="Loading component..." />
        </div>
        <div className="mt-3">
          <UiActionButton onClick={() => setIsLoading((current) => !current)}>
            {isLoading ? "停止加载" : "开始加载"}
          </UiActionButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
