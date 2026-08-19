import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

describe("terminal utils - formatTerminalPath & formatTerminalPaths", () => {
  it("无特殊字符的普通路径直接返回", async () => {
    const { formatTerminalPath } = await import("@/features/terminal/utils")
    expect(formatTerminalPath("/Users/yonah/Desktop/agent-test")).toBe(
      "/Users/yonah/Desktop/agent-test",
    )
    expect(formatTerminalPath("")).toBe("")
  })

  it("包含空格或特殊字符的路径使用双引号包裹并转义", async () => {
    const { formatTerminalPath } = await import("@/features/terminal/utils")
    expect(formatTerminalPath("/Users/yonah/Desktop/my folder/agent-test")).toBe(
      '"/Users/yonah/Desktop/my folder/agent-test"',
    )
    expect(formatTerminalPath('/Users/yonah/test "quoted"$var`cmd`\\path')).toBe(
      '"/Users/yonah/test \\"quoted\\"\\$var\\`cmd\\`\\\\path"',
    )
  })

  it("多路径格式化并以空格拼接", async () => {
    const { formatTerminalPaths } = await import("@/features/terminal/utils")
    expect(
      formatTerminalPaths([
        "/Users/yonah/Desktop/agent-test",
        "/Users/yonah/Desktop/my folder/test",
      ]),
    ).toBe('/Users/yonah/Desktop/agent-test "/Users/yonah/Desktop/my folder/test"')
    expect(formatTerminalPaths([])).toBe("")
  })
})

describe("terminal utils - extractPathsFromDataTransfer", () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = {
      api: {
        getPathForFile: vi.fn(),
      },
    }
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
  })

  it("DataTransfer 为空时返回空数组", async () => {
    const { extractPathsFromDataTransfer } = await import("@/features/terminal/utils")
    expect(extractPathsFromDataTransfer(null)).toEqual([])
  })

  it("优先从 files 与 window.api.getPathForFile 解析绝对物理路径", async () => {
    const { extractPathsFromDataTransfer } = await import("@/features/terminal/utils")
    const mockFile1 = new File(["content"], "agent-test")
    const mockFile2 = new File(["content"], "another-file.txt")

    // 模拟 window.api.getPathForFile
    ;(globalThis as { window?: { api?: { getPathForFile?: unknown } } }).window = {
      api: {
        getPathForFile: vi.fn((file: File) => {
          if (file === mockFile1) return "/Users/yonah/Desktop/agent-test"
          if (file === mockFile2) return "/Users/yonah/Desktop/another-file.txt"
          return ""
        }),
      },
    }

    const mockDataTransfer = {
      files: [mockFile1, mockFile2],
      getData: vi.fn(() => ""),
    } as unknown as DataTransfer

    const paths = extractPathsFromDataTransfer(mockDataTransfer)
    expect(paths).toEqual([
      "/Users/yonah/Desktop/agent-test",
      "/Users/yonah/Desktop/another-file.txt",
    ])
  })

  it("支持从 file.path 回退解析绝对路径", async () => {
    const { extractPathsFromDataTransfer } = await import("@/features/terminal/utils")
    const mockFile = Object.assign(new File(["content"], "agent-test"), {
      path: "/Users/yonah/Desktop/agent-test",
    })

    ;(globalThis as { window?: { api?: { getPathForFile?: unknown } } }).window = {
      api: {
        getPathForFile: undefined,
      },
    }

    const mockDataTransfer = {
      files: [mockFile],
      getData: vi.fn(() => ""),
    } as unknown as DataTransfer

    const paths = extractPathsFromDataTransfer(mockDataTransfer)
    expect(paths).toEqual(["/Users/yonah/Desktop/agent-test"])
  })

  it("支持从 text/uri-list 解析 file:// URI", async () => {
    const { extractPathsFromDataTransfer } = await import("@/features/terminal/utils")
    const mockDataTransfer = {
      files: [],
      getData: vi.fn((format: string) => {
        if (format === "text/uri-list") {
          return "# Comment\nfile:///Users/yonah/Desktop/agent%20test\nhttp://example.com"
        }
        return ""
      }),
    } as unknown as DataTransfer

    const paths = extractPathsFromDataTransfer(mockDataTransfer)
    expect(paths).toEqual(["/Users/yonah/Desktop/agent test"])
  })
})
