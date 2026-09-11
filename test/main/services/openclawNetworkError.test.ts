// @vitest-environment node
import { describe, expect, it } from "vitest"
import { openClawClientManager } from "@/services/openclaw/openclawClientManager"

describe("openclawClientManager connect error handling", () => {
  it("处理不可达的远程 Gateway 时返回友好格式化错误而不是抛出未捕获原生 Socket 异常", async () => {
    // 尝试连接一个不可达的虚拟实例（触发配置检查或连接错误处理）
    const result = await openClawClientManager.connect("non-existent-instance-id")
    expect(result.status).toBe("error")
    expect(result.error).toContain("OpenClaw instance not found or disabled")
  })
})
