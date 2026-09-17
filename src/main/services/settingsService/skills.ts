import type { SkillSettings } from "@shared/settings"

import { skillLoader } from "@/agent/skills/skillLoader"
import { getConfigPath } from "@/paths"
import { deleteSkillSafe } from "@/services/skillWorkspaceService"
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
 * 安全删除 Skill（限 ~/.lx/skills、~/.agents/skills 与项目内 .lx/.agents 目录之下，移至系统废纸篓）。
 */
export const deleteSkill = async (
  filePath: string,
): Promise<{ success: boolean; error?: string }> => deleteSkillSafe(filePath)
