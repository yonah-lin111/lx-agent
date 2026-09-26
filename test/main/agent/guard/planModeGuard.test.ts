import { describe, expect, it } from "vitest"
import { permissionManager } from "@/agent/permissions/permissionManager"

describe("Plan Mode Permission Guard", () => {
  it("should deny write/edit/apply_patch tools in plan mode", () => {
    expect(
      permissionManager.evaluate(
        "write",
        { path: "src/test.ts", content: "hi" },
        { collaborationMode: "plan" },
      ),
    ).toBe("deny")

    expect(
      permissionManager.evaluate(
        "edit",
        { path: "src/test.ts", oldString: "a", newString: "b" },
        { collaborationMode: "plan" },
      ),
    ).toBe("deny")

    expect(
      permissionManager.evaluate(
        "apply_patch",
        { patch: "diff ..." },
        { collaborationMode: "plan" },
      ),
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

  it("should deny the question tool in plan mode (grill-me uses plain-text single-question turns)", () => {
    expect(
      permissionManager.evaluate(
        "question",
        { questions: [{ question: "Pick one", options: [{ label: "A" }] }] },
        { collaborationMode: "plan" },
      ),
    ).toBe("deny")

    // build 模式保持豁免：question 永不询问、正常放行。
    expect(
      permissionManager.evaluate(
        "question",
        { questions: [{ question: "Pick one", options: [{ label: "A" }] }] },
        { collaborationMode: "build" },
      ),
    ).toBe("allow")
  })
})
