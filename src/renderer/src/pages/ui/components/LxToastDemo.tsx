import type React from "react"

import { useLxToast } from "@/components/ui/LxToast"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxToast 组件。
 */
export const LxToastDemo = (): React.JSX.Element => {
  const toast = useLxToast()

  const showStackedToasts = (): void => {
    toast.success("第一条保存成功")
    window.setTimeout(() => toast.warning("第二条磁盘空间不足"), 300)
    window.setTimeout(() => toast.error("第三条连接失败"), 600)
  }

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title="消息提示"
        description="通过 useLxToast 展示全局消息提示，支持四种类型，多条消息自动堆叠"
      >
        <div className="flex flex-wrap gap-2">
          <UiActionButton onClick={() => toast.success("保存成功")}>Success</UiActionButton>
          <UiActionButton onClick={() => toast.error("保存失败")}>Error</UiActionButton>
          <UiActionButton onClick={() => toast.warning("磁盘空间不足")}>Warning</UiActionButton>
          <UiActionButton onClick={() => toast.info("任务已加入队列")}>Info</UiActionButton>
          <UiActionButton onClick={showStackedToasts}>连续堆叠</UiActionButton>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title="消息方位"
        description="支持四角与顶部居中五种方位，默认展示在顶部中间"
      >
        <div className="flex flex-wrap gap-2">
          <UiActionButton onClick={() => toast.success("右下角消息", 3000, "bottom-right")}>
            Bottom Right
          </UiActionButton>
          <UiActionButton onClick={() => toast.success("右上角消息", 3000, "top-right")}>
            Top Right
          </UiActionButton>
          <UiActionButton onClick={() => toast.success("左下角消息", 3000, "bottom-left")}>
            Bottom Left
          </UiActionButton>
          <UiActionButton onClick={() => toast.success("左上角消息", 3000, "top-left")}>
            Top Left
          </UiActionButton>
          <UiActionButton onClick={() => toast.success("顶部居中消息", 3000, "top-center")}>
            Top Center
          </UiActionButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
