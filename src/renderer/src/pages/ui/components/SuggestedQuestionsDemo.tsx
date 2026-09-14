import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { SuggestedQuestions } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

export const SuggestedQuestionsDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const [echoedText, setEchoedText] = useState("")

  const questions = [
    t("uiPreview.demos.mock.suggestedQuestions.q1"),
    t("uiPreview.demos.mock.suggestedQuestions.q2"),
    t("uiPreview.demos.mock.suggestedQuestions.q3"),
  ]

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.suggestedQuestionsTitle")}
        description={t("uiPreview.demos.suggestedQuestionsDesc")}
      >
        <div className="flex w-full max-w-xl flex-col gap-4">
          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <SuggestedQuestions
              questions={questions}
              onSelect={(q) => toast.info(t("uiPreview.demos.toast.questionSend", { question: q }))}
              onEcho={(q) => setEchoedText(q)}
            />
          </div>

          {echoedText ? (
            <div className="text-xs text-white/60">
              {t("uiPreview.demos.mock.suggestedQuestions.echoedPrefix")}
              <span className="text-white/90">{echoedText}</span>
            </div>
          ) : null}

          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <SuggestedQuestions
              questions={[]}
              isLoading={true}
              onSelect={() => {}}
              onEcho={() => {}}
            />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
