import { describe, expect, it } from "vitest"
import {
  ContextWindowGuidanceSection,
  EnvironmentStateSection,
  WorldStateManager,
} from "../../../../src/main/agent/core/worldState"

describe("WorldStateManager", () => {
  it("only renders diffs when environment state changes", () => {
    const manager = new WorldStateManager()

    const initialEnv = new EnvironmentStateSection({
      cwd: "/test/path",
      gitBranch: "main",
      isWorktree: false,
    })

    const diff1 = manager.computeDiffs([initialEnv])
    expect(diff1.length).toBe(1)
    expect(diff1[0]).toContain("Working directory: /test/path")
    expect(diff1[0]).toContain("Git branch: main")

    // Same state -> no diff
    const sameEnv = new EnvironmentStateSection({
      cwd: "/test/path",
      gitBranch: "main",
      isWorktree: false,
    })
    const diff2 = manager.computeDiffs([sameEnv])
    expect(diff2.length).toBe(0)

    // Changed state -> render diff
    const changedEnv = new EnvironmentStateSection({
      cwd: "/test/path",
      gitBranch: "feature/harness",
      isWorktree: false,
    })
    const diff3 = manager.computeDiffs([changedEnv])
    expect(diff3.length).toBe(1)
    expect(diff3[0]).toContain("Git branch: feature/harness")
  })

  it("renders context window guidance appropriately based on token usage", () => {
    const manager = new WorldStateManager()

    const nominal = new ContextWindowGuidanceSection(0.3)
    expect(manager.computeDiffs([nominal]).length).toBe(0)

    const warning = new ContextWindowGuidanceSection(0.7)
    const warningDiff = manager.computeDiffs([warning])
    expect(warningDiff.length).toBe(1)
    expect(warningDiff[0]).toContain("Context usage is above 65%")

    const critical = new ContextWindowGuidanceSection(0.9)
    const criticalDiff = manager.computeDiffs([critical])
    expect(criticalDiff.length).toBe(1)
    expect(criticalDiff[0]).toContain("CRITICAL: Context usage is above 85%")
  })
})
