"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Button } from "@test-evals/ui/components/button"
import { Card, CardContent } from "@test-evals/ui/components/card"
import {
  type EvalCase,
  type RunWithCases,
  BASE,
  getGold,
  getRunDetail,
  resumeRun,
  scoreColor,
} from "@/lib/api"
import type { ClinicalExtraction } from "@test-evals/shared"

// ─── Score pill ───────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  const bg =
    score >= 0.8 ? "bg-green-500/10 text-green-600 dark:text-green-400 ring-green-500/20"
    : score >= 0.6 ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ring-yellow-500/20"
    : "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20"
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-mono font-medium ring-1 tabular-nums ${bg}`}>
      {score.toFixed(2)}
    </span>
  )
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 0.8 ? "bg-green-500" : score >= 0.6 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-mono tabular-nums ${scoreColor(score)}`}>{score.toFixed(3)}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score * 100}%` }} />
      </div>
    </div>
  )
}

// ─── Field compare row ────────────────────────────────────────────────────────

function CompareRow({ label, gold, pred }: { label: string; gold: unknown; pred: unknown }) {
  const goldStr = JSON.stringify(gold, null, 2)
  const predStr = JSON.stringify(pred, null, 2)
  const match = goldStr === predStr
  return (
    <div className="grid grid-cols-[110px_1fr_1fr] gap-3 py-2 border-b border-border/30 last:border-0">
      <span className="text-[10px] font-medium text-muted-foreground self-start pt-1">{label}</span>
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-2.5 py-1.5 text-[10px] leading-relaxed">{goldStr}</pre>
      <pre className={`whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed ${match ? "bg-green-500/8 dark:bg-green-500/10" : "bg-red-500/8 dark:bg-red-500/10"}`}>{predStr}</pre>
    </div>
  )
}

// ─── Case detail panel ────────────────────────────────────────────────────────

function CaseDetail({ evalCase }: { evalCase: EvalCase }) {
  const [gold, setGold] = useState<ClinicalExtraction | null>(null)
  const [openTrace, setOpenTrace] = useState<number | null>(null)

  useEffect(() => {
    getGold(evalCase.transcriptId).then(setGold).catch(() => null)
  }, [evalCase.transcriptId])

  const f = evalCase.fieldScores

  return (
    <div className="p-5 space-y-6 bg-muted/20 border-t border-border/30">
      {/* Field scores */}
      {f && (
        <div>
          <p className="text-xs font-semibold mb-3 text-foreground/80">Field Scores</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            {([
              ["Chief", f.chief_complaint],
              ["Vitals", f.vitals.average],
              ["Meds", f.medications.f1],
              ["Diagnoses", f.diagnoses.f1],
              ["Plan", f.plan.f1],
              ["Follow-up", f.follow_up],
              ["Overall", f.overall],
            ] as [string, number][]).map(([label, score]) => (
              <ScoreBar key={label} label={label} score={score} />
            ))}
          </div>
        </div>
      )}

      {/* Hallucinations */}
      {evalCase.hallucinations && evalCase.hallucinations.length > 0 && (
        <div className="rounded-xl bg-red-500/5 ring-1 ring-red-500/20 p-4">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">
            Hallucinations ({evalCase.hallucinations.length})
          </p>
          <ul className="space-y-1">
            {evalCase.hallucinations.map((h, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="font-mono text-muted-foreground shrink-0">{h.field}:</span>
                <span className="text-red-600 dark:text-red-400">{h.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gold vs Prediction */}
      {gold && evalCase.prediction && (
        <div>
          <div className="grid grid-cols-[110px_1fr_1fr] gap-3 mb-2">
            <span />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Gold</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Prediction</span>
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
          <p className="text-xs font-semibold mb-2 text-foreground/80">
            LLM Traces ({evalCase.traces.length} attempt{evalCase.traces.length > 1 ? "s" : ""})
          </p>
          <div className="space-y-2">
            {evalCase.traces.map((trace) => (
              <div key={trace.id} className="rounded-xl border border-border/40 overflow-hidden">
                <button
                  onClick={() => setOpenTrace(openTrace === trace.attemptNumber ? null : trace.attemptNumber)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/40 transition-colors"
                >
                  <span className="font-medium flex items-center gap-2">
                    Attempt {trace.attemptNumber}
                    {trace.validationErrors?.length ? (
                      <span className="rounded-full bg-red-500/10 text-red-500 ring-1 ring-red-500/20 px-2 py-0.5 text-[10px]">
                        {trace.validationErrors.length} error{trace.validationErrors.length > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-500/10 text-green-600 dark:text-green-400 ring-1 ring-green-500/20 px-2 py-0.5 text-[10px]">
                        ✓ valid
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {trace.durationMs}ms · {trace.inputTokens + trace.outputTokens} tokens
                  </span>
                </button>
                {openTrace === trace.attemptNumber && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/30 bg-muted/10">
                    {trace.validationErrors?.length ? (
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-red-500 mb-1.5 uppercase tracking-wide">Validation Errors</p>
                        <ul className="text-[10px] text-red-600 dark:text-red-400 space-y-0.5">
                          {trace.validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Messages</p>
                      <div className="space-y-2">
                        {trace.requestMessages.map((msg, i) => (
                          <div key={i}>
                            <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase">[{msg.role}]</span>
                            <pre className="mt-1 text-[10px] whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 leading-relaxed">
                              {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/10 text-green-600 dark:text-green-400 ring-green-500/20",
    running:   "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20",
    pending:   "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ring-yellow-500/20",
    failed:    "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${styles[status] ?? "bg-muted text-muted-foreground ring-border"}`}>
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />}
      {status}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RunDetailClient({ initialRun }: { initialRun: RunWithCases }) {
  const [run, setRun] = useState<RunWithCases>(initialRun)
  const [selectedCase, setSelectedCase] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (run.status !== "running") return
    const source = new EventSource(`${BASE}/api/v1/runs/${run.id}/stream`)
    eventSourceRef.current = source
    source.addEventListener("case_complete", async () => {
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
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/runs" className="hover:text-foreground transition-colors">Runs</Link>
        <span>/</span>
        <span className="font-mono text-foreground/70">{run.id.slice(0, 8)}…</span>
      </div>

      {/* Run summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Strategy", value: <span className="font-mono text-xs bg-muted/60 rounded-md px-2 py-0.5">{run.strategy}</span> },
          { label: "Status", value: <StatusBadge status={run.status} /> },
          { label: "Progress", value: `${run.completedCases}/${run.totalCases}` },
          { label: "Cost", value: `$${run.totalCostUsd.toFixed(4)}` },
          { label: "Started", value: new Date(run.createdAt).toLocaleDateString() },
          { label: "Model", value: <span className="truncate text-xs">{run.model}</span> },
        ].map(({ label, value }) => (
          <Card key={label} className="rounded-2xl border-border/50 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <div className="text-sm font-medium">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      {run.totalCases > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                run.status === "running" ? "bg-blue-500"
                : run.status === "completed" ? "bg-green-500"
                : "bg-yellow-500"
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Resume button */}
      {(run.status === "failed" || run.status === "partial") && (
        <Button variant="outline" size="sm" onClick={handleResume} disabled={resuming} className="rounded-full">
          {resuming ? "Resuming…" : "Resume Run"}
        </Button>
      )}

      {/* Cases table */}
      {run.cases.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                {["Case", "Overall", "Chief", "Vitals", "Meds", "Dx", "Plan", "F/U", "Halluc.", "Tries", "Cost"].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.cases.map((c, i) => {
                const f = c.fieldScores
                const isSelected = selectedCase === c.id
                return (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCase(isSelected ? null : c.id)}
                      className={`cursor-pointer transition-colors group ${i !== 0 ? "border-t border-border/30" : ""} ${isSelected ? "bg-muted/50" : "hover:bg-muted/30"}`}
                    >
                      <td className="px-3 py-2.5 font-mono font-medium">{c.transcriptId}</td>
                      {f ? (
                        <>
                          <td className="px-3 py-2.5"><ScorePill score={f.overall} /></td>
                          <td className={`px-3 py-2.5 tabular-nums ${scoreColor(f.chief_complaint)}`}>{f.chief_complaint.toFixed(2)}</td>
                          <td className={`px-3 py-2.5 tabular-nums ${scoreColor(f.vitals.average)}`}>{f.vitals.average.toFixed(2)}</td>
                          <td className={`px-3 py-2.5 tabular-nums ${scoreColor(f.medications.f1)}`}>{f.medications.f1.toFixed(2)}</td>
                          <td className={`px-3 py-2.5 tabular-nums ${scoreColor(f.diagnoses.f1)}`}>{f.diagnoses.f1.toFixed(2)}</td>
                          <td className={`px-3 py-2.5 tabular-nums ${scoreColor(f.plan.f1)}`}>{f.plan.f1.toFixed(2)}</td>
                          <td className={`px-3 py-2.5 tabular-nums ${scoreColor(f.follow_up)}`}>{f.follow_up.toFixed(2)}</td>
                        </>
                      ) : (
                        <td colSpan={7} className="px-3 py-2.5 text-muted-foreground italic">pending</td>
                      )}
                      <td className="px-3 py-2.5">
                        {c.hallucinations?.length ? (
                          <span className="rounded-full bg-red-500/10 text-red-500 ring-1 ring-red-500/20 px-1.5 py-0.5 text-[10px] font-medium">
                            {c.hallucinations.length}
                          </span>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.attemptCount}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">${c.costUsd.toFixed(4)}</td>
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
        <div className="rounded-2xl border-2 border-dashed border-border/50 flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">No cases processed yet.</p>
        </div>
      )}
    </div>
  )
}
