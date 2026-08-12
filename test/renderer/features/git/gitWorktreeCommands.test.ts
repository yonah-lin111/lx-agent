import type { GitWorktreeEntry } from "@shared/contracts/git"
import { describe, expect, it } from "vitest"
import {
  buildGitWorktreeOptions,
  getGitWorktreeDirName,
  getGitWorktreeDisplayName,
  resolveGitWorktreeTarget,
} from "@/features/git"

// 主工作区 + 关联工作区样例。
const worktrees: GitWorktreeEntry[] = [
  { path: "/repo", branch: "dev", isDefault: true },
  { path: "/repo/.worktrees/feature-x", branch: "feature-x", isDefault: false },
  { path: "/repo/.worktrees/detached", branch: null, isDefault: false },
]

describe("git 工作区命令", () => {
  it("目录名取路径末段", () => {
    expect(getGitWorktreeDirName("/repo/.worktrees/feature-x")).toBe("feature-x")
    expect(getGitWorktreeDirName("/repo")).toBe("repo")
    expect(getGitWorktreeDirName("/a/b/")).toBe("b")
  })

  it("显示名优先分支名，detached 退化目录名", () => {
    expect(getGitWorktreeDisplayName({ path: "/repo", branch: "dev" })).toBe("dev")
    expect(getGitWorktreeDisplayName({ path: "/repo/.worktrees/detached", branch: null })).toBe(
      "detached",
    )
  })

  it("构建选项：默认工作区置顶，其余工作区按分支标识，当前绑定高亮", () => {
    const options = buildGitWorktreeOptions({
      worktrees,
      projectPath: "/repo",
      projectBranch: "dev",
    })
    expect(options).toEqual([
      { name: "dev", path: "/repo", branch: "dev", isDefault: true, isCurrent: true },
      {
        name: "feature-x",
        path: "/repo/.worktrees/feature-x",
        branch: "feature-x",
        isDefault: false,
        isCurrent: false,
      },
      {
        name: "detached",
        path: "/repo/.worktrees/detached",
        branch: null,
        isDefault: false,
        isCurrent: false,
      },
    ])
  })

  it("绑定到非默认工作区时，默认工作区不再高亮", () => {
    const options = buildGitWorktreeOptions({
      worktrees,
      projectPath: "/repo",
      projectBranch: "dev",
      worktreePath: "/repo/.worktrees/feature-x",
    })
    expect(options[0]?.isCurrent).toBe(false)
    expect(options[1]?.isCurrent).toBe(true)
  })

  it("解析目标：分支名命中工作区，默认工作区按项目分支识别", () => {
    expect(resolveGitWorktreeTarget("feature-x", worktrees, "/repo")).toEqual({
      path: "/repo/.worktrees/feature-x",
      isDefault: false,
      isDetached: false,
    })
    // 项目当前分支 → 默认工作区。
    expect(resolveGitWorktreeTarget("dev", worktrees, "/repo", "dev")).toEqual({
      path: "/repo",
      isDefault: true,
      isDetached: false,
    })
    // detached 工作区按目录名解析。
    expect(resolveGitWorktreeTarget("detached", worktrees, "/repo")).toEqual({
      path: "/repo/.worktrees/detached",
      isDefault: false,
      isDetached: true,
    })
  })

  it("解析目标：空值或匹配不到返回 null", () => {
    expect(resolveGitWorktreeTarget("", worktrees, "/repo")).toBeNull()
    expect(resolveGitWorktreeTarget("no-such", worktrees, "/repo")).toBeNull()
    expect(resolveGitWorktreeTarget("feature-x", null, "/repo")).toBeNull()
  })
})
