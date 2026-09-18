import { GITHUB_REPO_URL } from "@shared/contracts/github"
import { Github, Star } from "lucide-react"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { formatStarCount } from "../utils"

export interface GitHubStarTagProps {
  // 仓库星标数；尚未取得或请求失败时为 null（仅隐藏数字）。
  stars: number | null
}

/**
 * 渲染 Hero 区的 GitHub 仓库入口：常驻可点击链接，星数就绪后按当前语言紧凑展示。
 */
export const GitHubStarTag = ({ stars }: GitHubStarTagProps): React.JSX.Element => {
  const { locale, t } = useTranslation()

  return (
    <LxTooltip hover={{ content: t("home.index.githubTip"), placement: "top" }}>
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
                {formatStarCount(stars, locale)}
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
