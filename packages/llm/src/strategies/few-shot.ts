import type { Strategy } from "./index"

const EXAMPLE_1_TRANSCRIPT = `\
[Visit type: in-person sick visit]
[Vitals taken at intake: BP 122/78, HR 88, Temp 100.4, SpO2 98%]

Doctor: Hi Jenna, what brings you in today?
Patient: I've had a sore throat for about four days, and now my nose is completely stuffed up.
Doctor: Throat is red but no exudate, ears clear, lungs fine. Rapid strep negative. Viral upper respiratory infection.
Doctor: Take ibuprofen 400 mg every 6 hours as needed for throat pain and fever, fluids, saline nasal spray.
Doctor: If not improving in 7 days or fever above 102, call us. No follow-up unless symptoms worsen.`

const EXAMPLE_1_EXTRACTION = JSON.stringify(
  {
    chief_complaint: "sore throat and nasal congestion for four days",
    vitals: { bp: "122/78", hr: 88, temp_f: 100.4, spo2: 98 },
    medications: [
      { name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours as needed", route: "PO" },
    ],
    diagnoses: [{ description: "viral upper respiratory infection", icd10: "J06.9" }],
    plan: [
      "supportive care with fluids and saline nasal spray",
      "ibuprofen 400 mg every 6 hours as needed for pain and fever",
      "call if not improving in 7 days or fever above 102",
    ],
    follow_up: { interval_days: null, reason: "return only if symptoms worsen" },
  },
  null,
  2,
)

const EXAMPLE_2_TRANSCRIPT = `\
[Visit type: in-person]
[Vitals at intake: BP 118/76, HR 82, Temp 101.2, SpO2 97%]

Doctor: Good morning, Daniel. What's going on?
Patient: Pressure behind my eyes and cheeks for ten days. Started as a cold but now bad pressure and yellow-green discharge.
Doctor: Tenderness over maxillary sinuses. Acute bacterial sinusitis.
Doctor: Amoxicillin-clavulanate 875 mg twice daily for 7 days, saline rinse twice a day, pseudoephedrine 30 mg every 6 hours.
Doctor: If not better in 5 days, call us. No follow-up otherwise.`

const EXAMPLE_2_EXTRACTION = JSON.stringify(
  {
    chief_complaint: "facial pressure and purulent nasal discharge for ten days",
    vitals: { bp: "118/76", hr: 82, temp_f: 101.2, spo2: 97 },
    medications: [
      { name: "amoxicillin-clavulanate", dose: "875 mg", frequency: "twice daily", route: "PO" },
      { name: "pseudoephedrine", dose: "30 mg", frequency: "every 6 hours", route: "PO" },
    ],
    diagnoses: [{ description: "acute bacterial sinusitis", icd10: "J01.90" }],
    plan: [
      "start amoxicillin-clavulanate 875 mg twice daily for 7 days",
      "saline nasal rinse twice a day",
      "pseudoephedrine 30 mg every 6 hours as needed for congestion",
      "call if not significantly better in 5 days",
    ],
    follow_up: { interval_days: null, reason: "call if not improving in 5 days" },
  },
  null,
  2,
)

export const fewShot: Strategy = {
  name: "few_shot",

  systemPrompt:
    "You are a clinical documentation assistant. " +
    "Extract structured clinical information from doctor-patient transcripts by calling the extract_clinical_data tool. " +
    "Only extract information explicitly stated in the transcript. Use null for missing fields.\n\n" +
    "Here are two examples of correct extractions:\n\n" +
    "=== EXAMPLE 1 ===\n" +
    "TRANSCRIPT:\n" +
    EXAMPLE_1_TRANSCRIPT +
    "\n\nCORRECT EXTRACTION:\n" +
    EXAMPLE_1_EXTRACTION +
    "\n\n=== EXAMPLE 2 ===\n" +
    "TRANSCRIPT:\n" +
    EXAMPLE_2_TRANSCRIPT +
    "\n\nCORRECT EXTRACTION:\n" +
    EXAMPLE_2_EXTRACTION +
    "\n\n=== END EXAMPLES ===\n" +
    "Now extract the clinical data from the transcript the user provides. " +
    "Match the same level of detail and format as the examples above.",

  buildUserMessage: (transcript: string) =>
    `Extract the clinical data from this transcript:\n\n${transcript}`,
}
