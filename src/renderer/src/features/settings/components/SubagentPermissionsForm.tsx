import type { SubagentCapabilityCatalog, SubagentRolePermissions } from "@shared/settings"
import { useCallback, useMemo } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { type TranslationKey, useTranslation } from "@/i18n"

// 权限分组标识。
type PermissionGroup = "tools" | "mcp" | "skills" | "websearch"

// 分组条目（展示名 + 状态标记）。
interface PermissionItem {
  name: string
  state?: "connected" | "disconnected" | "disabled"
}

// 子代理权限编辑器属性。
export interface SubagentPermissionsFormProps {
  catalog: SubagentCapabilityCatalog | null
  value: SubagentRolePermissions | undefined
  onChange: (permissions: SubagentRolePermissions | undefined) => void
}

// 分组键 → 权限字段名（同构）。
const GROUP_KEYS: readonly PermissionGroup[] = ["tools", "mcp", "skills", "websearch"]

/**
 * 渲染子代理角色能力权限编辑器：每组「不限制 / 自定义白名单」两态，白名单为空表示该组全禁。
 */
export const SubagentPermissionsForm = ({
  catalog,
  value,
  onChange,
}: SubagentPermissionsFormProps): React.JSX.Element => {
  const { t } = useTranslation()

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
    }),
    [catalog],
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
    const next: SubagentRolePermissions = { ...value }
    if (!restricted) {
      delete next[group]
    } else {
      // 打开限制时预置当前目录全选，避免空清单直接变成"全禁"。
      next[group] = itemsByGroup[group].map((item) => item.name)
    }
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }

  const handleToggleItem = (group: PermissionGroup, name: string, checked: boolean): void => {
    const current = value?.[group] ?? []
    const next = checked ? [...current, name] : current.filter((item) => item !== name)
    onChange({ ...value, [group]: next })
  }

  const handleSelectAll = (group: PermissionGroup): void => {
    onChange({ ...value, [group]: itemsByGroup[group].map((item) => item.name) })
  }

  const handleClearAll = (group: PermissionGroup): void => {
    onChange({ ...value, [group]: [] })
  }

  return (
    <div className="flex flex-col gap-3">
      {GROUP_KEYS.map((group) => {
        const items = itemsByGroup[group]
        const restricted = value?.[group] !== undefined
        const selected = value?.[group] ?? []
        const disabledAll = isGroupDisabledAll(group)

        return (
          <div
            key={group}
            className="flex flex-col gap-2 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <LxCheckbox
                  size="small"
                  checked={restricted}
                  onChange={(checked) => handleToggleGroup(group, checked)}
                />
                <span className="font-medium text-white/70">{groupLabel(group)}</span>
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
                    variant="ghost"
                    onClick={() => handleSelectAll(group)}
                  >
                    {t("settings.subagentsPermissionsSelectAll")}
                  </LxIconButton>
                  <LxIconButton
                    iconOnly={false}
                    variant="ghost"
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
                <div className="custom-scrollbar grid max-h-40 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <label key={item.name} className="flex cursor-pointer items-center gap-1.5">
                      <LxCheckbox
                        size="small"
                        checked={selected.includes(item.name)}
                        onChange={(checked) => handleToggleItem(group, item.name, checked)}
                      />
                      <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
                        {item.name}
                      </span>
                      {item.state === "connected" ? (
                        <span className="shrink-0 text-xs text-emerald-400/80">
                          {t("settings.subagentsPermissionsConnected")}
                        </span>
                      ) : null}
                      {item.state === "disconnected" ? (
                        <span className="shrink-0 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                          {t("settings.subagentsPermissionsDisconnected")}
                        </span>
                      ) : null}
                      {item.state === "disabled" ? (
                        <span className="shrink-0 text-xs text-amber-400/80">
                          {t("settings.subagentsPermissionsSkillDisabled")}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
