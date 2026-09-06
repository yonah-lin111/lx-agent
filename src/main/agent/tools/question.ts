import type { QuestionAnswer, QuestionPrompt } from "@shared/contracts/agent"
import { z } from "zod"
import type { AgentTool } from "../core/types"

// Option schema for multiple-choice questions.
const questionOptionSchema = z.object({
  label: z.string().min(1).max(100).describe("Option title or text"),
  description: z.string().max(200).optional().describe("Short explanation for this option"),
})

// Single question schema.
const questionPromptSchema = z.object({
  question: z.string().min(1).max(500).describe("Short plain-text question or prompt for the user"),
  header: z
    .string()
    .max(12)
    .optional()
    .describe("Short category badge (≤12 chars, e.g. 'Database', 'Architecture', 'UI Design')"),
  options: z
    .array(questionOptionSchema)
    .min(2)
    .max(4)
    .optional()
    .describe("Multiple-choice options (2..4 items). Omit for free-form text input."),
  multiSelect: z
    .boolean()
    .optional()
    .describe("Allow selecting multiple options (only applies when options are provided)"),
})

// question tool input schema.
const questionInputSchema = z.object({
  questions: z
    .array(questionPromptSchema)
    .min(1)
    .max(4)
    .describe("Array of questions to ask the user (1..4 questions)"),
})

// question tool dependencies.
export interface QuestionToolDeps {
  askQuestion: (
    questions: QuestionPrompt[],
    toolCallId: string,
    signal?: AbortSignal,
  ) => Promise<QuestionAnswer[] | null>
}

// Dismissed error message returned to model.
const QUESTION_DISMISSED_MESSAGE = "User dismissed the question without answering."

// Format user answers to model.
const formatAnswers = (answers: QuestionAnswer[]): string => {
  const parts = answers.map((item) => `"${item.question}"="${item.answer.join(",")}"`)
  return `User answered: ${parts.join(", ")}. Continue with the answers.`
}

/**
 * Create question tool: ask the user interactive questions.
 */
export const createQuestionTool = (
  deps: QuestionToolDeps,
): AgentTool<typeof questionInputSchema, { answers: QuestionAnswer[] }> => ({
  name: "question",
  label: "Ask Question",
  description:
    "Ask the user questions to clarify ambiguous requirements, confirm architectural decisions, or select from options.\n" +
    "Provide 'options' for multiple choice (single or multi-select), or omit 'options' for free-form text answers.",
  inputSchema: questionInputSchema,
  executionMode: "sequential",
  execute: async (toolCallId, params, signal) => {
    const answers = await deps.askQuestion(params.questions, toolCallId, signal)
    if (answers === null || answers.length === 0) {
      throw new Error(QUESTION_DISMISSED_MESSAGE)
    }
    return {
      content: [{ type: "text", text: formatAnswers(answers) }],
      details: { answers },
    }
  },
})
