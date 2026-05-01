import Anthropic from "@anthropic-ai/sdk"
import { env } from "@test-evals/env/server"
import type { ClinicalExtraction, LlmTrace, PromptStrategy } from "@test-evals/shared"
import { resolve } from "path"
import { extractionTool } from "./tool-definition"
import { strategies } from "./strategies/index"
import { hashPrompt } from "./prompt-hash"

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

// Haiku 4.5 pricing per token (USD) — verify at anthropic.com/pricing
const PRICING = {
  input: 0.0000008,
  output: 0.000004,
  cacheWrite: 0.000001,
  cacheRead: 0.00000008,
}

const MAX_RETRIES = 3
const MAX_RATE_LIMIT_RETRIES = 4

export type ExtractResult = {
  extraction: ClinicalExtraction | null
  schemaValid: boolean
  attemptCount: number
  traces: LlmTrace[]
  promptHash: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

async function loadValidator() {
  const { default: Ajv } = await import("ajv")
  const { default: addFormats } = await import("ajv-formats")
  const schemaPath = resolve(import.meta.dir, "../../../data/schema.json")
  const schema = await Bun.file(schemaPath).json()
  const ajv = new Ajv({ allErrors: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

let _validator: Awaited<ReturnType<typeof loadValidator>> | null = null
async function getValidator() {
  if (!_validator) _validator = await loadValidator()
  return _validator
}

async function validateExtraction(data: unknown): Promise<string[]> {
  const validate = await getValidator()
  const valid = validate(data)
  if (valid) return []
  return (
    validate.errors?.map((e) => {
      const path = e.instancePath || "(root)"
      return `${path}: ${e.message}`
    }) ?? []
  )
}

function calcCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  return (
    inputTokens * PRICING.input +
    outputTokens * PRICING.output +
    cacheReadTokens * PRICING.cacheRead +
    cacheWriteTokens * PRICING.cacheWrite
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function extract(
  transcript: string,
  strategy: PromptStrategy,
  model: string,
): Promise<ExtractResult> {
  const strat = strategies[strategy]
  const promptHash = hashPrompt(strat.systemPrompt)

  const traces: LlmTrace[] = []
  let totalInput = 0
  let totalOutput = 0
  let totalCacheRead = 0
  let totalCacheWrite = 0

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: strat.buildUserMessage(transcript) },
  ]

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const traceStart = Date.now()
    let rawResponse: Anthropic.Message | null = null

    // Call Anthropic with rate-limit retry and exponential backoff
    for (let rlAttempt = 0; rlAttempt < MAX_RATE_LIMIT_RETRIES; rlAttempt++) {
      try {
        rawResponse = await anthropic.messages.create({
          model,
          max_tokens: 1024,
          tools: [extractionTool],
          tool_choice: { type: "any" },
          system: [
            {
              type: "text",
              text: strat.systemPrompt,
              // cache_control is supported but not yet in SDK types
              cache_control: { type: "ephemeral" },
            },
          ],
          messages,
        })
        break
      } catch (err) {
        const isRateLimit = err instanceof Anthropic.APIError && err.status === 429
        if (isRateLimit && rlAttempt < MAX_RATE_LIMIT_RETRIES - 1) {
          await sleep(Math.min(2 ** rlAttempt * 2000, 30000))
          continue
        }
        throw err
      }
    }

    if (!rawResponse) throw new Error("No response after rate limit retries")

    const usage = rawResponse.usage as Anthropic.Usage & {
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
    const inputTokens = usage.input_tokens
    const outputTokens = usage.output_tokens
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0

    totalInput += inputTokens
    totalOutput += outputTokens
    totalCacheRead += cacheReadTokens
    totalCacheWrite += cacheWriteTokens

    const toolUseBlock = rawResponse.content.find((b) => b.type === "tool_use")
    const extracted = toolUseBlock?.type === "tool_use" ? toolUseBlock.input : null

    const validationErrors = await validateExtraction(extracted)
    const durationMs = Date.now() - traceStart

    traces.push({
      attemptNumber: attempt,
      requestMessages: messages as unknown[],
      responseJson: rawResponse,
      validationErrors,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      durationMs,
    })

    if (validationErrors.length === 0) {
      return {
        extraction: extracted as ClinicalExtraction,
        schemaValid: true,
        attemptCount: attempt,
        traces,
        promptHash,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheWriteTokens: totalCacheWrite,
        costUsd: calcCost(totalInput, totalOutput, totalCacheRead, totalCacheWrite),
      }
    }

    // Feed validation errors back to Claude for self-correction
    if (attempt < MAX_RETRIES) {
      messages.push(
        { role: "assistant", content: rawResponse.content },
        {
          role: "user",
          content:
            `Your previous extraction had these JSON Schema validation errors:\n` +
            validationErrors.map((e) => `  - ${e}`).join("\n") +
            `\n\nPlease fix these errors and call extract_clinical_data again with corrected values.`,
        },
      )
    }
  }

  return {
    extraction: null,
    schemaValid: false,
    attemptCount: MAX_RETRIES,
    traces,
    promptHash,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    cacheWriteTokens: totalCacheWrite,
    costUsd: calcCost(totalInput, totalOutput, totalCacheRead, totalCacheWrite),
  }
}
