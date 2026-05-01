import type { ClinicalExtraction } from "./extraction"
import type { FieldScores, HallucinationFlag } from "./metrics"

// One attempt in the retry loop — stored so you can inspect what went wrong
export type LlmTrace = {
  attemptNumber: number          // 1, 2, or 3
  requestMessages: unknown[]     // the exact messages sent to Claude
  responseJson: unknown          // the raw response from Claude
  validationErrors: string[]     // JSON Schema errors (empty if valid)
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number
}

// One fully evaluated transcript
export type CaseResult = {
  id: string
  runId: string
  transcriptId: string              // "case_001" — links to data/transcripts/case_001.txt

  prediction: ClinicalExtraction | null  // null if all 3 retries failed schema validation
  fieldScores: FieldScores
  hallucinations: HallucinationFlag[]
  schemaValid: boolean              // false if prediction is null
  attemptCount: number              // 1 = first try worked, 3 = needed max retries

  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  costUsd: number

  traces: LlmTrace[]               // every retry attempt, in order
  createdAt: Date
}

// SSE event shapes — these are the events streamed to the dashboard during a run
export type SseEvent =
  | { type: "case_complete"; data: CaseResult }
  | { type: "run_complete"; data: { runId: string; summary: RunCompleteSummary } }
  | { type: "error"; data: { message: string } }
  | { type: "ping" }  // keep-alive

export type RunCompleteSummary = {
  totalCases: number
  completedCases: number
  schemaFailures: number
  hallucinationCount: number
  totalCostUsd: number
  totalTokens: number
  cacheReadTokens: number
  wallTimeMs: number
}
