import { TERMINAL_CHANNELS } from "@shared/ipc/terminalChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/terminalService", () => ({
  terminalService: {
    createTerminal: vi.fn(),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    killTerminal: vi.fn(),
    getDesktopPath: vi.fn(() => "/mock/desktop"),
  },
}))

describe("terminal IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为终端领域 channel 注册全部主进程 handler", async () => {
    const { registerTerminalHandlers } = await import("@/ipc/terminalHandlers")

    registerTerminalHandlers(() => undefined)

    const expectedChannels = [
      TERMINAL_CHANNELS.create,
      TERMINAL_CHANNELS.write,
      TERMINAL_CHANNELS.resize,
      TERMINAL_CHANNELS.kill,
      TERMINAL_CHANNELS.getDesktopPath,
    ].sort()

    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(expectedChannels)
  })
})
