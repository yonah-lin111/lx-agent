import type {
  PermissionMode,
  PermissionSettings as PermissionSettingsConfig,
} from "@shared/contracts/agent"
import { AlertCircle, Plus } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"

// 规则组配置（按优先级展示）。
const RULE_GROUPS: Array<{
  key: "allow" | "deny" | "ask"
  label: string
  description: string
}> = [
  { key: "deny", label: "拒绝", description: "命中即拒绝（不询问），优先级最高" },
  { key: "ask", label: "询问", description: "命中即弹面板确认，可覆盖 allow 自动放行" },
  { key: "allow", label: "允许", description: "命中即放行，优先级低于 deny/ask" },
]

// 模式选项与说明。
const MODE_OPTIONS: LxSelectOption<PermissionMode>[] = [
  { value: "default", label: "default — 按规则逐次询问" },
  { value: "acceptEdits", label: "acceptEdits — write/edit 自动允许" },
  { value: "bypassPermissions", label: "bypassPermissions — 全部放行" },
]

const MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: "未命中规则时，bash / MCP 工具逐次询问确认。",
  acceptEdits: "write / edit 自动允许（仍受 deny 约束），bash / MCP 工具逐次询问确认。",
  bypassPermissions: "所有门控工具直接执行，不再询问确认。",
}

// 校验规则语法：ToolName(arg) 或 ToolName / ToolName()。
const isValidRule = (value: string): boolean => /^[A-Za-z0-9_-]+(?:\(.*\))?$/.test(value.trim())

export interface PermissionSettingsProps {
  settings: PermissionSettingsConfig
  setSettings: (settings: PermissionSettingsConfig) => void
}

/**
 * 设置页"权限"分区：模式三选一 + allow/deny/ask 三组规则编辑器。
 * 仅维护编辑态，保存由设置页统一处理（写入 agent.permissions）。
 */
export const PermissionSettings = ({
  settings,
  setSettings,
}: PermissionSettingsProps): React.JSX.Element => {
  const updateMode = (defaultMode: PermissionMode): void => {
    setSettings({ ...settings, defaultMode })
  }

  const updateRules = (key: "allow" | "deny" | "ask", rules: string[]): void => {
    setSettings({ ...settings, [key]: rules })
  }

  const addRule = (key: "allow" | "deny" | "ask"): void => {
    updateRules(key, [...settings[key], ""])
  }

  const removeRule = (key: "allow" | "deny" | "ask", index: number): void => {
    updateRules(
      key,
      settings[key].filter((_, ruleIndex) => ruleIndex !== index),
    )
  }

  const updateRule = (key: "allow" | "deny" | "ask", index: number, value: string): void => {
    updateRules(
      key,
      settings[key].map((rule, ruleIndex) => (ruleIndex === index ? value : rule)),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* 模式选择 */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-white/90">权限模式</h3>
        <p className="text-xs text-white/45">决定未命中规则时门控工具的默认处理方式。</p>
        <div className="w-72">
          <LxSelect value={settings.defaultMode} onChange={updateMode} options={MODE_OPTIONS} />
        </div>
        <p className="text-xs text-white/45">{MODE_DESCRIPTIONS[settings.defaultMode]}</p>
        {settings.defaultMode === "bypassPermissions" ? (
          <p className="flex items-center gap-1 text-xs text-amber-300/80">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            bypassPermissions 下门控工具（bash / write / edit / MCP）不再询问确认。
          </p>
        ) : null}
      </section>

      {/* 规则组 */}
      <section className="flex min-h-0 flex-1 flex-col gap-4">
        {RULE_GROUPS.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h4 className="text-sm font-semibold text-white/90">{group.label}</h4>
                <p className="text-xs text-white/45">{group.description}</p>
              </div>
              <LxIconButton
                preset="add"
                aria-label={`添加${group.label}规则`}
                title={{ content: "添加规则", placement: "left" }}
                onClick={() => addRule(group.key)}
              />
            </div>
            {settings[group.key].length === 0 ? (
              <p className="text-xs text-white/25">暂无规则</p>
            ) : (
              settings[group.key].map((rule, index) => {
                const invalid = !isValidRule(rule)
                return (
                  <div key={index} className="flex items-center gap-1.5">
                    <LxInput
                      value={rule}
                      placeholder="ToolName(arg)，如 Bash(git status)"
                      className={invalid ? "border-rose-400/50" : ""}
                      aria-invalid={invalid}
                      onChange={(event) => updateRule(group.key, index, event.target.value)}
                    />
                    {invalid ? (
                      <LxTooltip
                        content="格式应为 ToolName(arg)，如 Bash(git status)"
                        placement="top"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" />
                      </LxTooltip>
                    ) : null}
                    <LxIconButton
                      preset="delete"
                      aria-label={`删除规则 ${rule}`}
                      title={{ content: "删除规则", placement: "left" }}
                      onClick={() => removeRule(group.key, index)}
                    />
                  </div>
                )
              })
            )}
          </div>
        ))}
      </section>

      <p className="flex items-center gap-1 text-xs text-white/35">
        <Plus className="h-3 w-3" />
        语法：ToolName(arg)。bash 为命令前缀匹配；write/edit 为路径 glob；MCP 工具为参数子串匹配。
      </p>
    </div>
  )
}
