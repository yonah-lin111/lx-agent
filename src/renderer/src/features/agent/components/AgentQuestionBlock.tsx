import type { QuestionAnswer, QuestionPrompt, QuestionRequest } from "@shared/contracts/agent"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CornerDownRight,
  Send,
} from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { agentApi } from "@/features/agent/api/agentApi"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 单个问题块组件属性类型。
interface AgentQuestionBlockProps {
  toolCall: ToolCallBlock
}

// 提问附加 markdown 内容（content 字段；每问独立 previewRef，mermaid 经 fence 规则自动成图）。
const QuestionMarkdown = ({ content }: { content: string }): React.JSX.Element => {
  const previewRef = useRef<HTMLDivElement>(null)
  return (
    <LxMarkdownPreview
      html={markdownRenderer.render(content)}
      previewMode="preview"
      previewRef={previewRef}
      className="px-0 text-white/80"
      contentClassName="py-0 text-white/80 [&_*]:!text-white/80"
    />
  )
}

// 提取问题列表：pending 请求优先，回退 toolCall args。
const getQuestions = (toolCall: ToolCallBlock): QuestionPrompt[] => {
  const pending = toolCall.question
  if (pending && Array.isArray(pending.questions)) return pending.questions
  if (Array.isArray(toolCall.args.questions)) return toolCall.args.questions as QuestionPrompt[]
  return []
}

/**
 * AgentQuestionBlock - 渲染 question 工具调用：在消息流内直接展示提问与作答控件，
 * 独立成组、不参与执行折叠。多问题用 tab 切换；单选 LxRadio / 多选 LxCheckbox（均纵向排列），
 * 并支持自定义文本输入（对齐 Claude Code 的 Other / opencode 的 custom）。
 * 挂起期间展示交互表单；作答提交后经 agent:questionResponse 回灌 main。
 */
export const AgentQuestionBlock = ({
  toolCall,
}: AgentQuestionBlockProps): React.JSX.Element | null => {
  const pending: QuestionRequest | undefined = toolCall.question
  const questions = getQuestions(toolCall)
  if (questions.length === 0) return null

  // 每题作答态：选择题 = 已选 label 数组；自由文本/自定义输入 = customTexts。
  const [activeIndex, setActiveIndex] = useState(0)
  const [selections, setSelections] = useState<string[][]>(() => questions.map(() => []))
  const [customTexts, setCustomTexts] = useState<string[]>(() => questions.map(() => ""))
  // 已作答（非 pending）块的折叠态：仅作答完成后可折叠，默认折叠。
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const requestId = pending?.requestId

  // 新请求（requestId 变化）复位作答态。
  useEffect(() => {
    setActiveIndex(0)
    setSelections(questions.map(() => []))
    setCustomTexts(questions.map(() => ""))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId])

  // 展开时测量内容高度，支撑平滑折叠动画（对齐 Thinking 块实现）。
  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element || !isExpanded) {
      setContentHeight(null)
      return undefined
    }

    const updateHeight = (): void => setContentHeight(element.scrollHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [isExpanded, toolCall.answers, questions])

  // 无挂起请求：已作答（done）或请求尚未到达（running 瞬间）——展示只读问题清单。
  if (!pending) {
    // 按问题文本定位答案（答案随 toolCall 回填/落库恢复）。
    const answersByQuestion = new Map(
      (toolCall.answers ?? []).map((answer) => [answer.question, answer.answer]),
    )
    return (
      <div className="my-0.5 min-w-0">
        <button
          type="button"
          aria-label="已作答问题"
          aria-expanded={isExpanded}
          className="flex h-5 w-fit items-center gap-1 pr-2 text-[12px] transition-all duration-200 hover:text-white/70 focus:outline-none"
          onClick={() => setIsExpanded((previousExpanded) => !previousExpanded)}
        >
          <CircleHelp className="h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span className="font-mono text-[12px] font-bold text-sky-300">Question</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
          />
        </button>
        <div
          style={{
            maxHeight: isExpanded
              ? contentHeight !== null
                ? `${contentHeight}px`
                : `${innerRef.current?.scrollHeight ?? 0}px`
              : "0px",
            opacity: isExpanded ? 1 : 0,
            transition:
              "max-height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)",
          }}
          className="overflow-hidden"
        >
          <div ref={innerRef} className="mt-1 flex min-w-0 flex-col gap-1.5 pl-1">
            {questions.map((question, index) => {
              const answers = answersByQuestion.get(question.question) ?? []
              return (
                <div key={index} className="min-w-0">
                  <div className="flex min-w-0 items-start gap-1 text-[12px] leading-relaxed text-white/75">
                    <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
                    <span className="min-w-0 break-words">{question.question}</span>
                  </div>
                  {answers.length > 0 && (
                    <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                      {answers.map((answer) => (
                        <div
                          key={answer}
                          className="min-w-0 break-words text-[12px] leading-relaxed text-white/50"
                        >
                          {answer}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const activeQuestion = questions[activeIndex] ?? questions[0]!

  const toggleOption = (label: string, checked: boolean): void => {
    setSelections((prev) =>
      prev.map((selected, index) => {
        if (index !== activeIndex) return selected
        if (!activeQuestion.multiSelect) return [label]
        return checked
          ? selected.includes(label)
            ? selected
            : [...selected, label]
          : selected.filter((entry) => entry !== label)
      }),
    )
  }

  const setSelection = (label: string): void => {
    setSelections((prev) =>
      prev.map((selected, index) => (index === activeIndex ? [label] : selected)),
    )
  }

  const setCustomText = (value: string): void => {
    setCustomTexts((prev) => prev.map((text, index) => (index === activeIndex ? value : text)))
  }

  const isComplete = questions.every((question, index) =>
    question.options
      ? selections[index]!.length > 0 || customTexts[index]!.trim().length > 0
      : customTexts[index]!.trim().length > 0,
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
    void agentApi.questionRespond({ requestId: pending.requestId, answers })
  }

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <CircleHelp className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        <span className="font-mono text-[12px] font-bold text-sky-300">Question</span>
      </div>
      <div className="mt-1 flex min-w-0 items-start gap-1 pl-1">
        <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
        <div className="min-w-0 flex-1">
          {/* 多问题 tab 切换。 */}
          {questions.length > 1 && (
            <div className="mb-1.5 flex flex-wrap gap-1 border-b border-white/10 pb-1.5">
              {questions.map((question, index) => {
                const isActive = index === activeIndex
                const answered =
                  selections[index]!.length > 0 || customTexts[index]!.trim().length > 0
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[12px] transition-colors ${
                      isActive
                        ? "border-white/20 bg-white/15 text-white"
                        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <span className="truncate">{question.header || `问题 ${index + 1}`}</span>
                    {answered && <span className="h-1.5 w-1.5 rounded-full bg-white/60" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* 当前问题：纯文本提问 + 独立 md 内容 + 选项/自定义输入。 */}
          <div className="min-w-0">
            {activeQuestion.header && questions.length <= 1 && (
              <span className="mb-1 block w-fit max-w-full truncate rounded-[4px] bg-sky-300/10 px-1.5 py-0.5 text-[12px] text-sky-300">
                {activeQuestion.header}
              </span>
            )}
            <div className="text-[13px] leading-relaxed text-white/85">
              {activeQuestion.question}
            </div>
            {activeQuestion.content && (
              <div className="mt-1">
                <QuestionMarkdown content={activeQuestion.content} />
              </div>
            )}

            {activeQuestion.options ? (
              <>
                {activeQuestion.multiSelect ? (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {activeQuestion.options.map((option) => {
                      const checked = selections[activeIndex]!.includes(option.label)
                      return (
                        <label
                          key={option.label}
                          className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] text-white/75 transition-colors hover:bg-white/[0.04]"
                        >
                          <LxCheckbox
                            checked={checked}
                            onChange={(next) => toggleOption(option.label, next)}
                            aria-label={option.label}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span>{option.label}</span>
                            {option.description && (
                              <span className="mt-0.5 text-[10px] text-white/40">
                                {option.description}
                              </span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <LxRadioGroup
                    name={`question-${pending.requestId}-${activeIndex}`}
                    value={selections[activeIndex]![0] ?? ""}
                    onChange={setSelection}
                    className="mt-1.5 flex flex-col gap-1"
                  >
                    {activeQuestion.options.map((option) => (
                      <LxRadio
                        key={option.label}
                        value={option.label}
                        label={
                          option.description ? (
                            <span className="flex min-w-0 flex-col">
                              <span>{option.label}</span>
                              <span className="text-[10px] text-white/40">
                                {option.description}
                              </span>
                            </span>
                          ) : (
                            option.label
                          )
                        }
                      />
                    ))}
                  </LxRadioGroup>
                )}
                <input
                  value={customTexts[activeIndex]}
                  onChange={(event) => setCustomText(event.target.value)}
                  placeholder="其他（自定义输入）"
                  className="mt-1.5 h-7 w-full rounded-[4px] border border-white/10 bg-white/5 px-2 text-[12px] text-white/90 placeholder-white/35 focus:border-white/20 focus:outline-none"
                />
              </>
            ) : (
              <textarea
                value={customTexts[activeIndex]}
                onChange={(event) => setCustomText(event.target.value)}
                rows={2}
                placeholder="输入回答..."
                className="mt-1.5 min-h-[40px] w-full resize-none rounded-[4px] border border-white/10 bg-white/5 px-2 py-1 text-[12px] leading-[18px] text-white/90 placeholder-white/35 focus:border-white/20 focus:outline-none"
              />
            )}
          </div>

          {/* 底部操作：多问题时 Prev/Next 切换 tab，右侧 Submit 提交。 */}
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            {questions.length > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous question"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                  className="flex h-7 items-center gap-1 rounded-[4px] border border-white/10 bg-white/5 px-2 text-[12px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  aria-label="Next question"
                  disabled={activeIndex === questions.length - 1}
                  onClick={() =>
                    setActiveIndex((index) => Math.min(questions.length - 1, index + 1))
                  }
                  className="flex h-7 items-center gap-1 rounded-[4px] border border-white/10 bg-white/5 px-2 text-[12px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={!isComplete}
              onClick={handleSubmit}
              className="flex h-7 items-center gap-1.5 rounded-[4px] bg-white px-2.5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:!bg-white/15 disabled:!text-white/30"
            >
              <Send className="h-3 w-3" />
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
