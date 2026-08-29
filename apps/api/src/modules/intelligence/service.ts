import {
  buildBudgetIntelligence,
  buildForecast,
  buildInsights,
  detectAnomalies,
  detectRecurringExpenses,
  explainQuestion,
  type IntelligenceContext,
} from "@moneytalks/intelligence";
import type {
  AssistantTurn,
  IntelligenceReport,
} from "@moneytalks/types";
import type { AppLogger } from "../../lib/logger.js";
import {
  intelligenceRepository,
  type IntelligenceRepository,
} from "./repository.js";

export interface IntelligenceServiceDeps {
  logger: AppLogger;
  repository?: IntelligenceRepository;
}

/**
 * Read-only intelligence service. It only ever reads the current user's data
 * (already user-isolated in the repository) and passes it to the deterministic
 * engine. There are no write paths — the assistant and engine never mutate
 * MoneyTalks state.
 */
export class IntelligenceService {
  private readonly repository: IntelligenceRepository;

  constructor(private readonly deps: IntelligenceServiceDeps) {
    this.repository = deps.repository ?? intelligenceRepository;
  }

  /** Builds the full intelligence report for one user (read-only). */
  async report(userId: string): Promise<IntelligenceReport> {
    const ctx = await this.repository.buildContext(userId);
    return this.reportFromContext(ctx);
  }

  /** Answers a natural-language question from real data only (read-only). */
  async assistant(userId: string, question: string): Promise<AssistantTurn> {
    const ctx = await this.repository.buildContext(userId);
    return explainQuestion(ctx, question);
  }

  private reportFromContext(ctx: IntelligenceContext): IntelligenceReport {
    return {
      insights: buildInsights(ctx),
      budgets: buildBudgetIntelligence(ctx),
      forecast: buildForecast(ctx),
      recurring: detectRecurringExpenses(ctx),
      anomalies: detectAnomalies(ctx),
      generatedAt: new Date().toISOString(),
    };
  }
}
