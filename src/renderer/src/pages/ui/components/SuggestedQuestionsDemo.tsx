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
    "如何配置本地 MCP 服务器与工具调用？",
    "帮我分析一下 src/renderer/src/features/agent 模块的目录架构",
    "当前项目的国际化词条规范是什么？",
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
              onSelect={(q) => toast.info(`点击发送: ${q}`)}
              onEcho={(q) => setEchoedText(q)}
            />
          </div>

          {echoedText ? (
            <div className="text-xs text-white/60">
              已回显到输入框：<span className="text-white/90">{echoedText}</span>
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
