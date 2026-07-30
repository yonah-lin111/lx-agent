import { Send, Square } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

interface AgentInputProps {
  inputText: string
  isStreaming: boolean
  onInputChange: (text: string) => void
  onSend: () => void
  onStop: () => void
}

/**
 * Agent 聊天底栏输入框组件 (对标 OpenAI ChatGPT 顶级极简平滑架构)。
 */
export const AgentInput = ({
  inputText,
  isStreaming,
  onInputChange,
  onSend,
  onStop,
}: AgentInputProps): React.JSX.Element => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (inputText.trim() && !isStreaming) {
        onSend()
      }
    }
  }

  // 加号按钮
  const addButton = (
    <LxIconButton
      shape="circle"
      preset="add"
      aria-label="添加附件"
      title={{ content: "添加附件", placement: "top" }}
      hoverBgClass="hover:bg-white/20"
      hoverTextClass="hover:text-white"
      className="bg-white/10 !text-white/70"
    />
  )

  // 发送 / 停止按钮
  const actionButton = isStreaming ? (
    <LxIconButton
      shape="circle"
      aria-label="停止生成"
      title={{ content: "停止生成", placement: "top" }}
      onClick={onStop}
      hoverBgClass="hover:bg-white/90"
      className="bg-white !text-black shadow-sm"
    >
      <Square className="h-3 w-3 fill-current" />
    </LxIconButton>
  ) : (
    <LxIconButton
      shape="circle"
      aria-label="发送消息"
      title={{ content: "发送消息 (Enter)", placement: "top" }}
      onClick={onSend}
      disabled={!inputText.trim()}
      hoverBgClass="hover:bg-white/90"
      className="bg-white !text-black shadow-sm disabled:!bg-white/15 disabled:!text-white/30 disabled:!opacity-100 disabled:shadow-none"
    >
      <Send className="h-3.5 w-3.5" />
    </LxIconButton>
  )

  return (
    <div className="bg-transparent p-0.5 pt-1 pb-0">
      {/* 统一恒定布局容器：高度跟随 textarea 自然平滑伸缩，无横向滑行 */}
      <div className="relative flex flex-col justify-between rounded-[16px] border border-white/10 bg-[#1a1a1a] px-2.5 pt-2 pb-2 shadow-sm focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10 transition-[border-color,box-shadow,background-color] duration-200">
        {/* 输入区 */}
        <textarea
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="给 LX Agent 发送消息..."
          rows={1}
          className="min-h-6 max-h-[124px] w-full resize-none overflow-y-auto bg-transparent px-1 py-0.5 text-[12px] leading-[20px] text-white/90 placeholder-white/35 focus:outline-none [field-sizing:content]"
        />

        {/* 恒定固定的底部工具栏，左置加号右置发送 */}
        <div className="flex w-full items-center justify-between pt-1.5">
          <div>{addButton}</div>
          <div>{actionButton}</div>
        </div>
      </div>
    </div>
  )
}
