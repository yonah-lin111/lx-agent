// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GitStatusBar } from "@/features/git/components/GitStatusBar"
import { projectApi } from "@/features/project/api/projectApi"

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn(),
  },
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    getDefaultPath: vi.fn().mockResolvedValue("/desktop"),
  },
}))

vi.mock("@/features/git/api/gitApi", () => ({
  gitApi: {
    listBranches: vi.fn().mockResolvedValue([]),
    checkoutBranch: vi.fn(),
  },
}))

vi.mock("@/features/git/hooks/useGitWorktrees", () => ({
  useGitWorktrees: () => ({
    worktrees: [],
    projectBranch: "main",
    reload: vi.fn(),
  }),
}))

describe("GitStatusBar unimported styling", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("当项目为未导入状态时渲染 data-unimported 属性与灰色文本，且不渲染状态圆点", async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue([
      {
        id: "p1",
        name: "Unimported Repo",
        path: "/custom/path",
        type: "folder",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
        isImported: false,
      },
    ])

    const { container } = render(
      <GitStatusBar projectPath="/custom/path" interactive={true} isImported={false} />,
    )

    const item = container.querySelector('[data-unimported="true"]')
    expect(item).not.toBeNull()
    expect(item?.className).toContain("text-white/40")
    const dot = item?.querySelector(".rounded-full")
    expect(dot).toBeNull()
  })

  it("当项目为已导入状态时不渲染 data-unimported", async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue([
      {
        id: "p2",
        name: "Imported Repo",
        path: "/imported/path",
        type: "folder",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
        isImported: true,
      },
    ])

    const { container } = render(
      <GitStatusBar projectPath="/imported/path" interactive={true} isImported={true} />,
    )

    const item = container.querySelector('[data-unimported="true"]')
    expect(item).toBeNull()
  })
})
