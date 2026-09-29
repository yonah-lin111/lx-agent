import { memo } from "react"
import { AgentExecutionFlowItem } from "./AgentExecutionFlowItem"

// 仅比较数据 props：step 引用经 reuseExecutionSteps 稳定；回调每次渲染换新闭包，不参与比较。
export const AgentExecutionFlowItemMemo = memo(AgentExecutionFlowItem, (prev, next) => {
  return (
    prev.step === next.step &&
    prev.isExpanded === next.isExpanded &&
    prev.hasSubsequentUserMessage === next.hasSubsequentUserMessage
  )
})
