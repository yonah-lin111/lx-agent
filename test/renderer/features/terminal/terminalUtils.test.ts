import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveInitialTerminalCwd } from "@/features/terminal/utils"

const mockList = vi.fn()
const mockListProjects = vi.fn()
const mockGetDesktopPath = vi.fn(() => Promise.resolve("/Users/mock/Desktop"))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    list: () => mockList(),
    listProjects: () => mockListProjects(),
  },
}))

vi.mock("@/features/terminal/api/terminalApi", () => ({
  terminalApi: {
    getDesktopPath: () => mockGetDesktopPath(),
  },
}))

describe("terminal utils - resolveInitialTerminalCwd", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("无 itemId 时默认回退至 Desktop", async () => {
    const cwd = await resolveInitialTerminalCwd(null)
    expect(cwd).toBe("/Users/mock/Desktop")
    expect(mockGetDesktopPath).toHaveBeenCalled()
  })

  it("条目存在 worktreePath 时优先使用 worktreePath", async () => {
    mockList.mockResolvedValue([
      {
        id: "item-1",
        projectId: "proj-1",
        worktreePath: "/repo/.worktrees/feature-a",
      },
    ])

    const cwd = await resolveInitialTerminalCwd("item-1")
    expect(cwd).toBe("/repo/.worktrees/feature-a")
    expect(mockListProjects).not.toHaveBeenCalled()
  })

  it("条目无 worktreePath 时使用所属 filesystem 项目的根目录", async () => {
    mockList.mockResolvedValue([
      {
        id: "item-2",
        projectId: "proj-2",
      },
    ])
    mockListProjects.mockResolvedValue([
      {
        id: "proj-2",
        type: "filesystem",
        path: "/projects/my-app",
      },
    ])

    const cwd = await resolveInitialTerminalCwd("item-2")
    expect(cwd).toBe("/projects/my-app")
  })

  it("项目为虚拟类型时回退至 Desktop", async () => {
    mockList.mockResolvedValue([
      {
        id: "item-3",
        projectId: "proj-3",
      },
    ])
    mockListProjects.mockResolvedValue([
      {
        id: "proj-3",
        type: "virtual",
      },
    ])

    const cwd = await resolveInitialTerminalCwd("item-3")
    expect(cwd).toBe("/Users/mock/Desktop")
  })
})

describe("terminal utils - resolveCwdDisplayName", () => {
  it("正确提取路径的末级目录名", async () => {
    const { resolveCwdDisplayName } = await import("@/features/terminal/utils")
    expect(resolveCwdDisplayName("/Users/yonah/projects/agent/lx-agent")).toBe("lx-agent")
    expect(resolveCwdDisplayName("/Users/yonah/projects/agent/lx-agent/")).toBe("lx-agent")
    expect(resolveCwdDisplayName("/repo/sub-dir")).toBe("sub-dir")
  })

  it("对根目录、空值或未定义回退兜底", async () => {
    const { resolveCwdDisplayName } = await import("@/features/terminal/utils")
    expect(resolveCwdDisplayName("/")).toBe("/")
    expect(resolveCwdDisplayName("")).toBe("~")
    expect(resolveCwdDisplayName(undefined)).toBe("~")
  })
})
