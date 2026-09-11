import type { SubagentSettings } from "@shared/settings"
import { describe, expect, it } from "vitest"
import {
  BUILT_IN_AGENT_ROLES,
  buildAgentTypesDescription,
  resolveAgentRoles,
} from "@/agent/subagent/agentRoles"
import { REVIEW_AGENT_SYSTEM_PROMPT } from "@/agent/subagent/reviewAgent"

const EXPLORER_TOOLS = ["read", "ls", "grep", "find", "lsp", "web_search", "webfetch", "time"]

describe("BUILT_IN_AGENT_ROLES", () => {
  it("defines exactly review, explorer, worker in fixed order", () => {
    expect(Object.keys(BUILT_IN_AGENT_ROLES)).toEqual(["review", "explorer", "worker"])
  })

  it("marks every built-in role with builtIn: true and a matching name", () => {
    for (const [key, role] of Object.entries(BUILT_IN_AGENT_ROLES)) {
      expect(role.name).toBe(key)
      expect(role.builtIn).toBe(true)
    }
  })

  it("review reuses REVIEW_AGENT_SYSTEM_PROMPT and inherits tools", () => {
    const review = BUILT_IN_AGENT_ROLES.review
    expect(review.description).toBe(
      "Strict, uncompromising review of a given change set or proposal.",
    )
    expect(review.instructions).toBe(REVIEW_AGENT_SYSTEM_PROMPT)
    expect(review.tools).toBeUndefined()
  })

  it("explorer uses the exact read-only tool whitelist", () => {
    const explorer = BUILT_IN_AGENT_ROLES.explorer
    expect(explorer.description).toBe(
      "Fast, authoritative answers to specific, well-scoped codebase questions. Use multiple explorers in parallel for independent questions.",
    )
    expect(explorer.tools).toEqual(EXPLORER_TOOLS)
    expect(explorer.instructions).toContain("You are a codebase explorer sub-agent.")
    expect(explorer.instructions).toContain("Read-only: never modify files")
  })

  it("worker inherits the parent tool set", () => {
    const worker = BUILT_IN_AGENT_ROLES.worker
    expect(worker.description).toBe(
      "Execution and production work: implement part of a feature, fix tests or bugs, split large refactors into independent chunks.",
    )
    expect(worker.tools).toBeUndefined()
    expect(worker.instructions).toContain(
      "You are a worker sub-agent focused on execution and production work.",
    )
  })
})

describe("resolveAgentRoles", () => {
  it("appends user roles after built-ins in config insertion order", () => {
    const settings: SubagentSettings = {
      roles: {
        zeta: { description: "Zeta role" },
        alpha: { description: "Alpha role" },
      },
    }

    const roles = resolveAgentRoles(settings)

    expect([...roles.keys()]).toEqual(["review", "explorer", "worker", "zeta", "alpha"])
    expect(roles.get("zeta")).toEqual({ name: "zeta", description: "Zeta role", builtIn: false })
    expect(roles.get("alpha")).toEqual({ name: "alpha", description: "Alpha role", builtIn: false })
  })

  it("preserves user role fields 1:1", () => {
    const settings: SubagentSettings = {
      roles: {
        custom: {
          description: "Custom role",
          instructions: "Do the custom thing.",
          model: { provider: "openai", model: "gpt-5", variant: "high" },
          tools: ["read", "grep"],
        },
      },
    }

    const role = resolveAgentRoles(settings).get("custom")

    expect(role).toEqual({
      name: "custom",
      description: "Custom role",
      instructions: "Do the custom thing.",
      model: { provider: "openai", model: "gpt-5", variant: "high" },
      tools: ["read", "grep"],
      builtIn: false,
    })
  })

  it("ignores reserved names and names failing the pattern", () => {
    const settings: SubagentSettings = {
      roles: {
        review: { description: "shadow attempt" },
        explorer: { description: "shadow attempt" },
        worker: { description: "shadow attempt" },
        "Bad-Name": { description: "invalid name" },
        "9bad": { description: "invalid name" },
      },
    }

    expect([...resolveAgentRoles(settings).keys()]).toEqual(["review", "explorer", "worker"])
  })

  it("keeps built-in metadata unchanged after merging", () => {
    const roles = resolveAgentRoles({ roles: {} })

    expect(roles.get("review")).toBe(BUILT_IN_AGENT_ROLES.review)
    expect(roles.get("explorer")).toBe(BUILT_IN_AGENT_ROLES.explorer)
    expect(roles.get("worker")).toBe(BUILT_IN_AGENT_ROLES.worker)
    expect(roles.get("review")?.builtIn).toBe(true)
    expect(roles.get("review")?.instructions).toBe(REVIEW_AGENT_SYSTEM_PROMPT)
  })
})

describe("buildAgentTypesDescription", () => {
  it("renders the exact block in iteration order", () => {
    const description = buildAgentTypesDescription([
      { name: "review", description: "Strict review.", builtIn: true },
      { name: "explorer", description: "Line one\n  line two", builtIn: true },
      { name: "custom", description: "", builtIn: false },
    ])

    expect(description).toBe(
      [
        "Available agent types:",
        "- review: Strict review.",
        "- explorer: Line one line two",
        "- custom: no description",
      ].join("\n"),
    )
  })

  it("accepts any iterable and keeps resolved built-ins intact", () => {
    const description = buildAgentTypesDescription(resolveAgentRoles({ roles: {} }).values())

    expect(description.split("\n")).toEqual([
      "Available agent types:",
      "- review: Strict, uncompromising review of a given change set or proposal.",
      "- explorer: Fast, authoritative answers to specific, well-scoped codebase questions. Use multiple explorers in parallel for independent questions.",
      "- worker: Execution and production work: implement part of a feature, fix tests or bugs, split large refactors into independent chunks.",
    ])
  })
})
