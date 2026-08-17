import { BarChart3, X } from "lucide-react"
import type React from "react"
import { Fragment, useMemo } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import { buildQaGroups, groupAgentMessages } from "@/features/agent/messageGrouping"
import type { ChatBlock, SubagentData } from "@/features/agent/types"
import { toChatMessage } from "@/features/agent/utils"

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

/**
 * AgentSubagentPanel - 从顶部向下展开、恰好覆盖消息列表的子代理面板。
 * 消息列表保持挂载（不卸载）；面板内只读展示子代理完整内部运行记录（工具/MCP/skill/文本）。
 */
export const AgentSubagentPanel = ({
  toolCall,
  onClose,
  scrollRef,
}: AgentSubagentPanelProps): React.JSX.Element => {
  const isOpen = toolCall !== null
  const data: SubagentData | undefined = toolCall?.subagent
  const displayName = data?.name.trim() || "task"

  const messages = useMemo(() => {
    if (!data) return []
    let sequence = 0
    return data.messages.map((message) =>
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
      aria-label="子代理面板"
      inert={!isOpen}
      className="absolute inset-0 z-20 flex flex-col bg-[#262626] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        transform: isOpen ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.28s cubic-bezier(0.2, 0.85, 0.2, 1)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* 面板头部：Subagent 名称 + 关闭。 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="font-mono text-[13px] font-bold text-blue-300">Subagent</span>
          <span className="truncate text-[13px] text-white/70">
            {displayName !== "task" ? ` - ${displayName}(task)` : " - task"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 统计：token 用量（3 行，一行一个类型）。 */}
          {data && (
            <LxTooltip
              multiline
              placement="bottom"
              content={
                <div className="flex flex-col gap-0.5 whitespace-nowrap">
                  <span>输入 {data.usage.input} tokens</span>
                  <span>输出 {data.usage.output} tokens</span>
                  <span>总计 {data.usage.totalTokens} tokens</span>
                </div>
              }
            >
              <LxIconButton size="small" aria-label="查看统计">
                <BarChart3 className="h-3.5 w-3.5" />
              </LxIconButton>
            </LxTooltip>
          )}
          <LxIconButton
            size="small"
            aria-label="关闭子代理面板"
            title={{ content: "收起面板", placement: "bottom" }}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      </div>

      {data ? (
        <>
          {/* 子代理内部消息时间轴（只读，不隐藏消息列表）；AI 内容按 QA 组聚合到一个 AgentMessageItem。 */}
          {messages.length > 0 ? (
            <div
              ref={scrollRef}
              className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-1.5"
            >
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
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-white/35">
              子代理尚未产生内容
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-white/35">
          暂无子代理详情
        </div>
      )}
    </div>
  )
}
