import { GAME_PROTOCOL, type GameRomEntry } from "@shared/contracts/game"
import { ArrowLeft, Gamepad2, RotateCcw } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { useLxToast } from "@/components/ui/LxToast"
import { gameApi } from "@/features/game/api/gameApi"
import { useTranslation } from "@/i18n"

// guest → host 的上报通道与 host → guest 的下发通道（与 guest-preload.cjs 保持一致）。
const GUEST_CHANNEL = "lx-game-guest"
const HOST_CHANNEL = "lx-game-host"

// 退出前等待存档 flush 回执的上限。
const FLUSH_TIMEOUT_MS = 1500

// webview 元素的最小方法接口（send 为 Electron 注入）。
interface WebviewElement extends HTMLElement {
  send: (channel: string, ...args: unknown[]) => void
}

// guest 上报消息。
interface GameGuestMessage {
  type: "ready" | "started" | "save" | "save-restored" | "escape" | "flushed" | "error"
  data?: unknown
  message?: string
}

type StageStatus = "loading" | "running" | "error"

export interface GameStageProps {
  entry: GameRomEntry
  onExit: () => void
}

/**
 * 整页模拟器视图：webview 加载自托管 EmulatorJS 宿主页，经 preload 桥回传存档与退出信号。
 *
 * 退出流程：先请求 guest flush SRAM（收到 flushed 回执或 1.5s 超时）再卸载 webview。
 */
export const GameStage = ({ entry, onExit }: GameStageProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const { error: errorToast } = useLxToast()

  const webviewRef = useRef<WebviewElement | null>(null)
  const flushResolverRef = useRef<(() => void) | null>(null)
  const isExitingRef = useRef(false)

  const [preloadUrl, setPreloadUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<StageStatus>("loading")
  const [runId, setRunId] = useState(0)

  // 预加载脚本路径由主进程按 dev / 打包两种目录解析。
  useEffect(() => {
    let isCurrent = true
    gameApi
      .getRuntimeConfig()
      .then((config) => {
        if (isCurrent) setPreloadUrl(config.guestPreloadUrl)
      })
      .catch(() => {
        if (isCurrent) setStatus("error")
      })
    return () => {
      isCurrent = false
    }
  }, [])

  const src = useMemo(() => {
    const lang = locale === "zh" ? "zh-CN" : "en-US"
    const accent =
      typeof window === "undefined"
        ? ""
        : getComputedStyle(document.documentElement).getPropertyValue("--color-theme-accent").trim()
    const params = new URLSearchParams({
      entry: String(entry.id),
      lang,
      color: accent || "#38bdf8",
    })
    return `${GAME_PROTOCOL}://emulator/wrapper.html?${params.toString()}`
  }, [entry.id, locale])

  const requestExit = useCallback((): void => {
    if (isExitingRef.current) return
    isExitingRef.current = true

    const webview = webviewRef.current
    const finish = (): void => {
      onExit()
    }
    if (!webview || status === "error") {
      finish()
      return
    }

    const timeoutId = window.setTimeout(() => {
      flushResolverRef.current = null
      finish()
    }, FLUSH_TIMEOUT_MS)
    flushResolverRef.current = () => {
      window.clearTimeout(timeoutId)
      finish()
    }

    try {
      webview.send(HOST_CHANNEL, { type: "flush" })
    } catch {
      window.clearTimeout(timeoutId)
      flushResolverRef.current = null
      finish()
    }
  }, [onExit, status])

  // 消息回调经 ref 转发，避免 status 变化重建 webview 监听。
  const requestExitRef = useRef(requestExit)
  useEffect(() => {
    requestExitRef.current = requestExit
  }, [requestExit])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleIpcMessage = (event: Event): void => {
      const message = event as unknown as { channel?: string; args?: unknown[] }
      if (message.channel !== GUEST_CHANNEL) return
      const payload = message.args?.[0] as GameGuestMessage | undefined
      if (!payload || typeof payload !== "object") return

      switch (payload.type) {
        case "started":
          setStatus("running")
          void gameApi.markPlayed(entry.id).catch(() => undefined)
          break
        case "save":
          if (payload.data instanceof Uint8Array) {
            void gameApi
              .writeSave(entry.id, payload.data)
              .catch(() => errorToast(t("game.error.saveFailed")))
          }
          break
        case "escape":
          requestExitRef.current()
          break
        case "flushed":
          flushResolverRef.current?.()
          flushResolverRef.current = null
          break
        case "error":
          setStatus("error")
          break
        default:
          break
      }
    }

    const handleFailed = (event: Event): void => {
      const failure = event as unknown as { isMainFrame?: boolean }
      if (failure.isMainFrame === false) return
      setStatus("error")
    }

    webview.addEventListener("ipc-message", handleIpcMessage)
    webview.addEventListener("did-fail-load", handleFailed)
    webview.addEventListener("render-process-gone", handleFailed)
    return () => {
      webview.removeEventListener("ipc-message", handleIpcMessage)
      webview.removeEventListener("did-fail-load", handleFailed)
      webview.removeEventListener("render-process-gone", handleFailed)

      // 卸载兜底（例如切换主页视图）：请求 guest 立即 flush，并以一次性监听器把 SRAM 落盘。
      const handleLastSave = (event: Event): void => {
        const message = event as unknown as { channel?: string; args?: unknown[] }
        if (message.channel !== GUEST_CHANNEL) return
        const payload = message.args?.[0] as GameGuestMessage | undefined
        if (payload?.type === "save" && payload.data instanceof Uint8Array) {
          void gameApi.writeSave(entry.id, payload.data).catch(() => undefined)
        }
      }
      webview.addEventListener("ipc-message", handleLastSave)
      try {
        webview.send(HOST_CHANNEL, { type: "flush" })
      } catch {
        webview.removeEventListener("ipc-message", handleLastSave)
      }
    }
  }, [entry.id, errorToast, preloadUrl, runId, t])

  const handleRetry = (): void => {
    setStatus("loading")
    setRunId((current) => current + 1)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <LxIconButton
          size="small"
          aria-label={t("game.stage.back")}
          title={{ content: t("game.stage.back"), placement: "bottom" }}
          onClick={requestExit}
        >
          <ArrowLeft />
        </LxIconButton>
        <Gamepad2 className="h-4 w-4 shrink-0 text-emerald-400" />
        <span className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
          {entry.title}
        </span>
        <span className="ml-auto shrink-0 font-mono text-xs text-[var(--color-theme-text-subtle)]">
          {t("game.stage.exitHint")}
        </span>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-black">
        {preloadUrl ? (
          <webview
            key={`${entry.id}-${runId}`}
            ref={(node) => {
              webviewRef.current = node as WebviewElement | null
            }}
            src={src}
            preload={preloadUrl}
            partition="persist:lx-game"
            className="h-full w-full"
          />
        ) : null}

        <LxLoadingOverlay
          isLoading={status === "loading"}
          text={t("game.stage.loading")}
          rounded="rounded-[var(--theme-radius-base)]"
        />

        {status === "error" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <span className="text-sm text-white/80">{t("game.stage.error")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
                onClick={handleRetry}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("game.stage.retry")}
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-[6px] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                onClick={requestExit}
              >
                {t("game.stage.back")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
