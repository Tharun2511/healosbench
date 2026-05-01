import { describe, it, expect } from "bun:test"
import {
  normalizeFrequency,
  medicationMatches,
  setF1,
  scoreVitals,
  detectHallucinations,
} from "../apps/server/src/services/evaluate.service"
import type { ClinicalExtraction } from "@test-evals/shared"

// ─── 1. Frequency normalization ───────────────────────────────────────────────
// Verifies that common abbreviations all map to the same canonical string.
// This is critical for medication matching — "BID" and "twice daily" must be equal.

describe("normalizeFrequency", () => {
  it("maps BID and variants to twice_daily", () => {
    expect(normalizeFrequency("BID")).toBe("twice_daily")
    expect(normalizeFrequency("twice daily")).toBe("twice_daily")
    expect(normalizeFrequency("twice a day")).toBe("twice_daily")
    expect(normalizeFrequency("2x daily")).toBe("twice_daily")
  })

  it("maps QD and variants to once_daily", () => {
    expect(normalizeFrequency("QD")).toBe("once_daily")
    expect(normalizeFrequency("once daily")).toBe("once_daily")
    expect(normalizeFrequency("daily")).toBe("once_daily")
  })

  it("maps PRN to as_needed", () => {
    expect(normalizeFrequency("PRN")).toBe("as_needed")
    expect(normalizeFrequency("as needed")).toBe("as_needed")
  })

  it("returns empty string for null", () => {
    expect(normalizeFrequency(null)).toBe("")
  })
})

// ─── 2. Fuzzy medication matching ────────────────────────────────────────────
// Two medications should match even when:
//  - names differ in case ("Ibuprofen" vs "ibuprofen")
//  - dose has spacing differences ("10 mg" vs "10mg")
//  - frequency uses abbreviations ("BID" vs "twice daily")

describe("medicationMatches", () => {
  it("matches when name, dose, and frequency are equivalent", () => {
    expect(
      medicationMatches(
        { name: "Ibuprofen", dose: "400 mg", frequency: "BID" },
        { name: "ibuprofen", dose: "400mg", frequency: "twice daily" },
      ),
    ).toBe(true)
  })

  it("matches when dose is null on either side (dose unknown)", () => {
    expect(
      medicationMatches(
        { name: "aspirin", dose: null, frequency: "daily" },
        { name: "aspirin", dose: "81mg", frequency: "once daily" },
      ),
    ).toBe(true)
  })

  it("does NOT match when names are completely different", () => {
    expect(
      medicationMatches(
        { name: "ibuprofen", dose: "400mg", frequency: "BID" },
        { name: "acetaminophen", dose: "500mg", frequency: "BID" },
      ),
    ).toBe(false)
  })

  it("does NOT match when dose conflicts", () => {
    expect(
      medicationMatches(
        { name: "metformin", dose: "500mg", frequency: "daily" },
        { name: "metformin", dose: "1000mg", frequency: "daily" },
      ),
    ).toBe(false)
  })
})

// ─── 3. Set-based F1 ─────────────────────────────────────────────────────────
// setF1 computes precision/recall/F1 from two lists using a custom matcher.
// The key invariant: each gold item can only be matched once (goldUsed set).

describe("setF1", () => {
  const exactMatch = (a: string, b: string) => a === b

  it("returns 1/1/1 when both lists are empty", () => {
    const result = setF1([], [], exactMatch)
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1).toBe(1)
  })

  it("returns 0/0/0 when predictions is empty but gold is not", () => {
    const result = setF1([], ["a", "b"], exactMatch)
    expect(result.f1).toBe(0)
  })

  it("returns 0/0/0 when gold is empty but predictions is not", () => {
    const result = setF1(["a"], [], exactMatch)
    expect(result.f1).toBe(0)
  })

  it("computes correct P/R/F1 for partial match", () => {
    // predictions [A, B, C], gold [A, B, D] → 2 matches
    // precision = 2/3, recall = 2/3
    const result = setF1(["A", "B", "C"], ["A", "B", "D"], exactMatch)
    expect(result.precision).toBeCloseTo(2 / 3, 5)
    expect(result.recall).toBeCloseTo(2 / 3, 5)
    expect(result.f1).toBeCloseTo(2 / 3, 5)
  })

  it("computes perfect score when all predictions match gold", () => {
    const result = setF1(["A", "B"], ["A", "B"], exactMatch)
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1).toBe(1)
  })

  it("does not double-count a gold item (each gold matched at most once)", () => {
    // 2 predictions of "A", 1 gold "A" → only 1 TP
    // precision = 1/2, recall = 1/1
    const result = setF1(["A", "A"], ["A"], exactMatch)
    expect(result.precision).toBeCloseTo(0.5, 5)
    expect(result.recall).toBe(1)
  })
})

// ─── 4. Vitals scoring — temperature tolerance ───────────────────────────────
// temp_f allows ±0.2°F. A difference of 0.1 should pass; 0.3 should fail.

describe("scoreVitals", () => {
  const baseVitals = { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 }

  it("gives full score when all vitals match exactly", () => {
    const result = scoreVitals(baseVitals, baseVitals)
    expect(result.average).toBe(1)
  })

  it("gives temp score of 1 when difference is within ±0.2°F", () => {
    const pred = { ...baseVitals, temp_f: 98.7 } // diff = 0.1
    const result = scoreVitals(pred, baseVitals)
    expect(result.temp_f).toBe(1)
  })

  it("gives temp score of 0 when difference exceeds ±0.2°F", () => {
    const pred = { ...baseVitals, temp_f: 99.0 } // diff = 0.4
    const result = scoreVitals(pred, baseVitals)
    expect(result.temp_f).toBe(0)
  })

  it("gives bp score of 0 when blood pressure differs", () => {
    const pred = { ...baseVitals, bp: "140/90" }
    const result = scoreVitals(pred, baseVitals)
    expect(result.bp).toBe(0)
  })
})

// ─── 5 & 6. Hallucination detection ──────────────────────────────────────────
// A value is hallucinated if its meaningful words don't appear in the transcript.
// "Grounded" = at least 50% of the value's words appear in the transcript text.

const BASE_PREDICTION: ClinicalExtraction = {
  chief_complaint: "chest pain",
  vitals: { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 },
  medications: [],
  diagnoses: [],
  plan: [],
  follow_up: { interval_days: null, reason: null },
}

describe("detectHallucinations — positive (value NOT in transcript)", () => {
  it("flags a medication name that does not appear in the transcript", () => {
    const prediction: ClinicalExtraction = {
      ...BASE_PREDICTION,
      medications: [{ name: "vancomycin", dose: "1g", frequency: "daily" }],
    }
    const transcript = "Patient presents with chest pain. No medications noted."

    const flags = detectHallucinations(prediction, transcript)
    const flaggedFields = flags.map((f) => f.field)

    expect(flaggedFields.some((f) => f.includes("medications"))).toBe(true)
  })

  it("flags a diagnosis that does not appear in the transcript", () => {
    const prediction: ClinicalExtraction = {
      ...BASE_PREDICTION,
      diagnoses: [{ description: "myocardial infarction severe", icd10: "I21.9" }],
    }
    const transcript = "Patient has a mild headache. No cardiac concerns."

    const flags = detectHallucinations(prediction, transcript)
    expect(flags.length).toBeGreaterThan(0)
  })
})

describe("detectHallucinations — negative (value IS in transcript)", () => {
  it("does not flag a medication name that appears in the transcript", () => {
    const prediction: ClinicalExtraction = {
      ...BASE_PREDICTION,
      medications: [{ name: "metformin", dose: "500mg", frequency: "daily" }],
    }
    const transcript =
      "Patient is on metformin 500mg daily for diabetes management."

    const flags = detectHallucinations(prediction, transcript)
    const medFlags = flags.filter((f) => f.field.includes("medications[0].name"))

    expect(medFlags).toHaveLength(0)
  })

  it("does not flag a chief complaint whose words appear in the transcript", () => {
    const prediction: ClinicalExtraction = {
      ...BASE_PREDICTION,
      chief_complaint: "chest pain shortness",
    }
    const transcript =
      "Chief complaint: chest pain with shortness of breath for 2 days."

    const flags = detectHallucinations(prediction, transcript)
    const chiefFlags = flags.filter((f) => f.field === "chief_complaint")

    expect(chiefFlags).toHaveLength(0)
  })
})
