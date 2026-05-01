import type { Strategy } from "./index"

// Zero-shot: no examples, no reasoning guidance.
// Claude relies entirely on its training to understand the task.
// Fastest and cheapest but lowest accuracy baseline.
export const zeroShot: Strategy = {
  name: "zero_shot",

  systemPrompt:
    "You are a clinical documentation assistant. " +
    "Your job is to extract structured clinical information from doctor-patient transcripts. " +
    "Be precise: only extract information that is explicitly stated in the transcript. " +
    "For any field not mentioned in the transcript, use null. " +
    "Do not infer, assume, or add information that is not in the transcript. " +
    "Call the extract_clinical_data tool with the extracted information.",

  buildUserMessage: (transcript: string) =>
    `Extract the clinical data from this transcript:\n\n${transcript}`,
}
