import { Search } from "lucide-react"
import type React from "react"
import { useState } from "react"

import { LxInput } from "@/components/ui/LxInput"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxInput 组件。
 */
export const LxInputDemo = (): React.JSX.Element => {
  const [value, setValue] = useState("")
  const [numberValue, setNumberValue] = useState(0)

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection title="基础输入框" description="受控值、占位与清除按钮">
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="请输入内容"
          />
          <LxInput defaultValue="可清除的内容" clear aria-label="可清除输入框" />
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="前后缀" description="prefix / suffix 插槽">
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput
            prefix={<Search className="h-3.5 w-3.5 text-white/40" />}
            placeholder="搜索关键词"
          />
          <LxInput
            suffix={<span className="text-xs text-white/40">@lx.agent</span>}
            defaultValue="yonah"
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="特殊模式" description="password 显隐、number 步进与 multiline">
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput type="password" defaultValue="secret" aria-label="密码输入框" />
          <LxInput
            type="number"
            value={numberValue}
            onChange={(event) => setNumberValue(Number(event.target.value))}
            aria-label="数字输入框"
          />
          <LxInput multiline rows={3} placeholder="多行文本..." className="lg:col-span-2" />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title="尺寸与变体"
        description="xs / sm / lg 与 default / simple / disabled"
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput size="xs" placeholder="xs 尺寸" />
          <LxInput size="sm" placeholder="sm 尺寸" />
          <LxInput size="lg" placeholder="lg 尺寸" />
          <LxInput variant="simple" placeholder="simple 变体" />
          <LxInput disabled value="禁用状态" />
        </div>
      </UiPreviewSection>
    </div>
  )
}
