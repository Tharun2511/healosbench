"use client"

import { useEffect, useState } from "react"
import { Button } from "@test-evals/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card"
import { type Run, type RunWithCases, getRuns, getRunDetail, avgFieldScores, scoreColor } from "@/lib/api"

type AvgScores = NonNullable<ReturnType<typeof avgFieldScores>>

const FIELDS: { key: keyof Omit<AvgScores, "caseCount">; label: string; weight: string }[] = [
  { key: "chief_complaint", label: "Chief Complaint", weight: "10%" },
  { key: "vitals", label: "Vitals", weight: "20%" },
  { key: "medications", label: "Medications (F1)", weight: "25%" },
  { key: "diagnoses", label: "Diagnoses (F1)", weight: "20%" },
  { key: "plan", label: "Plan (F1)", weight: "15%" },
  { key: "follow_up", label: "Follow-up", weight: "10%" },
  { key: "overall", label: "Overall (weighted)", weight: "—" },
]

function ScoreCell({ score }: { score: number }) {
  return (
    <td className={`px-4 py-3 tabular-nums font-mono text-sm ${scoreColor(score)}`}>
      {score.toFixed(3)}
    </td>
  )
}

function DeltaCell({ a, b }: { a: number; b: number }) {
  const delta = b - a
  const color = Math.abs(delta) < 0.005
    ? "text-muted-foreground"
    : delta > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
  return (
    <td className={`px-4 py-3 tabular-nums font-mono text-sm font-medium ${color}`}>
      {delta > 0 ? "+" : ""}{delta.toFixed(3)}
    </td>
  )
}

export default function ComparePage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [runAId, setRunAId] = useState("")
  const [runBId, setRunBId] = useState("")
  const [runA, setRunA] = useState<RunWithCases | null>(null)
  const [runB, setRunB] = useState<RunWithCases | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRuns().then(setRuns).catch(() => null)
  }, [])

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault()
    if (!runAId || !runBId || runAId === runBId) {
      setError("Select two different runs")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [a, b] = await Promise.all([getRunDetail(runAId), getRunDetail(runBId)])
      setRunA(a)
      setRunB(b)
    } catch {
      setError("Failed to load one or both runs")
    } finally {
      setLoading(false)
    }
  }

  const scoresA = runA ? avgFieldScores(runA.cases) : null
  const scoresB = runB ? avgFieldScores(runB.cases) : null

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare Runs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Side-by-side field-level accuracy comparison</p>
      </div>

      {/* Selection form */}
      <Card className="rounded-2xl border-border/60 bg-card/80 backdrop-blur-sm shadow-sm">
        <CardContent className="pt-5">
          <form onSubmit={handleCompare} className="flex flex-wrap gap-4 items-end">
            {[
              { label: "Run A", value: runAId, set: setRunAId },
              { label: "Run B", value: runBId, set: setRunBId },
            ].map(({ label, value, set }) => (
              <div key={label} className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                <label className="text-xs font-medium text-muted-foreground">{label}</label>
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="h-9 rounded-full border border-border/60 bg-background/80 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                >
                  <option value="">— select a run —</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.strategy} · {r.model.split("/").pop()?.split("-").slice(-2).join("-") ?? r.model} · {new Date(r.createdAt).toLocaleDateString()} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button type="submit" disabled={loading} className="rounded-full px-6 h-9 shadow-sm shadow-primary/20">
              {loading ? "Loading…" : "Compare"}
            </Button>
            {error && <p className="w-full text-xs text-red-500">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {scoresA && scoresB && runA && runB && (
        <Card className="rounded-2xl border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base">Per-field Score Comparison</CardTitle>
            <div className="flex gap-6 mt-2">
              {[
                { tag: "A", run: runA, scores: scoresA, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20" },
                { tag: "B", run: runB, scores: scoresB, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-purple-500/20" },
              ].map(({ tag, run, scores, color }) => (
                <div key={tag} className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${color}`}>{tag}</span>
                  <span className="text-muted-foreground">{run.strategy}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="text-muted-foreground">{scores.caseCount} cases</span>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Field</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Weight</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Run A</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">Run B</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">B − A</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Winner</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label, weight }, i) => {
                  const a = scoresA[key]
                  const b = scoresB[key]
                  const winner = Math.abs(a - b) < 0.005 ? "tie" : a > b ? "A" : "B"
                  const isOverall = key === "overall"
                  return (
                    <tr key={key} className={`${i !== 0 ? "border-t border-border/30" : ""} ${isOverall ? "bg-muted/20 font-semibold" : ""}`}>
                      <td className="px-4 py-3">{label}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{weight}</td>
                      <ScoreCell score={a} />
                      <ScoreCell score={b} />
                      <DeltaCell a={a} b={b} />
                      <td className="px-4 py-3">
                        {winner === "tie" ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                            winner === "B"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-purple-500/20"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20"
                          }`}>
                            {winner}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Summary */}
            <div className="px-4 py-4 border-t border-border/40 bg-muted/10">
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const delta = scoresB.overall - scoresA.overall
                  if (Math.abs(delta) < 0.005) return "The two strategies performed equally overall."
                  const better = delta > 0 ? runB.strategy : runA.strategy
                  const worse = delta > 0 ? runA.strategy : runB.strategy
                  return `${better} outperformed ${worse} overall by ${Math.abs(delta).toFixed(3)} points (${(Math.abs(delta) * 100).toFixed(1)}%).`
                })()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
