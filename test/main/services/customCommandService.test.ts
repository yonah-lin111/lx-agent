import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CustomCommandService } from "@/services/customCommandService"

const holder = vi.hoisted(() => ({
  appDataRoot: "",
}))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getAppDataRoot: () => holder.appDataRoot,
  }
})

describe("CustomCommandService", () => {
  let tempDir: string
  let projectDir: string
  let service: CustomCommandService

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "custom-command-service-test-"))
    holder.appDataRoot = join(tempDir, ".lx")
    projectDir = join(tempDir, "workspace")
    service = new CustomCommandService()
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it("preserves leading spaces/indentation on the first line when saving custom command", () => {
    const rawContent = "  - line 1 with 2 spaces indent\n    - line 2 with 4 spaces indent\n"
    const saved = service.save({
      type: "agentInput",
      scope: "user",
      name: "myCmd",
      description: "command description",
      content: rawContent,
      argumentHint: "[foo] [bar]",
    })

    expect(saved.content).toBe("  - line 1 with 2 spaces indent\n    - line 2 with 4 spaces indent")
    expect(existsSync(saved.filePath)).toBe(true)

    const diskFile = readFileSync(saved.filePath, "utf8")
    expect(diskFile).toContain("---\ndescription: \"command description\"\nargument-hint: \"[foo] [bar]\"\n---\n\n  - line 1 with 2 spaces indent\n    - line 2 with 4 spaces indent\n")

    const list = service.list({ type: "agentInput", scope: "user" })
    const found = list.find((c) => c.name === "myCmd")
    expect(found).toBeDefined()
    expect(found?.content).toBe("  - line 1 with 2 spaces indent\n    - line 2 with 4 spaces indent")
  })

  it("handles empty and normal content without errors", () => {
    const saved = service.save({
      type: "agentMD",
      scope: "project",
      projectPath: projectDir,
      name: "mdTemplate",
      description: "md template description",
      content: "   # Header 1\nSome paragraph   \n\n",
      mdScope: "template",
    })

    expect(saved.content).toBe("   # Header 1\nSome paragraph")
    const list = service.list({ type: "agentMD", scope: "project", projectPath: projectDir })
    expect(list).toHaveLength(1)
    expect(list[0].content).toBe("   # Header 1\nSome paragraph")
    expect(list[0].mdScope).toBe("template")
  })
})
