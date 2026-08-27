import { describe, expect, it } from "vitest"
import { permissionManager } from "@/agent/permissions/permissionManager"

describe("Plan Mode Permission Guard", () => {
  it("should deny write/edit/apply_patch tools in plan mode", () => {
    expect(
      permissionManager.evaluate("write", { path: "src/test.ts", content: "hi" }, { collaborationMode: "plan" }),
    ).toBe("deny")

    expect(
      permissionManager.evaluate("edit", { path: "src/test.ts", oldString: "a", newString: "b" }, { collaborationMode: "plan" }),
    ).toBe("deny")

    expect(
      permissionManager.evaluate("apply_patch", { patch: "diff ..." }, { collaborationMode: "plan" }),
    ).toBe("deny")
  })

  it("should allow read-only tools in plan mode", () => {
    expect(
      permissionManager.evaluate("read", { path: "src/test.ts" }, { collaborationMode: "plan" }),
    ).toBe("allow")

    expect(
      permissionManager.evaluate("grep", { query: "test" }, { collaborationMode: "plan" }),
    ).toBe("allow")
  })
})
