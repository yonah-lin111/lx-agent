import type React from "react"
import { useState } from "react"

import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxRadio / LxRadioGroup 组件。
 */
export const LxRadioDemo = (): React.JSX.Element => {
  const [value, setValue] = useState("option-a")
  const [themeValue, setThemeValue] = useState("dark")

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection title="纵向单选组" description="LxRadioGroup 为单选项提供统一受控状态">
        <div className="flex flex-col gap-1">
          <LxRadioGroup name="preview-radio" value={value} onChange={setValue}>
            <LxRadio value="option-a" label="选项 A" />
            <LxRadio value="option-b" label="选项 B" />
            <LxRadio value="option-c" label="选项 C（禁用）" disabled />
          </LxRadioGroup>
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="横向单选组" description="通过 className 控制排列方向">
        <LxRadioGroup
          className="flex flex-wrap gap-2"
          name="preview-radio-theme"
          value={themeValue}
          onChange={setThemeValue}
        >
          <LxRadio value="system" label="跟随系统" />
          <LxRadio value="light" label="浅色" />
          <LxRadio value="dark" label="深色" />
        </LxRadioGroup>
      </UiPreviewSection>
      <UiPreviewSection title="禁用状态" description="整组禁用或单项禁用">
        <div className="flex flex-col gap-3">
          <LxRadioGroup name="preview-radio-disabled" value="one" onChange={() => {}} disabled>
            <LxRadio value="one" label="选项 1" />
            <LxRadio value="two" label="选项 2" />
          </LxRadioGroup>
          <LxRadioGroup name="preview-radio-partial" value="a" onChange={() => {}}>
            <LxRadio value="a" label="选项 A" />
            <LxRadio value="b" label="选项 B（禁用）" disabled />
          </LxRadioGroup>
        </div>
      </UiPreviewSection>
    </div>
  )
}
