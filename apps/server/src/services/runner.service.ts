import { db } from "@test-evals/db"
import { cases, llmTraces, runs } from "@test-evals/db/schema/eval"
import type { PromptStrategy, RunStatus } from "@test-evals/shared"
import { eq, and } from "drizzle-orm"
import { EventEmitter } from "events"
import { resolve } from "path"
import { extractTranscript, listTranscriptIds } from "./extract.service"
import { evaluate } from "./evaluate.service"

const TRANSCRIPTS_DIR = resolve(import.meta.dir, "../../../../data/transcripts")

// ─── Semaphore ────────────────────────────────────────────────────────────────
// Limits concurrent Claude API calls to avoid hammering rate limits.
// Acquire a slot before calling Claude, release it when done.
class Semaphore {
  private slots: number
  private queue: (() => void)[] = []

  constructor(slots: number) {
    this.slots = slots
  }

  acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--
      return Promise.resolve()
    }
    // No slots available — wait in queue until one is released
    return new Promise((resolve) => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next() // wake up the next waiter
    } else {
      this.slots++
    }
  }
}

// ─── SSE event registry ───────────────────────────────────────────────────────
// Maps runId → EventEmitter so the route handler can subscribe to live events.
// When the runner emits an event, the route handler writes it to the SSE stream.
export const runEmitters = new Map<string, EventEmitter>()

function getEmitter(runId: string): EventEmitter {
  if (!runEmitters.has(runId)) {
    runEmitters.set(runId, new EventEmitter())
  }
  return runEmitters.get(runId)!
}

function emit(runId: string, event: string, data: unknown) {
  getEmitter(runId).emit("event", { event, data })
}

// ─── Start a new run ──────────────────────────────────────────────────────────
export async function startRun(
  runId: string,
  strategy: PromptStrategy,
  model: string,
  datasetFilter?: string[],
): Promise<void> {
  const allIds = await listTranscriptIds()
  const transcriptIds = datasetFilter?.length
    ? allIds.filter((id) => datasetFilter.includes(id))
    : allIds

  // Update run as running with total case count
  await db
    .update(runs)
    .set({ status: "running" as RunStatus, totalCases: transcriptIds.length })
    .where(eq(runs.id, runId))

  await processRun(runId, strategy, model, transcriptIds)
}

// ─── Resume an interrupted run ────────────────────────────────────────────────
// Finds which cases already completed and skips them — no double-charging.
export async function resumeRun(runId: string): Promise<{ remainingCases: number }> {
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) })
  if (!run) throw new Error(`Run ${runId} not found`)

  // Find already-completed case IDs for this run
  const completedCases = await db
    .select({ transcriptId: cases.transcriptId })
    .from(cases)
    .where(eq(cases.runId, runId))

  const completedIds = new Set(completedCases.map((c) => c.transcriptId))

  // Get all transcript IDs and remove already-done ones
  const allIds = await listTranscriptIds()
  const remainingIds = allIds.filter((id) => !completedIds.has(id))

  if (remainingIds.length === 0) {
    await db.update(runs).set({ status: "completed" }).where(eq(runs.id, runId))
    return { remainingCases: 0 }
  }

  await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId))
  processRun(runId, run.strategy as PromptStrategy, run.model, remainingIds)

  return { remainingCases: remainingIds.length }
}

// ─── Core processing loop ─────────────────────────────────────────────────────
async function processRun(
  runId: string,
  strategy: PromptStrategy,
  model: string,
  transcriptIds: string[],
): Promise<void> {
  const semaphore = new Semaphore(5) // max 5 concurrent cases

  const tasks = transcriptIds.map((transcriptId) =>
    (async () => {
      await semaphore.acquire()
      try {
        await processCase(runId, transcriptId, strategy, model)
      } finally {
        semaphore.release()
      }
    })(),
  )

  // Wait for all cases to finish
  const results = await Promise.allSettled(tasks)
  const failedCount = results.filter((r) => r.status === "rejected").length

  const status: RunStatus = failedCount === transcriptIds.length ? "failed" : "completed"
  await db.update(runs).set({ status, completedAt: new Date() }).where(eq(runs.id, runId))

  emit(runId, "run_complete", { runId, failedCount })

  // Clean up the emitter after a short delay (let clients receive the final event)
  setTimeout(() => runEmitters.delete(runId), 5000)
}

// ─── Process a single case ────────────────────────────────────────────────────
async function processCase(
  runId: string,
  transcriptId: string,
  strategy: PromptStrategy,
  model: string,
): Promise<void> {
  // Idempotency check — if this case already exists for this run, skip it.
  // This means calling the same run twice won't re-charge you for completed cases.
  const existing = await db.query.cases.findFirst({
    where: and(eq(cases.runId, runId), eq(cases.transcriptId, transcriptId)),
  })
  if (existing) {
    emit(runId, "case_skipped", { transcriptId, reason: "already_completed" })
    return
  }

  try {
    // Read the transcript text for hallucination detection (evaluate needs it)
    const transcriptPath = resolve(TRANSCRIPTS_DIR, `${transcriptId}.txt`)
    const transcript = await Bun.file(transcriptPath).text()

    // Step 1: Extract — send to Claude
    const extractResult = await extractTranscript(transcriptId, strategy, model)

    // Step 2: Evaluate — score prediction vs gold
    const evalResult = await evaluate(transcriptId, extractResult.extraction, transcript)

    // Step 3: Persist case result
    const caseId = crypto.randomUUID()
    await db.insert(cases).values({
      id: caseId,
      runId,
      transcriptId,
      prediction: extractResult.extraction,
      fieldScores: evalResult.fieldScores,
      hallucinations: evalResult.hallucinations,
      schemaValid: extractResult.schemaValid,
      attemptCount: extractResult.attemptCount,
      inputTokens: extractResult.inputTokens,
      outputTokens: extractResult.outputTokens,
      cacheReadTokens: extractResult.cacheReadTokens,
      costUsd: extractResult.costUsd,
    })

    // Step 4: Persist every LLM trace (every retry attempt)
    for (const trace of extractResult.traces) {
      await db.insert(llmTraces).values({
        id: crypto.randomUUID(),
        caseId,
        attemptNumber: trace.attemptNumber,
        requestMessages: trace.requestMessages,
        responseJson: trace.responseJson,
        validationErrors: trace.validationErrors,
        inputTokens: trace.inputTokens,
        outputTokens: trace.outputTokens,
        cacheReadTokens: trace.cacheReadTokens,
        cacheWriteTokens: trace.cacheWriteTokens,
        durationMs: trace.durationMs,
      })
    }

    // Step 5: Update run aggregate totals
    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) })
    if (run) {
      await db.update(runs).set({
        completedCases: run.completedCases + 1,
        totalInputTokens: run.totalInputTokens + extractResult.inputTokens,
        totalOutputTokens: run.totalOutputTokens + extractResult.outputTokens,
        cacheReadTokens: run.cacheReadTokens + extractResult.cacheReadTokens,
        cacheWriteTokens: run.cacheWriteTokens + extractResult.cacheWriteTokens,
        totalCostUsd: run.totalCostUsd + extractResult.costUsd,
      }).where(eq(runs.id, runId))
    }

    // Step 6: Emit SSE event so the dashboard updates live
    emit(runId, "case_complete", {
      transcriptId,
      fieldScores: evalResult.fieldScores,
      hallucinations: evalResult.hallucinations.length,
      schemaValid: extractResult.schemaValid,
      attemptCount: extractResult.attemptCount,
      cacheReadTokens: extractResult.cacheReadTokens,
      costUsd: extractResult.costUsd,
    })
  } catch (err) {
    emit(runId, "case_error", {
      transcriptId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// ─── Create a new run record in the DB ───────────────────────────────────────
export async function createRun(
  strategy: PromptStrategy,
  model: string,
  promptHash: string,
): Promise<string> {
  const runId = crypto.randomUUID()
  await db.insert(runs).values({
    id: runId,
    strategy,
    model,
    promptHash,
    status: "pending",
  })
  return runId
}
