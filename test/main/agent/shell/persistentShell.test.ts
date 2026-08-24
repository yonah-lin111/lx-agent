import { describe, expect, it } from "vitest"
import { persistentShellManager } from "../../../../src/main/agent/shell/persistentShell"

describe("PersistentShellManager", () => {
  it("连续在 session 中执行命令并保持环境变量与 cwd", async () => {
    const session = persistentShellManager.getOrCreateSession("test-s1", "env-test", process.cwd())

    const res1 = await persistentShellManager.executeCommand(
      session,
      'export MY_VAR="hello_codex"',
      10000,
    )
    expect(res1.exitCode).toBe(0)

    const res2 = await persistentShellManager.executeCommand(session, "echo $MY_VAR", 10000)
    expect(res2.exitCode).toBe(0)
    expect(res2.output).toContain("hello_codex")
  })
})
