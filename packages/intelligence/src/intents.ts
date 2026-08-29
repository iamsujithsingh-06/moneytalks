import type { AssistantIntent } from "@moneytalks/types";

interface IntentRule {
  intent: Exclude<AssistantIntent, "unsupported">;
  keywords: string[];
}

const RULES: IntentRule[] = [
  {
    intent: "total-spend",
    keywords: ["total", "spent", "spend", "overall", "how much", "expense"],
  },
  {
    intent: "biggest-categories",
    keywords: ["biggest", "top", "largest", "most", "category", "categories", "larger"],
  },
  {
    intent: "category-spend",
    keywords: ["category", "categories", "merchant", "shopping", "grocer", "dining", "entertain"],
  },
  {
    intent: "month-comparison",
    keywords: ["compare", "comparison", "vs", "versus", "than last", "last month", "this month"],
  },
  {
    intent: "budget-status",
    keywords: ["budget", "over budget", "under budget", "limit", "remaining", "left"],
  },
  {
    intent: "trends",
    keywords: ["trend", "trending", "rising", "falling", "over time", "increase", "decrease", "pattern"],
  },
];

/**
 * Deterministic rule-based routing of a natural-language assistant question
 * to an assistant intent. Keywords are matched case-insensitively with
 * priority given to earlier (more specific) rules. Unknown/ambiguous
 * questions map to `unsupported` so the assistant refuses rather than guesses.
 */
export function detectIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();

  // Budget and month-comparison keywords are the most specific and win first.
  if (RULES[4]!.keywords.some((k) => q.includes(k))) return "budget-status";
  if (RULES[3]!.keywords.some((k) => q.includes(k))) return "month-comparison";
  if (RULES[1]!.keywords.some((k) => q.includes(k))) return "biggest-categories";
  if (RULES[2]!.keywords.some((k) => q.includes(k))) return "category-spend";
  if (RULES[5]!.keywords.some((k) => q.includes(k))) return "trends";
  if (RULES[0]!.keywords.some((k) => q.includes(k))) return "total-spend";

  return "unsupported";
}
