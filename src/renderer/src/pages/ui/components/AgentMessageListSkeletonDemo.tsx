import type React from "react"
import { useState } from "react"

import { AgentMessageListSkeleton } from "@/features/agent"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 AgentMessageListSkeleton 组件。
 */
export const AgentMessageListSkeletonDemo = (): React.JSX.Element => {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title="会话恢复骨架屏"
        description="加载期间展示 QA 对话骨架，支持最短展示时间与淡出"
      >
        <div className="relative flex h-72 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
          <AgentMessageListSkeleton isLoading={isLoading} />
        </div>
        <div className="mt-3">
          <UiActionButton onClick={() => setIsLoading((current) => !current)}>
            {isLoading ? "结束加载" : "开始加载"}
          </UiActionButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
