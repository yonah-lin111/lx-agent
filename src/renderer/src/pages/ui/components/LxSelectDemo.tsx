import type React from "react"
import { useState } from "react"

import { LxSelect, type LxSelectGroup, type LxSelectOption } from "@/components/ui/LxSelect"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例模型选项。
const MODEL_OPTIONS: (LxSelectOption<string> | LxSelectGroup<string>)[] = [
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  {
    label: "开源模型",
    options: [
      { value: "deepseek", label: "DeepSeek" },
      { value: "qwen", label: "Qwen" },
    ],
  },
]

// 示例区域选项。
const REGION_OPTIONS: (LxSelectOption<string> | LxSelectGroup<string>)[] = [
  {
    label: "华东",
    options: [
      { value: "shanghai", label: "上海" },
      { value: "hangzhou", label: "杭州" },
    ],
  },
  {
    label: "华南",
    options: [
      { value: "shenzhen", label: "深圳" },
      { value: "guangzhou", label: "广州" },
    ],
  },
  {
    label: "华北",
    options: [
      { value: "beijing", label: "北京" },
      { value: "tianjin", label: "天津" },
    ],
  },
]

const SIZE_OPTIONS: LxSelectOption<string>[] = [
  { value: "small", label: "small 尺寸" },
  { value: "other", label: "其他" },
]

/**
 * 预览 LxSelect 组件。
 */
export const LxSelectDemo = (): React.JSX.Element => {
  const [value, setValue] = useState("opus")
  const [regionValue, setRegionValue] = useState("shanghai")
  const [smallValue, setSmallValue] = useState("small")

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection title="基础用法" description="受控值、分组选项与禁用状态">
        <div className="grid gap-3 lg:grid-cols-2">
          <LxSelect value={value} onChange={setValue} options={MODEL_OPTIONS} />
          <LxSelect
            value="disabled"
            onChange={() => {}}
            options={[{ value: "disabled", label: "禁用" }]}
            disabled
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="分组选项" description="多分组选项展示，选中项带勾选标记">
        <div className="grid gap-3 lg:grid-cols-2">
          <LxSelect value={regionValue} onChange={setRegionValue} options={REGION_OPTIONS} />
          <LxSelect value="" onChange={() => {}} options={[]} placeholder="未匹配到选项" />
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="尺寸与方向" description="small / medium 与 up / down 弹出方向">
        <div className="grid gap-3 lg:grid-cols-2">
          <LxSelect
            size="small"
            value={smallValue}
            onChange={setSmallValue}
            options={SIZE_OPTIONS}
          />
          <LxSelect
            position="up"
            value={value}
            onChange={setValue}
            options={[
              { value: "opus", label: "向上弹出" },
              { value: "sonnet", label: "Sonnet" },
            ]}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
