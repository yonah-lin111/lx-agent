import type { QuestionAnswer, QuestionPrompt, QuestionRequest } from "@shared/contracts/agent"
import { FileText, Terminal } from "lucide-react"
import type React from "react"
import { useEffect, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentQuestionGraphic } from "@/features/agent/components/AgentQuestionGraphic"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatJsonString } from "./types"

export interface FlowItemQuestionContentProps {
  content: ExecutionToolContent
}

// 提取问题列表：pending 请求优先，回退工具参数。
const getQuestions = (content: ExecutionToolContent): QuestionPrompt[] => {
  const pending = content.question
  if (pending && Array.isArray(pending.questions)) return pending.questions
  if (Array.isArray(content.args?.questions)) {
    return content.args.questions as QuestionPrompt[]
  }
  return []
}

// 展示用参数：剥离 question 的 content 附加内容（Mermaid/MD 源码不展示）。
const toDisplayArgs = (args: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(args.questions)) return args
  return {
    ...args,
    questions: args.questions.map((question) => {
      if (typeof question !== "object" || question === null) return question
      const { content: _omitted, ...rest } = question as Record<string, unknown>
      return rest
    }),
  }
}

// 工具入参与执行结果。
const QuestionToolMeta = ({ content }: FlowItemQuestionContentProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const hasArgs = Object.keys(content.args ?? {}).length > 0
  if (!hasArgs && content.result === undefined) return null

  return (
    <>
      {/* 输入参数 */}
      {hasArgs && (
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1 text-[11px] text-white/45">
            <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
          </div>
          <div className="custom-scrollbar max-h-96 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px] break-all whitespace-pre-wrap text-sky-200/90">
            {formatJsonString(toDisplayArgs(content.args))}
          </div>
        </div>
      )}

      {/* 执行结果 */}
      {content.result !== undefined && (
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
            {content.isError && (
              <span className="text-[10px] font-medium text-rose-400">ERROR</span>
            )}
          </div>
          <div
            className={`custom-scrollbar max-h-96 overflow-y-auto rounded p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap ${
              content.isError
                ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            {content.result || <span className="text-white/30">-</span>}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * FlowItemQuestionContent - 执行流步骤内 question 工具的精简问答面板：
 * 挂起时全部问题纵向排列直接作答（单选 LxRadio / 多选 LxCheckbox + 自定义输入），
 * 统一底部提交；作答完成后只读回显问答记录。
 * 样式复用 agent-question-* 类名，主题（如 minecraft）全局覆盖自动生效。
 */
export const FlowItemQuestionContent = ({
  content,
}: FlowItemQuestionContentProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const pending: QuestionRequest | undefined = content.question
  const questions = getQuestions(content)
  if (questions.length === 0) return null

  // 每题作答态：选择题 = 已选 label 数组；自由文本/自定义输入 = customTexts。
  const [selections, setSelections] = useState<string[][]>(() => questions.map(() => []))
  const [customTexts, setCustomTexts] = useState<string[]>(() => questions.map(() => ""))

  // 新请求（requestId 变化）复位作答态。
  useEffect(() => {
    setSelections(questions.map(() => []))
    setCustomTexts(questions.map(() => ""))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.requestId, questions.length])

  // 无挂起请求：只读回显问答记录。
  if (!pending) {
    const answersByQuestion = new Map(
      (content.answers ?? []).map((answer) => [answer.question, answer.answer]),
    )
    return (
      <div
        className="flex min-w-0 flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {questions.map((question, index) => {
          const answers =
            answersByQuestion.get(question.question) ?? content.answers?.[index]?.answer ?? []
          return (
            <div key={index} className="min-w-0">
              <div className="agent-question-answered-title min-w-0 break-words text-[12px] leading-relaxed text-white/75">
                {question.question}
              </div>
              {question.content && <AgentQuestionGraphic content={question.content} />}
              {answers.length > 0 && (
                <div className="mt-0.5 flex min-w-0 flex-col gap-0.5 pl-3">
                  {answers.map((answer) => (
                    <div
                      key={answer}
                      className="agent-question-answered-value min-w-0 break-words font-mono text-[12px] leading-relaxed text-white/70"
                    >
                      → {answer}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <QuestionToolMeta content={content} />
      </div>
    )
  }

  const requestId = pending.requestId

  // 单选题：选中选项即清空该题自定义输入（多选题自定义内容保留）。
  const clearCustomText = (questionIndex: number): void => {
    setCustomTexts((prev) => prev.map((text, index) => (index === questionIndex ? "" : text)))
  }

  const toggleOption = (questionIndex: number, label: string, checked: boolean): void => {
    setSelections((prev) =>
      prev.map((selected, index) => {
        if (index !== questionIndex) return selected
        if (!questions[questionIndex]!.multiSelect) return [label]
        return checked
          ? selected.includes(label)
            ? selected
            : [...selected, label]
          : selected.filter((entry) => entry !== label)
      }),
    )
  }

  // 单选题：选项与自定义输入互斥，选中选项即清空自定义输入。
  const setSelection = (questionIndex: number, label: string): void => {
    clearCustomText(questionIndex)
    setSelections((prev) =>
      prev.map((selected, index) => (index === questionIndex ? [label] : selected)),
    )
  }

  // 单选题自定义输入与选项互斥；多选题自定义内容作为多选的一部分，保留已选选项。
  const setCustomText = (questionIndex: number, value: string): void => {
    if (value.trim().length > 0 && !questions[questionIndex]!.multiSelect) {
      setSelections((prev) =>
        prev.map((selected, index) => (index === questionIndex ? [] : selected)),
      )
    }
    setCustomTexts((prev) => prev.map((text, index) => (index === questionIndex ? value : text)))
  }

  const isComplete = questions.every(
    (_, index) => selections[index]!.length > 0 || customTexts[index]!.trim().length > 0,
  )

  const handleSubmit = (): void => {
    const answers: QuestionAnswer[] = questions.map((question, index) => {
      const custom = customTexts[index]!.trim()
      const selected = selections[index]!
      let answer: string[]
      if (question.options) {
        answer = question.multiSelect
          ? custom
            ? [...selected, custom]
            : selected
          : custom
            ? [custom]
            : selected
      } else {
        answer = custom ? [custom] : []
      }
      return { question: question.question, answer }
    })
    void agentApi.questionRespond({ requestId, answers })
  }

  // 鼠标激活隐藏 input 时显式保留焦点，但禁止浏览器为了聚焦调整外层列表位置。
  const focusOptionWithoutScrolling = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target
    if (!(target instanceof Element)) return

    const option = target.closest(".agent-question-option")
    const input = option?.querySelector<HTMLInputElement>("input")
    if (!input) return

    event.preventDefault()
    input.focus({ preventScroll: true })
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={focusOptionWithoutScrolling}
    >
      {questions.map((question, questionIndex) => {
        const currentSelections = selections[questionIndex] ?? []
        const currentCustomText = customTexts[questionIndex] ?? ""

        return (
          <div key={questionIndex} className="min-w-0">
            {questions.length > 1 && (
              <div className="mb-0.5 shrink-0 font-mono text-[10px] leading-none text-white/40">
                {question.header || `#${questionIndex + 1}`}
              </div>
            )}
            <div className="min-w-0 break-words text-[12px] leading-relaxed text-white/85">
              {question.question}
            </div>

            {question.content && <AgentQuestionGraphic content={question.content} />}

            {question.options ? (
              <>
                {question.multiSelect ? (
                  <div className="mt-1 flex flex-col gap-1">
                    {question.options.map((option) => {
                      const checked = currentSelections.includes(option.label)
                      return (
                        <label
                          key={option.label}
                          className="agent-question-option flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1 text-[12px] text-white/75 transition-colors hover:bg-white/[0.04]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <LxCheckbox
                            checked={checked}
                            onChange={(next) => toggleOption(questionIndex, option.label, next)}
                            aria-label={option.label}
                          />
                          <span>{option.label}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <LxRadioGroup
                    name={`flow-question-${requestId}-${questionIndex}`}
                    value={currentSelections[0] ?? ""}
                    onChange={(label) => setSelection(questionIndex, label)}
                    className="mt-1 flex flex-col gap-1"
                  >
                    {question.options.map((option) => (
                      <LxRadio
                        key={option.label}
                        value={option.label}
                        className="agent-question-option !py-1"
                        label={option.label}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ))}
                  </LxRadioGroup>
                )}
                <input
                  value={currentCustomText}
                  onChange={(event) => setCustomText(questionIndex, event.target.value)}
                  placeholder={t("agent.questionCustomOther")}
                  className="agent-question-input mt-1 h-6 w-full rounded-[4px] border border-white/10 bg-white/5 px-2 text-[11px] text-white/90 placeholder-white/35 focus:border-white/20 focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              </>
            ) : (
              <textarea
                value={currentCustomText}
                onChange={(event) => setCustomText(questionIndex, event.target.value)}
                rows={2}
                placeholder={t("agent.questionAnswerPlaceholder")}
                className="agent-question-input mt-1 min-h-[36px] w-full resize-none rounded-[4px] border border-white/10 bg-white/5 px-2 py-1 text-[11px] leading-[18px] text-white/90 placeholder-white/35 focus:border-white/20 focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )
      })}

      {/* 统一提交 */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!isComplete}
          onClick={handleSubmit}
          className="agent-question-submit-btn flex h-6 items-center gap-1 rounded-[4px] bg-white px-2 text-[11px] font-medium text-black transition-colors hover:bg-white/90 disabled:!bg-white/15 disabled:!text-white/30"
        >
          {t("agent.questionSubmit")}
        </button>
      </div>

      {/* 输入参数与执行结果 */}
      <QuestionToolMeta content={content} />
    </div>
  )
}
