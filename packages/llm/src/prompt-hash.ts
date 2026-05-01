import { createHash } from "crypto"

// SHA-256 hash of the full system prompt string.
// Changing even one character produces a completely different hash.
// This pins every DB run to the exact prompt version that generated it.
export function hashPrompt(systemPrompt: string): string {
  return createHash("sha256").update(systemPrompt).digest("hex").slice(0, 12)
}
