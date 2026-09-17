import type {
  InstructionScope,
  SaveInstructionInput,
  SaveSkillInput,
} from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import { dialog, ipcMain } from "electron"
import { getInstruction, saveInstruction } from "@/services/instructionService"
import {
  deleteSkillFile,
  importSkillFiles,
  listSkillFiles,
  moveSkillFile,
  readSkillFile,
  saveSkill,
  writeSkillFile,
} from "@/services/skillWorkspaceService"

// 校验字符串参数（IPC 输入边界）。
const requireString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${name}.`)
  }
  return value
}

/**
 * 注册 Skill 工作区文件操作与 AGENTS.md 指令文件读写 IPC 处理器。
 */
export const registerSkillHandlers = (): void => {
  ipcMain.handle(AGENT_CHANNELS.listSkillFiles, (_, skillDir: unknown) => {
    return listSkillFiles(requireString(skillDir, "skillDir"))
  })

  ipcMain.handle(AGENT_CHANNELS.readSkillFile, (_, skillDir: unknown, relativePath: unknown) => {
    return readSkillFile(
      requireString(skillDir, "skillDir"),
      requireString(relativePath, "relativePath"),
    )
  })

  ipcMain.handle(
    AGENT_CHANNELS.writeSkillFile,
    (_, skillDir: unknown, relativePath: unknown, content: unknown) => {
      return writeSkillFile(
        requireString(skillDir, "skillDir"),
        requireString(relativePath, "relativePath"),
        typeof content === "string" ? content : "",
      )
    },
  )

  ipcMain.handle(AGENT_CHANNELS.deleteSkillFile, (_, skillDir: unknown, relativePath: unknown) => {
    return deleteSkillFile(
      requireString(skillDir, "skillDir"),
      requireString(relativePath, "relativePath"),
    )
  })

  ipcMain.handle(
    AGENT_CHANNELS.moveSkillFile,
    (_, skillDir: unknown, fromRelativePath: unknown, toRelativePath: unknown) => {
      return moveSkillFile(
        requireString(skillDir, "skillDir"),
        requireString(fromRelativePath, "fromRelativePath"),
        requireString(toRelativePath, "toRelativePath"),
      )
    },
  )

  ipcMain.handle(
    AGENT_CHANNELS.importSkillFiles,
    async (_, skillDir: unknown, targetDirRelativePath: unknown, dialogTitle: unknown) => {
      const dir = requireString(skillDir, "skillDir")
      const target = typeof targetDirRelativePath === "string" ? targetDirRelativePath : ""
      const title = typeof dialogTitle === "string" && dialogTitle.trim() ? dialogTitle : undefined
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        ...(title ? { title } : {}),
      })
      if (result.canceled || result.filePaths.length === 0) return { ok: true, files: [] }
      return importSkillFiles(dir, target, result.filePaths)
    },
  )

  ipcMain.handle(AGENT_CHANNELS.saveSkill, (_, input: unknown) => {
    if (!input || typeof input !== "object") {
      return { ok: false, error: "Invalid skill input." }
    }
    return saveSkill(input as SaveSkillInput)
  })

  ipcMain.handle(AGENT_CHANNELS.getInstruction, (_, scope: unknown, projectPath: unknown) => {
    if (scope !== "user" && scope !== "project") {
      throw new Error("Invalid instruction scope.")
    }
    return getInstruction(
      scope as InstructionScope,
      typeof projectPath === "string" ? projectPath : undefined,
    )
  })

  ipcMain.handle(AGENT_CHANNELS.saveInstruction, (_, input: unknown) => {
    if (!input || typeof input !== "object") {
      throw new Error("Invalid instruction input.")
    }
    return saveInstruction(input as SaveInstructionInput)
  })
}
