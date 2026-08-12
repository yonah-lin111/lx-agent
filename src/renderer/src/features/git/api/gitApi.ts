import type { GitStatus, GitWorktreeEntry } from "@shared/contracts/git"

// Git feature 对 preload API 的访问层。
export const gitApi = {
  listWorktrees: (directory: string): Promise<GitWorktreeEntry[] | null> =>
    window.api.git.listWorktrees(directory),
  getStatus: (directory: string): Promise<GitStatus | null> => window.api.git.getStatus(directory),
}
