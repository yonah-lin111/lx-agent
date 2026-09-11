import { dispatchHooks, type HookDispatchContext } from "./dispatcher"
import { hookConfig } from "./hookConfig"
import type { HookDispatchInput, HookDispatchResult, LoadedHook } from "./types"

/**
 * 钩子体系入口：会话级配置缓存 + 串行派发。
 * 调用点只依赖 dispatch 与效果合并辅助函数，不感知子进程细节。
 */
class HooksManager {
  // 会话作用域配置（无热重载：配置变更仅对新会话生效）。
  getHooks(sessionId?: string | null): LoadedHook[] {
    return hookConfig.get(sessionId ?? "global")
  }

  // 清空缓存（会话销毁/测试）。
  reset(sessionId?: string | null): void {
    hookConfig.reset(sessionId === undefined ? undefined : (sessionId ?? "global"))
  }

  async dispatch(input: HookDispatchInput): Promise<HookDispatchResult> {
    const hooks = this.getHooks(input.sessionId)
    if (hooks.length === 0) return { runs: [] }
    const context: HookDispatchContext = {
      event: input.event,
      sessionId: input.sessionId,
      turnId: input.turnId,
      cwd: input.cwd ?? process.cwd(),
      model: input.model,
      permissionMode: input.permissionMode,
      toolName: input.toolName,
      payload: input.payload,
    }
    return dispatchHooks(hooks, context)
  }

  // best-effort 派发（SessionEnd：超时不等待，绝不阻断退出）。
  async dispatchBestEffort(input: HookDispatchInput, timeoutMs = 3000): Promise<void> {
    let timer: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        this.dispatch(input),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
          timer.unref?.()
        }),
      ])
    } catch {
      // 退出路径静默。
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

export const hooksManager = new HooksManager()
