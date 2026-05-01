"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Button } from "@test-evals/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card"
import {
  type EvalCase,
  type LlmTrace,
  type RunWithCases,
  BASE,
  getGold,
  getRunDetail,
  resumeRun,
  scoreColor,
  statusStyle,
} from "@/lib/api"
import type { ClinicalExtraction, FieldScores } from "@test-evals/shared"

// ─── Score bar visual ─────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 0.8 ? "bg-green-500" : score >= 0.6 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score * 100}%` }} />
      </div>
      <span className={`${scoreColor(score)} tabular-nums`}>{score.toFixed(3)}</span>
    </div>
  )
}

// ─── Field comparison row ─────────────────────────────────────────────────────

function CompareRow({ label, gold, pred }: { label: string; gold: unknown; pred: unknown }) {
  const goldStr = JSON.stringify(gold, null, 2)
  const predStr = JSON.stringify(pred, null, 2)
  const match = goldStr === predStr

  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs py-1.5 border-b last:border-0">
      <span className="font-medium text-muted-foreground self-start pt-0.5">{label}</span>
      <pre className="whitespace-pre-wrap break-words bg-muted/30 px-2 py-1 rounded-none text-[10px]">{goldStr}</pre>
      <pre className={`whitespace-pre-wrap break-words px-2 py-1 rounded-none text-[10px] ${match ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}>{predStr}</pre>
    </div>
  )
}

// ─── Case detail panel ────────────────────────────────────────────────────────

function CaseDetail({ evalCase }: { evalCase: EvalCase }) {
  const [gold, setGold] = useState<ClinicalExtraction | null>(null)
  const [openTrace, setOpenTrace] = useState<number | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    getGold(evalCase.transcriptId).then(setGold).catch(() => null)
  }, [evalCase.transcriptId])

  const f = evalCase.fieldScores

  return (
    <div className="p-4 space-y-4 bg-muted/10 border-t">
      {/* Field scores */}
      {f && (
        <div>
          <p className="text-xs font-medium mb-2">Field Scores</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {[
              ["Chief", f.chief_complaint],
              ["Vitals", f.vitals.average],
              ["Meds", f.medications.f1],
              ["Diagnoses", f.diagnoses.f1],
              ["Plan", f.plan.f1],
              ["Follow-up", f.follow_up],
              ["Overall", f.overall],
            ].map(([label, score]) => (
              <div key={label as string}>
                <p className="text-[10px] text-muted-foreground mb-0.5">{label as string}</p>
                <ScoreBar score={score as number} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hallucinations */}
      {evalCase.hallucinations && evalCase.hallucinations.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-red-600">Hallucinations ({evalCase.hallucinations.length})</p>
          <ul className="space-y-0.5">
            {evalCase.hallucinations.map((h, i) => (
              <li key={i} className="text-xs">
                <span className="font-mono text-muted-foreground">{h.field}:</span>{" "}
                <span className="text-red-600">{h.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gold vs Prediction */}
      {gold && evalCase.prediction && (
        <div>
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-[10px] font-medium text-muted-foreground mb-1">
            <span />
            <span>Gold</span>
            <span>Prediction</span>
          </div>
          <CompareRow label="Chief complaint" gold={gold.chief_complaint} pred={evalCase.prediction.chief_complaint} />
          <CompareRow label="Vitals" gold={gold.vitals} pred={evalCase.prediction.vitals} />
          <CompareRow label="Medications" gold={gold.medications} pred={evalCase.prediction.medications} />
          <CompareRow label="Diagnoses" gold={gold.diagnoses} pred={evalCase.prediction.diagnoses} />
          <CompareRow label="Plan" gold={gold.plan} pred={evalCase.prediction.plan} />
          <CompareRow label="Follow-up" gold={gold.follow_up} pred={evalCase.prediction.follow_up} />
        </div>
      )}

      {/* LLM Traces */}
      {evalCase.traces && evalCase.traces.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">LLM Traces ({evalCase.traces.length} attempt{evalCase.traces.length > 1 ? "s" : ""})</p>
          {evalCase.traces.map((trace) => (
            <div key={trace.id} className="border rounded-none mb-1">
              <button
                onClick={() => setOpenTrace(openTrace === trace.attemptNumber ? null : trace.attemptNumber)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/30"
              >
                <span className="font-medium">
                  Attempt {trace.attemptNumber}
                  {trace.validationErrors?.length ? (
                    <span className="ml-2 text-red-500">({trace.validationErrors.length} validation error{trace.validationErrors.length > 1 ? "s" : ""})</span>
                  ) : (
                    <span className="ml-2 text-green-600">✓ valid</span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {trace.durationMs}ms · {trace.inputTokens + trace.outputTokens} tokens
                </span>
              </button>
              {openTrace === trace.attemptNumber && (
                <div className="px-3 pb-3 space-y-2 border-t">
                  {trace.validationErrors?.length ? (
                    <div className="mt-2">
                      <p className="text-[10px] font-medium text-red-500 mb-1">Validation Errors</p>
                      <ul className="text-[10px] text-red-600 space-y-0.5">
                        {trace.validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Messages</p>
                    {trace.requestMessages.map((msg, i) => (
                      <div key={i} className="mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground">[{msg.role}] </span>
                        <pre className="text-[10px] whitespace-pre-wrap break-words bg-muted/20 px-2 py-1 mt-0.5">
                          {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RunDetailClient({ initialRun }: { initialRun: RunWithCases }) {
  const router = useRouter()
  const [run, setRun] = useState<RunWithCases>(initialRun)
  const [selectedCase, setSelectedCase] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // SSE subscription while run is active
  useEffect(() => {
    if (run.status !== "running") return

    const source = new EventSource(`${BASE}/api/v1/runs/${run.id}/stream`)
    eventSourceRef.current = source

    source.addEventListener("case_complete", async () => {
      // Refetch to get full case data (prediction + traces)
      const fresh = await getRunDetail(run.id).catch(() => null)
      if (fresh) setRun(fresh)
    })

    source.addEventListener("run_complete", async () => {
      source.close()
      const fresh = await getRunDetail(run.id).catch(() => null)
      if (fresh) setRun(fresh)
    })

    return () => source.close()
  }, [run.id, run.status])

  async function handleResume() {
    setResuming(true)
    try {
      await resumeRun(run.id)
      const fresh = await getRunDetail(run.id)
      setRun(fresh)
    } finally {
      setResuming(false)
    }
  }

  const progress = run.totalCases > 0 ? run.completedCases / run.totalCases : 0

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
      {/* Breadcrumb */}
      <div className="text-xs text-muted-foreground">
        <Link href="/runs" className="hover:underline">Runs</Link>
        <span className="mx-1">›</span>
        <span className="font-mono">{run.id.slice(0, 8)}…</span>
      </div>

      {/* Run header */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Strategy</p>
              <p className="text-sm font-mono font-medium">{run.strategy}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Model</p>
              <p className="text-sm font-mono">{run.model}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Status</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle(run.status)}`}>
                {run.status}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Progress</p>
              <p className="text-sm">{run.completedCases}/{run.totalCases}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Cost</p>
              <p className="text-sm">${run.totalCostUsd.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Started</p>
              <p className="text-sm">{new Date(run.createdAt).toLocaleString()}</p>
            </div>
            {(run.status === "failed" || run.status === "partial") && (
              <Button size="sm" variant="outline" onClick={handleResume} disabled={resuming}>
                {resuming ? "Resuming…" : "Resume"}
              </Button>
            )}
          </div>

          {/* Progress bar */}
          {run.totalCases > 0 && (
            <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${run.status === "running" ? "bg-blue-500" : run.status === "completed" ? "bg-green-500" : "bg-yellow-500"}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cases table */}
      {run.cases.length > 0 && (
        <div className="rounded-none border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Transcript", "Overall", "Chief", "Vitals", "Meds", "Dx", "Plan", "FU", "Halluc.", "Attempts", "Cost"].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.cases.map((c) => {
                const f = c.fieldScores
                const isSelected = selectedCase === c.id
                return (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCase(isSelected ? null : c.id)}
                      className={`border-t cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "bg-muted/50" : ""}`}
                    >
                      <td className="px-2 py-1.5 font-mono">{c.transcriptId}</td>
                      {f ? (
                        <>
                          <td className={`px-2 py-1.5 ${scoreColor(f.overall)} font-medium`}>{f.overall.toFixed(3)}</td>
                          <td className={`px-2 py-1.5 ${scoreColor(f.chief_complaint)}`}>{f.chief_complaint.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 ${scoreColor(f.vitals.average)}`}>{f.vitals.average.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 ${scoreColor(f.medications.f1)}`}>{f.medications.f1.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 ${scoreColor(f.diagnoses.f1)}`}>{f.diagnoses.f1.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 ${scoreColor(f.plan.f1)}`}>{f.plan.f1.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 ${scoreColor(f.follow_up)}`}>{f.follow_up.toFixed(2)}</td>
                        </>
                      ) : (
                        <td colSpan={7} className="px-2 py-1.5 text-muted-foreground">no scores</td>
                      )}
                      <td className="px-2 py-1.5">{c.hallucinations?.length ?? 0}</td>
                      <td className="px-2 py-1.5">{c.attemptCount}</td>
                      <td className="px-2 py-1.5">${c.costUsd.toFixed(4)}</td>
                    </tr>
                    {isSelected && (
                      <tr key={`${c.id}-detail`}>
                        <td colSpan={11} className="p-0">
                          <CaseDetail evalCase={c} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {run.cases.length === 0 && run.status !== "running" && (
        <p className="text-sm text-muted-foreground">No cases yet.</p>
      )}
    </div>
  )
}
