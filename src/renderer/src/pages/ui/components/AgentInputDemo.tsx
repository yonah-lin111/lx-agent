import type React from "react"
import { useState } from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { AgentInput, type AgentInputFile } from "@/features/agent/components/AgentInput"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

export const AgentInputDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxAgentToast()
  const [text, setText] = useState("")
  const [model, setModel] = useState("claude-3-7-sonnet")
  const [files, setFiles] = useState<AgentInputFile[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  const modelOptions = [
    { label: "Claude 3.7 Sonnet", value: "claude-3-7-sonnet" },
    { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet" },
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "DeepSeek V3", value: "deepseek-v3" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentInputTitle")}
        description={t("uiPreview.demos.agentInputDesc")}
      >
        <div className="w-full max-w-2xl">
          <AgentInput
            inputText={text}
            onInputChange={setText}
            isStreaming={isStreaming}
            isCompacting={false}
            queuedCount={0}
            queuedMessages={[]}
            onSend={(opts) => {
              toast.success(
                t("uiPreview.demos.toast.sendMessage", {
                  text: text || t("uiPreview.demos.toast.emptyText"),
                  mode: opts?.delivery ?? "direct",
                }),
              )
              setText("")
            }}
            onStop={() => {
              setIsStreaming(false)
              toast.info(t("uiPreview.demos.toast.stopped"))
            }}
            onClear={() => {
              setText("")
              setFiles([])
              toast.info(t("uiPreview.demos.toast.cleared"))
            }}
            onUndo={() => toast.info(t("uiPreview.demos.toast.undo"))}
            onCompact={() => toast.info(t("uiPreview.demos.toast.compact"))}
            selectedModel={model}
            onModelChange={setModel}
            modelOptions={modelOptions}
            hasModelOptions={true}
            worktreeOptions={null}
            onWorktreeSelect={() => {}}
            selectedFiles={files}
            onFilesChange={setFiles}
            supportsImages={true}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
