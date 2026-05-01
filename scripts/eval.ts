/**
 * CLI entry point for running evaluations without the dashboard.
 *
 * Usage:
 *   bun run eval                            # zero_shot, all 50 cases
 *   bun run eval -- --strategy=few_shot
 *   bun run eval -- --strategy=cot --model=claude-haiku-4-5-20251001
 *   bun run eval -- --strategy=zero_shot --cases=case_001,case_002,case_003
 */

import { EventEmitter } from "events"
import { hashPrompt, strategies } from "@test-evals/llm"
import type { PromptStrategy } from "@test-evals/shared"
import { createRun, runEmitters, startRun } from "../apps/server/src/services/runner.service"

// ─── Parse CLI args ───────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const flag = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(flag))
  return found ? found.slice(flag.length) : undefined
}

const strategy = (getArg("strategy") ?? "zero_shot") as PromptStrategy
const model = getArg("model") ?? "claude-haiku-4-5-20251001"
const casesArg = getArg("cases")
const datasetFilter = casesArg ? casesArg.split(",").map((s) => s.trim()) : undefined

// ─── Validate ─────────────────────────────────────────────────────────────────

const validStrategies: PromptStrategy[] = ["zero_shot", "few_shot", "cot"]
if (!validStrategies.includes(strategy)) {
  console.error(`Invalid strategy "${strategy}". Choose from: ${validStrategies.join(", ")}`)
  process.exit(1)
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const strat = strategies[strategy]
const promptHash = hashPrompt(strat.systemPrompt)
const runId = await createRun(strategy, model, promptHash)

console.log("─".repeat(50))
console.log(`Strategy  : ${strategy}`)
console.log(`Model     : ${model}`)
console.log(`Cases     : ${datasetFilter ? datasetFilter.join(", ") : "all"}`)
console.log(`Prompt    : ${promptHash}`)
console.log(`Run ID    : ${runId}`)
console.log("─".repeat(50))
console.log()

// Pre-register the emitter BEFORE startRun so we don't miss any events.
// runner.service uses getEmitter() which creates lazily — by seeding it here
// we guarantee our listener is attached before the first case_complete fires.
const emitter = new EventEmitter()
runEmitters.set(runId, emitter)

let completed = 0
let failed = 0
const startTime = Date.now()

// ─── Listen for live events ───────────────────────────────────────────────────

const runFinished = new Promise<void>((resolve) => {
  emitter.on("event", ({ event, data }: { event: string; data: Record<string, unknown> }) => {
    if (event === "case_complete") {
      completed++
      const scores = data.fieldScores as Record<string, unknown> | undefined
      const overall = typeof scores?.overall === "number" ? scores.overall.toFixed(3) : "?"
      const cost = typeof data.costUsd === "number" ? data.costUsd.toFixed(4) : "?"
      console.log(
        `  [${String(completed).padStart(2)}] ${data.transcriptId}` +
        `  overall=${overall}` +
        `  hallucinations=${data.hallucinations}` +
        `  cost=$${cost}`,
      )
    } else if (event === "case_error") {
      failed++
      console.error(`  [ERR] ${data.transcriptId}: ${data.error}`)
    } else if (event === "case_skipped") {
      console.log(`  [SKIP] ${data.transcriptId} — already completed`)
    } else if (event === "run_complete") {
      resolve()
    }
  })
})

// ─── Start the run and wait ───────────────────────────────────────────────────

await Promise.all([
  startRun(runId, strategy, model, datasetFilter),
  runFinished,
])

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

console.log()
console.log("─".repeat(50))
console.log(`Done in ${elapsed}s`)
console.log(`Completed : ${completed}`)
console.log(`Failed    : ${failed}`)
console.log(`Run ID    : ${runId}`)
console.log("─".repeat(50))
