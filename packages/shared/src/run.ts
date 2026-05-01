export type PromptStrategy = "zero_shot" | "few_shot" | "cot"

export type RunStatus = "pending" | "running" | "completed" | "failed" | "partial"
// partial = server crashed mid-run, can be resumed

export type Run = {
  id: string
  strategy: PromptStrategy
  model: string           // "claude-haiku-4-5-20251001"
  promptHash: string      // SHA-256 of system prompt — pins the exact prompt version
  status: RunStatus
  totalCases: number      // how many transcripts in this run (usually 50)
  completedCases: number  // how many have finished (for progress bar)
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  cacheReadTokens: number  // should be high — proves caching is working
  cacheWriteTokens: number // first run writes cache, subsequent runs read it
  wallTimeMs: number
  createdAt: Date
  completedAt: Date | null
}

// What the client sends to POST /api/v1/runs
export type CreateRunRequest = {
  strategy: PromptStrategy
  model: string
  datasetFilter?: string[]  // optional: run only these transcript IDs (e.g. ["case_001"])
  force?: boolean           // if true, ignore cached results and re-run
}

// Lightweight summary used in the runs list page
export type RunSummary = Pick<Run,
  | "id"
  | "strategy"
  | "model"
  | "status"
  | "totalCases"
  | "completedCases"
  | "totalCostUsd"
  | "wallTimeMs"
  | "createdAt"
> & {
  overallF1: number  // average F1 across all completed cases
}
