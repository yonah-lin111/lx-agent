import { History } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
import type { AgentHistoryPromptItem } from "../types"
import { panelClassName } from "../utils"

export interface AgentInputHistoryPromptPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  prompts: AgentHistoryPromptItem[]
  activeIndex: number
  onSelect?: (item: AgentHistoryPromptItem) => void
}

/**
 * 渲染 Agent 输入框的历史提示词选择面板（/historyPrompt 触发）。
 * item 结构对齐 Markdown 变量菜单：图标 + 首行标题 + 单行预览 + tag，激活项展开全文。
 */
export const AgentInputHistoryPromptPanel = ({
  isOpen,
  position,
  prompts,
  activeIndex,
  onSelect,
}: AgentInputHistoryPromptPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && prompts.length > 0 ? { position, activeIndex, prompts } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.historyPromptSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.prompts.map((item, index) => {
            const isActive = index === displayData.activeIndex
            const [firstLine = "", ...restLines] = item.text.split("\n")
            const title = firstLine.trim() || item.text.trim()
            const preview = restLines.join(" ").replace(/\s+/g, " ").trim()

            return (
              <LxCommandPanelItem
                key={item.id}
                active={isActive}
                className="group relative flex min-h-11 flex-col justify-center px-2 py-1"
                index={index}
                onSelect={() => onSelect?.(item)}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-white/5 text-white/70">
                    <History className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm leading-none text-white">
                    {title}
                  </span>
                  {preview && (
                    <span className="min-w-0 flex-1 truncate font-mono text-xs leading-none text-white/45">
                      {preview}
                    </span>
                  )}
                  <LxTag
                    bgClass="bg-white/10 text-white/50"
                    className="pointer-events-none shrink-0 font-mono tabular-nums"
                    size="small"
                  >
                    {displayData.prompts.length - index}
                  </LxTag>
                </div>
                {isActive && (
                  <div className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded border border-white/5 bg-black/20 p-1.5 font-mono text-xs text-white/60">
                    {item.text}
                  </div>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
