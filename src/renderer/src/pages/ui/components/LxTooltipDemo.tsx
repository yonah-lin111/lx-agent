import type React from "react"

import { LxTooltip } from "@/components/ui/LxTooltip"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxTooltip 组件。
 */
export const LxTooltipDemo = (): React.JSX.Element => (
  <div className="flex flex-col gap-4">
    <UiPreviewSection title="位置" description="top / bottom / left / right，超出视口时自动翻转">
      <div className="flex flex-wrap items-center gap-2">
        <LxTooltip content="上方提示" placement="top">
          <UiActionButton>上</UiActionButton>
        </LxTooltip>
        <LxTooltip content="下方提示" placement="bottom">
          <UiActionButton>下</UiActionButton>
        </LxTooltip>
        <LxTooltip content="左侧提示" placement="left">
          <UiActionButton>左</UiActionButton>
        </LxTooltip>
        <LxTooltip content="右侧提示" placement="right">
          <UiActionButton>右</UiActionButton>
        </LxTooltip>
      </div>
    </UiPreviewSection>
    <UiPreviewSection title="标题与内容" description="title 分隔标题与内容，multiline 支持换行">
      <LxTooltip
        title="LxTooltip"
        content="支持标题与内容的多层气泡，multiline 时宽度自适应并允许换行。"
        placement="bottom"
        multiline
      >
        <UiActionButton>悬停查看</UiActionButton>
      </LxTooltip>
    </UiPreviewSection>
    <UiPreviewSection title="二次确认" description="onConfirm 触发确认气泡">
      <LxTooltip
        title="删除确认"
        content="确定要删除这条记录吗？"
        placement="bottom"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <UiActionButton>删除记录</UiActionButton>
      </LxTooltip>
    </UiPreviewSection>
  </div>
)
