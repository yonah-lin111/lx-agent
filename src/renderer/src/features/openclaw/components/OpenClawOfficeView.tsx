import type React from "react"
import { useEffect, useRef } from "react"
import { useTranslation } from "@/i18n"
import type { OfficeAgentStatus } from "../agentStatus"
import { OfficeScene, type OfficeSceneAgent } from "../office/officeScene"

export interface OpenClawOfficeViewProps {
  agents: OfficeSceneAgent[]
  statuses: Record<string, OfficeAgentStatus>
  selectedAgentIds: string[]
  onSelectAgent: (agentId: string, additive: boolean) => void
}

/**
 * 工作区模式视图：承载程序化像素办公室画布（PixiJS），点选员工切换扇出目标。
 */
export const OpenClawOfficeView = ({
  agents,
  statuses,
  selectedAgentIds,
  onSelectAgent,
}: OpenClawOfficeViewProps): React.JSX.Element => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<OfficeScene | null>(null)

  // 选择回调保持最新，避免重建场景。
  const selectRef = useRef(onSelectAgent)
  selectRef.current = onSelectAgent

  // 场景创建是异步的：把最新 props 暂存，创建完成后立即回填，避免首帧丢失数据。
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  const selectionRef = useRef(selectedAgentIds)
  selectionRef.current = selectedAgentIds

  // 场景生命周期：创建一次，卸载时销毁。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let scene: OfficeScene | null = null
    let observer: ResizeObserver | null = null

    void OfficeScene.create({
      agents: [],
      statuses: {},
      selectedAgentIds: [],
      onSelectAgent: (agentId, additive) => selectRef.current(agentId, additive),
    })
      .then((created) => {
        if (disposed) {
          created.destroy()
          return
        }
        scene = created
        sceneRef.current = created
        container.appendChild(created.canvas)
        created.setAgents(agentsRef.current)
        created.setStatuses(statusesRef.current)
        created.setSelection(selectionRef.current)
        created.resize(container.clientWidth, container.clientHeight)
        observer = new ResizeObserver(() => {
          scene?.resize(container.clientWidth, container.clientHeight)
        })
        observer.observe(container)
      })
      .catch((error) => {
        console.error("[OpenClawOfficeView] Failed to initialize office scene:", error)
      })

    return () => {
      disposed = true
      observer?.disconnect()
      sceneRef.current = null
      scene?.destroy()
    }
  }, [])

  // 员工集合变化。
  useEffect(() => {
    sceneRef.current?.setAgents(agents)
  }, [agents])

  // 状态变化。
  useEffect(() => {
    sceneRef.current?.setStatuses(statuses)
  }, [statuses])

  // 选中集合变化。
  useEffect(() => {
    sceneRef.current?.setSelection(selectedAgentIds)
  }, [selectedAgentIds])

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden">
      <div ref={containerRef} className="h-full w-full min-h-0 flex-1 overflow-hidden" />
      {agents.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-[6px] border border-white/8 bg-black/40 px-3 py-2 text-xs text-white/60">
            {t("openclaw.officeEmpty")}
          </p>
        </div>
      ) : null}
      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-white/40">
        {t("openclaw.officeHint")}
      </p>
    </div>
  )
}
