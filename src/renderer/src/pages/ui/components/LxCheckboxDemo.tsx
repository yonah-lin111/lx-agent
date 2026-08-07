import type React from "react"
import { useState } from "react"

import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxCheckbox 组件。
 */
export const LxCheckboxDemo = (): React.JSX.Element => {
  const [isChecked, setIsChecked] = useState(false)
  const [agreements, setAgreements] = useState({ beta: true, telemetry: false })

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection title="基础用法" description="受控选中状态，onChange 回传布尔值">
        <div className="flex items-center gap-3">
          <LxCheckbox checked={isChecked} onChange={setIsChecked} aria-label="基础复选框" />
          <span className="text-xs text-white/60">{isChecked ? "已选中" : "未选中"}</span>
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="多选框组" description="组合多个复选框展示表单场景">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <LxCheckbox
              checked={agreements.beta}
              onChange={(checked) => setAgreements({ ...agreements, beta: checked })}
              aria-label="参与 Beta 测试"
            />
            参与 Beta 测试
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <LxCheckbox
              checked={agreements.telemetry}
              onChange={(checked) => setAgreements({ ...agreements, telemetry: checked })}
              aria-label="允许遥测"
            />
            允许遥测
          </label>
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="禁用状态" description="disabled 时不可交互并降低透明度">
        <div className="flex items-center gap-3">
          <LxCheckbox checked disabled onChange={() => {}} aria-label="禁用且选中" />
          <LxCheckbox disabled onChange={() => {}} aria-label="禁用" />
        </div>
      </UiPreviewSection>
    </div>
  )
}
