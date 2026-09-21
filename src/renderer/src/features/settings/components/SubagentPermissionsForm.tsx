import type { CapabilityPermissions, SubagentCapabilityCatalog } from "@shared/settings"
import { Lock } from "lucide-react"
import { useCallback, useMemo } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { type TranslationKey, useTranslation } from "@/i18n"

// 权限分组标识。
export type PermissionGroup = "tools" | "mcp" | "skills" | "websearch" | "subagents"

// 分组条目（展示名 + 状态标记）。
interface PermissionItem {
  name: string
  state?: "connected" | "disconnected" | "disabled" | "builtin"
}

// 子代理权限编辑器属性。
export interface SubagentPermissionsFormProps {
  catalog: SubagentCapabilityCatalog | null
  value: CapabilityPermissions | undefined
  onChange: (permissions: CapabilityPermissions | undefined) => void
  // 模式硬基线工具：永久禁用、不可勾选（仅 tools 组生效）。
  lockedItems?: readonly string[]
  // 展示的分组与顺序（缺省四组；协作模式弹窗追加 subagents 组）。
  groups?: readonly PermissionGroup[]
}

// 分组键 → 权限字段名（同构）。
const DEFAULT_GROUPS: readonly PermissionGroup[] = ["tools", "mcp", "skills", "websearch"]

// 权限摘要：五组各自统计；未限制分组不展示（子代理与协作模式共用）。
export const describePermissions = (
  permissions: CapabilityPermissions | undefined,
  t: (key: TranslationKey) => string,
): string => {
  if (!permissions) return t("settings.subagentsPermissionsUnlimitedAll")
  const parts: string[] = []
  const groups: Array<[keyof CapabilityPermissions, TranslationKey]> = [
    ["tools", "settings.subagentsPermissions_tools"],
    ["mcp", "settings.subagentsPermissions_mcp"],
    ["skills", "settings.subagentsPermissions_skills"],
    ["websearch", "settings.subagentsPermissions_websearch"],
    ["subagents", "settings.subagentsPermissions_subagents"],
  ]
  for (const [key, labelKey] of groups) {
    const list = permissions[key]
    if (list === undefined) continue
    parts.push(`${t(labelKey)}: ${list.length}`)
  }
  return parts.length > 0 ? parts.join(" / ") : t("settings.subagentsPermissionsUnlimitedAll")
}

/**
 * 渲染子代理角色能力权限编辑器：2×2 网格分组，每组「不限制 / 自定义白名单」两态，白名单为空表示该组全禁。
 * lockedItems 用于协作模式硬基线：这些工具永远排除在白名单之外。
 */
export const SubagentPermissionsForm = ({
  catalog,
  value,
  onChange,
  lockedItems,
  groups = DEFAULT_GROUPS,
}: SubagentPermissionsFormProps): React.JSX.Element => {
  const { t } = useTranslation()

  const lockedSet = useMemo(() => new Set(lockedItems ?? []), [lockedItems])

  const itemsByGroup = useMemo<Record<PermissionGroup, PermissionItem[]>>(
    () => ({
      tools: (catalog?.tools ?? []).map((name) => ({ name })),
      mcp: (catalog?.mcp ?? []).map((item) => ({
        name: item.name,
        state: item.connected ? "connected" : "disconnected",
      })),
      skills: (catalog?.skills ?? []).map((item) => ({
        name: item.name,
        state: item.disabled ? "disabled" : undefined,
      })),
      websearch: ["web_search", "webfetch"].map((name) => ({ name })),
      subagents: (catalog?.subagents ?? []).map((item) => ({
        name: item.name,
        state: item.builtIn ? "builtin" : undefined,
      })),
    }),
    [catalog],
  )

  // 可勾选条目：tools 组剔除模式硬基线（单独以锁定行展示）。
  const selectableItems = useCallback(
    (group: PermissionGroup): PermissionItem[] =>
      group === "tools"
        ? itemsByGroup.tools.filter((item) => !lockedSet.has(item.name))
        : itemsByGroup[group],
    [itemsByGroup, lockedSet],
  )

  const lockedToolItems = useMemo(
    () => itemsByGroup.tools.filter((item) => lockedSet.has(item.name)),
    [itemsByGroup, lockedSet],
  )

  const groupLabel = useCallback(
    (group: PermissionGroup): string =>
      t(`settings.subagentsPermissions_${group}` as TranslationKey),
    [t],
  )

  // 白名单为空时提示"全部禁用"。
  const isGroupDisabledAll = (group: PermissionGroup): boolean =>
    value?.[group] !== undefined && value[group]?.length === 0

  const handleToggleGroup = (group: PermissionGroup, restricted: boolean): void => {
    const next: CapabilityPermissions = { ...value }
    if (!restricted) {
      delete next[group]
    } else {
      // 打开限制时预置当前目录全选，避免空清单直接变成"全禁"。
      next[group] = selectableItems(group).map((item) => item.name)
    }
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }

  const handleToggleItem = (group: PermissionGroup, name: string, checked: boolean): void => {
    const current = value?.[group] ?? []
    const next = checked ? [...current, name] : current.filter((item) => item !== name)
    onChange({ ...value, [group]: next })
  }

  const handleSelectAll = (group: PermissionGroup): void => {
    onChange({ ...value, [group]: selectableItems(group).map((item) => item.name) })
  }

  const handleClearAll = (group: PermissionGroup): void => {
    onChange({ ...value, [group]: [] })
  }

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {groups.map((group) => {
        const items = selectableItems(group)
        const restricted = value?.[group] !== undefined
        const selected = value?.[group] ?? []
        const disabledAll = isGroupDisabledAll(group)

        return (
          <div
            key={group}
            data-permission-group={group}
            className="settings-item-card flex min-w-0 flex-col gap-2 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <LxCheckbox
                  size="small"
                  checked={restricted}
                  aria-label={groupLabel(group)}
                  onChange={(checked) => handleToggleGroup(group, checked)}
                />
                <span className="truncate font-medium text-white/70">{groupLabel(group)}</span>
                {restricted ? (
                  <LxTag size="small" color={disabledAll ? "rose" : "sky"}>
                    {disabledAll
                      ? t("settings.subagentsPermissionsAllDisabled")
                      : t("settings.subagentsPermissionsSelected", { count: selected.length })}
                  </LxTag>
                ) : (
                  <LxTag size="small" color="gray">
                    {t("settings.subagentsPermissionsUnlimited")}
                  </LxTag>
                )}
              </label>
              {restricted ? (
                <div className="flex shrink-0 items-center gap-1">
                  <LxIconButton
                    iconOnly={false}
                    textClass="text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]"
                    onClick={() => handleSelectAll(group)}
                  >
                    {t("settings.subagentsPermissionsSelectAll")}
                  </LxIconButton>
                  <LxIconButton
                    iconOnly={false}
                    textClass="text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]"
                    onClick={() => handleClearAll(group)}
                  >
                    {t("settings.subagentsPermissionsClearAll")}
                  </LxIconButton>
                </div>
              ) : null}
            </div>

            {restricted ? (
              items.length === 0 ? (
                <span className="text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                  {t("settings.subagentsPermissionsNoItems")}
                </span>
              ) : (
                <div className="custom-scrollbar flex max-h-32 flex-col gap-1 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <label
                      key={item.name}
                      className="flex cursor-pointer items-center gap-1.5 rounded-[4px] px-1 py-0.5 hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.05))]"
                    >
                      <LxCheckbox
                        size="small"
                        checked={selected.includes(item.name)}
                        aria-label={item.name}
                        onChange={(checked) => handleToggleItem(group, item.name, checked)}
                      />
                      <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
                        {item.name}
                      </span>
                      {item.state === "connected" ? (
                        <span className="ml-auto shrink-0 text-xs text-emerald-400/80">
                          {t("settings.subagentsPermissionsConnected")}
                        </span>
                      ) : null}
                      {item.state === "disconnected" ? (
                        <span className="ml-auto shrink-0 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                          {t("settings.subagentsPermissionsDisconnected")}
                        </span>
                      ) : null}
                      {item.state === "disabled" ? (
                        <span className="ml-auto shrink-0 text-xs text-amber-400/80">
                          {t("settings.subagentsPermissionsSkillDisabled")}
                        </span>
                      ) : null}
                      {item.state === "builtin" ? (
                        <span className="ml-auto shrink-0 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                          {t("settings.subagentsBuiltinTag")}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              )
            ) : null}

            {group === "tools" && lockedToolItems.length > 0 ? (
              <div className="flex flex-col gap-1">
                {lockedToolItems.map((item) => (
                  <div
                    key={item.name}
                    data-locked-tool={item.name}
                    className="flex items-center gap-1.5 rounded-[4px] px-1 py-0.5 opacity-70"
                  >
                    <Lock className="h-3 w-3 shrink-0 text-rose-300/80" aria-hidden />
                    <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] line-through">
                      {item.name}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-rose-300/80">
                      {t("settings.subagentsPermissionsLocked")}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
