import { extract } from "@test-evals/llm"
import type { ExtractResult } from "@test-evals/llm"
import type { PromptStrategy } from "@test-evals/shared"
import { resolve } from "path"

// Absolute path to the data/transcripts directory
// import.meta.dir = apps/server/src/services → go up 4 levels to repo root
const TRANSCRIPTS_DIR = resolve(import.meta.dir, "../../../../data/transcripts")

// Reads transcript text from disk and runs the LLM extraction.
// Does NOT touch the database — the runner handles persistence.
export async function extractTranscript(
  transcriptId: string,   // e.g. "case_001"
  strategy: PromptStrategy,
  model: string,
): Promise<ExtractResult> {
  const filePath = resolve(TRANSCRIPTS_DIR, `${transcriptId}.txt`)
  const transcript = await Bun.file(filePath).text()
  return extract(transcript, strategy, model)
}

// Returns all transcript IDs available in the data directory, sorted.
// Used by the runner to know which cases to process.
export async function listTranscriptIds(): Promise<string[]> {
  const glob = new Bun.Glob("*.txt")
  const ids: string[] = []
  for await (const file of glob.scan(TRANSCRIPTS_DIR)) {
    ids.push(file.replace(".txt", ""))
  }
  return ids.sort()
}
