// For set-based fields: medications, diagnoses, plan
export type F1Score = {
  precision: number  // of what Claude predicted, how much was correct
  recall: number     // of what gold has, how much Claude found
  f1: number         // harmonic mean of precision and recall (0-1)
}

// For vitals — one score per sub-field, then averaged
export type VitalsScore = {
  bp: number      // 0 or 1 exact match
  hr: number      // 0 or 1 exact match
  temp_f: number  // 0 or 1 with ±0.2°F tolerance
  spo2: number    // 0 or 1 exact match
  average: number // mean of the four above
}

// Rolled up scores for one case across all fields
export type FieldScores = {
  chief_complaint: number   // 0-1 fuzzy match
  vitals: VitalsScore
  medications: F1Score
  diagnoses: F1Score
  plan: F1Score
  follow_up: number         // 0-1 combined score
  overall: number           // weighted average of all fields
}

// One flagged hallucination: a value Claude invented that isn't in the transcript
export type HallucinationFlag = {
  field: string   // e.g. "medications[0].name"
  value: string   // the value Claude produced
  grounded: false // always false — if grounded it wouldn't be here
}
