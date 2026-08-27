import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  MessageSquareShare,
  Shield,
  X,
} from "lucide-react"
import type React from "react"
import { Fragment, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageList"
import { buildQaGroups, groupAgentMessages } from "@/features/agent/messageGrouping"
import type { ChatBlock, InterAgentCommunication, SubagentData } from "@/features/agent/types"
import { toChatMessage } from "@/features/agent/utils"
import { markdownRenderer } from "@/features/markdown/utils/markdownRenderer"
import { useTranslation } from "@/i18n"

// 子代理调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 子代理面板属性类型。
interface AgentSubagentPanelProps {
  // 当前打开的子代理调用（null = 面板收起）。
  toolCall: ToolCallBlock | null
  // 关闭面板。
  onClose: () => void
  // 面板消息列表滚动容器（面板打开时，AgentMessageList 的滚动按钮接管面板滚动）。
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

interface CommItemProps {
  comm: InterAgentCommunication
}

/**
 * 结构化多 Agent 信元组件：对齐 AgentExecutionFlowItem 的折叠展开机制。
 * 默认完全折叠（不显示 body），点击头部展开完整内容；subagent->orchestrator 走 Markdown 渲染。
 */
const SubagentCommItem = ({ comm }: CommItemProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)
  const previewRef = useRef<HTMLElement | null>(null)
  const isFromSubagent = comm.author.startsWith("subagent") || comm.recipient === "orchestrator"

  return (
    <div
      data-expanded={isExpanded}
      className="agent-subagent-comm-item rounded-[6px] border border-white/8 bg-[#212121] transition-colors hover:border-white/15"
    >
      {/* 头部摘要栏：与 AgentExecutionFlowItem 一致的点击展开交互 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded((prev) => !prev)
          }
        }}
        className="agent-subagent-comm-header flex h-8 cursor-pointer items-center justify-between gap-2 px-2.5 select-none"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 leading-none">
          <div className="flex shrink-0 items-center text-white/40">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>
          <span className="agent-subagent-comm-route font-mono text-[12px] font-bold leading-none text-sky-300">
            {comm.author} &rarr; {comm.recipient}
          </span>
          {comm.triggerTurn && (
            <span className="agent-subagent-comm-trigger shrink-0 rounded bg-sky-500/20 px-1 py-0.5 font-mono text-[10px] leading-none text-sky-300">
              trigger
            </span>
          )}
        </div>
      </div>

      {/* 展开详情区：与 AgentExecutionFlowItem 相同的条件渲染 */}
      {isExpanded ? (
        <div className="agent-subagent-comm-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-[12px]">
          <div className="agent-subagent-comm-content text-white/80">
            {isFromSubagent ? (
              <LxMarkdownPreview
                html={markdownRenderer.render(comm.content)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0 text-white/80"
                contentClassName="py-0 text-white/80 text-[12px] [&_p]:my-1 leading-relaxed"
              />
            ) : (
              <div className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-white/70">
                {comm.content}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * AgentSubagentPanel - 从顶部向下展开、恰好覆盖消息列表的子代理面板。
 * 消息列表保持挂载（不卸载）；面板内只读展示子代理完整内部运行记录（工具/MCP/skill/文本）。
 */
export const AgentSubagentPanel = ({
  toolCall,
  onClose,
  scrollRef,
}: AgentSubagentPanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isOpen = toolCall !== null
  const data: SubagentData | undefined = toolCall?.subagent
  const displayName = data?.name.trim() || "task"

  const messages = useMemo(() => {
    if (!data) return []
    let sequence = 0
    // 在子代理面板中，过滤掉用户的原始 prompt 消息（已在顶部的 orchestrator->subagent 结构化展示）
    return data.messages
      .filter((message) => message.role !== "user")
      .map((message) =>
        toChatMessage(
          message,
          message.role === "assistant" && message.stopReason === "pending",
          `subagent-${sequence++}`,
        ),
      )
  }, [data])

  // 与 AgentMessageList 相同的 QA 分组：一次子代理运行的 AI 内容（助手消息 + 工具结果 + 续写）合并到一个 AgentMessageItem 内展示。
  const messageGroups = useMemo(() => buildQaGroups(groupAgentMessages(messages)), [messages])

  return (
    <div
      role="dialog"
      aria-label={t("agent.subagentPanel")}
      inert={!isOpen}
      className="agent-subagent-panel-dialog absolute inset-0 z-20 flex flex-col bg-[#262626] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        transform: isOpen ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.28s cubic-bezier(0.2, 0.85, 0.2, 1)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* 面板头部：Subagent 名称 + 关闭。 */}
      <div className="agent-subagent-panel-header flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-mono text-[13px] font-bold text-blue-300">Subagent</span>
          <span className="truncate text-[13px] text-white/70">
            {displayName !== "task" ? ` - ${displayName}(task)` : " - task"}
          </span>
          {data?.subagentId && (
            <span className="agent-subagent-id inline-flex items-center rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
              ID: {data.subagentId}
            </span>
          )}
          {data?.sandboxPolicy && (
            <span className="agent-subagent-policy inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/60">
              <Shield className="h-2.5 w-2.5 text-sky-400" />
              {data.sandboxPolicy}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 统计：token 用量（3 行，一行一个类型）。 */}
          {data && (
            <LxTooltip
              multiline
              placement="bottom"
              content={
                <div className="flex flex-col gap-0.5 whitespace-nowrap">
                  <span>{t("agent.inputTokens", { count: data.usage.input })}</span>
                  <span>{t("agent.outputTokens", { count: data.usage.output })}</span>
                  <span>{t("agent.totalTokens", { count: data.usage.totalTokens })}</span>
                </div>
              }
            >
              <LxIconButton size="small" aria-label={t("agent.viewStats")}>
                <BarChart3 className="h-3.5 w-3.5" />
              </LxIconButton>
            </LxTooltip>
          )}
          <LxIconButton
            size="small"
            aria-label={t("agent.closeSubagentPanel")}
            title={{ content: t("agent.collapsePanel"), placement: "bottom" }}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      </div>

      {data ? (
        <div
          ref={scrollRef}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2"
        >
          {/* 结构化通信信元（置于消息列表顶部，随列表一起滚动） */}
          {data.communications && data.communications.length > 0 && (
            <div className="agent-interagent-section flex flex-col gap-1.5 rounded-[6px] border border-white/10 bg-black/20 p-2.5">
              <div className="agent-interagent-title flex items-center gap-1 text-[11px] font-semibold text-white/50">
                <MessageSquareShare className="h-3.5 w-3.5 text-sky-400" />
                <span>Inter-Agent Protocol</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {data.communications.map((comm) => (
                  <SubagentCommItem key={comm.id ?? comm.content.slice(0, 16)} comm={comm} />
                ))}
              </div>
            </div>
          )}

          {/* 协议与消息列表之间的轮次/阶段分隔线（参考 AgentExecutionFlowList 分割线规范） */}
          {data.communications && data.communications.length > 0 && messages.length > 0 && (
            <div className="agent-subagent-flow-divider my-1 flex items-center gap-2">
              <div className="h-[1px] flex-1 bg-white/10" />
              <span className="font-mono text-[10px] font-semibold tracking-wider text-white/35 uppercase">
                {t("agent.executionFlow")}
              </span>
              <div className="h-[1px] flex-1 bg-white/10" />
            </div>
          )}

          {/* 子代理内部消息时间轴（只读，不隐藏消息列表）；AI 内容按 QA 组聚合到一个 AgentMessageItem。 */}
          {messages.length > 0 ? (
            <div className="flex flex-col gap-1">
              {messageGroups.map((group) => {
                const userMessage = group.userMessage
                const assistant = group.assistant
                const groupKey = userMessage?.id ?? assistant?.message.id
                return (
                  <Fragment key={groupKey}>
                    {userMessage && (
                      <div className="mb-2 w-full">
                        <AgentMessageItem message={userMessage} isPinned={false} readOnly />
                      </div>
                    )}
                    {assistant && (
                      <AgentMessageItem
                        message={assistant.message}
                        continuationMessages={assistant.continuationMessages}
                        readOnly
                      />
                    )}
                  </Fragment>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-24 flex-1 items-center justify-center text-[12px] text-white/35">
              {t("agent.subagentNoContent")}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-white/35">
          {t("agent.subagentNoDetails")}
        </div>
      )}
    </div>
  )
}
