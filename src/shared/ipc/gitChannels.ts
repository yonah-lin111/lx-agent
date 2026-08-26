// Git 领域 IPC channel。
export const GIT_CHANNELS = {
  getStatus: "git:getStatus",
  listWorktrees: "git:listWorktrees",
  listBranches: "git:listBranches",
  checkoutBranch: "git:checkoutBranch",
} as const
