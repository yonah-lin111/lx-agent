import type { TokenSaverRun } from "@shared/contracts/agent"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { formatTokensShort } from "./types"

export interface FlowItemTokenSaverBadgeProps {
  run: TokenSaverRun
}

/**
 * 渲染请求级 Token Saver 生效标注（RTK 工具输出压缩 / Caveman / Ponytail 风格提示词）。
 */
export const FlowItemTokenSaverBadge = ({
  run,
}: FlowItemTokenSaverBadgeProps): React.JSX.Element | null => {
  const { t } = useTranslation()

  // 标注片段：RTK 携带节省字符数，风格提示词携带档位。
  const parts: string[] = []
  const hasRtk = Boolean(run.rtkFilters && run.rtkFilters.length > 0)
  if (hasRtk) {
    parts.push(
      run.rtkSavedChars !== undefined
        ? t("agent.tokenSaverRtkBadge", { saved: formatTokensShort(run.rtkSavedChars) })
        : t("agent.tokenSaverRtk"),
    )
  }
  if (run.cavemanLevel) {
    parts.push(t("agent.tokenSaverCavemanBadge", { level: run.cavemanLevel }))
  }
  if (run.ponytailLevel) {
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
          {hasRtk && run.rtkFilters ? (
            <span>
              {t("agent.tokenSaverRtkDetail", {
                filters: run.rtkFilters.join(", "),
                saved: (run.rtkSavedChars ?? 0).toLocaleString(),
              })}
            </span>
          ) : null}
          {run.cavemanLevel ? (
            <span>{t("agent.tokenSaverCavemanDetail", { level: run.cavemanLevel })}</span>
          ) : null}
          {run.ponytailLevel ? (
            <span>{t("agent.tokenSaverPonytailDetail", { level: run.ponytailLevel })}</span>
          ) : null}
        </div>
      }
    >
      <span
        data-testid="flow-item-token-saver"
        className="inline-block min-w-0 max-w-full truncate leading-none text-white/35 select-text tabular-nums cursor-default hover:text-white/60 transition-colors"
      >
        {parts.join(" · ")}
      </span>
    </LxTooltip>
  )
}
