import { GITHUB_REPO_URL } from "@shared/contracts/github"
import { Github } from "lucide-react"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

/**
 * 渲染 Hero 区的 GitHub 仓库入口：常驻可点击链接。
 */
export const GitHubRepoTag = (): React.JSX.Element => {
  const { t } = useTranslation()

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
        >
          GitHub
        </LxTag>
      </a>
    </LxTooltip>
  )
}
