import type {
  ClinicalExtraction,
  F1Score,
  FieldScores,
  HallucinationFlag,
  Medication,
  Diagnosis,
  VitalsScore,
} from "@test-evals/shared"
import { resolve } from "path"

const GOLD_DIR = resolve(import.meta.dir, "../../../../data/gold")

// ─── Text normalization helpers ───────────────────────────────────────────────

// Lowercase + remove punctuation + collapse whitespace
// "Sore throat, 4 days!" → "sore throat 4 days"
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Token overlap score (Dice coefficient) — 0 to 1
// Splits both strings into words and measures how many they share.
// "sore throat and congestion" vs "throat congestion sore" → high score
// "ibuprofen" vs "acetaminophen" → 0
function fuzzyScore(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" "))
  const tokensB = new Set(normalize(b).split(" "))
  if (tokensA.size === 0 && tokensB.size === 0) return 1
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  // Dice: 2 * |intersection| / (|A| + |B|)
  return (2 * intersection) / (tokensA.size + tokensB.size)
}

// ─── Normalization for medication fields ──────────────────────────────────────

// "10 mg" → "10mg", "400MG" → "400mg"
function normalizeDose(dose: string | null): string {
  if (!dose) return ""
  return dose.toLowerCase().replace(/\s+/g, "")
}

// Maps common frequency abbreviations to a canonical form.
// "BID" == "twice daily" == "twice a day" → all become "twice_daily"
function normalizeFrequency(freq: string | null): string {
  if (!freq) return ""
  const f = normalize(freq)
  if (/\b(bid|twice daily|twice a day|two times daily|2x daily)\b/.test(f)) return "twice_daily"
  if (/\b(tid|three times daily|three times a day|3x daily)\b/.test(f)) return "three_times_daily"
  if (/\b(qid|four times daily|four times a day|4x daily)\b/.test(f)) return "four_times_daily"
  if (/\b(qd|once daily|once a day|daily|every day|1x daily)\b/.test(f)) return "once_daily"
  if (/\b(prn|as needed|as necessary|when needed)\b/.test(f)) return "as_needed"
  if (/every 6 hour/.test(f) || /q6h/.test(f)) return "every_6_hours"
  if (/every 8 hour/.test(f) || /q8h/.test(f)) return "every_8_hours"
  if (/every 4 hour/.test(f) || /q4h/.test(f)) return "every_4_hours"
  if (/every 12 hour/.test(f) || /q12h/.test(f)) return "every_12_hours"
  return f // return as-is if no known pattern matches
}

// ─── Generic set-based F1 ─────────────────────────────────────────────────────

// Calculates precision, recall, and F1 for two lists using a custom matcher.
// Example: predictions=[A,B,C], golds=[A,B,D] → 2 matches → P=0.67, R=0.67, F1=0.67
function setF1<T>(
  predictions: T[],
  golds: T[],
  matches: (pred: T, gold: T) => boolean,
): F1Score {
  if (predictions.length === 0 && golds.length === 0) {
    return { precision: 1, recall: 1, f1: 1 }
  }
  if (predictions.length === 0 || golds.length === 0) {
    return { precision: 0, recall: 0, f1: 0 }
  }

  const goldUsed = new Set<number>()
  let truePositives = 0

  for (const pred of predictions) {
    for (let i = 0; i < golds.length; i++) {
      const gold = golds[i]
      if (!goldUsed.has(i) && gold !== undefined && matches(pred, gold)) {
        truePositives++
        goldUsed.add(i)
        break
      }
    }
  }

  const precision = truePositives / predictions.length
  const recall = truePositives / golds.length
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  return { precision, recall, f1 }
}

// ─── Per-field scorers ────────────────────────────────────────────────────────

function scoreChiefComplaint(pred: string, gold: string): number {
  return fuzzyScore(pred, gold)
}

function scoreVitals(pred: ClinicalExtraction["vitals"], gold: ClinicalExtraction["vitals"]): VitalsScore {
  // bp is a string ("122/78") — normalize then exact match
  const bpScore = (() => {
    if (pred.bp === null && gold.bp === null) return 1
    if (pred.bp === null || gold.bp === null) return 0
    return normalize(pred.bp) === normalize(gold.bp) ? 1 : 0
  })()

  // hr and spo2 are integers — exact match
  const hrScore = pred.hr === gold.hr ? 1 : 0
  const spo2Score = pred.spo2 === gold.spo2 ? 1 : 0

  // temp_f is a float — allow ±0.2°F tolerance
  const tempScore = (() => {
    if (pred.temp_f === null && gold.temp_f === null) return 1
    if (pred.temp_f === null || gold.temp_f === null) return 0
    return Math.abs(pred.temp_f - gold.temp_f) <= 0.2 ? 1 : 0
  })()

  const average = (bpScore + hrScore + tempScore + spo2Score) / 4

  return { bp: bpScore, hr: hrScore, temp_f: tempScore, spo2: spo2Score, average }
}

// Two medications match if:
//  1. Name fuzzy score > 0.7 (handles "ibuprofen" vs "Ibuprofen 200")
//  2. Normalized dose matches exactly ("10mg" == "10 mg")
//  3. Normalized frequency matches ("BID" == "twice daily")
function medicationMatches(pred: Medication, gold: Medication): boolean {
  const nameScore = fuzzyScore(pred.name, gold.name)
  if (nameScore < 0.7) return false
  const doseMatch =
    normalizeDose(pred.dose) === normalizeDose(gold.dose) ||
    pred.dose === null ||
    gold.dose === null
  const freqMatch =
    normalizeFrequency(pred.frequency) === normalizeFrequency(gold.frequency) ||
    pred.frequency === null ||
    gold.frequency === null
  return doseMatch && freqMatch
}

function scoreMedications(pred: Medication[], gold: Medication[]): F1Score {
  return setF1(pred, gold, medicationMatches)
}

// Two diagnoses match if description fuzzy score > 0.6
// ICD10 match gives a bonus — average the description score with icd10 match
function diagnosisMatches(pred: Diagnosis, gold: Diagnosis): boolean {
  return fuzzyScore(pred.description, gold.description) >= 0.6
}

function scoreDiagnoses(pred: Diagnosis[], gold: Diagnosis[]): F1Score {
  return setF1(pred, gold, diagnosisMatches)
}

// Plan items match if fuzzy score > 0.5 (they can be worded very differently)
function scorePlan(pred: string[], gold: string[]): F1Score {
  return setF1(pred, gold, (a, b) => fuzzyScore(a, b) >= 0.5)
}

function scoreFollowUp(
  pred: ClinicalExtraction["follow_up"],
  gold: ClinicalExtraction["follow_up"],
): number {
  // interval_days: exact match (null == null counts as 1)
  const intervalScore = pred.interval_days === gold.interval_days ? 1 : 0

  // reason: fuzzy match (0 if both null, 1 if both null)
  const reasonScore = (() => {
    if (pred.reason === null && gold.reason === null) return 1
    if (pred.reason === null || gold.reason === null) return 0.5
    return fuzzyScore(pred.reason, gold.reason)
  })()

  return 0.5 * intervalScore + 0.5 * reasonScore
}

// ─── Hallucination detection ──────────────────────────────────────────────────

// A value is hallucinated if it doesn't appear (even approximately) in the transcript.
// We normalize both and check for substring presence.
function isGrounded(value: string, transcriptNormalized: string): boolean {
  const normalizedValue = normalize(value)
  if (normalizedValue.length < 3) return true // too short to check meaningfully
  // Check each word of the value appears in the transcript
  const words = normalizedValue.split(" ").filter((w) => w.length > 3)
  if (words.length === 0) return true
  const foundWords = words.filter((w) => transcriptNormalized.includes(w))
  // If more than half the meaningful words are found, consider it grounded
  return foundWords.length / words.length >= 0.5
}

function detectHallucinations(
  prediction: ClinicalExtraction,
  transcript: string,
): HallucinationFlag[] {
  const transcriptNorm = normalize(transcript)
  const flags: HallucinationFlag[] = []

  const check = (field: string, value: string | null) => {
    if (!value) return
    if (!isGrounded(value, transcriptNorm)) {
      flags.push({ field, value, grounded: false })
    }
  }

  check("chief_complaint", prediction.chief_complaint)

  prediction.medications.forEach((med, i) => {
    check(`medications[${i}].name`, med.name)
    check(`medications[${i}].dose`, med.dose)
  })

  prediction.diagnoses.forEach((dx, i) => {
    check(`diagnoses[${i}].description`, dx.description)
  })

  prediction.plan.forEach((item, i) => {
    check(`plan[${i}]`, item)
  })

  check("follow_up.reason", prediction.follow_up.reason)

  return flags
}

// ─── Overall weighted score ───────────────────────────────────────────────────

function overallScore(scores: Omit<FieldScores, "overall">): number {
  return (
    scores.chief_complaint * 0.10 +
    scores.vitals.average * 0.20 +
    scores.medications.f1 * 0.25 +
    scores.diagnoses.f1 * 0.20 +
    scores.plan.f1 * 0.15 +
    scores.follow_up * 0.10
  )
}

// ─── Main evaluate function ───────────────────────────────────────────────────

export type EvaluateResult = {
  fieldScores: FieldScores
  hallucinations: HallucinationFlag[]
  schemaValid: boolean
}

export async function evaluate(
  transcriptId: string,
  prediction: ClinicalExtraction | null,
  transcript: string,
): Promise<EvaluateResult> {
  // Load the gold (correct) answer for this transcript
  const goldPath = resolve(GOLD_DIR, `${transcriptId}.json`)
  const gold: ClinicalExtraction = await Bun.file(goldPath).json()

  // If Claude failed all retries, return zero scores
  if (!prediction) {
    const zeroF1: F1Score = { precision: 0, recall: 0, f1: 0 }
    const zeroVitals: VitalsScore = { bp: 0, hr: 0, temp_f: 0, spo2: 0, average: 0 }
    return {
      fieldScores: {
        chief_complaint: 0,
        vitals: zeroVitals,
        medications: zeroF1,
        diagnoses: zeroF1,
        plan: zeroF1,
        follow_up: 0,
        overall: 0,
      },
      hallucinations: [],
      schemaValid: false,
    }
  }

  const chiefScore = scoreChiefComplaint(prediction.chief_complaint, gold.chief_complaint)
  const vitalsScore = scoreVitals(prediction.vitals, gold.vitals)
  const medsScore = scoreMedications(prediction.medications, gold.medications)
  const dxScore = scoreDiagnoses(prediction.diagnoses, gold.diagnoses)
  const planScore = scorePlan(prediction.plan, gold.plan)
  const followUpScore = scoreFollowUp(prediction.follow_up, gold.follow_up)

  const scoresWithoutOverall = {
    chief_complaint: chiefScore,
    vitals: vitalsScore,
    medications: medsScore,
    diagnoses: dxScore,
    plan: planScore,
    follow_up: followUpScore,
  }

  const fieldScores: FieldScores = {
    ...scoresWithoutOverall,
    overall: overallScore(scoresWithoutOverall),
  }

  const hallucinations = detectHallucinations(prediction, transcript)

  return { fieldScores, hallucinations, schemaValid: true }
}
