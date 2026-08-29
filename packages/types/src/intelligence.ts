import type {
  AnomalySeverity,
  ForecastConfidence,
  AssistantIntent,
  RecurrenceFrequency,
} from "@moneytalks/shared";

export type {
  ForecastConfidence,
  AnomalySeverity,
  AssistantIntent,
  RecurrenceFrequency,
} from "@moneytalks/shared";

/**
 * A single deterministic, explainable spending insight (never fabricated).
 * Reuses the shared analytics `InsightCard` contract so analytics and the
 * Phase 9 intelligence engine both reference the same type.
 */
import type { InsightCard } from "./analytics.js";

/** Budget usage plus an explainable warning / projection (deterministic). */
export interface BudgetIntelligence {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  scope: string;
  period: string;
  allocatedMinor: number;
  spentMinor: number;
  percent: number;
  alertStatus: string;
  /** Remaining allocation in minor units (>= 0; 0 when over). */
  remainingMinor: number;
  /** Overspent amount in minor units (> 0 only when over budget). */
  overspentMinor: number;
  /** Warning copy derived from real numbers. */
  message: string;
  /** Estimated project-to-period-end spend in minor units (nullable). */
  projectedSpentMinor: number | null;
  /** Estimated days until exhaustion within the period, or null. */
  daysToExhaustion: number | null;
  /** On-track boolean when a projection is computable, else null. */
  onTrack: boolean | null;
  /** Human explanation of how the projection was derived. */
  projectionBasis: string | null;
}

/** A point in an explainable spending forecast (always labelled an estimate). */
export interface ForecastPoint {
  /** Bucket label, `YYYY-MM-DD` or `YYYY-MM`. */
  period: string;
  /** Projected expense in minor units (never fabricated; 0 when insufficient data). */
  projectedExpenseMinor: number;
  /** Deterministic lower/upper range in minor units for confidence. */
  lowerMinor: number;
  upperMinor: number;
}

export interface SpendingForecast {
  currency: string;
  granularity: string;
  confidence: ForecastConfidence;
  isEstimate: boolean;
  points: ForecastPoint[];
  /** Machine + human explanation of how the estimate was derived. */
  basis: string;
  /** True when there is insufficient history to make a real projection. */
  insufficientData: boolean;
}

/** Evidence-backed recurring expense candidate. */
export interface RecurringExpense {
  id: string;
  merchant: string;
  categoryId: string | null;
  frequency: RecurrenceFrequency;
  /** Typical (mean) amount in minor units. */
  typicalAmountMinor: number;
  /** Detected instances (count). */
  occurrences: number;
  /** Confidence 0..1 backed by regularity + occurrence count. */
  confidence: number;
  /** Actual dates/series used as evidence. */
  evidence: Array<{ date: string; amountMinor: number }>;
  /** Human-friendly explanation citing the evidence. */
  explanation: string;
}

/** An anomaly flagged by explainable rules/statistics. */
export interface SpendingAnomaly {
  id: string;
  merchant: string | null;
  categoryName: string | null;
  amountMinor: number;
  transactionDate: string;
  severity: AnomalySeverity;
  /** Human-readable reason stating exactly why it was flagged. */
  reason: string;
  /** Which statistical/rule signal fired. */
  signal: string;
}

/** Bundle returned by the insights endpoint. */
export interface IntelligenceReport {
  insights: InsightCard[];
  budgets: BudgetIntelligence[];
  forecast: SpendingForecast;
  recurring: RecurringExpense[];
  anomalies: SpendingAnomaly[];
  generatedAt: string;
}

/** Assistant query result — read-only, never mutates data. */
export interface AssistantQuery {
  intent: AssistantIntent;
  /** Whether a deterministic answer could be computed. */
  supported: boolean;
  /** When unsupported/insufficient, a safe human explanation. */
  fallbackMessage: string;
}

/** A natural-language assistant turn returned to the client. */
export interface AssistantTurn {
  question: string;
  intent: AssistantIntent;
  /** Deterministic answer text — numbers always derived from real data. */
  answer: string;
  /** Optional structured numbers backing the answer. */
  data: {
    amountMinor?: number;
    currency?: string;
    categoryName?: string;
    differenceMinor?: number;
    priorAmountMinor?: number;
  };
  /** True when the question maps to a real computation; false when answered
   * with a safe fallback because the intent is unsupported or data is missing. */
  supported: boolean;
  /** Explanatory note for honesty (e.g. "estimate", "insufficient data"). */
  caveat: string | null;
  /** Warning when the requested scope is not supported yet. */
  fallbackMessage?: string;
}
