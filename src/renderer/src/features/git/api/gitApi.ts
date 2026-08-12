import type { GitStatus } from "@shared/contracts/git"

// Git feature 对 preload API 的访问层。
export const gitApi = {
  getStatus: (directory: string): Promise<GitStatus | null> => window.api.git.getStatus(directory),
}
