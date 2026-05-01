"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Button } from "@test-evals/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card"
import { type Run, getRuns, startRun, statusStyle, scoreColor } from "@/lib/api"

const STRATEGIES = ["zero_shot", "few_shot", "cot"] as const
const DEFAULT_MODEL = "claude-haiku-4-5-20251001"

export default function RunsClient({ initialRuns }: { initialRuns: Run[] }) {
  const router = useRouter()
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const [showForm, setShowForm] = useState(false)
  const [strategy, setStrategy] = useState<string>("zero_shot")
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "running" || r.status === "pending")
    if (hasActive) {
      pollRef.current = setInterval(async () => {
        const fresh = await getRuns().catch(() => null)
        if (fresh) setRuns(fresh)
      }, 4000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [runs])

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    setStarting(true)
    setError(null)
    try {
      const { runId } = await startRun({ strategy: strategy as "zero_shot" | "few_shot" | "cot", model })
      router.push(`/runs/${runId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run")
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evaluation Runs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{runs.length} run{runs.length !== 1 ? "s" : ""} total</p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full px-5 shadow-sm shadow-primary/20 hover:shadow-primary/30 transition-shadow"
        >
          {showForm ? "Cancel" : "+ New Run"}
        </Button>
      </div>

      {/* New run form */}
      {showForm && (
        <Card className="rounded-2xl border-border/60 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configure New Run</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStart} className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Strategy</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="h-9 rounded-full border border-border/60 bg-background/80 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-9 rounded-full border border-border/60 bg-background/80 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  placeholder="model name"
                />
              </div>
              <Button type="submit" disabled={starting} className="rounded-full px-6 h-9 shadow-sm shadow-primary/20">
                {starting ? "Starting…" : "Start Run"}
              </Button>
              {error && <p className="w-full text-xs text-red-500 mt-1">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Runs table */}
      {runs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground text-sm">No runs yet.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Start your first evaluation above.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                {["Strategy", "Model", "Status", "Progress", "Avg Score", "Cost", "Started"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr
                  key={run.id}
                  onClick={() => router.push(`/runs/${run.id}`)}
                  className={`cursor-pointer hover:bg-muted/40 transition-colors group ${i !== 0 ? "border-t border-border/30" : ""}`}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-muted/60 rounded-md px-2 py-0.5">{run.strategy}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[180px]">{run.model}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3">
                    {run.totalCases > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all"
                            style={{ width: `${(run.completedCases / run.totalCases) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">{run.completedCases}/{run.totalCases}</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">${run.totalCostUsd.toFixed(4)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

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
