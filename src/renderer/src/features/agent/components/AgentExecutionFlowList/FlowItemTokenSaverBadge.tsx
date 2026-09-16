import type { TokenSaverHit, TokenSaverRun } from "@shared/contracts/agent"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { formatTokensShort } from "./types"

export interface FlowItemTokenSaverBadgeProps {
  // 单条工具输出的 RTK 命中记录（工具步骤专用）。
  hit?: TokenSaverHit
  // 请求级生效记录（回复步骤专用，仅展示输出风格提示词）。
  run?: TokenSaverRun
}

// 标注基础样式。
const BADGE_CLASS =
  "inline-block min-w-0 max-w-full truncate leading-none text-white/35 select-text tabular-nums cursor-default hover:text-white/60 transition-colors"

/**
 * 渲染 Token Saver 生效标注：工具步骤展示 RTK 压缩命中，回复步骤展示输出风格提示词。
 */
export const FlowItemTokenSaverBadge = ({
  hit,
  run,
}: FlowItemTokenSaverBadgeProps): React.JSX.Element | null => {
  const { t } = useTranslation()

  // 工具级：只展示该条输出的压缩收益。
  if (hit) {
    return (
      <LxTooltip
        placement="top"
        className="min-w-0 max-w-full"
        content={
          <div className="flex flex-col gap-0.5 font-mono text-xs">
            <div className="border-b border-white/10 pb-0.5 text-white/60">
              {t("agent.tokenSaverTitle")}
            </div>
            <span>
              {t("agent.tokenSaverRtkDetail", {
                filters: hit.filter,
                saved: hit.savedChars.toLocaleString(),
              })}
            </span>
          </div>
        }
      >
        <span data-testid="flow-item-token-saver" className={BADGE_CLASS}>
          {t("agent.tokenSaverRtkBadge", { saved: formatTokensShort(hit.savedChars) })}
        </span>
      </LxTooltip>
    )
  }

  // 请求级：风格提示词档位（RTK 已在工具步骤归因，此处不重复）。
  const parts: string[] = []
  if (run?.cavemanLevel) {
    parts.push(t("agent.tokenSaverCavemanBadge", { level: run.cavemanLevel }))
  }
  if (run?.ponytailLevel) {
    parts.push(t("agent.tokenSaverPonytailBadge", { level: run.ponytailLevel }))
  }
  if (parts.length === 0) return null

  return (
    <LxTooltip
      placement="top"
      className="min-w-0 max-w-full"
      content={
        <div className="flex flex-col gap-0.5 font-mono text-xs">
          <div className="border-b border-white/10 pb-0.5 text-white/60">
            {t("agent.tokenSaverTitle")}
          </div>
          {run?.cavemanLevel ? (
            <span>{t("agent.tokenSaverCavemanDetail", { level: run.cavemanLevel })}</span>
          ) : null}
          {run?.ponytailLevel ? (
            <span>{t("agent.tokenSaverPonytailDetail", { level: run.ponytailLevel })}</span>
          ) : null}
        </div>
      }
    >
      <span data-testid="flow-item-token-saver" className={BADGE_CLASS}>
        {parts.join(" · ")}
      </span>
    </LxTooltip>
  )
}
