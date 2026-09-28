# «Markaz qoplagan 1-dars» — the centre's first lesson shows as the centre's money

**Date:** 2026-09-28 · **Status:** draft, waiting for the CEO
**Depends on:** PR #595 (ADR-0046) and PR #596 (ADR-0047).
**From:** the «Zarur» list of 28.09 (items 7 and 11). Items 14 and 21 of that
list (a Branch Director seeing other branches on `/reports/payment-reports`, and
the endless loader for a director of two branches) were already fixed on main
by f206f1f9 (27.09) and are out of scope.

## Why

CEO decision (27.09): the centre covers one lesson a month for the teacher, the
first one, and only if the student came. Since #595 a student who has not paid
is kept out of the lesson from the 2nd one on, so every accrual from the 2nd
lesson on is backed by the student's own money. One kind of accrual is not: a
student who came to the month's **first** lesson and has not paid for it.

Today that accrual is written like any other monthly lesson: its coverage is
the month's charge transaction, so it is stored as **student-funded**
(`wasCenterTopUp = false`). The salary report then shows it under
«O'quvchilar to'lagan», the «Markaz qo'shdi» column and the X/Y/Z recovery
card do not see it, and the «Markaz qoplagani» debt tab does not list the
student. If the student never pays, the report keeps saying the students paid
for a lesson the centre paid for.

The teacher's pay is right; only the funder is wrong.

## Rule

**R1 — Fronted at the lesson.** A monthly-course lesson dated 2026-10-01 or
later, marked PRESENT or LATE, which is the student's first lesson of the month
in the group and which their payments do not reach
(`firstLessonCoverage(...) → firstLesson && !covered`, the rule #596 already
uses for an ABSENT), accrues as a **centre top-up**:
`isCenterTopUp = true`, `wasCenterTopUp = true`. Same amount, same teacher.

**R2 — Recovered on payment.** When a payment makes such a lesson covered, its
accrual flips `isCenterTopUp → false`. `wasCenterTopUp` stays `true` (sticky,
as for every top-up): that month the centre fronted it, and the pay-back is the
X/Y/Z lifecycle. Where: the payment phase #596 added
(`processRetroactiveBillingForStudent`, phase 1b), which already reads the
student's coverage once per payment.

**R3 — Corrections.** ABSENT → PRESENT/LATE on an uncovered first lesson
writes the fronted accrual (today it writes a student-funded one).
PRESENT/LATE → ABSENT keeps #596's rule (the accrual is reversed until the
student pays).

**R4 — A charge written later does not recover it.** `setCenterTopUpForPeriod`
flips every fronted accrual of the period to `false` when a month's charge is
written (a return from a freeze, a re-charge). For a fronted first lesson that
would call a lesson recovered that nobody paid for. After that flip, the same
student's first lessons of that period are re-judged by R1/R2.

## Not changed

- The teacher's amount and when it is paid.
- Lessons before 2026-10-01, LESSON_PACK courses, and every accrual from the
  2nd lesson on.
- The gap sweep: it fronts lessons with no accrual; these have one.

## Item 11 — the old top-up flag (July–September)

Known defect in server/CLAUDE.md: under the 12-lesson model `isCenterTopUp` is
cleared only when retroactive billing settles a previously unbilled lesson, so
a student who later paid can stay «fronted», and the «Qolgan (markaz)» figure
of those months reads high. From October the monthly model flips the flag on
charge writes, and R2 covers the first lesson, so the defect is historical.

Proposed: a **read-only audit script** first
(`scripts/audit-center-topup-flags.ts`): per past month, the fronted accruals
whose student has since paid enough to cover them, and the sum. The CEO sees
the figures and decides; a fix script (dry run by default) is written only
after that. No figures are stored in the repository.

## Testing

- Pure: `firstLessonCoverage` already tested; add a case table for R1 (first
  lesson × covered × status) → funded by the centre or by the student.
- Billing: PRESENT on an uncovered first lesson → `createAccrual` with
  `centerFunded: true`; covered → as today; 2nd lesson → as today; before
  01.10 → as today. ABSENT → PRESENT on an uncovered first lesson → fronted.
- Payment phase: a payment that covers the lesson flips the flag; one that
  does not leaves it; a repeat run changes nothing.
- R4: after a re-charge the uncovered first lesson is fronted again.
- Salary report: the fronted lesson appears in `centerFunded`, not in
  `covered`; `fullDeserved` is unchanged.

## Docs

ADR-0048 (Uzbek): the funder of the centre's first lesson. `server/CLAUDE.md`:
the attendance part-2 paragraph and the known-defect note.
