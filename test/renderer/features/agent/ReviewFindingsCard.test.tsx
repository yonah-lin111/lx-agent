// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ReviewFindingsCard } from "@/features/agent/components/blocks/ReviewFindingsCard"
import type { ReviewFindingsData } from "@/features/agent/types"

describe("ReviewFindingsCard", () => {
  const mockFindingsData: ReviewFindingsData = {
    summary: "发现 2 处潜在缺陷与风险",
    findings: [
      {
        id: "f1",
        title: "未转义的 SQL 注入风险",
        severity: "critical",
        location: {
          filePath: "src/db/query.ts",
          lineStart: 42,
          lineEnd: 45,
        },
        description: "直接字符串拼接用户入参，未通过占位符传参。",
        suggestion: "db.query('SELECT * FROM users WHERE id = ?', [userId])",
      },
      {
        id: "f2",
        title: "循环内存在重复的数组查找",
        severity: "medium",
        location: {
          filePath: "src/utils/calc.ts",
          lineStart: 108,
        },
        description: "O(n^2) 复杂度隐患，建议转换为 Set 进行 O(1) 查找。",
        suggestion: "const set = new Set(arr); set.has(x);",
      },
      {
        id: "f3",
        title: "未释放的资源句柄",
        severity: "low",
        location: {
          filePath: "src/io/handle.ts",
          lineStart: 12,
        },
        description: "文件流未在 finally 块中显式 close。",
      },
    ],
    raw: "<review_findings>...</review_findings>",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    window.api = {
      agent: {
        openFileAt: vi.fn(),
      },
    } as unknown as typeof window.api
  })

  it("正确渲染 ReviewFindings 概览、严重级别徽标与默认前 2 条问题列表", () => {
    render(<ReviewFindingsCard findingsData={mockFindingsData} />)

    expect(screen.getByText("未转义的 SQL 注入风险")).toBeTruthy()
    expect(screen.getByText("循环内存在重复的数组查找")).toBeTruthy()
    // 第 3 条默认折叠未渲染
    expect(screen.queryByText("未释放的资源句柄")).toBeNull()
    expect(screen.getByText("1 Critical")).toBeTruthy()
    expect(screen.getByText("1 Medium")).toBeTruthy()
  })

  it("点击省略号展开剩余卡片内容", () => {
    const { container } = render(<ReviewFindingsCard findingsData={mockFindingsData} />)

    const moreButton = container.querySelector(".review-findings-expand-toggle") as HTMLButtonElement
    expect(moreButton).toBeTruthy()
    fireEvent.click(moreButton)

    // 展开后显示第 3 条
    expect(screen.getByText("未释放的资源句柄")).toBeTruthy()
  })

  it("点击文件行链接调用 openFileAt 进行编辑器定位", () => {
    render(<ReviewFindingsCard findingsData={mockFindingsData} />)

    const links = screen.getAllByText(/src\/db\/query\.ts:42-45/)
    expect(links.length).toBeGreaterThan(0)
    fireEvent.click(links[0])

    expect(window.api.agent.openFileAt).toHaveBeenCalledWith("src/db/query.ts", 42)
  })

  it("支持单项/全选切换与一键采纳修复回调", () => {
    const onApplyFixes = vi.fn()
    render(<ReviewFindingsCard findingsData={mockFindingsData} onApplyFixes={onApplyFixes} />)

    const applyButton = screen.getByRole("button", {
      name: /采纳并修复选中项|Apply Selected Fixes/i,
    })
    fireEvent.click(applyButton)

    expect(onApplyFixes).toHaveBeenCalledWith(mockFindingsData.findings)
  })
})
