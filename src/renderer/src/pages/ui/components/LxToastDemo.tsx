import type React from "react"

import { useLxToast } from "@/components/ui/LxToast"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxToast 组件。
 */
export const LxToastDemo = (): React.JSX.Element => {
  const toast = useLxToast()

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title="消息提示"
        description="通过 useLxToast 展示全局单条提示，支持四种类型"
      >
        <div className="flex flex-wrap gap-2">
          <UiActionButton onClick={() => toast.success("保存成功")}>Success</UiActionButton>
          <UiActionButton onClick={() => toast.error("保存失败")}>Error</UiActionButton>
          <UiActionButton onClick={() => toast.warning("磁盘空间不足")}>Warning</UiActionButton>
          <UiActionButton onClick={() => toast.info("任务已加入队列")}>Info</UiActionButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
