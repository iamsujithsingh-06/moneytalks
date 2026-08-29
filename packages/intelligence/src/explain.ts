import type { AssistantIntent, AssistantTurn } from "@moneytalks/types";
import { detectIntent } from "./intents.js";
import { spentByMonth } from "./insights.js";
import type { IntelligenceContext } from "./types.js";

/**
 * Deterministic, hallucination-safe assistant. It answers ONLY from real
 * transaction/budget data present in the context. When no real data answers a
 * supported question, it says so explicitly (supported=false); when the
 * question is not understood, it asks for clarification rather than
 * fabricating an answer.
 */
export function explainQuestion(
  ctx: IntelligenceContext,
  question: string,
): AssistantTurn {
  const intent = detectIntent(question);
  const currentMonth = ctx.now.slice(0, 7);

  const expenseByMonth = spentByMonth(
    ctx.transactions.filter((t) => t.isExpense),
  );

  switch (intent) {
    case "total-spend": {
      const total = [...expenseByMonth.values()].reduce((m, v) => m + v, 0);
      if (total <= 0) {
        return turn(
          question,
          intent,
          "I don't have any confirmed expenses yet, so there's no total spend to report.",
          false,
          "insufficient data",
          {},
        );
      }
      return turn(
        question,
        intent,
        `Your total recorded spending across all confirmed expenses is ${total} minor units.`,
        true,
        null,
        { amountMinor: total, currency: ctx.currency },
      );
    }
    case "biggest-categories": {
      const cats = rankCategories(ctx);
      if (cats.length === 0) {
        return turn(
          question,
          intent,
          "I don't have enough categorized expenses to rank your biggest categories.",
          false,
          "insufficient data",
          {},
        );
      }
      const top = cats
        .slice(0, 3)
        .map((c) => `${c.name} (${c.spent} minor units)`)
        .join(", ");
      return turn(
        question,
        intent,
        `Your biggest spending categories are: ${top}.`,
        true,
        null,
        { categoryName: cats[0]?.name, currency: ctx.currency },
      );
    }
    case "category-spend": {
      const cats = rankCategories(ctx);
      if (cats.length === 0) {
        return turn(
          question,
          intent,
          "I don't have categorized expenses to tell you about category spend.",
          false,
          "insufficient data",
          {},
        );
      }
      const details = cats
        .slice(0, 3)
        .map((c) => `${c.name}: ${c.spent} minor units`)
        .join("; ");
      return turn(
        question,
        intent,
        `Category spend so far: ${details}.`,
        true,
        null,
        { categoryName: cats[0]?.name, currency: ctx.currency },
      );
    }
    case "month-comparison": {
      const months = [...expenseByMonth.keys()].sort();
      if (months.length < 2) {
        return turn(
          question,
          intent,
          "I need at least two months of expenses to compare your spending.",
          false,
          "insufficient data",
          {},
        );
      }
      const prev = months[months.length - 2] as string;
      const last = months[months.length - 1] as string;
      const prevVal = expenseByMonth.get(prev) ?? 0;
      const lastVal = expenseByMonth.get(last) ?? 0;
      if (prevVal === 0) {
        return turn(
          question,
          intent,
          `Last month (${prev}) had no expenses, so there's no comparison to make.`,
          false,
          "insufficient data",
          {},
        );
      }
      const change = ((lastVal - prevVal) / prevVal) * 100;
      const direction = change >= 0 ? "up" : "down";
      return turn(
        question,
        intent,
        `Spending went ${direction} ${Math.abs(change).toFixed(1)}% from ${prev} (${prevVal}) to ${last} (${lastVal}) minor units.`,
        true,
        null,
        {
          amountMinor: lastVal,
          priorAmountMinor: prevVal,
          differenceMinor: lastVal - prevVal,
          currency: ctx.currency,
        },
      );
    }
    case "budget-status": {
      const budgets = ctx.budgets;
      if (budgets.length === 0) {
        return turn(
          question,
          intent,
          "You don't have any budgets yet, so there's no budget status to report.",
          false,
          "insufficient data",
          {},
        );
      }
      const out = budgets.map((b) => {
        const over = b.allocatedMinor - spentInBudget(ctx, b);
        const term = over >= 0 ? `${over} left` : `${-over} over`;
        return `${b.categoryName ?? "Uncategorized"}: ${term}`;
      });
      return turn(
        question,
        intent,
        `Budget status: ${out.join("; ")}.`,
        true,
        null,
        { currency: ctx.currency },
      );
    }
    case "trends": {
      const months = [...expenseByMonth.keys()].sort();
      if (months.length < 2) {
        return turn(
          question,
          intent,
          "I need at least two months to identify a spending trend.",
          false,
          "insufficient data",
          {},
        );
      }
      const first = expenseByMonth.get(months[0] as string) ?? 0;
      const last = expenseByMonth.get(months[months.length - 1] as string) ?? 0;
      const trend =
        last > first * 1.1
          ? "rising"
          : last < first * 0.9
            ? "falling"
            : "roughly stable";
      return turn(
        question,
        intent,
        `Your spending trend is ${trend} from ${months[0]} to ${currentMonth} (${first} → ${last} minor units).`,
        true,
        null,
        { amountMinor: last, priorAmountMinor: first, currency: ctx.currency },
      );
    }
    case "unsupported":
    default:
      return turn(
        question,
        intent,
        "I can tell you about your total spend, biggest categories, category spend, month-to-month comparisons, budget status, and spending trends. Could you rephrase?",
        false,
        "unsupported intent",
        {},
      );
  }
}

function turn(
  question: string,
  intent: AssistantIntent,
  answer: string,
  supported: boolean,
  caveat: string | null,
  data: AssistantTurn["data"],
): AssistantTurn {
  return {
    question,
    intent,
    answer,
    supported,
    caveat,
    data,
    ...(supported ? {} : { fallbackMessage: answer }),
  } as AssistantTurn;
}

function rankCategories(ctx: IntelligenceContext): { name: string; spent: number }[] {
  const map = new Map<string, { name: string; spent: number }>();
  for (const t of ctx.transactions) {
    if (!t.isExpense) continue;
    const name = t.categoryId
      ? ctx.categories.find((c) => c.id === t.categoryId)?.name ?? "Uncategorized"
      : "Uncategorized";
    const rec = map.get(name) ?? { name, spent: 0 };
    rec.spent += t.amountMinor;
    map.set(name, rec);
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent);
}

function spentInBudget(
  ctx: IntelligenceContext,
  budget: IntelligenceContext["budgets"][number],
): number {
  let total = 0;
  const from = dateIso(budget.window.from);
  const to = dateIso(budget.window.to);
  for (const t of ctx.transactions) {
    if (!t.isExpense) continue;
    if (t.date < from || t.date > to) continue;
    total += t.amountMinor;
  }
  return total;
}

function dateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
