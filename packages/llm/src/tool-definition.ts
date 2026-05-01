import type Anthropic from "@anthropic-ai/sdk"

// This is the tool Claude must call — its input schema mirrors data/schema.json exactly.
// By forcing Claude to call this tool, we guarantee structured JSON output.
// Claude cannot reply with free text — it MUST call this function.
export const extractionTool: Anthropic.Tool = {
  name: "extract_clinical_data",
  description:
    "Extract structured clinical information from a doctor-patient transcript. " +
    "Call this tool with all fields populated. Use null for any field not mentioned in the transcript.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"],
    properties: {
      chief_complaint: {
        type: "string",
        minLength: 1,
        description: "Primary reason for the visit in patient words or brief clinical summary.",
      },
      vitals: {
        type: "object",
        additionalProperties: false,
        required: ["bp", "hr", "temp_f", "spo2"],
        properties: {
          bp: {
            type: ["string", "null"],
            description: 'Blood pressure as "systolic/diastolic", e.g. "122/78". Null if not mentioned.',
          },
          hr: {
            type: ["integer", "null"],
            description: "Heart rate in bpm. Null if not mentioned.",
          },
          temp_f: {
            type: ["number", "null"],
            description: "Temperature in Fahrenheit. Null if not mentioned.",
          },
          spo2: {
            type: ["integer", "null"],
            description: "Oxygen saturation percent. Null if not mentioned.",
          },
        },
      },
      medications: {
        type: "array",
        description: "All medications discussed in the encounter.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "dose", "frequency", "route"],
          properties: {
            name: { type: "string", minLength: 1 },
            dose: { type: ["string", "null"] },
            frequency: { type: ["string", "null"] },
            route: { type: ["string", "null"] },
          },
        },
      },
      diagnoses: {
        type: "array",
        description: "Working or confirmed diagnoses.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description"],
          properties: {
            description: { type: "string", minLength: 1 },
            icd10: {
              type: "string",
              description: "ICD-10-CM code if inferable, e.g. J06.9",
            },
          },
        },
      },
      plan: {
        type: "array",
        description: "One string per discrete plan action.",
        items: { type: "string", minLength: 1 },
      },
      follow_up: {
        type: "object",
        additionalProperties: false,
        required: ["interval_days", "reason"],
        properties: {
          interval_days: {
            type: ["integer", "null"],
            description: "Days until follow-up visit. Null if no scheduled visit.",
          },
          reason: { type: ["string", "null"] },
        },
      },
    },
  },
}
