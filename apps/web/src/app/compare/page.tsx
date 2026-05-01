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

function DeltaCell({ a, b }: { a: number; b: number }) {
  const delta = b - a
  const color = Math.abs(delta) < 0.005
    ? "text-muted-foreground"
    : delta > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
  return (
    <td className={`px-3 py-2 tabular-nums ${color}`}>
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
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold">Compare Runs</h1>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleCompare} className="flex flex-wrap gap-4 items-end">
            {[
              { label: "Run A", value: runAId, set: setRunAId },
              { label: "Run B", value: runBId, set: setRunBId },
            ].map(({ label, value, set }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="h-8 border border-input rounded-none px-2 text-xs bg-background w-72"
                >
                  <option value="">— select a run —</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.strategy} · {r.model.split("-").slice(-2).join("-")} · {new Date(r.createdAt).toLocaleString()} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Loading…" : "Compare"}
            </Button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {scoresA && scoresB && runA && runB && (
        <Card>
          <CardHeader>
            <CardTitle>Per-field Score Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Weight</th>
                  <th className="px-3 py-2 text-left font-medium">
                    A: {runA.strategy} <span className="text-muted-foreground">({scoresA.caseCount} cases)</span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    B: {runB.strategy} <span className="text-muted-foreground">({scoresB.caseCount} cases)</span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">B − A</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Winner</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label, weight }) => {
                  const a = scoresA[key]
                  const b = scoresB[key]
                  const winner = Math.abs(a - b) < 0.005 ? "tie" : a > b ? "A" : "B"
                  return (
                    <tr key={key} className="border-t">
                      <td className={`px-3 py-2 ${key === "overall" ? "font-semibold" : ""}`}>{label}</td>
                      <td className="px-3 py-2 text-muted-foreground">{weight}</td>
                      <td className={`px-3 py-2 tabular-nums ${scoreColor(a)}`}>{a.toFixed(3)}</td>
                      <td className={`px-3 py-2 tabular-nums ${scoreColor(b)}`}>{b.toFixed(3)}</td>
                      <DeltaCell a={a} b={b} />
                      <td className="px-3 py-2">
                        {winner === "tie" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={winner === "B" ? "text-green-600 dark:text-green-400 font-medium" : "text-blue-600 dark:text-blue-400 font-medium"}>
                            {winner}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Summary sentence */}
            <div className="px-4 py-3 border-t text-xs text-muted-foreground">
              {(() => {
                const delta = scoresB.overall - scoresA.overall
                if (Math.abs(delta) < 0.005) return "The two strategies performed equally."
                const better = delta > 0 ? `${runB.strategy}` : `${runA.strategy}`
                const worse = delta > 0 ? `${runA.strategy}` : `${runB.strategy}`
                return `${better} outperformed ${worse} overall by ${Math.abs(delta).toFixed(3)} points (${(Math.abs(delta) * 100).toFixed(1)}%).`
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
