import { describe, expect, it } from "vitest"
import { applyHunksToFile, parsePatch } from "../../../../src/main/agent/tools/applyPatchParser"

describe("applyPatchParser", () => {
  it("解析包含 Add / Update / Delete 的标准 V4A 补丁", () => {
    const patch = `
*** Begin Patch
*** Add File: src/hello.ts
+export const hello = "world"
+export const value = 42

*** Update File: src/index.ts
@@ ... @@
-console.log("old")
+console.log("new")
 
*** Delete File: src/obsolete.ts
*** End Patch
`
    const parsed = parsePatch(patch)
    expect(parsed.actions).toHaveLength(3)

    expect(parsed.actions[0]).toEqual({
      type: "add",
      path: "src/hello.ts",
      content: 'export const hello = "world"\nexport const value = 42',
    })

    expect(parsed.actions[1].type).toBe("update")
    if (parsed.actions[1].type === "update") {
      expect(parsed.actions[1].path).toBe("src/index.ts")
      expect(parsed.actions[1].hunks).toHaveLength(1)
      expect(parsed.actions[1].hunks[0].oldLines).toContain('console.log("old")')
      expect(parsed.actions[1].hunks[0].newLines).toContain('console.log("new")')
    }

    expect(parsed.actions[2]).toEqual({
      type: "delete",
      path: "src/obsolete.ts",
    })
  })

  it("对畸形/空指令抛出错误", () => {
    expect(() => parsePatch("")).toThrow("补丁内容不能为空")
    expect(() => parsePatch("*** Add File:")).toThrow("Add File 路径不能为空")
    expect(() => parsePatch("*** Unknown Directive: foo")).toThrow("无法识别的补丁头部指令")
  })

  it("正确对文件应用上下文匹配与替换", () => {
    const original = `function add(a, b) {
  return a + b
}

function sub(a, b) {
  return a - b
}`

    const hunks = [
      {
        oldLines: ["function sub(a, b) {", "  return a - b", "}"],
        newLines: ["function sub(a, b) {", "  // subtract", "  return a - b", "}"],
      },
    ]

    const updated = applyHunksToFile(original, hunks, "math.js")
    expect(updated).toContain("// subtract")
  })

  it("当旧代码上下文不匹配或不唯一时报错", () => {
    const original = `foo\nfoo`
    const hunks = [
      {
        oldLines: ["foo"],
        newLines: ["bar"],
      },
    ]
    expect(() => applyHunksToFile(original, hunks, "test.txt")).toThrow("匹配不唯一")
    expect(() =>
      applyHunksToFile("hello", [{ oldLines: ["world"], newLines: ["bar"] }], "test.txt"),
    ).toThrow("无法在原文件中找到匹配")
  })

  it("hunk 内容中以 -- / ++ 开头的增删行不被当作 diff 标头丢弃", () => {
    const patch = `
*** Begin Patch
*** Update File: sample.txt
@@
 keep
---old
+++new
*** End Patch
`
    const parsed = parsePatch(patch)
    expect(parsed.actions).toHaveLength(1)
    const action = parsed.actions[0]
    if (action.type !== "update") throw new Error("expected update action")
    expect(action.hunks[0].oldLines).toEqual(["keep", "--old"])
    expect(action.hunks[0].newLines).toEqual(["keep", "++new"])
  })

  it("diff 标头对（--- 紧跟 +++ 与 @@）仍被跳过", () => {
    const patch = `
*** Begin Patch
*** Update File: sample.txt
--- a/sample.txt
+++ b/sample.txt
@@
 keep
-old
+new
*** End Patch
`
    const parsed = parsePatch(patch)
    const action = parsed.actions[0]
    if (action.type !== "update") throw new Error("expected update action")
    expect(action.hunks[0].oldLines).toEqual(["keep", "old"])
    expect(action.hunks[0].newLines).toEqual(["keep", "new"])
  })
})
