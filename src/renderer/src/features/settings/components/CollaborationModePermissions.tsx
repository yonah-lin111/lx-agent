import type {
  CollaborationMode,
  PermissionSettings as PermissionSettingsConfig,
} from "@shared/contracts/agent"
import {
  getModeBlockedTools,
  roleBlockedTools,
  withModePermissionDefaults,
} from "@shared/contracts/agent"
import type { CapabilityPermissions, SubagentCapabilityCatalog } from "@shared/settings"
import { Edit2, Lock } from "lucide-react"
import { useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxModal } from "@/components/ui/LxModal"
import { LxTag } from "@/components/ui/LxTag"
import { type TranslationKey, useTranslation } from "@/i18n"
import { settingsApi } from "../api/settingsApi"
import {
  describePermissions,
  type PermissionGroup,
  permissionsEqual,
  SubagentPermissionsForm,
} from "./SubagentPermissionsForm"

// 协作模式展示顺序与文案键（描述复用 agent 命名空间）。
const MODE_ORDER: readonly CollaborationMode[] = ["build", "plan", "review", "design"]

// 权限分组：五组（tools / mcp / skills / websearch / subagents）。
const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  "tools",
  "mcp",
  "skills",
  "websearch",
  "subagents",
]

const MODE_LABEL_KEYS: Record<CollaborationMode, TranslationKey> = {
  build: "agent.collaborationModeBuild",
  plan: "agent.collaborationModePlan",
  review: "agent.collaborationModeReview",
  design: "agent.collaborationModeDesign",
}

const MODE_DESC_KEYS: Record<CollaborationMode, TranslationKey> = {
  build: "agent.collaborationModeBuildDesc",
  plan: "agent.collaborationModePlanDesc",
  review: "agent.collaborationModeReviewDesc",
  design: "agent.collaborationModeDesignDesc",
}

// 模式标签配色（与状态栏协作模式指示一致）。
const MODE_TAG_COLORS: Record<CollaborationMode, "default" | "sky" | "purple" | "pink"> = {
  build: "default",
  plan: "sky",
  review: "purple",
  design: "pink",
}

export interface CollaborationModePermissionsProps {
  settings: PermissionSettingsConfig
  setSettings: (settings: PermissionSettingsConfig) => void
}

/**
 * 设置页"协作模式权限"卡片：Build / Plan / Review / Design 四行能力权限覆盖。
 * 非 build 模式的写操作硬基线不可放开（UI 锁定、保存时由主进程规范化剥离）。
 */
export const CollaborationModePermissions = ({
  settings,
  setSettings,
}: CollaborationModePermissionsProps): React.JSX.Element => {
  const { t } = useTranslation()

  const [catalog, setCatalog] = useState<SubagentCapabilityCatalog | null>(null)
  const [editingMode, setEditingMode] = useState<CollaborationMode | null>(null)
  const [formPermissions, setFormPermissions] = useState<CapabilityPermissions | undefined>(
    undefined,
  )

  useEffect(() => {
    void settingsApi
      .getSubagentCapabilities()
      .then(setCatalog)
      .catch((err) => console.error("[CollaborationModePermissions] Failed to load catalog:", err))
  }, [])

  // 永久禁用角色：能力集与模式硬基线冲突（含未限制 tools 的角色），与主进程门控同一判定。
  const lockedRolesOf = (mode: CollaborationMode): string[] =>
    (catalog?.subagents ?? [])
      .filter((role) => roleBlockedTools(role.permissions, mode).length > 0)
      .map((role) => role.name)

  const handleOpenEdit = (mode: CollaborationMode): void => {
    // 非 build 模式的 subagents 缺省回退探索子代理：弹窗展示与门控一致的有效配置；
    // 永久禁用角色不进入编辑态白名单（保存时随之清理）。
    const effective = withModePermissionDefaults(mode, settings.modes?.[mode])
    const lockedRoles = new Set(lockedRolesOf(mode))
    const subagents = effective?.subagents
    setFormPermissions(
      effective !== undefined && subagents !== undefined && lockedRoles.size > 0
        ? { ...effective, subagents: subagents.filter((name) => !lockedRoles.has(name)) }
        : effective,
    )
    setEditingMode(mode)
  }

  const handleConfirm = (): void => {
    if (!editingMode) return
    const modes = { ...settings.modes }
    // 未改动（仍等于模式缺省，如非 build 的 explorer 缺省）时不落冗余覆盖节点。
    const unchangedDefault = permissionsEqual(
      formPermissions,
      withModePermissionDefaults(editingMode, undefined),
    )
    if (formPermissions && !unchangedDefault) {
      modes[editingMode] = formPermissions
    } else {
      delete modes[editingMode]
    }
    const next = { ...settings }
    if (Object.keys(modes).length > 0) next.modes = modes
    else delete next.modes
    setSettings(next)
    setEditingMode(null)
  }

  const renderRow = (mode: CollaborationMode): React.JSX.Element => {
    const override = settings.modes?.[mode]
    const effective = withModePermissionDefaults(mode, override)
    const lockedTools = [...getModeBlockedTools(mode)]
    // 白名单里已被角色改动变成永久禁用的角色（死条目）：提示用户重新编辑，确认后自动清理。
    const lockedRoles = lockedRolesOf(mode)
    const staleRoles = (effective?.subagents ?? []).filter((name) => lockedRoles.includes(name))
    return (
      <div
        key={mode}
        data-mode-permission={mode}
        className="settings-item-card flex flex-col gap-1.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <LxTag size="small" color={MODE_TAG_COLORS[mode]}>
              {t(MODE_LABEL_KEYS[mode])}
            </LxTag>
            {override ? (
              <LxTag size="small" color="amber">
                {t("settings.subagentsPermissionsOverridden")}
              </LxTag>
            ) : null}
          </div>
          <LxIconButton
            preset="edit"
            onClick={() => handleOpenEdit(mode)}
            title={{ content: t("settings.collaborationModePermissionsEdit"), placement: "top" }}
            aria-label={`${t("settings.collaborationModePermissionsEdit")} ${t(MODE_LABEL_KEYS[mode])}`}
          >
            <Edit2 className="text-white/70" />
          </LxIconButton>
        </div>
        <p className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
          {t(MODE_DESC_KEYS[mode])}
        </p>
        <p className="text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
          <span>{t("settings.subagentsPermissions")}:</span>{" "}
          <span className="font-mono">
            {effective
              ? describePermissions(effective, t)
              : t("settings.subagentsPermissionsUnlimited")}
          </span>
        </p>
        {lockedTools.length > 0 ? (
          <p className="flex items-center gap-1 text-xs text-rose-300/70">
            <Lock className="h-3 w-3 shrink-0" />
            {t("settings.collaborationModePermissionsLockedHint", {
              tools: lockedTools.join(", "),
            })}
          </p>
        ) : null}
        {staleRoles.length > 0 ? (
          <p className="flex items-center gap-1 text-xs text-rose-300/70">
            <Lock className="h-3 w-3 shrink-0" />
            {t("settings.collaborationModePermissionsLockedRolesHint", {
              roles: staleRoles.join(", "),
            })}
          </p>
        ) : null}
      </div>
    )
  }

  const lockedItemsByGroup = editingMode
    ? {
        tools: [...getModeBlockedTools(editingMode)],
        subagents: lockedRolesOf(editingMode),
      }
    : undefined

  return (
    <div className="settings-item-card flex flex-col gap-3 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-white/90">
          {t("settings.collaborationModePermissions")}
        </h3>
        <LxInfoTooltip markdown={t("settings.collaborationModePermissionsDoc")} placement="right" />
      </div>
      <p className="text-xs text-white/45">{t("settings.collaborationModePermissionsDesc")}</p>
      <div className="flex flex-col gap-2">{MODE_ORDER.map(renderRow)}</div>

      <LxModal
        isOpen={editingMode !== null}
        onClose={() => setEditingMode(null)}
        title={editingMode ? t(MODE_LABEL_KEYS[editingMode]) : ""}
        width="720px"
      >
        <div className="flex flex-col gap-3.5 p-1 text-xs text-white/80">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-white/70">{t("settings.subagentsPermissions")}</span>
            <LxInfoTooltip
              markdown={t("settings.collaborationModePermissionsDoc")}
              placement="right"
            />
          </div>
          <SubagentPermissionsForm
            catalog={catalog}
            value={formPermissions}
            onChange={setFormPermissions}
            lockedItemsByGroup={lockedItemsByGroup}
            groups={PERMISSION_GROUPS}
          />
          <div className="mt-1 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
            <LxIconButton
              iconOnly={false}
              onClick={() => setEditingMode(null)}
              textClass="text-white/70"
              className="border border-white/10 cursor-pointer"
            >
              {t("settings.cancel")}
            </LxIconButton>
            <LxIconButton
              iconOnly={false}
              preset="confirm"
              onClick={handleConfirm}
              textClass="text-white"
              className="font-medium cursor-pointer"
            >
              {t("settings.confirm")}
            </LxIconButton>
          </div>
        </div>
      </LxModal>
    </div>
  )
}
