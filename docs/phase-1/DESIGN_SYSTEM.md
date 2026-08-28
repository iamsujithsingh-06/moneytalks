# MoneyTalks — Design System Direction (Phase 1)

> Status: Approved direction (no UI implementation in Phase 1).
> **Rule:** the direction below is inspiration, not copying. Do not replicate any third-party UI. We build our own component language.

---

## 1. North Star

MoneyTalks should feel like a **serious financial product** — premium, calm, precise — not a generic student expense tracker.

Two words guide every screen:

> **"Track your money. Understand your money."**

- **Track** = effortless capture (SMS, OCR, import, quick add), fast lists, clear status.
- **Understand** = dashboards, analytics, budgets, goals, and AI insights that feel native to the product, not bolted on.

---

## 2. Locked Design Direction

| Principle | Direction |
|---|---|
| Appearance | **Dark-first** interface (dark is the default and hero state; light theme optional but secondary) |
| Aesthetic | Premium, minimal, high-readability, generous whitespace, restrained motion |
| Focus | Financial dashboard forward; data density handled with hierarchy, not clutter |
| Primary accent | **Teal / blue** family |
| Secondary accent | **Purple** (used sparingly for AI/secondary actions) |
| Surfaces | Rounded cards, subtle borders, soft elevation (no harsh shadows) |
| Typography | Clean, neutral, tabular numerals for money; strong hierarchy |
| States | Clear **positive (income/gains)** vs **negative (expense/risk)** signals, color + icon + copy (never color alone) |
| Accessibility | WCAG 2.1 AA contrast; readable type scales; keyboard/focus support; reduced-motion support |
| Responsive | Mobile-first layout; desktop dashboards; touch targets ≥ 44px |
| AI integration | Insights feel native: cards, inline answers, drill-downs — not a chatbot bolted on |

---

## 3. Color System (directional tokens)

> Values below are **direction**, to be finalized by a designer in Phase 2+; naming is token-driven for theming.

- **Background:** near-black, deep neutral (`bg-canvas`, `bg-surface`, `bg-surface-raised`).
- **Primary — teal/blue:** interactive accents, links, focus, active charts (`accent-primary` family).
- **Secondary — purple:** AI surfaces, insights, premium/secondary actions (`accent-secondary` family).
- **Positive:** income / inflow / gains (`semantic-positive`).
- **Negative:** expense / over-budget / risk (`semantic-negative`).
- **Neutral/warning/info:** supporting statuses (`semantic-warning`, `semantic-info`, `text-*`, `border-*`).
- **Text:** high-contrast on dark (near-white body, muted for secondary).
- **Contrast:** AA minimum (4.5:1 body, 3:1 large text/UI); money figures get AA+.

**Usage rule:** never indicate financial direction by color alone — pair with sign (`+₹` / `−₹`), icon (arrow up/down), and copy.

## 4. Typography

- Neutral, humanist sans for UI (e.g., Inter-class family; final choice in Phase 2).
- **Tabular numbers for all monetary amounts** (fixed-width numerals so columns/ledgers align).
- Type scale: display / title / heading / body / caption / overline; line-height ≥ 1.5 body.
- Money formatting: locale-aware (`₹1,23,456` Indian grouping), integer minor-unit handling server-side.

## 5. Components (directional set)

- **Cards:** rounded, elevated-by-color/border rather than drop shadows; used for dashboard tiles, summaries, insight cards.
- **Ledger/Transaction list:** high-scanability — merchant, category chip, amount right-aligned with sign + color + icon, status badges (`pending`, `synced`, `duplicate`, `auto`).
- **Progress bars:** budgets & goals; color shifts by state (ok → warning → over).
- **Charts:** line (cash flow/trends), bar (category comparisons), donut (breakdowns); consistent palette, legend + values (tabular), tooltips, reduced-motion friendly.
- **Badges/chips:** category, source (`SMS`, `OCR`, `Import`), confidence, sync state.
- **Buttons/inputs/forms:** consistent focus rings (teal), validation states, dark-friendly.
- **Empty states:** helpful + on-brand ("No transactions yet — here's how to get started"), never blank.
- **AI surfaces:** insight cards + assistant panel using purple accents; always show data references + drill-downs.
- **Feedback:** toasts/snackbars for async jobs (import, export, OCR); sync indicator in header.

## 6. Layout & Navigation (web)

- **Desktop:** persistent left rail (Dashboard, Transactions, Analytics, Budgets, Goals, Reports, AI Assistant, Settings) + top bar (search, sync status, notifications, profile).
- **Mobile web:** bottom navigation (4–5 items) + collapsible sections; dashboard-first.
- Dashboard composition: balance + period toggle; income/expense/net; top categories; recent activity; active budgets; goals; AI insight card (native, not decorative).
- Skeleton loaders for async data; shimmer-free minimal motion.

## 7. Dark Mode Strategy

- Dark is **default** (no "switch to dark" ceremony on first run).
- Light theme offered in Settings (secondary), sharing the same tokens (no separate art).
- Tokens live in `packages/config` (JSON) and drive Tailwind theme + Compose theme on Android → single source of truth for color/type/radius/spacing.

## 8. Motion & Interaction

- Subtle, purposeful motion only (transitions < 300 ms; charts animate once on mount, respect `prefers-reduced-motion`).
- No confetti/nova; finance = calm. Confirmation via clear success state, not animation.

## 9. Copy / Voice

- Clear, direct, non-preachy. Money shown with currency + sign always.
- Error messages actionable, in plain language (see ERROR_HANDLING).
- AI assistant voice: factual, data-grounded, references visible; no hype, no invented advice.
- Empty/blank states explain what to do next.

## 10. Android Alignment

- Compose Material 3, customized with the same tokens (dark-first), same component language, gesture-native.
- Money = tabular numerals; sync/review indicators visible; app-lock screen minimal + branded.

## 11. Do Not

- Do not copy any reference UI (layouts, branding) — inspiration only.
- Do not ship color-only status; always pair color+icon+text.
- Do not bury numbers: money is always prominent, precise, and tabular.
- Do not treat AI as a gimmick: insights must earn their place with accuracy + grounding.

## 12. Acceptance Criteria for Phase 8+ (design implementation)

- Dark-first theme with AA contrast on all interactive/reading text.
- Tabular money numerals everywhere.
- Positive/negative states use color+icon+copy.
- Single token source shared by web + Android.
- AI insight cards present with references + drill-downs.
- Responsive dashboard passes on ≤360px width.
- Reduced-motion honored.
