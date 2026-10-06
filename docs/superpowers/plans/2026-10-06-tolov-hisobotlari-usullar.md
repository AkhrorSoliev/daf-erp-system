# To'lov hisobotlari: to'lov usullari va «Bugun» filtri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/payment-reports` shows the period's payments split by method, offers «Bugun / Kecha / Shu hafta» presets, and names the dates each card compares against.

**Architecture:** `ReportsPaymentsService.getPaymentReports` adds a `groupBy(['method'])` next to its existing aggregate (same where: COMPLETED + createdAt + branch scope) for the current period and every trend month, and returns the previous window's Tashkent dates. The client adds one card + one stacked-bar dialog, preset buttons in the filter bar (they only fill `startDate`/`endDate`), and pure helpers for presets and the comparison label.

**Tech Stack:** NestJS + Prisma + Jest (server); Next.js + React Query + recharts + date-fns + Vitest (client).

**Spec:** `docs/superpowers/specs/2026-10-06-tolov-hisobotlari-usullar-design.md`

## Global Constraints

- UI text in Uzbek (Latin). No English words on screen.
- Roles and branch scope unchanged: CEO, Branch Director, Administrator; `@BranchScope()`.
- Every new payment query carries `branchIdWhere(scope)` (guarded by `reports-payments.service.spec.ts`).
- Method labels come from `PAYMENT_METHOD_LABELS` (`client/src/components/payments/overview/overview-math.ts`); no second copy.
- Chart colours: literal hex, at most 4 hues + slate (client/CLAUDE.md, Charts).
- Do NOT run prettier on `client/`. Server: `npx prettier --write` on touched files.
- The client must not crash against a server without the new fields (deploy order is manual).

---

### Task 1: Server — methods split and compared dates

**Files:**
- Modify: `server/src/reports/reports-payments.service.ts`
- Test: `server/src/reports/reports-payments.service.spec.ts`

**Interfaces — Produces** (new fields on the `GET /reports/payment-reports` response):

```ts
methods: {
  current: { method: PaymentMethod; amount: number; count: number; share: number }[]; // amount desc
  total: { amount: number; count: number };
  trend: { month: string; byMethod: Partial<Record<PaymentMethod, number>> }[];
};
comparedTo: { startDate: string; endDate: string }; // YYYY-MM-DD, Tashkent, inclusive
```

- [ ] **Step 1: failing tests** — in the spec, make `payment.groupBy` answer by `by[0]` (`branchId` rows vs `method` rows), find the branch call by `by`, and add:
  - splits September by method, largest first, `share` = rounded % of the aggregate total, `total = { amount, count }` from the aggregate;
  - the last trend month carries `byMethod` `{ CASH, PAYME, CLICK }`;
  - `comparedTo` for 01.09–30.09 is `2026-08-02` … `2026-08-31`; for one day 06.10 it is `2026-10-05` … `2026-10-05`.
- [ ] **Step 2:** `cd server && npx jest src/reports/reports-payments.service.spec.ts` → new tests FAIL (`methods` undefined).
- [ ] **Step 3: implement** — `computePaymentMetricsForPeriod` adds
  `payment.groupBy({ by: ['method'], where: <same payment where>, _sum: { amount: true }, _count: true })` and returns `paymentCount` + `byMethod`; `getPaymentReports` returns `methods` (sorted, shares) and `comparedTo` via `tashkentDateStr(previousStart)` / `tashkentDateStr(new Date(previousEnd.getTime() - 1))`.
- [ ] **Step 4:** rerun the spec → PASS; `npx prettier --write` + `npx eslint --quiet` on both files; `npm run typecheck`.
- [ ] **Step 5:** commit `feat(reports): split payment reports by method and return the compared dates`.

### Task 2: Client — presets and comparison label

**Files:**
- Create: `client/src/components/reports/payment-reports/payment-report-period.ts`
- Test: `client/src/components/reports/payment-reports/payment-report-period.test.ts`
- Modify: `client/src/components/reports/payment-reports/payment-reports-filter-bar.tsx`
- Modify: `client/src/components/reports/payment-reports/payment-report-card.tsx` (`compareLabel` prop replaces the hard-coded «o'tgan oyga nisbatan»)

**Interfaces — Produces:**

```ts
export type DatePreset = "today" | "yesterday" | "thisWeek";
export const DATE_PRESETS: { key: DatePreset; label: string }[]; // Bugun, Kecha, Shu hafta
export function presetRange(preset: DatePreset, today: Date): { start: Date; end: Date };
export function activePreset(start: Date | null, end: Date | null, today: Date): DatePreset | null;
export function comparisonLabel(c: { startDate: string; endDate: string }, today: Date): string;
// "05.10 bilan solishtirganda" | "29.09–05.10 bilan solishtirganda" | "29.12.2025–04.01.2026 bilan solishtirganda"
```

- [ ] **Step 1: failing tests** — presets on Tuesday 06.10.2026 (today, yesterday, week from Monday 05.10), on Sunday 11.10.2026 (week 05.10–11.10), on Monday (week = today); `activePreset` matches and returns `null` for an arbitrary range; `comparisonLabel` single day, range, year shown when it is not the current year or the range spans two years.
- [ ] **Step 2:** `cd client && npx vitest run src/components/reports/payment-reports/payment-report-period.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement** the module; filter bar renders the three buttons (`variant` default when active, `aria-pressed`), clicking fills `rangeStart`/`rangeEnd`.
- [ ] **Step 4:** rerun → PASS; `npx eslint --quiet` on touched files.
- [ ] **Step 5:** commit `feat(reports): today/yesterday/this-week presets and honest comparison label`.

### Task 3: Client — «To'lov usullari» card and dialog, wiring, guide entry

**Files:**
- Create: `client/src/components/reports/payment-reports/payment-methods-card.tsx`
- Create: `client/src/components/reports/payment-reports/payment-methods-dialog.tsx`
- Modify: `client/src/components/reports/payment-reports/payment-report-dialog.tsx` (export `MonthsToggle`, reused)
- Modify: `client/src/components/reports/payment-reports/payment-reports-client.tsx`
- Modify: `client/src/qollanma/yangiliklar.ts`

**Interfaces — Consumes:** Task 1 response fields; Task 2 `comparisonLabel`.

- [ ] **Step 1:** card: one grid (method · amount · «N ta» · %), «Jami» row from `methods.total`, empty text «Tanlangan davrda to'lov yo'q».
- [ ] **Step 2:** dialog: stacked `BarChart` by month, one `Bar` per method present in the trend (order CASH, PAYME, CLICK, TRANSFER, UZUM), custom tooltip without zero rows plus «Jami», `MonthsToggle`.
- [ ] **Step 3:** client page: response type gains `methods?` / `comparedTo?`; card rendered only when `methods` exists; `compareLabel = comparedTo ? comparisonLabel(comparedTo, new Date()) : "oldingi davrga nisbatan"`; skeleton count 6.
- [ ] **Step 4:** `yangiliklar.ts` entry (roles 1, 2, 3) — methods card, presets, comparison label, and that the page is open to the Administrator (#670).
- [ ] **Step 5:** `npx eslint --quiet` on touched files, `npx vitest run src/components/reports src/qollanma`, `npx tsc --noEmit -p .`, `npm run build`.
- [ ] **Step 6:** commit `feat(reports): payment methods card and dialog on the payment reports page`.
