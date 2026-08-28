# ADR-007: AI Architecture (Grounded, Provider-Independent, Write-Protected)

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `AI_ARCHITECTURE.md`

## Context
MoneyTalks must answer financial questions ("Why did I spend more this month?", "Where did most of my money go?", "Am I exceeding my budget?") and generate insights. Locked requirements: AI must not receive raw database access, must not invent transactions/facts, must be grounded in application-calculated data, and must never modify transactions.

## Decision
- **Controlled pipeline:** user question → **intent detection** → **financial analytics/data layer** (computed, bounded, structured; the only data source) → **grounded prompt assembly** (our code; data + question + strict safety rules) → **AI provider adapter** → **grounded response with references** → user drill-down.
- **No write access:** AI service has read-only analytics access; suggestions only; transactions/categories/etc. are never written by AI. Automation produces drafts requiring user action.
- **Provider-independent:** `AiProvider` interface (`complete(...)`); implementations for OpenAI-compatible, Anthropic, Gemini, self-hosted (vLLM/Ollama); selection via config/flags; failover provider; on total failure, degrade to a **computed-data-only template answer** (no generative text) so the user still gets grounded numbers.
- **Privacy:** providers receive aggregated amounts, category/period labels, budget names — no raw PII, no raw SMS, no receipt images, no full notes. `aiFeaturesEnabled` opt-in (default off). Server-side keys only.
- **Traceability:** every answer/insight stores `dataSnapshot` (the numbers it was generated from) + references; hallucination tests + QA contract tests.
- **Insights engine:** deterministic signals first (anomaly/trend/budget-risk/savings-opportunity) computed by analytics, then grounded generation; stored in `ai_insights`, dismissible with feedback.
- **Cost/latency controls:** deterministic intent routing avoids model calls where possible; bounded prompts, temperature 0 for data questions; per-user caps; caching.

## Alternatives Considered
- Direct LLM with DB/vector access — violates grounding/no-invention requirements → rejected.
- AI with write tokens — violates write-protection → rejected.
- Single vendor SDK — violates no-coupling requirement → rejected.
- Rule-only "AI" (no model) — no natural-language UX; used only as the fallback/intent layer.

## Trade-offs
- Grounding layer limits the model to what we compute → some questions become "I can't determine that from your data," which is correct behavior.
- Adapter + fallback adds engineering → buys multi-vendor flexibility and resilience.
- Aggregated-only context can reduce answer richness → acceptable for correctness-first finance.
- AI opt-in default-off limits initial exposure → appropriate for trust-first product.

## Consequences
- Analytics service (Phase 4) is the data contract AI reads; AI (Phase 10) is built strictly on top.
- Grounded-data contract enforced by tests; no AI path can write ledger data.
- Cost/abuse controls ship with the AI feature, not after.
