import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { AgentInput, type AgentInputFile } from "@/features/agent/components/AgentInput"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

export const AgentInputDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
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
              toast.success(`发送消息: ${text || "（空）"} [模式: ${opts?.delivery ?? "direct"}]`)
              setText("")
            }}
            onStop={() => {
              setIsStreaming(false)
              toast.info("已停止生成")
            }}
            onClear={() => {
              setText("")
              setFiles([])
              toast.info("已清除输入")
            }}
            onUndo={() => toast.info("撤销上一条")}
            onCompact={() => toast.info("触发上下文压缩")}
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
