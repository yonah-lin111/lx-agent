import type React from "react"
import { Brain } from "lucide-react"
import { LxSelect, type LxSelectGroup, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

// 模型选择器属性。
export interface AgentModelSelectProps {
  // 当前选中的模型值（格式 "provider::model"）。
  value: string
  // 值改变回调。
  onChange: (value: string) => void
  // 可选模型列表（按 Provider 分组）。
  options: (LxSelectOption<string> | LxSelectGroup<string>)[]
  // 是否禁用选择器。
  disabled?: boolean
  // 当前选中的思考等级。
  variant?: string
  // 当前模型支持的思考等级列表。
  variants?: string[]
  // 思考等级改变回调。
  onVariantChange?: (variant: string) => void
}

/**
 * AgentModelSelect - Agent 输入栏的模型选择器，向上弹出并限制宽度，
 * 与底部工具栏的附件按钮保持同一视觉层级，并在支持思考等级时提供快速切换药丸/下拉。
 */
export const AgentModelSelect = ({
  value,
  onChange,
  options,
  disabled = false,
  variant,
  variants = [],
  onVariantChange,
}: AgentModelSelectProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-1">
      <LxSelect
        value={value}
        onChange={onChange}
        options={options}
        position="up"
        size="small"
        disabled={disabled}
        className="!w-fit max-w-[220px]"
      />
      {variants.length > 0 && onVariantChange && (
        <LxSelect
          value={variant ?? variants[0]}
          onChange={onVariantChange}
          position="up"
          size="small"
          disabled={disabled}
          className="!w-fit max-w-[120px]"
          options={variants.map((v) => ({
            value: v,
            label: v,
          }))}
        />
      )}
    </div>
  )
}
