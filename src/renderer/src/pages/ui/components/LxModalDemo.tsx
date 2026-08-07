import type React from "react"
import { useState } from "react"

import { LxModal } from "@/components/ui/LxModal"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxModal 组件。
 */
export const LxModalDemo = (): React.JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection title="弹窗容器" description="支持遮罩关闭与 Esc 关闭">
        <UiActionButton onClick={() => setIsOpen(true)}>打开弹窗</UiActionButton>
        <LxModal isOpen={isOpen} title="示例弹窗" onClose={() => setIsOpen(false)}>
          <p className="text-xs leading-relaxed text-white/70">
            这是 LxModal 的示例内容。点击遮罩或按 Esc 可关闭弹窗。
          </p>
          <div className="mt-3 flex justify-end">
            <UiActionButton onClick={() => setIsOpen(false)}>知道了</UiActionButton>
          </div>
        </LxModal>
      </UiPreviewSection>
      <UiPreviewSection title="确认弹窗" description="标题 + 正文 + 取消/确认操作组合">
        <UiActionButton onClick={() => setIsConfirmOpen(true)}>打开确认弹窗</UiActionButton>
        <LxModal isOpen={isConfirmOpen} title="删除项目" onClose={() => setIsConfirmOpen(false)}>
          <p className="text-xs leading-relaxed text-white/70">
            确定要删除项目「LX Agent」吗？该操作将同时删除项目下的所有条目，且不可恢复。
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <UiActionButton onClick={() => setIsConfirmOpen(false)}>取消</UiActionButton>
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-[6px] border border-rose-500/20 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 transition-colors hover:border-rose-500/40 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
              onClick={() => setIsConfirmOpen(false)}
            >
              确认删除
            </button>
          </div>
        </LxModal>
      </UiPreviewSection>
    </div>
  )
}
