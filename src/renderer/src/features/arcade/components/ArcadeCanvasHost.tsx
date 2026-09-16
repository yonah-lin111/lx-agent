import { useEffect, useRef } from "react"
import { ARCADE_HEIGHT, ARCADE_WIDTH } from "../constants"
import { createArcadeGame } from "../games"
import type { ArcadeGameId, ArcadeInputState, ArcadePalette } from "../types"

// 游戏按键（阻止浏览器默认滚动行为）。
const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])

export interface ArcadeCanvasHostProps {
  gameId: ArcadeGameId
  // 每次重新开局 +1，强制重建游戏实例。
  runId: number
  palette: ArcadePalette
  isPaused: boolean
  onGameOver: (score: number) => void
  onPauseRequest: () => void
}

/**
 * 小游戏画布宿主：负责 RAF 循环、输入采集、暂停/失焦处理与 DPR 适配。
 */
export const ArcadeCanvasHost = ({
  gameId,
  runId,
  palette,
  isPaused,
  onGameOver,
  onPauseRequest,
}: ArcadeCanvasHostProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const paletteRef = useRef(palette)
  paletteRef.current = palette
  const isPausedRef = useRef(isPaused)
  isPausedRef.current = isPaused
  const onGameOverRef = useRef(onGameOver)
  onGameOverRef.current = onGameOver
  const onPauseRequestRef = useRef(onPauseRequest)
  onPauseRequestRef.current = onPauseRequest

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = ARCADE_WIDTH * dpr
    canvas.height = ARCADE_HEIGHT * dpr

    const game = createArcadeGame(gameId)
    const input: ArcadeInputState = { keys: new Set(), pressedKeys: new Set() }
    let finished = false
    let rafId = 0
    let lastFrameAt = performance.now()

    const toLogical = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((clientX - rect.left) / rect.width) * ARCADE_WIDTH,
        y: ((clientY - rect.top) / rect.height) * ARCADE_HEIGHT,
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // 游戏运行中由游戏层接管 ESC（暂停）；暂停后放行给弹窗关闭。
        if (!isPausedRef.current && !finished) {
          event.preventDefault()
          event.stopPropagation()
          onPauseRequestRef.current()
        }
        return
      }
      if (GAME_KEYS.has(event.code)) event.preventDefault()
      if (!input.keys.has(event.code)) input.pressedKeys.add(event.code)
      input.keys.add(event.code)
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      input.keys.delete(event.code)
    }

    const handleWindowBlur = (): void => {
      if (!finished && !isPausedRef.current) onPauseRequestRef.current()
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const point = toLogical(event.clientX, event.clientY)
      input.pressedKeys.add("Space")
      game.pointerDown?.(point.x, point.y)
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const point = toLogical(event.clientX, event.clientY)
      game.pointerMove?.(point.x, point.y)
    }

    const handlePointerUp = (event: PointerEvent): void => {
      const point = toLogical(event.clientX, event.clientY)
      game.pointerUp?.(point.x, point.y)
    }

    const frame = (now: number): void => {
      rafId = requestAnimationFrame(frame)
      const dt = Math.min(now - lastFrameAt, 50)
      lastFrameAt = now
      if (!Number.isFinite(dt) || dt <= 0) return

      if (!isPausedRef.current && !finished) {
        game.update(dt, input)
        input.pressedKeys.clear()
        if (game.isFinished()) {
          finished = true
          onGameOverRef.current(game.getScore())
        }
      } else {
        input.pressedKeys.clear()
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      game.render(ctx, paletteRef.current)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("keyup", handleKeyUp, true)
    window.addEventListener("blur", handleWindowBlur)
    canvas.addEventListener("pointerdown", handlePointerDown)
    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerup", handlePointerUp)
    canvas.addEventListener("pointercancel", handlePointerUp)
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("keyup", handleKeyUp, true)
      window.removeEventListener("blur", handleWindowBlur)
      canvas.removeEventListener("pointerdown", handlePointerDown)
      canvas.removeEventListener("pointermove", handlePointerMove)
      canvas.removeEventListener("pointerup", handlePointerUp)
      canvas.removeEventListener("pointercancel", handlePointerUp)
      game.dispose?.()
    }
  }, [gameId, runId])

  return (
    <canvas
      ref={canvasRef}
      aria-label={gameId}
      className="h-auto w-full max-w-full rounded-[var(--theme-radius-base)] bg-[var(--color-theme-bg)]"
      style={{ aspectRatio: `${ARCADE_WIDTH} / ${ARCADE_HEIGHT}` }}
    />
  )
}
