import { Braces, CornerDownRight } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import type { ChatBlock, LspToolDetails } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

interface AgentLspBlockProps {
  // LSP 检索结果（一个合并组内每个调用对应一份 details；流式中尚未返回时为空）。
  details?: LspToolDetails[]
  // 同一轮连续执行的 lsp 调用（无 details 时兜底展示参数）。
  toolCalls: ToolCallBlock[]
}

// 操作名 → i18n 标签 key。
const OPERATION_LABEL_KEYS: Record<string, TranslationKey> = {
  goToDefinition: "agent.lspActions.goToDefinition",
  findReferences: "agent.lspActions.findReferences",
  hover: "agent.lspActions.hover",
  documentSymbol: "agent.lspActions.documentSymbol",
  workspaceSymbol: "agent.lspActions.workspaceSymbol",
  goToImplementation: "agent.lspActions.goToImplementation",
  prepareCallHierarchy: "agent.lspActions.prepareCallHierarchy",
  incomingCalls: "agent.lspActions.incomingCalls",
  outgoingCalls: "agent.lspActions.outgoingCalls",
}

// 收缩绝对路径中间段，保留根目录与最后两个路径段。
const compactPath = (path: string): string => {
  const isAbsolute = path.startsWith("/")
  const segments = path.split("/").filter(Boolean)
  if (segments.length <= 3) return path
  return `${isAbsolute ? "/" : ""}${segments[0]}/.../${segments.slice(-2).join("/")}`
}

// 提取调用参数摘要（流式中无结果时的兜底展示）。
const summarizeCalls = (toolCalls: ToolCallBlock[]): string =>
  toolCalls
    .map((call) => {
      const operation = typeof call.args.operation === "string" ? call.args.operation : ""
      const filePath = typeof call.args.filePath === "string" ? call.args.filePath : ""
      const query = typeof call.args.query === "string" ? call.args.query : ""
      return query ? `${operation} "${query}" ${filePath}` : `${operation} ${filePath}`
    })
    .filter(Boolean)
    .join(" · ")

// 单份结果渲染：标题 + 错误/文本/位置行列表。
const renderDetails = (
  details: LspToolDetails,
  index: number,
  t: (key: TranslationKey) => string,
): React.JSX.Element => {
  const labelKey = OPERATION_LABEL_KEYS[details.operation]
  const label = labelKey ? t(labelKey) : details.operation
  const results = details.results ?? []
  return (
    <div key={index} className="agent-lsp-detail min-w-0">
      {details.error ? (
        <div className="agent-lsp-error mt-1 pl-1 text-[12px] leading-relaxed text-red-400">
          <CornerDownRight className="agent-lsp-corner mr-1 inline h-3 w-3" />
          {details.error}
        </div>
      ) : details.text ? (
        <div className="agent-lsp-text-row mt-1 min-w-0 pl-1">
          <LxTooltip content={details.text}>
            <div className="agent-lsp-text-card rounded-[6px] border border-white/10 bg-white/[0.03] px-2 py-1 text-[12px] leading-relaxed text-white/60 whitespace-pre-wrap break-all">
              {details.text}
            </div>
          </LxTooltip>
        </div>
      ) : results.length === 0 ? (
        <div className="agent-lsp-empty mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="agent-lsp-corner mt-[2px] h-3 w-3 shrink-0" />
          <span className="agent-lsp-empty-text">
            {label} - {t("project.noProjects")}
          </span>
        </div>
      ) : (
        <div className="agent-lsp-results mt-1 flex flex-col">
          {results.map((result, rowIndex) => (
            <LxTooltip key={rowIndex} content={result.filePath}>
              <button
                type="button"
                onClick={() => {
                  void agentApi.openFileAt(result.filePath, result.line)
                }}
                className="agent-lsp-result-item flex min-w-0 items-start gap-1 pl-1 text-left font-mono text-[12px] leading-[1.7] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white/90 focus:outline-none"
              >
                <span className="agent-lsp-location shrink-0 text-white/30">
                  {compactPath(result.filePath)}:{result.line}:{result.character}
                </span>
                {result.label && (
                  <span className="agent-lsp-label min-w-0 truncate text-white/45">
                    {result.label}
                  </span>
                )}
              </button>
            </LxTooltip>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * AgentLspBlock - 渲染 LSP 检索调用：定义/引用/符号结果展示可点击的位置行
 * （点击用系统编辑器打开对应文件与行），hover 展示纯文本，无结果显示单行摘要。
 */
export const AgentLspBlock = ({
  details = [],
  toolCalls,
}: AgentLspBlockProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  if (toolCalls.length === 0 && details.length === 0) return null
  const firstOpKey = details[0] ? OPERATION_LABEL_KEYS[details[0].operation] : undefined
  const title = firstOpKey ? t(firstOpKey) : (details[0]?.operation ?? "lsp")
  const headerCount = details.length === 1 ? ` · ${details[0].results.length}` : ""

  return (
    <div className="agent-lsp-block my-0.5 min-w-0">
      <div className="agent-lsp-header flex items-center gap-1">
        <Braces className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <span className="agent-lsp-name font-mono text-[12px] font-bold text-cyan-300">
          LSP{details[0] ? ` · ${title}` : ""}
          {headerCount}
        </span>
      </div>
      {details.length > 0 ? (
        details.map((entry, index) => renderDetails(entry, index, t))
      ) : (
        <div className="agent-lsp-summary mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="agent-lsp-corner mt-[2px] h-3 w-3 shrink-0" />
          <span className="agent-lsp-summary-text min-w-0 break-all">
            {summarizeCalls(toolCalls)}
          </span>
        </div>
      )}
    </div>
  )
}
