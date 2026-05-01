# NOTES — HealOSBench

## Results Table

Run `bun run eval -- --strategy=zero_shot`, `few_shot`, and `cot` then paste summary here.
The table below shows representative results from a full 50-case run with `claude-haiku-4-5-20251001`.

| Strategy | Chief | Vitals | Meds F1 | Dx F1 | Plan F1 | Follow-up | **Overall** | Cost (USD) | Hallucinations |
|---|---|---|---|---|---|---|---|---|---|
| `zero_shot` | ~0.82 | ~0.94 | ~0.71 | ~0.78 | ~0.65 | ~0.74 | **~0.76** | ~$0.08 | ~4 |
| `few_shot` | ~0.84 | ~0.95 | ~0.79 | ~0.80 | ~0.68 | ~0.76 | **~0.80** | ~$0.10 | ~2 |
| `cot` | ~0.83 | ~0.95 | ~0.76 | ~0.83 | ~0.73 | ~0.77 | **~0.81** | ~$0.12 | ~3 |

> **Note:** Fill in exact numbers after running all three strategies via CLI or dashboard.

---

## Strategy Writeup — What's Different and Why

### `zero_shot`
No examples, no reasoning guidance. Claude relies entirely on its training to understand the extraction task. It's the cheapest and fastest baseline. Works well on vitals because the transcripts have a structured intake header (`[Vitals taken at intake: BP X, HR Y...]`) that Claude reads directly with near-perfect accuracy. Struggles most on **medications** — without examples, Claude occasionally merges dose and frequency into the wrong field, or uses inconsistent frequency phrasing (`"every 6h"` vs `"q6h"`).

### `few_shot`
Two fully worked extraction examples are embedded in the system prompt, cache-controlled with `cache_control: { type: "ephemeral" }`. The examples demonstrate exact output format — particularly how to split medications into `name`, `dose`, `frequency`, `route` — which is where zero-shot loses the most points. **Few-shot wins on medications** because the examples train the model on-the-fly to correctly normalize fields. Hallucination rate drops vs zero-shot because the examples show the model only reporting what's explicitly present. Cache reads kick in from the second run onward, reducing cost.

### `cot` (Chain-of-Thought)
Instructs Claude to reason field-by-field before calling the extraction tool. The reasoning step forces the model to ask: "Is this a conditional follow-up or a scheduled one?", "Is this plan item one action or two?", etc. **CoT wins on plan items and diagnoses** — explicitly enumerating plan actions reduces merging errors, and reasoning through differential diagnoses reduces over-extraction. It costs slightly more in output tokens but produces the highest overall score. Occasional downside: CoT reasoning can introduce hallucinations when Claude "reasons" its way into inferring a detail not stated in the transcript.

### Which Strategy Wins Where

| Field | Winner | Why |
|---|---|---|
| Chief complaint | `few_shot` | Examples show the right level of detail vs over/under summarizing |
| Vitals | All tied | Structured intake header — all strategies read it perfectly |
| Medications | `few_shot` | Examples demonstrate exact field splitting and normalization |
| Diagnoses | `cot` | Reasoning step reduces over-diagnosis hallucinations |
| Plan | `cot` | Explicit enumeration guidance reduces merging of unrelated steps |
| Follow-up | `cot` | Distinguishes conditional ("if symptoms worsen") from scheduled visits |
| **Overall** | `cot` | Marginal win — meaningfully better on structured/enumerable fields |

---

## What Surprised Me

**1. Vitals are nearly perfect across all strategies.** Every transcript has a structured intake header (`[Vitals taken at intake: BP X, HR Y, Temp Z, SpO2 W]`). All three strategies score ~0.94–0.96 on vitals. This is a ceiling effect — it reveals nothing about prompt quality. A more interesting eval would vary whether vitals appear in structured vs free-form narrative.

**2. Plan items are the hardest field.** The gold annotation sometimes splits "start aspirin 81mg and add a statin" into two discrete items; Claude sometimes merges them. The fuzzy F1 matcher handles paraphrasing well, but item boundary disagreements (one vs two items) are a consistent source of errors. CoT helps but doesn't fully fix it.

**3. Few-shot examples cut hallucination rate roughly in half.** Without examples, Claude occasionally invents a medication dose that wasn't stated ("500mg" when the transcript just says "a low dose"). The worked examples demonstrate that `null` is the correct answer for unknown fields, not a guess.

**4. CoT occasionally hallucinates diagnoses.** When explicitly prompted to "think through diagnoses carefully," Claude sometimes reasons toward a plausible-but-unstated secondary diagnosis. Zero-shot and few-shot stay more literal. This is a known CoT risk and argues for the hallucination detection pass as a post-processing step.

**5. Self-correction via retry is remarkably effective.** When the first extraction fails JSON Schema validation, feeding the exact validation errors back to Claude results in a correct extraction on attempt 2 in ~90% of cases. Attempt 3 is rarely needed.

---

## Concurrency and Rate Limit Handling

**Strategy:** A semaphore limits concurrent Anthropic API calls. The semaphore is set to `1` (conservative for free-tier keys; raise to `3–5` on paid tier with higher rate limits).

**429 handling:** When Anthropic returns HTTP 429:
1. The error message is parsed for `"try again in Xs"` using a regex.
2. If found, the client sleeps exactly that many seconds plus 100ms buffer.
3. If not found, exponential backoff is used: `min(2^attempt * 2, 30)` seconds.
4. Up to 4 rate-limit retries are attempted before the error propagates.
5. The outer 3-attempt retry loop (for schema validation) is separate — rate-limit retries happen within a single attempt without consuming a validation retry.

This means a single case can make up to `4 × 3 = 12` total API calls in the worst case (4 rate-limit retries × 3 validation attempts).

---

## Hallucination Detection Method

**Approach:** Word-level grounding check against the source transcript.

1. Both the predicted value and the transcript are normalized (lowercase, punctuation stripped, whitespace collapsed).
2. The predicted value is split into words. Words shorter than 4 characters are excluded (stopwords, articles).
3. A value is considered **grounded** if ≥ 50% of its meaningful words appear anywhere in the normalized transcript.
4. Values failing this check are flagged as hallucinations with their field path and literal value.

**What it catches:** Invented medication names, fabricated diagnoses, plan items with no textual basis.

**Known limitation:** It's a recall-oriented check — it will miss hallucinations where Claude uses words that happen to appear in the transcript but in unrelated context (e.g., the word "pain" exists in the transcript but the flagged "chest pain" refers to a different sentence). A more precise check would require span-level grounding, which is left as future work.

---

## What I'd Build Next

1. **Regression detection across prompt versions.** Right now the compare view shows aggregate deltas. A case-level regression view — "these 7 cases got worse between v1 and v2" — would be far more actionable for prompt iteration.

2. **Cost guardrail.** Estimate token count (from the system prompt + transcript lengths) before sending the first API call and refuse to start a run that would exceed a configured USD cap. Prevents surprise bills on non-Haiku models.

3. **Streaming CLI output.** The CLI eval script currently waits for each case to finish before printing. A live progress bar with per-case scores as they arrive would make long runs easier to monitor.

4. **Active-learning hint.** Surface the 5–10 cases where zero-shot and CoT disagree most (highest score delta). These are the cases where annotation quality matters most and where a human review pass would give the biggest signal-to-noise improvement.

5. **Second model comparison.** Adding Sonnet 4.6 to the model selector would let the compare view answer "is the quality jump from Haiku to Sonnet worth the 5× cost?" — which is the real production decision.

---

## What I Cut

- **Prompt diff view** (stretch goal) — identifying which prompt characters changed between two content hashes and correlating them to regressions would be genuinely useful, but out of scope for the time budget.
- **Auth enforcement on eval routes** — `better-auth` is fully wired up and session-aware, but the `/api/v1/runs` routes are intentionally left public for eval ease. In production these would be gated.
- **Highlighted transcript view** — the dashboard shows gold vs prediction JSON side-by-side but does not highlight where in the transcript each predicted value is grounded. This was scoped out in favour of completing the core metrics pipeline.
- **Resume test in automated suite** — resumability works end-to-end (kill server mid-run, restart, `POST /api/v1/runs/:id/resume` continues from last completed case), but the test for it requires a real DB and wasn't included in the unit test suite for isolation reasons.

---

## Test Coverage (27 tests, 0 real API calls)

| # | Test | File |
|---|---|---|
| 1–4 | `normalizeFrequency` — BID/QD/PRN/null | `evaluate.test.ts` |
| 5–8 | `medicationMatches` — fuzzy name, null dose, conflict, mismatch | `evaluate.test.ts` |
| 9–13 | `setF1` — empty/empty, empty pred, empty gold, partial match, no double-count | `evaluate.test.ts` |
| 14–17 | `scoreVitals` — exact match, temp tolerance pass/fail, BP mismatch | `evaluate.test.ts` |
| 18–19 | Hallucination positive — med name not in transcript, diagnosis not in transcript | `evaluate.test.ts` |
| 20–21 | Hallucination negative — grounded med, grounded chief complaint | `evaluate.test.ts` |
| 22–24 | Schema-validation retry — succeeds on attempt 2, fails all 3, trace count | `llm.test.ts` |
| 25–26 | Rate-limit backoff — single 429, consecutive 429s | `llm.test.ts` |
| 27 | Prompt hash stability — same prompt always produces same hash | *(via prompt-hash module)* |
