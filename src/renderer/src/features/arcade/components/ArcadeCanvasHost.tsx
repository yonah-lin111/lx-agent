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
 * 小游戏画布宿主：负责 RAF 循环、输入采集、暂停/失焦处理与等比缩放适配。
 * 游戏统一在 960 × 600 逻辑坐标系内绘制到离屏画布，宿主再按容器尺寸等比缩放并完整显示（永不裁切）。
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

    // 逻辑画布：游戏只与世界坐标系（960 × 600）打交道，缩放全部由宿主负责。
    const logicalCanvas = document.createElement("canvas")
    logicalCanvas.width = ARCADE_WIDTH
    logicalCanvas.height = ARCADE_HEIGHT
    const logicalCtx = logicalCanvas.getContext("2d")
    if (!logicalCtx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // 等比 contain 适配：cssScale 为单个逻辑像素对应的 CSS 像素，offset 为居中留白。
    const fit = { cssScale: 1, offsetX: 0, offsetY: 0, isDirty: true }

    const syncCanvasSize = (): void => {
      fit.isDirty = false
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const cssScale = Math.min(rect.width / ARCADE_WIDTH, rect.height / ARCADE_HEIGHT)
      fit.cssScale = cssScale
      fit.offsetX = (rect.width - ARCADE_WIDTH * cssScale) / 2
      fit.offsetY = (rect.height - ARCADE_HEIGHT * cssScale) / 2

      // 位图按显示尺寸分配，保证任意缩放档位下像素密度都与屏幕一致。
      const bitmapWidth = Math.max(1, Math.round(ARCADE_WIDTH * cssScale * dpr))
      const bitmapHeight = Math.max(1, Math.round(ARCADE_HEIGHT * cssScale * dpr))
      if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth
        canvas.height = bitmapHeight
      }
    }
    syncCanvasSize()

    const game = createArcadeGame(gameId)
    const input: ArcadeInputState = { keys: new Set(), pressedKeys: new Set() }
    let finished = false
    let rafId = 0
    let lastFrameAt = performance.now()

    const toLogical = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left - fit.offsetX) / fit.cssScale,
        y: (clientY - rect.top - fit.offsetY) / fit.cssScale,
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // 游戏运行中由游戏层接管 ESC（暂停）；暂停后放行给页面层退出。
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
      if (fit.isDirty) syncCanvasSize()

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

      game.render(logicalCtx, paletteRef.current)

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = !paletteRef.current.pixel
      ctx.drawImage(logicalCanvas, 0, 0, canvas.width, canvas.height)
    }

    const resizeObserver = new ResizeObserver(() => {
      fit.isDirty = true
    })
    resizeObserver.observe(canvas)

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
      resizeObserver.disconnect()
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
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden rounded-[var(--theme-radius-base)]"
      style={{ backgroundColor: palette.background }}
    >
      <canvas ref={canvasRef} aria-label={gameId} className="h-full w-full object-contain" />
    </div>
  )
}
