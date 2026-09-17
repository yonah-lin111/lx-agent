import type {
  ImportSkillFilesResult,
  SaveSkillInput,
  SaveSkillResult,
  SkillFileContent,
  SkillFileEntry,
  SkillFileOpResult,
  SkillItem,
} from "@shared/contracts/agent"
import { settingsApi } from "./settingsApi"

// Skill 工作区 API：列表、内容、文件操作与保存删除。
export const skillApi = {
  list: (cwd?: string, force?: boolean): Promise<SkillItem[]> =>
    window.api.agent.listSkills(cwd, force),
  getContent: (name: string, cwd?: string): Promise<string | null> =>
    window.api.agent.getSkillContent(name, cwd),
  listFiles: (skillDir: string): Promise<SkillFileEntry[]> =>
    window.api.agent.listSkillFiles(skillDir),
  readFile: (skillDir: string, relativePath: string): Promise<SkillFileContent> =>
    window.api.agent.readSkillFile(skillDir, relativePath),
  writeFile: (
    skillDir: string,
    relativePath: string,
    content: string,
  ): Promise<SkillFileOpResult> => window.api.agent.writeSkillFile(skillDir, relativePath, content),
  deleteFile: (skillDir: string, relativePath: string): Promise<SkillFileOpResult> =>
    window.api.agent.deleteSkillFile(skillDir, relativePath),
  moveFile: (
    skillDir: string,
    fromRelativePath: string,
    toRelativePath: string,
  ): Promise<SkillFileOpResult> =>
    window.api.agent.moveSkillFile(skillDir, fromRelativePath, toRelativePath),
  importFiles: (
    skillDir: string,
    targetDirRelativePath: string,
    dialogTitle?: string,
  ): Promise<ImportSkillFilesResult> =>
    window.api.agent.importSkillFiles(skillDir, targetDirRelativePath, dialogTitle),
  save: (input: SaveSkillInput): Promise<SaveSkillResult> => window.api.agent.saveSkill(input),
  delete: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    settingsApi.deleteSkill(filePath),
}
