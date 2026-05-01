import type {
  ClinicalExtraction,
  FieldScores,
  HallucinationFlag,
  PromptStrategy,
} from "@test-evals/shared"

export const BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8787"

// ─── Types (mirror the DB schema rows) ───────────────────────────────────────

export type Run = {
  id: string
  strategy: string
  model: string
  promptHash: string
  status: string
  totalCases: number
  completedCases: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  wallTimeMs: number
  createdAt: string
  completedAt: string | null
}

export type EvalCase = {
  id: string
  runId: string
  transcriptId: string
  prediction: ClinicalExtraction | null
  fieldScores: FieldScores | null
  hallucinations: HallucinationFlag[] | null
  schemaValid: boolean
  attemptCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  costUsd: number
  createdAt: string
  traces?: LlmTrace[]
}

export type LlmTrace = {
  id: string
  caseId: string
  attemptNumber: number
  requestMessages: Array<{ role: string; content: unknown }>
  responseJson: unknown
  validationErrors: string[] | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number
  createdAt: string
}

export type RunWithCases = Run & { cases: EvalCase[] }

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function getRuns(): Promise<Run[]> {
  const res = await fetch(`${BASE}/api/v1/runs`, { next: { revalidate: 5 } })
  if (!res.ok) throw new Error("Failed to fetch runs")
  return res.json() as Promise<Run[]>
}

export async function getRunDetail(id: string): Promise<RunWithCases> {
  const res = await fetch(`${BASE}/api/v1/runs/${id}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`Run ${id} not found`)
  return res.json() as Promise<RunWithCases>
}

export async function getGold(transcriptId: string): Promise<ClinicalExtraction> {
  const res = await fetch(`${BASE}/api/v1/transcripts/${transcriptId}/gold`)
  if (!res.ok) throw new Error("Gold not found")
  return res.json() as Promise<ClinicalExtraction>
}

export async function getTranscriptText(transcriptId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/transcripts/${transcriptId}/text`)
  if (!res.ok) throw new Error("Transcript not found")
  return res.text()
}

export async function startRun(body: {
  strategy: PromptStrategy
  model: string
  datasetFilter?: string[]
}): Promise<{ runId: string }> {
  const res = await fetch(`${BASE}/api/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to start run")
  return res.json() as Promise<{ runId: string }>
}

export async function resumeRun(id: string): Promise<{ remainingCases: number }> {
  const res = await fetch(`${BASE}/api/v1/runs/${id}/resume`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to resume run")
  return res.json() as Promise<{ remainingCases: number }>
}

// ─── Score helpers ────────────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 0.8) return "text-green-600 dark:text-green-400"
  if (score >= 0.6) return "text-yellow-600 dark:text-yellow-400"
  return "text-red-600 dark:text-red-400"
}

export function statusStyle(status: string): string {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    partial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  }
  return map[status] ?? map.pending!
}

export function avgFieldScores(cases: EvalCase[]) {
  const valid = cases.filter((c) => c.fieldScores)
  if (!valid.length) return null
  const n = valid.length
  const sum = { chief: 0, vitals: 0, meds: 0, dx: 0, plan: 0, fu: 0, overall: 0 }
  for (const c of valid) {
    const f = c.fieldScores!
    sum.chief += f.chief_complaint
    sum.vitals += f.vitals.average
    sum.meds += f.medications.f1
    sum.dx += f.diagnoses.f1
    sum.plan += f.plan.f1
    sum.fu += f.follow_up
    sum.overall += f.overall
  }
  return {
    chief_complaint: sum.chief / n,
    vitals: sum.vitals / n,
    medications: sum.meds / n,
    diagnoses: sum.dx / n,
    plan: sum.plan / n,
    follow_up: sum.fu / n,
    overall: sum.overall / n,
    caseCount: n,
  }
}
