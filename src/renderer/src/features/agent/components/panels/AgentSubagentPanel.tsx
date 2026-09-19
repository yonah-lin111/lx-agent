import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageSquareShare,
  Shield,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react"
import type React from "react"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList"
import { AgentMessageItemMemo } from "@/features/agent/components/AgentMessageList"
import { buildQaGroups, groupAgentMessages } from "@/features/agent/messageGrouping"
import type {
  ChatBlock,
  ChatMessage,
  InterAgentCommunication,
  SubagentData,
} from "@/features/agent/types"
import { toChatMessage } from "@/features/agent/utils"
import { formatSubagentLabel } from "@/features/agent/utils/subagentLabel"
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
  // 视图模式：qa 渲染消息气泡时间轴，flow 渲染执行流程流水线
  mode?: "qa" | "flow"
}

interface CommItemProps {
  comm: InterAgentCommunication
}

// 协议轮次：一次 orchestrator→subagent 派发（triggerTurn）及其结果信元为一个 Protocol。
interface SubagentProtocol {
  // 本轮信元：派发信元 + 紧随其结果信元。
  comms: InterAgentCommunication[]
  // 本轮消息在 SubagentData.messages 中的区间；无法定位时为 null（回退展示全部消息）。
  messageRange: { start: number; end: number } | null
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
          <span className="agent-subagent-comm-route font-mono text-xs font-bold leading-none text-sky-300">
            {comm.author} &rarr; {comm.recipient}
          </span>
        </div>
      </div>

      {/* 展开详情区：与 AgentExecutionFlowItem 相同的条件渲染 */}
      {isExpanded ? (
        <div className="agent-subagent-comm-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-xs">
          <div className="agent-subagent-comm-content text-white/80">
            {isFromSubagent ? (
              <LxMarkdownPreview
                html={markdownRenderer.render(comm.content)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0 text-white/80"
                contentClassName="py-0 text-white/80 text-xs [&_p]:my-1 leading-relaxed"
              />
            ) : (
              <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/70">
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
  mode = "qa",
}: AgentSubagentPanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isOpen = toolCall !== null
  const data: SubagentData | undefined = toolCall?.subagent
  const displayName = data?.name.trim() || "task"
  const displayLabel = formatSubagentLabel(displayName, data?.roleName)
  // 子代理运行中：面板内消息的流式展示信号（父级 task 调用未结束即运行中）。
  const isSubagentRunning = toolCall?.status === "running"
  const [isIdCopied, setIsIdCopied] = useState(false)

  // 沙箱策略文案（复用设置页现有文案）。
  const sandboxLabel = data?.sandboxPolicy
    ? data.sandboxPolicy === "read-only"
      ? t("settings.sandboxReadOnly")
      : data.sandboxPolicy === "danger-full-access"
        ? t("settings.sandboxDangerFullAccess")
        : t("settings.sandboxWorkspaceWrite")
    : null

  // 复制完整子代理 ID（供按 subagent_id 续接调用），成功后短暂反馈。
  const handleCopySubagentId = async (): Promise<void> => {
    const subagentId = data?.subagentId
    if (!subagentId) return
    try {
      await navigator.clipboard.writeText(subagentId)
      setIsIdCopied(true)
      window.setTimeout(() => setIsIdCopied(false), 1500)
    } catch {
      setIsIdCopied(false)
    }
  }

  // 协议轮次派生：以 triggerTurn 信元为界，消息按 subagent messages 中的 user 消息切分。
  const protocols = useMemo<SubagentProtocol[]>(() => {
    if (!data) return []
    const communications = data.communications ?? []
    const triggerIndexes: number[] = []
    communications.forEach((comm, index) => {
      if (comm.triggerTurn) triggerIndexes.push(index)
    })
    if (triggerIndexes.length === 0) return []
    const userMessageIndexes: number[] = []
    data.messages.forEach((message, index) => {
      if (message.role === "user") userMessageIndexes.push(index)
    })
    return triggerIndexes.map((triggerIndex, protocolIndex) => {
      const nextTriggerIndex = triggerIndexes[protocolIndex + 1] ?? communications.length
      const comms = [
        communications[triggerIndex],
        ...communications
          .slice(triggerIndex + 1, nextTriggerIndex)
          .filter((comm) => !comm.triggerTurn),
      ]
      const start = userMessageIndexes[protocolIndex]
      const end = userMessageIndexes[protocolIndex + 1] ?? data.messages.length
      return {
        comms,
        messageRange: start === undefined ? null : { start: start + 1, end },
      }
    })
  }, [data])

  // 协议选择：未手动切换时跟随打开调用自身的轮次（快照中最后一个 Protocol），
  // 手动切换后记录选择；切换调用（toolCallId 变化）或收起面板时回到默认轮次。
  const openedToolCallId = toolCall?.toolCallId ?? ""
  const [protocolSelection, setProtocolSelection] = useState<{
    toolCallId: string
    index: number
  } | null>(null)
  const lastProtocolIndex = Math.max(protocols.length - 1, 0)
  const activeProtocolIndex =
    protocolSelection && protocolSelection.toolCallId === openedToolCallId
      ? Math.min(protocolSelection.index, lastProtocolIndex)
      : lastProtocolIndex
  const activeProtocol = protocols[activeProtocolIndex]

  useEffect(() => {
    if (!isOpen) setProtocolSelection(null)
  }, [isOpen])

  // 面板滚动容器：对外复用 scrollRef，对内保留本地引用供切换 Protocol 时重置滚动。
  const containerRef = useRef<HTMLDivElement | null>(null)
  const attachScrollContainer = (node: HTMLDivElement | null): void => {
    containerRef.current = node
    if (scrollRef) scrollRef.current = node
  }

  // 切换 Protocol：记录当前调用的选择并同步重置滚动位置，避免停留在上一轮的滚动偏移。
  const handleSelectProtocol = (nextIndex: number): void => {
    setProtocolSelection({ toolCallId: openedToolCallId, index: nextIndex })
    if (containerRef.current) containerRef.current.scrollTop = 0
  }

  // 快照跨 IPC 每帧都是全新对象；按消息内容比对，复用未变化消息的转换结果，
  // 既避免每帧对所有历史消息重跑 toChatMessage，也让子项 memo 只命中真正变化的消息。
  const conversionCacheRef = useRef<{ keys: string[]; messages: ChatMessage[] }>({
    keys: [],
    messages: [],
  })

  const messages = useMemo(() => {
    if (!data) {
      conversionCacheRef.current = { keys: [], messages: [] }
      return []
    }
    const previous = conversionCacheRef.current
    const range = activeProtocol?.messageRange
    const rawMessages = (
      range ? data.messages.slice(range.start, range.end) : data.messages
    ).filter((message) => message.role !== "user")
    const nextKeys: string[] = []
    const nextMessages: ChatMessage[] = []
    for (let index = 0; index < rawMessages.length; index++) {
      const raw = rawMessages[index]
      const key = JSON.stringify(raw)
      nextKeys.push(key)
      if (previous.keys[index] === key && previous.messages[index]) {
        nextMessages.push(previous.messages[index])
        continue
      }
      nextMessages.push(
        toChatMessage(
          raw,
          raw.role === "assistant" && raw.stopReason === "pending",
          `subagent-${index}`,
        ),
      )
    }
    conversionCacheRef.current = { keys: nextKeys, messages: nextMessages }
    return nextMessages
  }, [data, activeProtocol])

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
      {/* 面板头部：左侧 Subagent 名称；右侧 ID / 沙箱策略等低频信息收敛为紧凑徽章。 */}
      <div className="agent-subagent-panel-header flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-blue-300">Subagent</span>
          <span className="truncate text-sm text-white/70">{displayLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 沙箱策略：LxTag 图标徽章（颜色语义与 PermissionStatusButton 对齐），完整文案走 Tooltip。 */}
          {data?.sandboxPolicy && sandboxLabel && (
            <LxTooltip placement="bottom" content={sandboxLabel}>
              <LxTag
                size="small"
                className="agent-subagent-policy"
                aria-label={sandboxLabel}
                color={
                  data.sandboxPolicy === "read-only"
                    ? "sky"
                    : data.sandboxPolicy === "danger-full-access"
                      ? "amber"
                      : "emerald"
                }
                prefix={
                  data.sandboxPolicy === "read-only" ? (
                    <Shield className="h-3.5 w-3.5 text-sky-400" />
                  ) : data.sandboxPolicy === "danger-full-access" ? (
                    <ShieldOff className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  )
                }
              />
            </LxTooltip>
          )}
          {/* 子代理 ID：图标按钮（Copy → Check 反馈），hover Tooltip 展示完整 ID，点击复制供续接调用。 */}
          {data?.subagentId && (
            <LxIconButton
              size="small"
              aria-label={`${t("agent.copySubagentId")}: ${data.subagentId}`}
              title={{ content: data.subagentId, placement: "bottom" }}
              onClick={handleCopySubagentId}
            >
              {isIdCopied ? <Check className="text-emerald-400" /> : <Copy />}
            </LxIconButton>
          )}
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
                <BarChart3 />
              </LxIconButton>
            </LxTooltip>
          )}
          <LxIconButton
            size="small"
            aria-label={t("agent.closeSubagentPanel")}
            title={{ content: t("agent.collapsePanel"), placement: "bottom" }}
            onClick={onClose}
          >
            <X />
          </LxIconButton>
        </div>
      </div>

      {data ? (
        <div
          ref={attachScrollContainer}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2 [scrollbar-gutter:stable]"
        >
          {/* 结构化通信信元（置于消息列表顶部，随列表一起滚动） */}
          {data.communications && data.communications.length > 0 && (
            <div className="agent-interagent-section flex flex-col gap-1.5 rounded-[6px] border border-white/10 bg-black/20 p-2.5">
              <div className="agent-interagent-title flex items-center justify-between gap-2 text-xs font-semibold text-white/50">
                <div className="flex min-w-0 items-center gap-1.5">
                  <MessageSquareShare className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  <span className="truncate">Inter-Agent Protocol</span>
                </div>
                {/* 右侧：trigger 徽章（仅标识打开调用自身的轮次，浏览历史轮次时不显示）+ 协议轮次切换。 */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {activeProtocol && activeProtocolIndex === lastProtocolIndex && (
                    <LxTag size="small" color="sky" className="agent-interagent-trigger">
                      trigger
                    </LxTag>
                  )}
                  {protocols.length > 0 && (
                    <div className="agent-interagent-switcher flex items-center gap-1">
                      <LxIconButton
                        size="small"
                        aria-label={t("agent.previousProtocol")}
                        disabled={activeProtocolIndex === 0}
                        onClick={() => handleSelectProtocol(activeProtocolIndex - 1)}
                      >
                        <ArrowLeft />
                      </LxIconButton>
                      <span className="agent-interagent-protocol-index font-mono text-xs leading-none text-white/45">
                        {activeProtocolIndex + 1}/{protocols.length}
                      </span>
                      <LxIconButton
                        size="small"
                        aria-label={t("agent.nextProtocol")}
                        disabled={activeProtocolIndex >= protocols.length - 1}
                        onClick={() => handleSelectProtocol(activeProtocolIndex + 1)}
                      >
                        <ArrowRight />
                      </LxIconButton>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {(activeProtocol ? activeProtocol.comms : data.communications).map((comm) => (
                  <SubagentCommItem key={comm.id ?? comm.content.slice(0, 16)} comm={comm} />
                ))}
              </div>
            </div>
          )}

          {/* 协议与消息列表之间的轮次/阶段分隔线（参考 AgentExecutionFlowList 分割线规范） */}
          {data.communications && data.communications.length > 0 && messages.length > 0 && (
            <div className="agent-subagent-flow-divider my-1 flex items-center gap-2">
              <div className="h-[1px] flex-1 bg-white/10" />
              <span className="font-mono text-xs font-semibold tracking-wider text-white/35 uppercase">
                {t("agent.executionFlow")}
              </span>
              <div className="h-[1px] flex-1 bg-white/10" />
            </div>
          )}

          {/* 子代理内部消息时间轴（只读，不隐藏消息列表） */}
          {messages.length > 0 ? (
            mode === "flow" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <AgentExecutionFlowList messages={messages} isStreaming={isSubagentRunning} />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {messageGroups.map((group, groupIndex) => {
                  const userMessage = group.userMessage
                  const assistant = group.assistant
                  const groupKey = userMessage?.id ?? assistant?.message.id
                  const isLastGroup = groupIndex === messageGroups.length - 1
                  return (
                    <Fragment key={groupKey}>
                      {userMessage && (
                        <div className="mb-2 w-full">
                          <AgentMessageItemMemo message={userMessage} readOnly />
                        </div>
                      )}
                      {assistant && (
                        <AgentMessageItemMemo
                          message={assistant.message}
                          continuationMessages={assistant.continuationMessages}
                          isLoading={isSubagentRunning && isLastGroup}
                          readOnly
                        />
                      )}
                    </Fragment>
                  )
                })}
              </div>
            )
          ) : (
            <div className="flex min-h-24 flex-1 items-center justify-center text-xs text-white/35">
              {t("agent.subagentNoContent")}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-white/35">
          {t("agent.subagentNoDetails")}
        </div>
      )}
    </div>
  )
}
