import type { PromptStrategy } from "@test-evals/shared"
import { cot } from "./cot"
import { fewShot } from "./few-shot"
import { zeroShot } from "./zero-shot"

export type Strategy = {
  name: PromptStrategy
  systemPrompt: string
  buildUserMessage: (transcript: string) => string
}

export const strategies: Record<PromptStrategy, Strategy> = {
  zero_shot: zeroShot,
  few_shot: fewShot,
  cot: cot,
}
