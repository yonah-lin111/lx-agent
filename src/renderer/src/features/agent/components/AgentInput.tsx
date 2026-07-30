import { Send, Sparkles, Square } from "lucide-react"
import type React from "react"
import { useRef } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

interface AgentInputProps {
  inputText: string
  isStreaming: boolean
  onInputChange: (text: string) => void
  onSend: () => void
  onStop: () => void
}

/**
 * Agent 聊天底栏输入框组件。
 */
export const AgentInput = ({
  inputText,
  isStreaming,
  onInputChange,
  onSend,
  onStop,
}: AgentInputProps): React.JSX.Element => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="border-t border-white/5 bg-[#1c1c1c] p-2">
      <div className="relative flex flex-col rounded-[6px] border border-white/10 bg-[#121212] transition-colors focus-within:border-white/25">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="给 LX Agent 发送消息... (Enter 发送, Shift+Enter 换行)"
          rows={2}
          className="w-full resize-none bg-transparent p-2.5 text-[12px] text-white/90 placeholder-white/30 focus:outline-none"
        />

        <div className="flex items-center justify-between p-1.5 pt-0">
          <div className="flex items-center gap-1 px-1 text-[10px] text-white/30">
            <Sparkles className="h-3 w-3 text-emerald-400/70" />
            <span>LX Agent</span>
          </div>

          <div>
            {isStreaming ? (
              <LxIconButton
                size="small"
                aria-label="停止生成"
                title={{ content: "停止生成", placement: "top" }}
                onClick={onStop}
                className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
              >
                <Square className="h-3 w-3 fill-current" />
              </LxIconButton>
            ) : (
              <LxIconButton
                size="small"
                aria-label="发送消息"
                title={{ content: "发送消息 (Enter)", placement: "top" }}
                onClick={onSend}
                disabled={!inputText.trim()}
                className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:bg-transparent disabled:text-white/30 disabled:opacity-30"
              >
                <Send className="h-3 w-3" />
              </LxIconButton>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
