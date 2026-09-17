import type { UpdateNotice } from "@/features/update"
import { useTranslation } from "@/i18n"

export interface UpdateNoticeBannerProps {
  notice: UpdateNotice
}

/**
 * 渲染首页更新提醒横幅：有新版本时展示版本对比与下载入口，可本次会话内忽略。
 */
export const UpdateNoticeBanner = ({
  notice,
}: UpdateNoticeBannerProps): React.JSX.Element | null => {
  const { t } = useTranslation()

  if (!notice.hasUpdate || notice.isDismissed || !notice.latestVersion) return null

  return (
    <div className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-[6px] border border-[var(--color-theme-accent)]/45 bg-[var(--color-theme-surface-hover)] px-3 py-2">
      <span className="min-w-0 truncate text-xs text-[var(--color-theme-text)]">
        {t("home.index.updateAvailable", {
          version: notice.latestVersion,
          current: notice.currentVersion,
        })}
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs">
        {notice.releaseUrl ? (
          <a
            href={notice.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-theme-accent)] underline-offset-2 hover:underline"
          >
            {t("home.index.updateDownload")}
          </a>
        ) : null}
        <button
          type="button"
          className="text-[var(--color-theme-text-muted)] underline-offset-2 hover:underline"
          onClick={notice.dismiss}
        >
          {t("home.index.updateDismiss")}
        </button>
      </span>
    </div>
  )
}
