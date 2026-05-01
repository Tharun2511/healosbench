export type Vitals = {
  bp: string | null      // "122/78" — systolic/diastolic as string
  hr: number | null      // beats per minute
  temp_f: number | null  // fahrenheit, e.g. 100.4
  spo2: number | null    // oxygen saturation percent
}

export type Medication = {
  name: string
  dose: string | null
  frequency: string | null
  route: string | null   // PO, IV, topical, inhaled, etc.
}

export type Diagnosis = {
  description: string
  icd10?: string         // optional — Claude may or may not infer it
}

export type FollowUp = {
  interval_days: number | null  // null = no scheduled visit
  reason: string | null
}

// The full extraction — this is what Claude must return for every transcript
export type ClinicalExtraction = {
  chief_complaint: string
  vitals: Vitals
  medications: Medication[]
  diagnoses: Diagnosis[]
  plan: string[]
  follow_up: FollowUp
}
