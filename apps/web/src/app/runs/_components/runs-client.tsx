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

  // Poll every 4s while any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "running" || r.status === "pending")
    if (hasActive) {
      pollRef.current = setInterval(async () => {
        const fresh = await getRuns().catch(() => null)
        if (fresh) setRuns(fresh)
      }, 4000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
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
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Evaluation Runs</h1>
        <Button onClick={() => setShowForm((v) => !v)} variant="default" size="sm">
          {showForm ? "Cancel" : "+ New Run"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Start a New Run</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStart} className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Strategy</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="h-8 border border-input rounded-none px-2 text-xs bg-background"
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-8 border border-input rounded-none px-2 text-xs bg-background w-64"
                />
              </div>
              <Button type="submit" size="sm" disabled={starting}>
                {starting ? "Starting…" : "Start Run"}
              </Button>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet. Start one above.</p>
      ) : (
        <div className="rounded-none border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Strategy", "Model", "Status", "Progress", "Avg Score", "Cost", "Started"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => router.push(`/runs/${run.id}`)}
                  className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-2 font-mono">{run.strategy}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{run.model}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {run.totalCases > 0
                      ? `${run.completedCases}/${run.totalCases}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">${run.totalCostUsd.toFixed(4)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
