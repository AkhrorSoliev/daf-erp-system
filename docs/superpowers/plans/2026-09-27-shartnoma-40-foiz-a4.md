# Contract 6.2 — No Refund After 40% (A4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a MONTHLY student leaves by their own decision (removal from the group, expulsion, card archive) on or after 01.10.2026, return the unheld lessons of the month only while at most 40% of the month's lessons were held; the CEO or a branch director can instead choose «Markaz tashabbusi» (unheld lessons back) or «Sifat bo'yicha shikoyat» (the whole month back).

**Architecture:** One pure rule (`billing/departure-policy.ts`) on top of the existing `departureRelease`, shared by the write (`MonthlyChargeService.reverseChargeForDeparture`) and a new read (`previewDepartureOutcomes`), so the dialog can never quote a figure the write does not credit. The policy travels from the removal DTO and the status-change DTO down to the charge; every other caller (freeze, transfer, group/branch/course closure) keeps today's rule. Threshold is the company-level setting `payment.noRefundAfterPercent` (default 40).

**Tech Stack:** NestJS 11, Prisma 7, Jest; Next.js 16, React Query, Vitest (node).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` §A4; contract (new) 6.2; mockup approved by the CEO 27.09.2026 («Ha roziman»): three options, «Kurs boshlanmasdan» dropped (0% held already returns everything), a debtor leaving after >40% keeps the whole month's debt.
- Contract start: departures on/after `2026-10-01` (Tashkent day) only; earlier departures keep today's rule whatever the policy.
- «Ko'prog'i» is strict: exactly 40% held → unheld lessons are returned.
- Share = covered lessons held up to and including the departure day ÷ covered lessons of the month (dates already frozen out excluded from both). A mid-month joiner's denominator is their own lessons.
- Non-default policies only for CEO / Branch Director, checked on the server from the database (ADR-0028), 403 otherwise.
- Teacher accruals are never touched by any policy.
- Freeze, transfer and centre-initiated closures (group cancelled/completed/deleted, branch closed/archived, course archived) keep today's rule (unheld lessons back).
- User-facing text: Latin Uzbek, no English. Code, comments, commits, PR: English. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Public repo: no production data.
- No schema migration (the policy lives in ledger metadata and history, not a column).

## File Map

| File | Change |
|---|---|
| `server/src/billing/departure-policy.ts` (+ spec) | NEW pure rule: policy type, contract start, `heldShare`, `policyRelease` |
| `server/src/settings/settings.types.ts`, `dto/update-payment-settings.dto.ts`, `settings.controller.ts` (+ specs) | `payment.noRefundAfterPercent` (0–100, default 40, company-level) |
| `server/src/billing/monthly-charge.service.ts` (+ spec) | `reverseChargeForDeparture({ policy })`, `previewDepartureOutcomes` |
| `server/src/students/shared/departure-policy-access.ts` (+ spec) | NEW: only CEO / Branch Director may pick a non-default policy |
| `server/src/students/dto/remove-from-group.dto.ts`, `student-enrollment.service.ts` (+ spec) | removal takes `departurePolicy`, history gets the money line |
| `server/src/students/dto/change-student-status.dto.ts`, `students-status.service.ts`, `students-write.service.ts`, `common/status/status-cascade.service.ts` (+ specs) | expel/archive take the policy; card delete uses the default |
| `server/src/students/students.controller.ts`, `students-read.service.ts` (+ specs) | `GET /students/:id/departure-preview` |
| `client/src/lib/departure-money.ts` (+ test) | NEW pure texts/decisions for the block |
| `client/src/components/students/departure-money-block.tsx` | NEW «Pul (shartnoma bo'yicha)» block |
| removal dialog + 3 callers, `change-status-dialog.tsx`, `payment-settings-client.tsx` | wire the block and the policy |
| `docs/adr/0043-…`, README, `server/CLAUDE.md` | decision record |

## Tasks

1. **Pure rule** — `departure-policy.ts`: `DEPARTURE_POLICIES`, `DEFAULT_DEPARTURE_POLICY = 'STUDENT_CANCELLED'`, `CONTRACT_62_START_DAY = '2026-10-01'`, `heldShare(input)`, `policyRelease(input, policy, thresholdPercent)` → `{ release, share, withheld }`. Tests: 5/13 → 8 released; 6/13 → withheld; exactly 40% → released; before 01.10 → released; centre → unheld; quality → all covered (capped at chargedAmount); frozen-out dates excluded from both sides; legacy row (no dates).
2. **Setting** — `payment.noRefundAfterPercent`, integer 0–100, default 40, `companyLevelOnly`; DTO + controller + specs.
3. **Charge service** — `reverseChargeForDeparture` takes `policy?` (default `CENTER_INITIATIVE` = today), reads the threshold only for `STUDENT_CANCELLED`, returns `{ refunded, lessons, policy, share, withheld }`, adds `policy` + `heldPercent` to the ADJUSTMENT metadata; `previewDepartureOutcomes(client, { enrollmentId, departureDate, companyId })` returns the three outcomes. Specs.
4. **Access rule** — `assertMayChooseDeparturePolicy(prisma, userId, policy)`. Specs.
5. **Removal** — DTO `departurePolicy?` (IsIn); service checks access, passes the policy, writes a `pul` line into the student and group history. Specs.
6. **Expel / archive** — DTO `departurePolicy?`; status service checks access and passes `{ departurePolicy }` into `cascade('Student', …)`; cascade threads it to `cascadeEnrollmentStatus` → `reverseChargeForDeparture` for EXPELLED/ARCHIVED only (default `STUDENT_CANCELLED` there); card delete passes the default. Specs.
7. **Preview endpoint** — `GET /students/:id/departure-preview?enrollmentId=` (CEO/BD/Admin, branch-scoped like removal): per MONTHLY enrollment (one, or all ACTIVE/FROZEN for expel) the group, period, covered/held/percent, threshold, whether the contract rule applies, current balance and the three outcomes. Controller guard spec + service spec.
8. **Client** — pure `departure-money.ts` (consequence texts, which options a role sees), `DepartureMoneyBlock` (lesson squares, facts line, radios for CEO/BD, locked default for others, consequence box), removal dialog + 3 callers send `departurePolicy`, change-status dialog (EXPELLED/ARCHIVED) the same, settings page number input (CEO-only). Vitest + guard test. **UI matches the approved mockup.**
9. **Docs** — ADR-0043 (Uzbek), README row, `server/CLAUDE.md` paragraph under «Enrollment Lifecycle Prepaid Refund».
10. **Verify** — server `npm run typecheck`, `npx eslint src` (0 errors), `npx jest --runInBand`; client `npx vitest run`, `npx eslint src`, `npm run build`. No push, no deploy.

## Deviations Found While Building

- **Archive keeps the old rule.** The status dialog archives a student through `DELETE /students/:id` and tells the admin it is «faqat xato/duplikat yozuv uchun»; a real departure is an expulsion. Withholding a mistaken record's money would be wrong, so only removal and expulsion take a policy (default `STUDENT_CANCELLED`); an archive, like every centre closing, returns the unheld lessons. A policy sent with any status but EXPELLED is a 400.
- **«Withheld» only when money would come back.** A month whose lessons are all held, or a frozen student whose rest the freeze already returned, is not reported as withheld (`policyRelease` checks the release first), so no history row claims the rule kept money it never touched.
- **The money note lives in billing** (`billing/departure-money-note.ts`), shared by the removal and the status cascade.
- **A fourth policy, `LEVEL_COMPLETED` («Darajani tugatdi»)** — CEO 27.09.2026: a student who finishes a level, with a certificate or to wait for the next level's group, fulfils the contract (10.1) rather than cancelling it, so the unheld lessons come back. Open to administrators on a removal, refused on an expulsion. The contract gains a sentence in 3.4 (both `docs/tolov-savollari/shartnoma-2026-taklif*.docx`).

## Deploy Notes

No migration. Server first, then client (the client sends a field the old server would reject: `forbidNonWhitelisted`). Must be live before the first departure on 01.10.2026 for the rule to apply from day one.
