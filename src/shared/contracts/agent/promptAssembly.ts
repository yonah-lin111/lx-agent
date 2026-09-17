// 提示词装配契约：模板/Skill 条目与分段装配输出。

// Prompt 模板条目（由 promptTemplateLoader 扫描自 ~/.lx/prompts 与 <cwd>/.lx/prompts）。
export interface PromptTemplateItem {
  name: string
  description: string
  argumentHint?: string
  source: "project" | "user"
  filePath: string
}

// Skill 条目（由 skillLoader 扫描自 ~/.lx/skills、~/.agents/skills 与项目内 .lx/.agents 目录）。
export interface SkillItem {
  name: string
  description: string
  shortDescription?: string
  displayName?: string
  filePath: string
  baseDir: string
  disableModelInvocation: boolean
  isGlobal?: boolean
  // 来源根目录：lx 原生或跨客户端标准 .agents。
  sourceKind?: "lx" | "agents"
}

// 系统提示词分段装配结果。
export interface AssembledSection {
  name: string
  text: string
}

// 运行时上下文注入结果。
export interface AssembledContext {
  name: string
  text: string
}

// 系统提示词装配输出结构（系统提示词、指令文件、技能、环境变量与工具全集）。
export interface PromptAssembly {
  sections: AssembledSection[]
  contexts: AssembledContext[]
  variables: Record<string, string | undefined>
  activeTools?: string[]
  rendered: string
}
