import { CornerDownLeft, Lightbulb } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

// 推荐问题组件属性。
type SuggestedQuestionsProps = {
  questions: string[]
  isLoading?: boolean
  // 点击问题：直接发送。
  onSelect: (question: string) => void
  // 点击回显按钮：填入输入框并聚焦。
  onEcho: (question: string) => void
}

/**
 * SuggestedQuestions - 展示可直接发送或回显到输入框的后续问题。
 */
export const SuggestedQuestions = ({
  questions,
  isLoading = false,
  onSelect,
  onEcho,
}: SuggestedQuestionsProps): React.JSX.Element | null => {
  if (!isLoading && questions.length === 0) return null

  return (
    <div className="my-1.5 flex w-full max-w-full gap-2.5 pl-1">
      <div className="flex w-6 shrink-0 items-start justify-center pt-0.5">
        <Lightbulb className="h-3.5 w-3.5 text-lime-300" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-xs font-medium text-white/50">推荐问题</div>
        {isLoading ? (
          <div className="h-5 w-36 animate-pulse rounded-[6px] bg-white/5" />
        ) : (
          <div className="flex flex-col items-start gap-1">
            {questions.map((question) => (
              <div key={question} className="group/item flex w-full max-w-full items-start gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(question)}
                  className="min-w-0 flex-1 rounded-[6px] border border-white/10 px-2 py-1 text-left text-xs leading-relaxed text-white/65 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
                >
                  {question}
                </button>
                <LxIconButton
                  size="small"
                  aria-label="填入输入框"
                  title={{ content: "填入输入框", placement: "top" }}
                  onClick={() => onEcho(question)}
                  className="mt-1 opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100"
                >
                  <CornerDownLeft className="h-3 w-3" />
                </LxIconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
