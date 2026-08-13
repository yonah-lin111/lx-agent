import { describe, expect, it } from "vitest"
import { createTodoTool } from "@/agent/tools/todowrite"

describe("todowrite 工具", () => {
  it("整表替换：返回清单摘要 + details.todos 原样回传", async () => {
    const tool = createTodoTool()
    expect(tool.name).toBe("todowrite")
    // 状态写工具：串行执行，避免同轮并发覆盖。
    expect(tool.executionMode).toBe("sequential")

    const todos = [
      { content: "读取现有配置", status: "completed" as const },
      { content: "实现 todowrite 工具", status: "in_progress" as const },
      { content: "补充单测", status: "pending" as const },
    ]
    const result = await tool.execute("tc1", { todos }, undefined, undefined)

    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("")
    expect(text).toContain("任务清单（3 项）")
    expect(text).toContain("#1 [completed] 读取现有配置")
    expect(text).toContain("#2 [in_progress] 实现 todowrite 工具")
    expect(text).toContain("#3 [pending] 补充单测")
    // details.todos 原样回传（runner 在 tool_execution_end 解析落地）。
    expect((result.details as { todos: typeof todos }).todos).toEqual(todos)
  })

  it("传空数组即清空清单", async () => {
    const tool = createTodoTool()
    const result = await tool.execute("tc2", { todos: [] }, undefined, undefined)
    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("")
    expect(text).toBe("任务清单已清空。")
    expect((result.details as { todos: unknown[] }).todos).toEqual([])
  })

  it("schema 拒绝非法状态值", () => {
    const tool = createTodoTool()
    const parsed = tool.inputSchema.safeParse({
      todos: [{ content: "非法状态", status: "doing" }],
    })
    expect(parsed.success).toBe(false)
  })
})
