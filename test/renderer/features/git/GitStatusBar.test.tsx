// @vitest-environment jsdom

import type { GitWorktreeEntry } from "@shared/contracts/git"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GitStatusBar } from "@/features/git"

// jsdom 未实现 ResizeObserver / requestAnimationFrame，用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

// Mock useGitWorktrees 钩子
const mockUseGitWorktrees = vi.fn()
vi.mock("@/features/git/hooks/useGitWorktrees", () => ({
  useGitWorktrees: (projectPath: string | undefined) => mockUseGitWorktrees(projectPath),
}))

// Mock API 避免未捕获 Promise
vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    getDefaultPath: vi.fn().mockResolvedValue(""),
  },
}))

vi.mock("@/features/git/api/gitApi", () => ({
  gitApi: {
    listBranches: vi.fn().mockResolvedValue([]),
    checkoutBranch: vi.fn().mockResolvedValue({ ok: true }),
  },
}))

describe("GitStatusBar 分支与工作区隐藏规则", () => {
  beforeEach(() => {
    mockUseGitWorktrees.mockReturnValue({
      worktrees: null,
      projectBranch: null,
      reload: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe("分支项渲染与隐藏", () => {
    it("非 git 目录或无分支信息时（mainBranch 为 null），隐藏分支 bar", () => {
      mockUseGitWorktrees.mockReturnValue({
        worktrees: null,
        projectBranch: null,
        reload: vi.fn(),
      })

      const { container } = render(
        <GitStatusBar projectPath="/test/non-git-repo" interactive={true} />,
      )

      // 容器存在项目名，但没有任何分支图标与 none
      expect(container.querySelector(".lucide-git-branch")).toBeNull()
      expect(screen.queryByText("none")).toBeNull()
    })

    it("有有效分支信息时，渲染分支名", () => {
      mockUseGitWorktrees.mockReturnValue({
        worktrees: [{ path: "/test/repo", branch: "dev", isDefault: true }],
        projectBranch: "dev",
        reload: vi.fn(),
      })

      const { container } = render(<GitStatusBar projectPath="/test/repo" interactive={true} />)

      expect(container.querySelector(".lucide-git-branch")).not.toBeNull()
      expect(screen.getByText("dev")).not.toBeNull()
    })
  })

  describe("工作区项渲染与隐藏", () => {
    it("只有默认工作区且当前在主工作区时，交互模式下直接隐藏工作区 bar", () => {
      const singleDefaultWorktree: GitWorktreeEntry[] = [
        { path: "/test/repo", branch: "main", isDefault: true },
      ]
      mockUseGitWorktrees.mockReturnValue({
        worktrees: singleDefaultWorktree,
        projectBranch: "main",
        reload: vi.fn(),
      })

      const { container } = render(<GitStatusBar projectPath="/test/repo" interactive={true} />)

      // 应该隐藏 GitFork 图标，且绝不显示 "none"
      expect(container.querySelector(".lucide-git-fork")).toBeNull()
      expect(screen.queryByText("none")).toBeNull()
      // 但分支仍显示
      expect(screen.getByText("main")).not.toBeNull()
    })

    it("存在多个工作区且当前在主工作区时，交互模式下显示默认工作区以支持切换", () => {
      const multipleWorktrees: GitWorktreeEntry[] = [
        { path: "/test/repo", branch: "main", isDefault: true },
        { path: "/test/repo/.worktrees/feature-1", branch: "feature-1", isDefault: false },
      ]
      mockUseGitWorktrees.mockReturnValue({
        worktrees: multipleWorktrees,
        projectBranch: "main",
        reload: vi.fn(),
      })

      const { container } = render(<GitStatusBar projectPath="/test/repo" interactive={true} />)

      // 应该展示工作区入口供切换
      expect(container.querySelector(".lucide-git-fork")).not.toBeNull()
      // 不应显示 none，应显示默认工作区
      expect(screen.queryByText("none")).toBeNull()
    })

    it("当前处于独立工作区目录时，正常显示该工作区名称", () => {
      const multipleWorktrees: GitWorktreeEntry[] = [
        { path: "/test/repo", branch: "main", isDefault: true },
        { path: "/test/repo/.worktrees/feature-1", branch: "feature-1", isDefault: false },
      ]
      mockUseGitWorktrees.mockReturnValue({
        worktrees: multipleWorktrees,
        projectBranch: "main",
        reload: vi.fn(),
      })

      const { container } = render(
        <GitStatusBar projectPath="/test/repo/.worktrees/feature-1" interactive={true} />,
      )

      expect(container.querySelector(".lucide-git-fork")).not.toBeNull()
      expect(screen.getByText("feature-1")).not.toBeNull()
    })

    it("非交互模式下，仅当命中非默认工作区时才渲染工作区", () => {
      const singleDefaultWorktree: GitWorktreeEntry[] = [
        { path: "/test/repo", branch: "main", isDefault: true },
      ]
      mockUseGitWorktrees.mockReturnValue({
        worktrees: singleDefaultWorktree,
        projectBranch: "main",
        reload: vi.fn(),
      })

      const { container } = render(<GitStatusBar projectPath="/test/repo" interactive={false} />)

      expect(container.querySelector(".lucide-git-fork")).toBeNull()
    })
  })
})
