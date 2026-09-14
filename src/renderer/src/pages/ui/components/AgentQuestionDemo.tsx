import type { QuestionAnswer, QuestionPrompt } from "@shared/contracts/agent"
import type React from "react"
import { useMemo } from "react"
import { AgentQuestionBlock } from "@/features/agent"
import type { ChatBlock } from "@/features/agent/types"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 构造单次 question 工具调用的完整快照。
const buildQuestionCall = (
  toolCallId: string,
  requestId: string,
  questions: QuestionPrompt[],
  answers?: QuestionAnswer[],
): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId,
  toolName: "question",
  args: { questions },
  question: {
    requestId,
    toolCallId,
    sessionId: "sess_demo",
    questions,
  },
  answers,
  status: "done",
})

// 示例提问数据。
const createMockQuestionCalls = (
  t: I18nContextType["t"],
): {
  pending: ToolCallBlock
  pipeline: ToolCallBlock
  graphic: ToolCallBlock
  answered: ToolCallBlock
} => {
  const pendingQuestions: QuestionPrompt[] = [
    {
      header: t("uiPreview.demos.mock.question.pending.runModeHeader"),
      question: t("uiPreview.demos.mock.question.pending.runModeQuestion"),
      options: [
        {
          label: t("uiPreview.demos.mock.question.pending.fastLabel"),
          description: t("uiPreview.demos.mock.question.pending.fastDesc"),
        },
        {
          label: t("uiPreview.demos.mock.question.pending.standardLabel"),
          description: t("uiPreview.demos.mock.question.pending.standardDesc"),
        },
      ],
    },
    {
      header: t("uiPreview.demos.mock.question.pending.auxHeader"),
      question: t("uiPreview.demos.mock.question.pending.auxQuestion"),
      multiSelect: true,
      options: [
        {
          label: t("uiPreview.demos.mock.question.pending.logsLabel"),
          description: t("uiPreview.demos.mock.question.pending.logsDesc"),
        },
        {
          label: t("uiPreview.demos.mock.question.pending.snapshotLabel"),
          description: t("uiPreview.demos.mock.question.pending.snapshotDesc"),
        },
      ],
    },
  ]

  const pipelineQuestion: QuestionPrompt = {
    header: t("uiPreview.demos.mock.question.pipeline.header"),
    question: t("uiPreview.demos.mock.question.pipeline.question"),
    options: [
      {
        label: t("uiPreview.demos.mock.question.pipeline.fullLabel"),
        description: t("uiPreview.demos.mock.question.pipeline.fullDesc"),
      },
      {
        label: t("uiPreview.demos.mock.question.pipeline.fastLabel"),
        description: t("uiPreview.demos.mock.question.pipeline.fastDesc"),
      },
    ],
  }

  const graphicQuestion: QuestionPrompt = {
    header: t("uiPreview.demos.mock.question.graphic.header"),
    question: t("uiPreview.demos.mock.question.graphic.question"),
    options: [
      {
        label: t("uiPreview.demos.mock.question.graphic.agreeLabel"),
        description: t("uiPreview.demos.mock.question.graphic.agreeDesc"),
      },
      {
        label: t("uiPreview.demos.mock.question.graphic.ipcLabel"),
        description: t("uiPreview.demos.mock.question.graphic.ipcDesc"),
      },
    ],
  }

  const inlineQuestionText = t("uiPreview.demos.mock.question.inline.question")
  const inlineOptionLabel = t("uiPreview.demos.mock.question.inline.optionLabel")
  const inlineQuestions: QuestionPrompt[] = [
    {
      question: inlineQuestionText,
      options: [
        {
          label: inlineOptionLabel,
          description: t("uiPreview.demos.mock.question.inline.optionDesc"),
        },
      ],
    },
  ]

  return {
    pending: buildQuestionCall("call_question_1", "q_request_1", pendingQuestions),
    pipeline: buildQuestionCall("call_question_2", "q_request_2", [pipelineQuestion]),
    graphic: buildQuestionCall("call_question_3", "q_request_3", [graphicQuestion]),
    answered: buildQuestionCall("call_question_4", "q_request_4", inlineQuestions, [
      { question: inlineQuestionText, answer: [inlineOptionLabel] },
    ]),
  }
}

export const AgentQuestionDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const mockCalls = useMemo(() => createMockQuestionCalls(t), [t])

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentQuestionTitle")}
        description={t("uiPreview.demos.agentQuestionDesc")}
      >
        <div className="flex flex-col gap-4">
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-xs font-medium text-white/40">
              {t("uiPreview.demos.mock.question.stages.pending")}
            </div>
            <AgentQuestionBlock toolCall={mockCalls.pending} />
          </div>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-xs font-medium text-white/40">
              {t("uiPreview.demos.mock.question.stages.ascii")}
            </div>
            <AgentQuestionBlock toolCall={mockCalls.pipeline} />
          </div>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-xs font-medium text-white/40">
              {t("uiPreview.demos.mock.question.stages.graphic")}
            </div>
            <AgentQuestionBlock toolCall={mockCalls.graphic} />
          </div>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-xs font-medium text-white/40">
              {t("uiPreview.demos.mock.question.stages.answered")}
            </div>
            <AgentQuestionBlock toolCall={mockCalls.answered} />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
