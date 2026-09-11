import type React from "react"

export interface OpenClawUserMessageProps {
  content: string
}

export const OpenClawUserMessage = ({ content }: OpenClawUserMessageProps): React.JSX.Element => {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        data-user-bubble="true"
        className="openclaw-user-bubble bg-user-bubble max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[4px] bg-[#253347] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 shadow-sm"
      >
        {content}
      </div>
    </div>
  )
}
