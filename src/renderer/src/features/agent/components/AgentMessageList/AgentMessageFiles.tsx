import { FileText, Loader2 } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

export interface AgentMessageFile {
  name: string
  path: string
  type: "image" | "text"
  size?: string
  extension?: string
}

export interface AgentMessageFilesProps {
  files: AgentMessageFile[]
  align?: "left" | "right"
  className?: string
}

export const AgentMessageFiles = ({
  files,
  align = "right",
  className = "",
}: AgentMessageFilesProps): React.JSX.Element | null => {
  if (!files || files.length === 0) return null

  const justifyClass = align === "left" ? "justify-start" : "justify-end"

  return (
    <div className={`mb-2 flex flex-wrap gap-2 ${justifyClass} ${className}`.trim()}>
      {files.map((file, idx) => {
        if (file.type === "image") {
          return <ImageItem key={idx} file={file} />
        } else {
          return <FileItem key={idx} file={file} />
        }
      })}
    </div>
  )
}

const ImageItem = ({ file }: { file: AgentMessageFile }) => {
  const [loading, setLoading] = useState(true)
  const imageSrc = `lx-image://local${file.path}`

  const previewContent = (
    <div className="flex items-center justify-center overflow-hidden p-1 max-w-[min(420px,80vw)] max-h-[min(420px,80vh)]">
      <img
        src={imageSrc}
        alt={file.name}
        className="max-w-full max-h-full object-contain rounded-[4px]"
      />
    </div>
  )

  return (
    <LxTooltip content={previewContent} placement="top" multiline>
      <div className="agent-message-file-image relative h-12 w-12 overflow-hidden rounded-[8px] border border-white/10 bg-white/5 flex items-center justify-center cursor-pointer">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#252525]">
            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
          </div>
        )}
        <img
          src={imageSrc}
          alt={file.name}
          className={`h-full w-full object-cover transition-opacity duration-200 ${loading ? "opacity-0" : "opacity-100"}`}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
    </LxTooltip>
  )
}

const FileItem = ({ file }: { file: AgentMessageFile }) => {
  const { t } = useTranslation()
  const extension = file.extension || file.name.split(".").pop()?.toUpperCase() || "UNKNOWN"
  const sizeStr = file.size || t("agent.unknownSize")

  return (
    <LxTooltip
      content={
        <div className="flex flex-col gap-0.5 text-xs text-left w-fit max-w-[min(360px,80vw)]">
          <span className="font-semibold text-white/95 break-words">{file.name}</span>
          {file.path && <span className="text-[10px] text-white/40 break-all">{file.path}</span>}
        </div>
      }
      placement="top"
      multiline
    >
      <div className="agent-message-file-item flex h-12 w-48 items-center gap-2 rounded-[8px] border border-white/10 bg-white/5 px-2.5 cursor-default">
        <div className="agent-message-file-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-white/10">
          <FileText className="h-4 w-4 text-teal-400" />
        </div>
        <div className="min-w-0 flex-1 text-left flex flex-col justify-center">
          <div className="truncate text-xs font-medium text-white/80">{file.name}</div>
          <div className="truncate text-[10px] text-white/30 mt-0.5">
            {extension} · {sizeStr}
          </div>
        </div>
      </div>
    </LxTooltip>
  )
}
