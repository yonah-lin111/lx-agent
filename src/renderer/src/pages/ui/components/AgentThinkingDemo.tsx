import type React from "react"

import { AgentThinkingBlock } from "@/features/agent"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 AgentThinkingBlock 组件。
 */
export const AgentThinkingDemo = (): React.JSX.Element => (
  <div className="flex w-full flex-col gap-4">
    <UiPreviewSection
      title="思考时间线"
      description="可折叠的思考块，点击展开展示 Markdown 思考内容"
    >
      <div className="flex max-w-lg flex-col">
        <AgentThinkingBlock content="用户询问 UI 组件预览页面，我需要梳理已有 lx 组件的 props，再补充 agent 相关的展示组件示例。" />
      </div>
    </UiPreviewSection>
    <UiPreviewSection title="流式生成中" description="isGenerating 时展示 Thinking 状态与脉冲指示">
      <div className="flex max-w-lg flex-col">
        <AgentThinkingBlock content="正在分析代码结构并生成答案..." isGenerating />
      </div>
    </UiPreviewSection>
  </div>
)
