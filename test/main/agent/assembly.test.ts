import { beforeEach, describe, expect, it, vi } from "vitest"

const cpMock = vi.hoisted(() => ({ execSync: vi.fn() }))

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, execSync: cpMock.execSync }
})

import {
  clearGitEnvCache,
  collectEnvironmentVariables,
  setGitEnvCacheClock,
} from "@/agent/assembly"

// 模拟位于 worktree 的 git 仓库输出。
const mockGitRepo = (): void => {
  cpMock.execSync.mockImplementation((command: string, options: { cwd?: string } = {}) => {
    switch (command) {
      case "git rev-parse --show-toplevel":
        return `${options.cwd}\n`
      case "git rev-parse --abbrev-ref HEAD":
        return "feature/test\n"
      case "git rev-parse --git-common-dir":
        return "/repo/.git\n"
      case "git rev-parse --git-dir":
        return "/repo/.git/worktrees/wt\n"
      default:
        throw new Error(`unexpected git command: ${command}`)
    }
  })
}

describe("collectEnvironmentVariables git 短 TTL 缓存", () => {
  beforeEach(() => {
    cpMock.execSync.mockReset()
    clearGitEnvCache()
    setGitEnvCacheClock(() => Date.now())
  })

  it("首次调用执行 git 并产出变量，TTL 内复用缓存", () => {
    let now = 100_000
    setGitEnvCacheClock(() => now)
    mockGitRepo()

    const first = collectEnvironmentVariables("/repo")
    expect(first.cwd).toBe("/repo")
    expect(first.repo_root).toBe("/repo")
    expect(first.git_branch).toBe("feature/test")
    expect(first.is_worktree).toBe("true")
    expect(cpMock.execSync).toHaveBeenCalledTimes(4)

    now += 4_999
    const second = collectEnvironmentVariables("/repo")
    expect(second.repo_root).toBe("/repo")
    expect(cpMock.execSync).toHaveBeenCalledTimes(4)
  })

  it("TTL 过期后重新执行 git", () => {
    let now = 0
    setGitEnvCacheClock(() => now)
    mockGitRepo()

    collectEnvironmentVariables("/repo")
    expect(cpMock.execSync).toHaveBeenCalledTimes(4)

    now += 5_001
    collectEnvironmentVariables("/repo")
    expect(cpMock.execSync).toHaveBeenCalledTimes(8)
  })

  it("不同 cwd 缓存隔离", () => {
    mockGitRepo()

    collectEnvironmentVariables("/repo-a")
    collectEnvironmentVariables("/repo-b")
    expect(cpMock.execSync).toHaveBeenCalledTimes(8)

    collectEnvironmentVariables("/repo-a")
    expect(cpMock.execSync).toHaveBeenCalledTimes(8)
  })

  it("非 git 仓库/超时的失败结果静默跳过且被缓存", () => {
    cpMock.execSync.mockImplementation(() => {
      throw new Error("not a git repository")
    })

    const vars = collectEnvironmentVariables("/plain")
    expect(vars.cwd).toBe("/plain")
    expect(vars.repo_root).toBeUndefined()
    expect(vars.git_branch).toBeUndefined()
    expect(vars.is_worktree).toBeUndefined()
    expect(cpMock.execSync).toHaveBeenCalledTimes(3)

    collectEnvironmentVariables("/plain")
    expect(cpMock.execSync).toHaveBeenCalledTimes(3)
  })
})
