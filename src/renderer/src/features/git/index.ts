// Git 领域能力：状态栏（GitStatusBar/useGitStatus）与工作区切换（useGitWorktrees/命令菜单）。

export { GitStatusBar } from "./components/GitStatusBar"
export { GitWorktreeCommandMenu } from "./components/GitWorktreeCommandMenu"
export { useGitStatus } from "./hooks/useGitStatus"
export { useGitWorktrees } from "./hooks/useGitWorktrees"
export type { GitWorktreeOption, GitWorktreeTarget } from "./utils"
export {
  buildGitWorktreeOptions,
  getGitWorktreeDirName,
  getGitWorktreeDisplayName,
  resolveGitWorktreeTarget,
} from "./utils"
