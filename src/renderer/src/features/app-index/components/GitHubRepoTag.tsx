import { GITHUB_REPO_URL } from "@shared/contracts/github"
import { Github, Star } from "lucide-react"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useGitHubStars } from "@/features/app-index/hooks/useGitHubStars"
import { formatStarCount } from "@/features/app-index/utils"
import { useTranslation } from "@/i18n"

/**
 * 渲染 Hero 区的 GitHub 仓库入口：常驻可点击链接，星数就绪后随链接一同展示。
 */
export const GitHubRepoTag = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { stars } = useGitHubStars()

  return (
    <LxTooltip
      hover={{
        content:
          stars === null
            ? t("home.index.githubTip")
            : t("home.index.githubStarsTip", { count: stars.toLocaleString() }),
        placement: "top",
      }}
    >
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-center"
      >
        <LxTag
          size="small"
          className="cursor-pointer! font-mono"
          prefix={<Github className="h-3.5 w-3.5" />}
          suffix={
            stars !== null ? (
              <>
                <Star className="h-3 w-3" fill="currentColor" />
                {formatStarCount(stars)}
              </>
            ) : null
          }
        >
          GitHub
        </LxTag>
      </a>
    </LxTooltip>
  )
}
