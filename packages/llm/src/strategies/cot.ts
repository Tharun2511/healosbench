import type { Strategy } from "./index"

// Chain-of-thought: instructs Claude to reason through each field before extracting.
// This costs more output tokens but can improve accuracy on ambiguous transcripts.
export const cot: Strategy = {
  name: "cot",

  systemPrompt:
    "You are a clinical documentation assistant. " +
    "Extract structured clinical information from doctor-patient transcripts by calling the extract_clinical_data tool.\n\n" +
    "Before calling the tool, think through each field carefully:\n" +
    "- CHIEF COMPLAINT: What did the patient say was their main reason for coming in? Use their words where possible.\n" +
    "- VITALS: Check the intake header line first. Are all four values (BP, HR, Temp, SpO2) present?\n" +
    "- MEDICATIONS: List every drug mentioned — started, continued, or stopped. " +
    "Pay attention to dose (amount per dose), frequency (how often), and route (how taken).\n" +
    "- DIAGNOSES: What did the doctor conclude? Include ICD-10 codes only if you can infer them confidently.\n" +
    "- PLAN: Break the plan into one item per discrete action. Do not merge unrelated steps.\n" +
    "- FOLLOW-UP: Is there a specific scheduled return visit (interval_days)? " +
    "Or is it conditional ('come back if symptoms worsen')?\n\n" +
    "Only extract information explicitly stated in the transcript. " +
    "Use null for any field not mentioned. Do not hallucinate values.",

  buildUserMessage: (transcript: string) =>
    `Think through each field carefully, then call extract_clinical_data with your findings.\n\nTRANSCRIPT:\n${transcript}`,
}
