import type React from "react"
import { LxSelect, type LxSelectGroup, type LxSelectOption } from "@/components/ui/LxSelect"

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
}

/**
 * AgentModelSelect - Agent 输入栏的模型选择器，向上弹出并限制宽度，
 * 与底部工具栏的附件按钮保持同一视觉层级。
 */
export const AgentModelSelect = ({
  value,
  onChange,
  options,
  disabled = false,
}: AgentModelSelectProps): React.JSX.Element => (
  <LxSelect
    value={value}
    onChange={onChange}
    options={options}
    position="up"
    size="small"
    disabled={disabled}
    className="!w-fit max-w-[220px]"
  />
)
