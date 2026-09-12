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

const MOCK_ASCII_QUESTION_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call_question_4",
  toolName: "question",
  args: {
    questions: [
      {
        header: "流程分支",
        question: "检测到多条构建管线，请选择首选的执行路径：",
        options: [
          {
            label: "全量并行验证 (CI + Lint + Tests)",
            description: "执行完整的单元测试与集成测试流水线",
          },
          {
            label: "极速旁路部署 (Skip Tests)",
            description: "跳过耗时集成测试，仅执行基础类型检查",
          },
        ],
      },
    ],
  },
  question: {
    requestId: "q_request_4",
    toolCallId: "call_question_4",
    sessionId: "sess_demo",
    questions: [
      {
        header: "流程分支",
        question: "检测到多条构建管线，请选择首选的执行路径：",
        options: [
          {
            label: "全量并行验证 (CI + Lint + Tests)",
            description: "执行完整的单元测试与集成测试流水线",
          },
          {
            label: "极速旁路部署 (Skip Tests)",
            description: "跳过耗时集成测试，仅执行基础类型检查",
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
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              1. 待作答交互阶段 (Pending)
            </div>
            <AgentQuestionBlock toolCall={MOCK_QUESTION_CALL} />
          </div>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              2. 字符图案绘画阶段 (Claude Code ASCII Art)
            </div>
            <AgentQuestionBlock toolCall={MOCK_ASCII_QUESTION_CALL} />
          </div>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              3. 图形化与结构化排版提问阶段 (SVG & HTML Graphic)
            </div>
            <AgentQuestionBlock toolCall={MOCK_GRAPHIC_QUESTION_CALL} />
          </div>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <div className="mb-2 text-[11px] font-medium text-white/40">
              4. 已完成展示/折叠阶段 (Answered / Readonly)
            </div>
            <AgentQuestionBlock toolCall={MOCK_ANSWERED_QUESTION_CALL} />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
