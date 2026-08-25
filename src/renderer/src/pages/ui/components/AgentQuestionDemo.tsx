import type React from "react"
import { AgentQuestionBlock } from "@/features/agent"
import type { ChatBlock } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

const MOCK_QUESTION_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call_question_1",
  toolName: "question",
  args: {
    questions: [
      {
        header: "运行模式",
        question: "请选择当前任务需要采用的执行策略：",
        options: [
          {
            label: "极速模式",
            description: "只进行局部最小验证并跳过全量构建。",
          },
          {
            label: "标准模式",
            description: "执行完整测试并输出变更分析报告。",
          },
        ],
      },
      {
        header: "辅助配置",
        question: "是否开启额外的辅助能力？（可多选）",
        multiSelect: true,
        options: [
          {
            label: "启用详细日志",
            description: "保留调试级别的 trace 日志流。",
          },
          {
            label: "自动保存快照",
            description: "每个步骤完成后自动生成还原点。",
          },
        ],
      },
    ],
  },
  question: {
    requestId: "q_request_1",
    toolCallId: "call_question_1",
    sessionId: "sess_demo",
    questions: [
      {
        header: "运行模式",
        question: "请选择当前任务需要采用的执行策略：",
        options: [
          {
            label: "极速模式",
            description: "只进行局部最小验证并跳过全量构建。",
          },
          {
            label: "标准模式",
            description: "执行完整测试并输出变更分析报告。",
          },
        ],
      },
      {
        header: "辅助配置",
        question: "是否开启额外的辅助能力？（可多选）",
        multiSelect: true,
        options: [
          {
            label: "启用详细日志",
            description: "保留调试级别的 trace 日志流。",
          },
          {
            label: "自动保存快照",
            description: "每个步骤完成后自动生成还原点。",
          },
        ],
      },
    ],
  },
  status: "done",
}

const MOCK_ANSWERED_QUESTION_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call_question_2",
  toolName: "question",
  args: {
    questions: [
      {
        question: "你好！这是一条测试提问，你能看到并选择这个选项吗？",
        options: [
          {
            label: "工作正常",
            description: "组件能够正常渲染和交互",
          },
        ],
      },
    ],
  },
  answers: [
    {
      question: "你好！这是一条测试提问，你能看到并选择这个选项吗？",
      answer: ["工作正常"],
    },
  ],
  status: "done",
}

const MOCK_GRAPHIC_QUESTION_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call_question_3",
  toolName: "question",
  args: {
    questions: [
      {
        header: "架构确认",
        question: "请确认以下服务间数据流转架构方案是否符合要求：",
        content: `
<div style="text-align: center; margin-bottom: 8px;">
  <svg viewBox="0 0 420 100" width="100%" height="90" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="25" width="100" height="50" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
    <text x="60" y="54" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">Renderer</text>
    
    <path d="M 115 50 L 155 50" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
    
    <rect x="160" y="25" width="100" height="50" rx="6" fill="#1e293b" stroke="#a855f7" stroke-width="1.5" />
    <text x="210" y="54" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">Preload IPC</text>
    
    <path d="M 265 50 L 305 50" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
    
    <rect x="310" y="25" width="100" height="50" rx="6" fill="#1e293b" stroke="#22c55e" stroke-width="1.5" />
    <text x="360" y="54" fill="#4ade80" font-size="12" font-weight="bold" text-anchor="middle">Main Core</text>
  </svg>
</div>
<table>
  <thead>
    <tr><th>模块</th><th>通信协议</th><th>鉴权</th></tr>
  </thead>
  <tbody>
    <tr><td>Renderer ↔ Preload</td><td>ContextBridge</td><td>白名单暴露</td></tr>
    <tr><td>Preload ↔ Main</td><td>Electron IPC</td><td>内部安全通道</td></tr>
  </tbody>
</table>
`,
        options: [
          {
            label: "完全同意该架构",
            description: "按照此拓扑推进后续模块实现",
          },
          {
            label: "需要微调 IPC 边界",
            description: "补充双向流式通道设计",
          },
        ],
      },
    ],
  },
  question: {
    requestId: "q_request_3",
    toolCallId: "call_question_3",
    sessionId: "sess_demo",
    questions: [
      {
        header: "架构确认",
        question: "请确认以下服务间数据流转架构方案是否符合要求：",
        content: `
<div style="text-align: center; margin-bottom: 8px;">
  <svg viewBox="0 0 420 100" width="100%" height="90" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="25" width="100" height="50" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
    <text x="60" y="54" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">Renderer</text>
    
    <path d="M 115 50 L 155 50" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
    
    <rect x="160" y="25" width="100" height="50" rx="6" fill="#1e293b" stroke="#a855f7" stroke-width="1.5" />
    <text x="210" y="54" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">Preload IPC</text>
    
    <path d="M 265 50 L 305 50" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
    
    <rect x="310" y="25" width="100" height="50" rx="6" fill="#1e293b" stroke="#22c55e" stroke-width="1.5" />
    <text x="360" y="54" fill="#4ade80" font-size="12" font-weight="bold" text-anchor="middle">Main Core</text>
  </svg>
</div>
<table>
  <thead>
    <tr><th>模块</th><th>通信协议</th><th>鉴权</th></tr>
  </thead>
  <tbody>
    <tr><td>Renderer ↔ Preload</td><td>ContextBridge</td><td>白名单暴露</td></tr>
    <tr><td>Preload ↔ Main</td><td>Electron IPC</td><td>内部安全通道</td></tr>
  </tbody>
</table>
`,
        options: [
          {
            label: "完全同意该架构",
            description: "按照此拓扑推进后续模块实现",
          },
          {
            label: "需要微调 IPC 边界",
            description: "补充双向流式通道设计",
          },
        ],
      },
    ],
  },
  status: "done",
}

export const AgentQuestionDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentQuestionTitle")}
        description={t("uiPreview.demos.agentQuestionDesc")}
      >
        <div className="flex flex-col gap-4">
          <div className="w-full max-w-xl rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              1. 待作答交互阶段 (Pending)
            </div>
            <AgentQuestionBlock toolCall={MOCK_QUESTION_CALL} />
          </div>
          <div className="w-full max-w-xl rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              2. 图形化与结构化排版提问阶段 (SVG & HTML Graphic)
            </div>
            <AgentQuestionBlock toolCall={MOCK_GRAPHIC_QUESTION_CALL} />
          </div>
          <div className="w-full max-w-xl rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              3. 已完成展示/折叠阶段 (Answered / Readonly)
            </div>
            <AgentQuestionBlock toolCall={MOCK_ANSWERED_QUESTION_CALL} />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
