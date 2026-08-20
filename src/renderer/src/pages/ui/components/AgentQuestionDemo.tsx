import type React from "react"
import { AgentQuestionBlock } from "@/features/agent/components/AgentQuestionBlock"
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
              2. 已完成展示/折叠阶段 (Answered / Readonly)
            </div>
            <AgentQuestionBlock toolCall={MOCK_ANSWERED_QUESTION_CALL} />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
