/**
 * Tests for the LLM extraction client.
 *
 * Uses _setAnthropicForTesting() to inject a mock client — no real API calls are made.
 * The mock client controls what each API call returns, enabling deterministic tests.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"

// Set required env vars before any imports that validate them
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-not-real"
process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long"
process.env.BETTER_AUTH_URL = "http://localhost:8787"
process.env.CORS_ORIGIN = "http://localhost:3001"

// Dynamic import after env is set — avoids Zod validation failure at import time
const { extract, _setAnthropicForTesting } = await import("../packages/llm/src/client")

// ─── Mock response builders ───────────────────────────────────────────────────

// A fully valid ClinicalExtraction that passes JSON Schema validation
// Note: medications require "route" field per data/schema.json
const VALID_EXTRACTION = {
  chief_complaint: "chest pain",
  vitals: { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 },
  medications: [{ name: "aspirin", dose: "81mg", frequency: "daily", route: "PO" }],
  diagnoses: [{ description: "chest pain" }],
  plan: ["EKG ordered", "chest X-ray"],
  follow_up: { interval_days: 7, reason: "review results" },
}

// Missing chief_complaint — fails JSON Schema validation and triggers a retry
const INVALID_EXTRACTION = {
  vitals: { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 },
  medications: [],
  diagnoses: [],
  plan: [],
  follow_up: { interval_days: null, reason: null },
}

function makeApiResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", id: "tool-1", name: "extract_clinical_data", input }],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }
}

// ─── Shared mock state ────────────────────────────────────────────────────────

const mockState = {
  callCount: 0,
  responses: [] as Array<{ status: number; message: string } | ReturnType<typeof makeApiResponse>>,
}

function buildMockClient() {
  const create = mock(async () => {
    const resp = mockState.responses[mockState.callCount] ?? mockState.responses.at(-1)
    mockState.callCount++

    // An entry with a numeric "status" is a mock HTTP error to throw
    if (resp && "status" in resp && typeof (resp as { status: number }).status === "number") {
      const err = Object.assign(new Error((resp as { message: string }).message), {
        status: (resp as { status: number }).status,
      })
      throw err
    }
    return resp
  })
  return { messages: { create } }
}

beforeEach(() => {
  mockState.callCount = 0
  mockState.responses = []
  _setAnthropicForTesting(buildMockClient() as never)
})

afterEach(() => {
  _setAnthropicForTesting(null)
})

// ─── 7. Schema-validation retry ───────────────────────────────────────────────
// When Claude returns data that fails JSON Schema validation, the client feeds
// the errors back and retries. This test verifies the full retry loop works.

describe("Schema-validation retry", () => {
  it("succeeds on the second attempt after an invalid first response", async () => {
    // Attempt 1: missing chief_complaint → fails validation → retry
    // Attempt 2: valid extraction → succeeds
    mockState.responses = [makeApiResponse(INVALID_EXTRACTION), makeApiResponse(VALID_EXTRACTION)]

    const result = await extract(
      "Patient came in with chest pain.",
      "zero_shot",
      "claude-haiku-4-5-20251001",
    )

    expect(result.schemaValid).toBe(true)
    expect(result.attemptCount).toBe(2)
    expect(result.extraction).not.toBeNull()
    expect(result.extraction?.chief_complaint).toBe("chest pain")
  })

  it("returns schemaValid: false and null extraction if all 3 retries fail", async () => {
    mockState.responses = [
      makeApiResponse(INVALID_EXTRACTION),
      makeApiResponse(INVALID_EXTRACTION),
      makeApiResponse(INVALID_EXTRACTION),
    ]

    const result = await extract(
      "Patient came in with chest pain.",
      "zero_shot",
      "claude-haiku-4-5-20251001",
    )

    expect(result.schemaValid).toBe(false)
    expect(result.extraction).toBeNull()
    expect(result.attemptCount).toBe(3)
  })

  it("records a trace per attempt, with errors on failed ones and none on success", async () => {
    mockState.responses = [makeApiResponse(INVALID_EXTRACTION), makeApiResponse(VALID_EXTRACTION)]

    const result = await extract(
      "Patient came in with chest pain.",
      "zero_shot",
      "claude-haiku-4-5-20251001",
    )

    expect(result.traces).toHaveLength(2)
    expect(result.traces[0]?.validationErrors?.length).toBeGreaterThan(0)
    expect(result.traces[1]?.validationErrors).toHaveLength(0)
  })
})

// ─── 8. Rate-limit backoff ────────────────────────────────────────────────────
// When the API returns status 429, the client retries with exponential backoff.
// We replace setTimeout with an instant version to avoid real delays in tests.

describe("Rate-limit backoff", () => {
  const origSetTimeout = globalThis.setTimeout

  beforeEach(() => {
    globalThis.setTimeout = ((fn: TimerHandler, _delay?: number, ...args: unknown[]) =>
      origSetTimeout(fn, 0, ...args)) as typeof globalThis.setTimeout
    // Rebuild the client with the new (instant) setTimeout in scope
    _setAnthropicForTesting(buildMockClient() as never)
  })

  afterEach(() => {
    globalThis.setTimeout = origSetTimeout
  })

  it("retries after a 429 and returns the successful response", async () => {
    mockState.responses = [
      { status: 429, message: "Rate limit exceeded" },
      makeApiResponse(VALID_EXTRACTION),
    ]

    const result = await extract(
      "Patient came in with chest pain.",
      "zero_shot",
      "claude-haiku-4-5-20251001",
    )

    expect(result.extraction).not.toBeNull()
    expect(result.schemaValid).toBe(true)
    expect(mockState.callCount).toBe(2)
  })

  it("retries multiple times on consecutive 429s before succeeding", async () => {
    mockState.responses = [
      { status: 429, message: "Rate limit exceeded" },
      { status: 429, message: "Rate limit exceeded" },
      makeApiResponse(VALID_EXTRACTION),
    ]

    const result = await extract(
      "Patient came in with chest pain.",
      "zero_shot",
      "claude-haiku-4-5-20251001",
    )

    expect(result.extraction).not.toBeNull()
    expect(mockState.callCount).toBe(3)
  })
})
