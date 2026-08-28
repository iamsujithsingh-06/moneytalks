# MoneyTalks — AI Architecture (Phase 1)

> Status: Approved (design only). Reference: `adr/ADR-007-ai-architecture.md`.
> **Non-negotiables:** AI never gets raw database access, never invents transactions or financial facts, never modifies transactions, and every answer must be grounded in application-calculated data.

---

## 1. Guiding Principles

1. **Grounding:** AI responses are produced only from structured financial data computed by MoneyTalks' analytics layer. No raw DB, no invented figures.
2. **No write access:** AI cannot create, edit, or delete transactions. Automation always produces **suggestions** requiring user action.
3. **Privacy-first:** AI providers receive aggregated/calculated data only — no raw PII, no merchant-specific sensitive detail beyond what's needed for the answer, no raw SMS text, no receipt images.
4. **Transparency:** answers carry references (category, period, amount) the user can drill into.
5. **Fail-safe:** provider outage or low data → graceful degradation (computed-data-only answer, or "not enough data").

---

## 2. High-Level Flow

```
User question / system trigger
   │
   ▼
Intent detection (deterministic + optional model)
   │
   ▼
Financial analytics/data layer (computed, bounded, structured)
   │
   ▼
Prompt assembly (data + question + safety rules)      ── never raw DB/PII
   │
   ▼
AI model (provider adapter: OpenAI-compatible / Anthropic / Gemini / self-hosted)
   │
   ▼
Grounded response (with references)
   │
   ▼
User (drill-down into underlying transactions available)
```

## 3. Controlled Architecture (layers)

### 3.1 Intent Detection
- Maps a natural-language question to a **typed financial operation** with parameters.
- Deterministic classifier first (keywords/slots) → fallback to LLM intent extraction (bounded, low-cost) for ambiguous input.
- Example intents:
  - `spending_change` ("Why did I spend more this month?")
  - `category_breakdown` ("Where did most of my money go?")
  - `category_spend` ("How much did I spend on food?")
  - `budget_status` ("Am I exceeding my budget?")
  - `category_delta` ("What category increased the most?")
  - `savings_capacity` ("How much can I save based on my recent spending?")
  - `cashflow`, `top_merchants`, `income_analysis`, `recurring_summary`, `clarity` (ambiguous → ask clarifying question)
- Output: `{ intent, params: { period, category?, granularity?, currency? }, confidence }`.

### 3.2 Analytics / Data Layer (the only data source)
- **`FinancialDataService`** computes structured, bounded results:
  - Period deltas (income, expense, net).
  - Category breakdowns + deltas.
  - Budget status per category (allocated, spent, remaining, pct).
  - Savings capacity estimate (income − fixed/avg expenses).
  - Top merchants, trend series, anomalies (statistical, deterministic rules first).
  - Recurring/subscription detections (from `recurring_transactions` + patterns).
- Data is **aggregated and bounded**: no raw transaction dumps; numbers are the answer input.
- All computation is deterministic + testable (unit-testable contracts), independent of the AI provider.

### 3.3 Prompt Assembly (server-side, in our code)
- Builds a **grounded prompt**: structured JSON data + user question + strict instructions:
  - Answer only from provided data.
  - Do not invent numbers or transactions.
  - Reference categories/periods; say "I can't determine that from your data" when unsupported.
  - No financial advice beyond summarizing the user's own data (conservative framing; disclaimers where relevant).
- System prompt + data payload; user message minimal. History (conversation context) kept bounded (last N turns), data re-computed per turn.

### 3.4 AI Provider Adapter
- **`AiProvider` interface:** `complete({ system, messages, tools? }) → { text, usage, model }`.
- Implementations: OpenAI-compatible, Anthropic, Gemini, self-hosted (vLLM/Ollama). Selected by config/feature flag.
- Failover: primary → fallback provider; on total failure, degrade to **computed-data-only response** (template rendering of the analytics numbers without generative text) — the user still gets the grounded answer.
- **No client keys:** all provider calls server-side.

### 3.5 Response Shaping
- Structured response: `{ answer, intent, references: [{type:'category'|'period'|'budget', id, label, amountMinor}], dataSnapshot }`.
- References enable the UI to offer "show transactions for Food this month" drill-downs (still user-scoped, permission-checked).
- Rate/abuse limits per user; content moderation of user input (harmless) and output (avoid advice-looking assertions — framing only).

---

## 4. Insight Generation (proactive)

- **Trigger:** scheduled recompute (e.g., daily) + on-demand refresh; after budget threshold crossings.
- **Signal detection (deterministic first):**
  - Anomalies: month-over-month category spikes (statistical threshold).
  - Trends: consistent category growth over ≥3 months.
  - Budget risk: spend ≥ warning/hard thresholds.
  - Savings opportunity: stable positive cash flow estimate.
- For each signal, analytics computes the exact numbers → prompt → insight text (grounded) → stored in `ai_insights` with `dataSnapshot` + references.
- Insights are dismissible; feedback (dismiss/like) stored for quality tuning.
- **Never auto-generates transactions** from insights (e.g., savings suggestion stays a suggestion).

## 5. Grounded-Data Contract (traceability)

- Every AI response/insight stores `dataSnapshot` (the structured numbers it was generated from).
- Requirement: user (and developer) can reproduce "the AI said X because data was Y" — full traceability, no hallucination surfaces.
- QA contract tests: for a fixed dataset, AI answers must match computed numbers (with provider variance tolerance); hallucination tests (ask about non-existent categories → must refuse).

## 6. Security & Privacy Boundaries

- **No raw PII to provider.** Provider receives: aggregated amounts, category labels, period labels, budget names. Merchant names only in aggregates (e.g., top merchant lists) when needed, never full raw SMS/notes by default.
- **No write tokens** in AI service; no DB mutation capability (read-only analytics interface).
- Per-user `aiFeaturesEnabled` opt-in (settings); AI disabled by default until user enables.
- Provider DPA review; data retention off/minimized; logs sanitized (no prompt data).
- Prompt-injection resistance: user text is data, not instructions; system prompt separation; input normalization; output filters for protected content.

## 7. Cost & Latency Controls

- Intent routing avoids model calls for deterministic intents.
- Short, bounded prompts; temperature 0 for data questions; cheap model for intent, better model for final answer (configurable).
- Insight generation is batch/cached (recompute only on change or daily).
- Per-user daily caps + rate limits; streaming (SSE) for long assistant answers (P2).

## 8. Example Grounded Answers

| Question | Analytics result | Grounded answer shape |
|---|---|---|
| "Why did I spend more this month?" | Expense +18% vs last month; Top categories: Food +₹2,400, Travel +₹3,100 | "Your spending rose 18%. Food and Travel drove it: +₹2,400 and +₹3,100. Here are those transactions." |
| "Am I exceeding my budget?" | Food 90% of budget, warning threshold 80% | "Food is at 90% of its ₹8,000 budget — above your 80% warning. Remaining ₹800." |
| "What category increased the most?" | Travel +₹3,100 (+64%) | "Travel increased most: +₹3,100 (+64%)." |
| "How much can I save?" | Avg income ₹X, avg expenses ₹Y | "Based on your last 3 months, you can set aside about ₹(X−Y)/month. This is an estimate from your data." |

## 9. Evolvability

- Intents/operations are data-driven (registry) → new question types added without rearchitecting.
- Parser/classifier for intent can move from deterministic to ML without changing the data layer contract.
- Insights signals can become ML-based later; storage/rendering unchanged.
- Multi-provider switching via flags; self-hosted option for privacy-focused deployments.

## 10. Metrics & Observability

- Intent resolution rate; data-layer latency; provider latency/error/fallback rate; answer grounding violations (post-hoc checks); insight CTR/dismiss rate; cost per answer.
- Full audit: every AI call logged (userId, intent, prompt data-size, model, latency, outcome) minus content.

## 11. Related Documents

- Endpoints: `API_ARCHITECTURE.md` (§2.16)
- Data the AI reads: `DATABASE_ARCHITECTURE.md` (analytics §8)
- Decision: `adr/ADR-007-ai-architecture.md`
