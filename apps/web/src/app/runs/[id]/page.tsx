import { getRunDetail } from "@/lib/api"
import RunDetailClient from "./run-detail-client"

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRunDetail(id).catch(() => null)

  if (!run) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Run not found.</p>
      </div>
    )
  }

  return <RunDetailClient initialRun={run} />
}
