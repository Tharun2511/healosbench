import { relations } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { ClinicalExtraction } from "@test-evals/shared"
import type { FieldScores, HallucinationFlag } from "@test-evals/shared"
import type { LlmTrace } from "@test-evals/shared"

// ─── runs ────────────────────────────────────────────────────────────────────
// One row per eval run (e.g. "zero_shot on all 50 cases started at 10am")
export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  strategy: text("strategy").notNull(),     // "zero_shot" | "few_shot" | "cot"
  model: text("model").notNull(),            // "claude-haiku-4-5-20251001"
  promptHash: text("prompt_hash").notNull(), // SHA-256 of system prompt

  status: text("status").notNull().default("pending"),
  // "pending" | "running" | "completed" | "failed" | "partial"

  totalCases: integer("total_cases").notNull().default(0),
  completedCases: integer("completed_cases").notNull().default(0),

  // token + cost aggregates (summed across all cases)
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),

  wallTimeMs: integer("wall_time_ms").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
})

// ─── cases ───────────────────────────────────────────────────────────────────
// One row per transcript per run — the scored result
export const cases = pgTable(
  "cases",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),

    transcriptId: text("transcript_id").notNull(), // "case_001"

    // What Claude returned (null if all 3 retries failed validation)
    prediction: jsonb("prediction").$type<ClinicalExtraction | null>(),

    // Per-field scores — stored as JSON so we can query/display them easily
    fieldScores: jsonb("field_scores").$type<FieldScores>(),

    // Values Claude produced that weren't grounded in the transcript
    hallucinations: jsonb("hallucinations").$type<HallucinationFlag[]>(),

    schemaValid: boolean("schema_valid").notNull().default(true),
    attemptCount: integer("attempt_count").notNull().default(1),

    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cases_run_id_idx").on(table.runId),
    // This pair uniquely identifies a case in a run — used for idempotency check
    index("cases_run_transcript_idx").on(table.runId, table.transcriptId),
  ],
)

// ─── llm_traces ──────────────────────────────────────────────────────────────
// Every Claude API call ever made — one row per attempt in the retry loop
// This is what populates the trace viewer in the dashboard
export const llmTraces = pgTable(
  "llm_traces",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),

    attemptNumber: integer("attempt_number").notNull(), // 1, 2, or 3

    // Full conversation sent to Claude — stored so you can replay/debug
    requestMessages: jsonb("request_messages").$type<unknown[]>().notNull(),

    // Raw Claude response object
    responseJson: jsonb("response_json").$type<unknown>(),

    // JSON Schema validation errors that triggered the retry (empty = success)
    validationErrors: jsonb("validation_errors").$type<string[]>(),

    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("llm_traces_case_id_idx").on(table.caseId)],
)

// ─── Relations ───────────────────────────────────────────────────────────────
// These tell Drizzle how the tables connect — enables joined queries

export const runsRelations = relations(runs, ({ many }) => ({
  cases: many(cases),
}))

export const casesRelations = relations(cases, ({ one, many }) => ({
  run: one(runs, { fields: [cases.runId], references: [runs.id] }),
  traces: many(llmTraces),
}))

export const llmTracesRelations = relations(llmTraces, ({ one }) => ({
  case: one(cases, { fields: [llmTraces.caseId], references: [cases.id] }),
}))
