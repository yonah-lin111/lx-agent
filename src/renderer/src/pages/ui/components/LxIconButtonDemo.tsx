import { Star } from "lucide-react"
import type React from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxIconButton 组件。
 */
export const LxIconButtonDemo = (): React.JSX.Element => (
  <div className="flex flex-col gap-4">
    <UiPreviewSection
      title="预设"
      description="内置 add / close / save / confirm / delete / edit 图标与悬停反馈"
    >
      <div className="flex flex-wrap items-center gap-2">
        <LxIconButton
          preset="add"
          aria-label="添加"
          title={{ content: "添加", placement: "bottom" }}
        />
        <LxIconButton
          preset="close"
          aria-label="关闭"
          title={{ content: "关闭", placement: "bottom" }}
        />
        <LxIconButton
          preset="save"
          aria-label="保存"
          title={{ content: "保存", placement: "bottom" }}
        />
        <LxIconButton
          preset="confirm"
          aria-label="确认"
          title={{ content: "确认", placement: "bottom" }}
        />
        <LxIconButton
          preset="delete"
          aria-label="删除"
          title={{ content: "删除", placement: "bottom" }}
        />
        <LxIconButton
          preset="edit"
          aria-label="编辑"
          title={{ content: "编辑", placement: "bottom" }}
        />
      </div>
    </UiPreviewSection>
    <UiPreviewSection title="尺寸与形状" description="small / medium / large 与 square / circle">
      <div className="flex flex-wrap items-center gap-2">
        <LxIconButton
          size="small"
          aria-label="small 尺寸"
          title={{ content: "small", placement: "bottom" }}
        />
        <LxIconButton
          size="medium"
          aria-label="medium 尺寸"
          title={{ content: "medium", placement: "bottom" }}
        />
        <LxIconButton
          size="large"
          aria-label="large 尺寸"
          title={{ content: "large", placement: "bottom" }}
        />
        <LxIconButton
          shape="circle"
          preset="add"
          aria-label="圆形添加"
          title={{ content: "circle + add", placement: "bottom" }}
        />
        <LxIconButton
          shape="circle"
          preset="delete"
          aria-label="圆形删除"
          title={{ content: "circle + delete", placement: "bottom" }}
        />
      </div>
    </UiPreviewSection>
    <UiPreviewSection title="状态" description="禁用、高亮与自定义图标">
      <div className="flex flex-wrap items-center gap-2">
        <LxIconButton preset="add" disabled aria-label="禁用添加" />
        <LxIconButton
          highlighted
          aria-label="高亮"
          title={{ content: "highlighted", placement: "bottom" }}
        />
        <LxIconButton
          aria-label="自定义图标"
          title={{ content: "自定义图标", placement: "bottom" }}
        >
          <Star className="h-4 w-4" />
        </LxIconButton>
      </div>
    </UiPreviewSection>
  </div>
)
