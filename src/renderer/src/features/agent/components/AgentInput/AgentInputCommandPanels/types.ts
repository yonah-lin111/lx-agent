import type { SkillItem } from "@shared/contracts/agent"
import type { ProjectFileEntry } from "@shared/project"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"

export interface AgentInputCommand {
  id: string
  name: string
  description: string
  kind?: "builtin" | "prompt" | "skill"
  source?: "project" | "user"
  argumentHint?: string
}

export interface AgentInputModel {
  id: string
  label: string
  provider: string
}

export interface AgentInputProjectItem {
  id: string
  name: string
  path: string
  isDesktop?: boolean
  isCurrent?: boolean
}

export interface AgentInputSessionItem {
  id: string
  title: string
  cwd: string
  updatedAt: string
  isCurrent?: boolean
}

export type AgentPanelKind = "command" | "file"

// 历史提示词条目（新→旧）。
export interface AgentHistoryPromptItem {
  id: string
  text: string
}

export type AgentMentionItem =
  | {
      kind: "skill"
      skill: SkillItem
    }
  | {
      kind: "file"
      file: ProjectFileEntry
    }
  | {
      kind: "design"
      design: FrontDesignItem
    }
  | {
      kind: "subagent"
      subagent: SubagentMentionCandidate
    }
  | {
      kind: "claw"
      claw: ClawMentionCandidate
    }

// 子代理角色提及候选（内置角色 + 用户自定义角色）。
export interface SubagentMentionCandidate {
  name: string
  description: string
  builtIn: boolean
}

// OpenClaw 提及候选（渲染层展示用）。
export interface ClawMentionCandidate {
  instanceId: string
  agentId: string
  // Agent 显示名
  name: string
  // 实例显示名
  instanceName: string
}
