// @vitest-environment jsdom

import type { PermissionRequest } from "@shared/contracts/agent"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentStatusBar } from "@/features/agent"

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

const mockGitStatusBar = vi.fn()
// Mock GitStatusBar 避免依赖 gitApi 与 Electron IPC。
vi.mock("@/features/git", () => ({
  GitStatusBar: (props: Record<string, unknown>) => {
    mockGitStatusBar(props)
    return <div data-testid="mock-git-status-bar">{(props.projectPath as string) ?? "no-path"}</div>
  },
}))

describe("AgentStatusBar", () => {
  afterEach(cleanup)

  it("正常渲染基础状态栏结构，且不包含任何 todo 相关元素与文案", () => {
    const { container } = render(
      <AgentStatusBar
        projectPath="/test/project"
        projectId="p1"
        collaborationMode="build"
        jobs={[]}
        pendingRequest={null}
        onPermissionRespond={vi.fn()}
      />,
    )

    // 验证状态栏根容器与 GitStatusBar 存在
    expect(container.querySelector(".agent-status-bar")).not.toBeNull()
    expect(screen.getByTestId("mock-git-status-bar")).not.toBeNull()
    expect(screen.getByText("/test/project")).not.toBeNull()

    // 验证协作模式按钮存在
    expect(screen.getByText("Build")).not.toBeNull()

    // 核心断言：验证 todo 按钮、图标及相关元素不存在
    expect(container.querySelector(".lucide-list-todo")).toBeNull()
    expect(container.querySelector("[aria-label*='todo' i]")).toBeNull()
    expect(container.querySelector("[aria-label*='待办']")).toBeNull()
    expect(container.querySelector("[aria-label*='任务清单']")).toBeNull()
    expect(screen.queryByText(/todo/i)).toBeNull()
    expect(screen.queryByText(/任务清单/i)).toBeNull()
  })

  it("渲染后台任务与权限请求时，依然不出现 todo 组件", () => {
    const mockRequest: PermissionRequest = {
      requestId: "req-1",
      toolName: "bash",
      args: { command: "npm test" },
      summary: "Run test",
      mode: "build",
      sessionId: "sess-1",
    }

    const { container } = render(
      <AgentStatusBar
        projectPath="/test/project"
        collaborationMode="plan"
        jobs={[
          {
            id: "job-1",
            toolName: "test-job",
            command: "echo 1",
            status: "running",
            startTime: Date.now(),
          },
        ]}
        pendingRequest={mockRequest}
        onPermissionRespond={vi.fn()}
      />,
    )

    expect(screen.getByText("Plan")).not.toBeNull()
    expect(screen.getByText("bash")).not.toBeNull()

    // 再次断言不包含 todo 任何元素
    expect(container.querySelector(".lucide-list-todo")).toBeNull()
    expect(container.querySelector("[aria-label*='todo' i]")).toBeNull()
    expect(container.querySelector("[aria-label*='任务清单']")).toBeNull()
    expect(screen.queryByText(/todo/i)).toBeNull()
    expect(screen.queryByText(/任务清单/i)).toBeNull()
  })

  it("渲染 GitStatusBar 时不传递 alwaysShowWorktree={true}", () => {
    mockGitStatusBar.mockClear()
    render(
      <AgentStatusBar
        projectPath="/test/project"
        projectId="p1"
        pendingRequest={null}
        onPermissionRespond={vi.fn()}
      />,
    )

    expect(mockGitStatusBar).toHaveBeenCalledTimes(1)
    const passedProps = mockGitStatusBar.mock.calls[0]?.[0] as Record<string, unknown>
    expect(passedProps.alwaysShowWorktree).toBeUndefined()
    expect(passedProps.interactive).toBe(true)
  })
})
