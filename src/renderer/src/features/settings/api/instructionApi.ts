import type {
  InstructionFileInfo,
  InstructionScope,
  SaveInstructionInput,
} from "@shared/contracts/agent"

// AGENTS.md 指令文件 API：用户级与项目级读写。
export const instructionApi = {
  get: (scope: InstructionScope, projectPath?: string): Promise<InstructionFileInfo> =>
    window.api.agent.getInstruction(scope, projectPath),
  save: (input: SaveInstructionInput): Promise<InstructionFileInfo> =>
    window.api.agent.saveInstruction(input),
}
