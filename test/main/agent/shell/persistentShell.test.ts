import { describe, expect, it, vi } from "vitest"
import {
  buildEndMarkerCommand,
  type PersistentSession,
  PersistentShellManager,
  persistentShellManager,
} from "../../../../src/main/agent/shell/persistentShell"

// 假 pty 会话：记录写入并收集数据监听器（不产生真实进程）。
const makeFakeSession = (): {
  session: PersistentSession
  writes: string[]
  emit: (data: string) => void
} => {
  const writes: string[] = []
  const listeners = new Set<(data: string) => void>()
  const session = {
    key: "fake:s",
    sessionId: "s",
    name: "fake",
    cwd: process.cwd(),
    lastUsedAt: Date.now(),
    busy: false,
    ptyProcess: {
      write: (data: string) => {
        writes.push(data)
      },
      onData: (callback: (data: string) => void) => {
        listeners.add(callback)
        return {
          dispose: () => {
            listeners.delete(callback)
          },
        }
      },
      kill: () => {},
    },
  } as unknown as PersistentSession
  const emit = (data: string): void => {
    for (const listener of [...listeners]) listener(data)
  }
  return { session, writes, emit }
}

// 假 AbortSignal：可控 aborted 状态并记录监听器增删次数。
const makeFakeSignal = (
  initiallyAborted = false,
): {
  signal: AbortSignal
  add: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  abort: () => void
} => {
  const handlers = new Set<() => void>()
  let aborted = initiallyAborted
  const add = vi.fn((_type: string, handler: () => void) => {
    handlers.add(handler)
  })
  const remove = vi.fn((_type: string, handler: () => void) => {
    handlers.delete(handler)
  })
  const signal = {
    get aborted() {
      return aborted
    },
    addEventListener: add,
    removeEventListener: remove,
  } as unknown as AbortSignal
  return {
    signal,
    add,
    remove,
    abort: () => {
      aborted = true
      for (const handler of [...handlers]) handler()
    },
  }
}

describe("PersistentShellManager", () => {
  it("连续在 session 中执行命令并保持环境变量与 cwd", async () => {
    const session = persistentShellManager.getOrCreateSession("test-s1", "env-test", process.cwd())

    const res1 = await persistentShellManager.executeCommand(
      session,
      'export MY_VAR="hello_agent"',
      10000,
    )
    expect(res1.exitCode).toBe(0)

    const res2 = await persistentShellManager.executeCommand(session, "echo $MY_VAR", 10000)
    expect(res2.exitCode).toBe(0)
    expect(res2.output).toContain("hello_agent")
  }, 20000)

  it("已中止的 signal 立即取消且不写命令", async () => {
    const manager = new PersistentShellManager()
    const { session, writes } = makeFakeSession()
    const { signal } = makeFakeSignal(true)

    await expect(manager.executeCommand(session, "echo hi", 1000, signal)).rejects.toThrow(
      "命令已中止",
    )
    expect(writes).toEqual([])
    expect(session.busy).toBe(false)
    manager.disposeAll()
  })

  it("同一 signal 复用时 abort 监听器不累积", async () => {
    const manager = new PersistentShellManager()
    const { session, writes } = makeFakeSession()
    const { signal, add, remove, abort } = makeFakeSignal()

    await expect(manager.executeCommand(session, "cmd1", 20, signal)).rejects.toThrow("超时")
    expect(add).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)

    const second = manager.executeCommand(session, "cmd2", 1000, signal)
    expect(add).toHaveBeenCalledTimes(2)
    abort()
    await expect(second).rejects.toThrow("命令已中止")
    expect(remove).toHaveBeenCalledTimes(2)
    expect(writes).toHaveLength(2)
    manager.disposeAll()
  })

  it("buildEndMarkerCommand 按平台生成可用 marker 语法", () => {
    expect(buildEndMarkerCommand("MK1", "darwin")).toBe('echo "__LX_AGENT_END_MK1__:$?"\n')
    expect(buildEndMarkerCommand("MK1", "win32")).toBe("echo __LX_AGENT_END_MK1__:%errorlevel%\r\n")
  })
})
