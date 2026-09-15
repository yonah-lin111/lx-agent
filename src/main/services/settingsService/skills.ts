import { basename, dirname, join, resolve } from "node:path"
import type { SkillSettings } from "@shared/settings"
import { shell } from "electron"

import { skillLoader } from "@/agent/skills/skillLoader"
import { getAppDataRoot, getConfigPath } from "@/paths"
import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化 Skill 设置。
 */
export const normalizeSkillSettings = (input: unknown): SkillSettings => {
  if (!isRecord(input)) return { disabled: [] }
  const disabled = Array.isArray(input.disabled)
    ? Array.from(
        new Set(
          input.disabled
            .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
            .map((item) => item.trim()),
        ),
      )
    : []
  return { disabled }
}

/**
 * 读取 Skill 设置。
 */
export const getSkillSettings = (): SkillSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return normalizeSkillSettings(rawAgent.skills)
}

/**
 * 保存 Skill 设置。
 */
export const saveSkillSettings = (input: SkillSettings): SkillSettings => {
  const settings = normalizeSkillSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
    return {
      ...rawConfig,
      agent: {
        ...rawAgentObj,
        skills: {
          disabled: settings.disabled,
        },
      },
    }
  })

  skillLoader.clearCache()
  return settings
}

/**
 * 安全删除全局 Skill（仅限 ~/.lx/skills，移至系统废纸篓）。
 */
export const deleteSkill = async (
  filePath: string,
): Promise<{ success: boolean; error?: string }> => {
  const globalSkillsDir = resolve(join(getAppDataRoot(), "skills"))
  const resolvedTarget = resolve(filePath)
  if (!resolvedTarget.startsWith(globalSkillsDir)) {
    return { success: false, error: "Only user global skills in ~/.lx/skills can be deleted" }
  }

  const dir = dirname(resolvedTarget)
  // 若为目录型 skill（.../skills/skillName/SKILL.md），删除其专属子目录；否则删除单文件
  const targetToDelete =
    basename(resolvedTarget) === "SKILL.md" && dir !== globalSkillsDir ? dir : resolvedTarget

  try {
    await shell.trashItem(targetToDelete)
    skillLoader.clearCache()
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
