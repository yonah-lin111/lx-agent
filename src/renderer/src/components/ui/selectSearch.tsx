import { Search } from "lucide-react"
import type React from "react"
import { LxInput } from "@/components/ui/LxInput"
import type { LxSelectGroup, LxSelectOption } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import { isFuzzyMatch } from "@/lib/fuzzyMatch"

// 下拉面板条目：普通选项或分组选项。
export type LxSelectItem<T> = LxSelectOption<T> | LxSelectGroup<T>

const isGroup = <T,>(item: LxSelectItem<T>): item is LxSelectGroup<T> => "options" in item

/**
 * 按关键词模糊过滤下拉条目：仅匹配 label，分组内无命中整组隐藏。
 */
export const filterSelectOptions = <T extends string>(
  options: LxSelectItem<T>[],
  query: string,
): LxSelectItem<T>[] => {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return options
  return options
    .map((item) =>
      isGroup(item)
        ? {
            ...item,
            options: item.options.filter((option) =>
              isFuzzyMatch(keyword, option.label.toLocaleLowerCase()),
            ),
          }
        : item,
    )
    .filter((item) =>
      isGroup(item)
        ? item.options.length > 0
        : isFuzzyMatch(keyword, item.label.toLocaleLowerCase()),
    )
}

// 下拉搜索框属性。
export interface SelectSearchFieldProps {
  value: string
  onChange: (value: string) => void
  // 占位文案，默认使用通用搜索文案。
  placeholder?: string
}

/**
 * 下拉面板顶部搜索框：LxInput 加搜索图标前缀。
 */
export const SelectSearchField = ({
  value,
  onChange,
  placeholder,
}: SelectSearchFieldProps): React.JSX.Element => {
  const { t } = useTranslation()
  const text = placeholder ?? t("common.search")
  return (
    <LxInput
      aria-label={text}
      placeholder={text}
      prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
