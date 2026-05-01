import { db } from "@test-evals/db"
import { cases, llmTraces, runs } from "@test-evals/db/schema/eval"
import { hashPrompt, strategies } from "@test-evals/llm"
import type { CreateRunRequest } from "@test-evals/shared"
import { eq, desc } from "drizzle-orm"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { createRun, resumeRun, runEmitters, startRun } from "../services/runner.service"

export const runsRouter = new Hono()

// ─── POST /api/v1/runs ────────────────────────────────────────────────────────
// Body: { strategy, model, datasetFilter? }
// Creates a run record and immediately starts processing in the background.
// Returns the runId so the client can open the SSE stream right away.
runsRouter.post("/", async (c) => {
  const body = await c.req.json<CreateRunRequest>()
  const { strategy, model, datasetFilter } = body

  if (!strategy || !model) {
    return c.json({ error: "strategy and model are required" }, 400)
  }

  const strat = strategies[strategy]
  if (!strat) {
    return c.json({ error: `Unknown strategy: ${strategy}` }, 400)
  }

  const promptHash = hashPrompt(strat.systemPrompt)
  const runId = await createRun(strategy, model, promptHash)

  // Fire-and-forget — the SSE stream lets clients track progress
  startRun(runId, strategy, model, datasetFilter).catch((err) => {
    console.error(`Run ${runId} failed:`, err)
  })

  return c.json({ runId }, 201)
})

// ─── GET /api/v1/runs ─────────────────────────────────────────────────────────
// Returns all runs newest-first — used to populate the runs list page.
runsRouter.get("/", async (c) => {
  const allRuns = await db.select().from(runs).orderBy(desc(runs.createdAt))
  return c.json(allRuns)
})

// ─── GET /api/v1/runs/:id ─────────────────────────────────────────────────────
// Returns the run + every case with its LLM traces (full detail page).
runsRouter.get("/:id", async (c) => {
  const runId = c.req.param("id")

  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: {
      cases: {
        with: { traces: true },
      },
    },
  })

  if (!run) return c.json({ error: "Run not found" }, 404)

  return c.json(run)
})

// ─── GET /api/v1/runs/:id/cases ───────────────────────────────────────────────
// Paginated cases for a run — used when we need a flat list without traces.
runsRouter.get("/:id/cases", async (c) => {
  const runId = c.req.param("id")

  const runCases = await db
    .select()
    .from(cases)
    .where(eq(cases.runId, runId))

  return c.json(runCases)
})

// ─── GET /api/v1/runs/:id/cases/:caseId/traces ────────────────────────────────
// All LLM traces for a single case — used by the trace viewer.
runsRouter.get("/:id/cases/:caseId/traces", async (c) => {
  const caseId = c.req.param("caseId")

  const traces = await db
    .select()
    .from(llmTraces)
    .where(eq(llmTraces.caseId, caseId))

  return c.json(traces)
})

// ─── GET /api/v1/runs/:id/stream ─────────────────────────────────────────────
// SSE endpoint — the dashboard opens this to get live case_complete events.
// Each event is: data: {"event":"case_complete","data":{...}}\n\n
// The stream closes automatically when the run finishes (run_complete event).
runsRouter.get("/:id/stream", (c) => {
  const runId = c.req.param("id")

  return streamSSE(c, async (stream) => {
    // Send a ping immediately so the client knows the connection is alive
    await stream.writeSSE({ event: "ping", data: JSON.stringify({ runId }) })

    await new Promise<void>((resolve) => {
      const emitter = runEmitters.get(runId)

      // If there's no emitter, the run either hasn't started or already finished
      if (!emitter) {
        resolve()
        return
      }

      const handler = async (payload: { event: string; data: unknown }) => {
        await stream.writeSSE({
          event: payload.event,
          data: JSON.stringify(payload.data),
        })

        // Close the stream once the run is done
        if (payload.event === "run_complete") {
          resolve()
        }
      }

      emitter.on("event", handler)

      // Clean up if the client disconnects early
      stream.onAbort(() => {
        emitter.off("event", handler)
        resolve()
      })
    })
  })
})

// ─── POST /api/v1/runs/:id/resume ────────────────────────────────────────────
// Resumes a run that was interrupted mid-way (e.g. server crash).
// Skips cases that already have a DB row, continues from where it left off.
runsRouter.post("/:id/resume", async (c) => {
  const runId = c.req.param("id")

  try {
    const result = await resumeRun(runId)
    return c.json(result)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})
