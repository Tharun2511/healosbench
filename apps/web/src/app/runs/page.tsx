import { getRuns } from "@/lib/api"
import RunsClient from "./_components/runs-client"

export default async function RunsPage() {
  const initialRuns = await getRuns().catch(() => [])
  return <RunsClient initialRuns={initialRuns} />
}
