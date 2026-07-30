import { ArrowUp, Plus, Square } from "lucide-react"
import type React from "react"
import { useEffect, useRef } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"

interface AgentInputProps {
  inputText: string
  isStreaming: boolean
  onInputChange: (text: string) => void
  onSend: () => void
  onStop: () => void
}

/**
 * Agent 聊天底栏输入框组件 (OpenAI ChatGPT 风格重构)。
 */
export const AgentInput = ({
  inputText,
  isStreaming,
  onInputChange,
  onSend,
  onStop,
}: AgentInputProps): React.JSX.Element => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 动态根据输入文本调整 textarea 的高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    if (!inputText) {
      textarea.style.height = ""
      return
    }

    // 先重置高度以准确获取真实 scrollHeight，防止被 Flex 容器伸展
    textarea.style.height = "0px"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [inputText])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (inputText.trim() && !isStreaming) {
        onSend()
      }
    }
  }

  return (
    <div className="bg-transparent p-1 pt-1.5">
      <div className="relative flex flex-col rounded-[14px] border border-white/10 bg-[#1a1a1a] transition-all duration-200 shadow-sm focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="给 LX Agent 发送消息..."
          rows={1}
          className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[12px] leading-relaxed text-white/90 placeholder-white/35 focus:outline-none max-h-[180px] min-h-[40px] overflow-y-auto"
        />

        <div className="flex items-center justify-between px-2.5 pb-2 pt-0.5">
          <div className="flex items-center">
            <LxTooltip content="添加附件" placement="top">
              <button
                type="button"
                aria-label="添加附件"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </LxTooltip>
          </div>

          <div>
            {isStreaming ? (
              <LxTooltip content="停止生成" placement="top">
                <button
                  type="button"
                  aria-label="停止生成"
                  onClick={onStop}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition-all hover:bg-white/90 active:scale-95 shadow-sm"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              </LxTooltip>
            ) : (
              <LxTooltip content="发送消息 (Enter)" placement="top">
                <button
                  type="button"
                  aria-label="发送消息"
                  onClick={onSend}
                  disabled={!inputText.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 disabled:cursor-not-allowed bg-white text-black hover:bg-white/90 active:scale-95 disabled:bg-white/15 disabled:text-white/30 disabled:shadow-none shadow-sm"
                >
                  <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
                </button>
              </LxTooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
