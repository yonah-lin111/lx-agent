import { describe, expect, it } from "vitest"
import { CLI_DEFINITIONS, getCliVersions, probeSingleCli } from "@/services/cliToolService"

describe("cliToolService", () => {
  it("CLI_DEFINITIONS 包含 6 种 AI CLI 工具定义", () => {
    const ids = Object.keys(CLI_DEFINITIONS)
    expect(ids).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "agy",
      "grok",
    ])
  })

  it("getCliVersions 返回所有支持工具的状态与元数据", async () => {
    const versions = await getCliVersions({ force: true })
    expect(versions).toHaveLength(6)



    for (const v of versions) {
      expect(v).toHaveProperty("id")
      expect(v).toHaveProperty("name")
      expect(v).toHaveProperty("displayName")
      expect(v).toHaveProperty("installed")
      expect(typeof v.installed).toBe("boolean")
    }
  })

  it("probeSingleCli 能正确处理不存在的工具并安全返回未安装状态", async () => {
    const result = await probeSingleCli(
      {
        id: "claude",
        name: "non-existent-tool-xyz-12345",
        displayName: "Test Tool",
        command: "non-existent-tool-xyz-12345",
        binaryCandidates: ["non-existent-tool-xyz-12345"],
        homepage: "https://example.com",
        installCommand: "npm i -g non-existent-tool-xyz-12345",
        updateCommand: "npm i -g non-existent-tool-xyz-12345",
      },
      "",
    )


    expect(result.installed).toBe(false)
    expect(result.version).toBeNull()
  })
})

