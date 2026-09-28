# «Davomat va to'lov tartibi» — attendance window, unpaid-student admission, teacher pay

**Date:** 2026-09-27 · **Status:** approved by the CEO («Hammasi joyida davom etamiz», 27.09)
**Mockup:** Design canvas «Davomat va to'lov tartibi» (6 screens; PDF sent to the CEO).
**Contract:** new contract clauses 3.2, 3.4, 3.5, 5.1 (`docs/tolov-savollari/shartnoma-2026-taklif-toza.docx`).

## Why

1. Attendance can be entered long after a lesson. The server checks the lesson
   time only when the date is today, and CEO / Branch Director / Administrator
   skip the check completely. In September (read-only check) a noticeable
   share of lessons had their attendance first saved after the lesson ended,
   most of them by admins; admins also edited lessons that had ended, and
   some lessons never got attendance at all. The
   group's «Davomat olinmagan darslar» list invites anyone to fill old lessons.
   The end-of-lesson Telegram messages ask teachers and admins to «restore» it.
2. Contract 3.2: the first lesson of a month may be attended unpaid; from the
   2nd lesson a student is not admitted until paid. Today every student is on
   the roster and every mark pays the teacher: under monthly billing
   `accrueMonthlySalary` passes the month's charge transaction as coverage, so a
   debtor's lessons are paid to the teacher whether or not the student ever
   pays. The centre silently covers all of them.

## CEO decisions (27.09.2026)

- Teacher takes attendance once, during the lesson. An administrator may take
  or edit it until the lesson ends. After the lesson ends nobody on the site —
  the CEO included — can enter or change attendance; a correction is made only
  on the CEO's order, by a script.
- Admin takes attendance during the lesson → the teacher is paid (no fine).
  No attendance at the end of the lesson → the teacher gets nothing for that
  lesson (the fine is the lesson's pay: every attending student's teacher
  share for that day, summed).
- A late arrival marked by an admin after the teacher's save gets «Kechikdi»
  plus the minutes late, automatically (lateness statistics).
- An unpaid student is shown on the roster but disabled, with the warning:
  «Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish
  haqi yozilmaydi.»
- No extension without payment. A student who pays part of the month attends
  as far as the money reaches; a payment promise is recorded for the rest.
  Minimum: the money must cover every lesson of the month up to and including
  the one being attended (450 000 a month over 13 lessons: 1 lesson is
  34 615, so the 2nd lesson needs 69 231).
- The centre covers one lesson (the month's first) for the teacher, only if
  the student attended it.
- Excused (24 h notice, document) → deducted from next month (5.1, unchanged).
  Unexcused or blocked-for-non-payment lessons are paid in full (3.2).
- Trial lesson (3.5): a first-time student who leaves after the first lesson
  pays nothing; the centre pays the teacher.

## Rules

**R1 — Attendance window.** A lesson's window is `[start − 10 min, end]` on
the lesson day, Tashkent time, from the effective times (a reschedule's
override wins). Before it: only pre-marked absences. Inside it: the teacher
saves once; an admin (Administrator, Branch Director, CEO) saves and edits any
number of times. After it: attendance is closed to every role — saves, edits,
QR sessions and scans, pre-marks are refused. Past and future dates are
therefore closed to everyone. The only bypass is an explicit
`allowClosedLesson` option used by a CLI script run on the CEO's order.

**R2 — Admission (monthly courses, lessons on/after 2026-10-01).** For student
S in group G on lesson day D:
- D is before S's second lesson of the month in G (`paymentDueDate` over the
  charge's `coveredDates`, or the live calendar from the enrollment start when
  there is no charge or it has no dates; no second lesson → every lesson that
  month is the first) → admitted.
- Otherwise S is admitted iff
  `S.balance + Σ release(c, D) ≥ 0`, where the sum runs over S's CHARGED
  charges of D's month on ACTIVE enrollments and `release(c, D)` is
  `departureRelease({...c, departureDay: D})?.amount ?? 0` — the value of the
  covered lessons after D (discounted, frozen-out excluded, capped at the
  charge). In words: every lesson up to and including today is paid, and any
  older debt is fully paid.
- `shortfall = −(balance + Σ release)` is the least amount that admits S today.
- A payment promise never admits anyone.

**R3 — Marks for a blocked student.** PRESENT, LATE and ABSENT are refused
(400, the student's name). EXCUSED is allowed (admin; or a teacher saving a
pre-marked «Sababli»). No row is written otherwise; the full-roster check
skips blocked students. An unchanged existing mark is not re-checked.

**R4 — Teacher pay.** Unchanged for marks (PRESENT/LATE/ABSENT accrue, EXCUSED
does not). A blocked lesson has no row, so it never pays, even after a later
payment. Admission guarantees that every admitted lesson from the 2nd on is
paid. Part 2: a debtor ABSENT at the month's first lesson accrues only when
the student pays.

**R5 — Partial payment.** The admin payment dialog shows, for the amount
typed, how many lessons it reaches («2 darsga yetadi: 02.10 va 05.10») and
what the next lesson still needs. When the payment leaves a debt, it asks for
the promise date of the rest (prefilled with the first lesson the money does
not reach) and the server upserts the student's OPEN promise after the
payment. Promise failure never undoes the payment.

**R6 — Messages.** The attendance reminder texts change: at end − 30 min the
teacher is told that without attendance this lesson is not paid, the admin
that taking it now keeps the teacher's pay; at the end both are told it was
not taken and can no longer be entered on the site.

## Part 1 (before the first 2nd-lesson of October, 03.10)

Server:
- `attendance/shared/lesson-window.ts` (pure): `lessonWindowState`.
- `AttendanceValidationService`: date validity stays in `validateLessonDate`
  (no role bypass, no time check, returns effective times); new
  `assertWindowOpen` (R1) used by save and QR; planned absences refuse a
  closed lesson.
- `billing/lesson-admission.ts` (pure, R2) + `LessonAdmissionService`
  (loads balances, charges, the group's first-lesson dates; batch for a
  roster; per-student schedule for the payment dialog).
- `getByDate` returns `window` and per-student `admission`.
- `AttendanceSaveService.save`: R1 for every role, R3, `allowClosedLesson`.
- QR scan: R3.
- `GET /students/:id/admission-schedule` (CEO, BD, Administrator, Cashier).
- `CreatePaymentDto.promiseDate?` → upsert the OPEN promise after a payment
  that leaves a debt (R5).
- Reminder texts (R6).
- `SaveAttendanceOptions.allowClosedLesson`; the script that uses it is written on the CEO's first correction order (a script booting the whole app would also start its crons).

Client:
- Attendance form: one window rule for all roles (banners from the mockup),
  blocked rows (lock, warning, admin «To'lov qabul qilish»), «Qisman to'lagan
  · DD.MM gacha» note, planning mode only before the lesson.
- «Davomat olinmagan darslar»: no longer opens the form; says the teacher was
  not paid.
- Payment dialog: coverage hint + promise date (R5).

Docs: ADR-0047 (Uzbek), `server/CLAUDE.md` attendance paragraph.

## Part 2 (after October starts)

- `Attendance.lateMinutes` (migration); set when an admin marks a student
  present after the lesson's first save; shown on the row, the student card
  and the attendance report.
- «Berilmadi»: a nightly record of lessons that ended without attendance,
  with each teacher's lost pay (students with a charge covering the day,
  minus pre-marked excused and blocked); shown on the teacher's salary page
  and the admin salary page; the end-of-lesson message gains the amount.
- Trial lesson (3.5) in `policyRelease`: first-time student, only the first
  lesson attended → the whole month released.
- R4's deferred accrual for a debtor's ABSENT first lesson.

## Non-goals

- FIXED_MONTHLY teachers (none exist) are not fined.
- No site screen for post-lesson corrections; no grace period after the end.
- LESSON_PACK courses (none active) keep the old roster.
- Contract 5.3 (freeze not returning) stays a separate task.

## Testing

Pure units first: window states around `start − 10`, `end`, past, future,
reschedule override; admission for first lesson, exact threshold, one so'm
short, old debt, two groups, discount, credit, frozen-out, pre-2026-10-01.
Service tests: every role refused after the end and before the start; teacher
second save refused; blocked PRESENT/ABSENT refused, EXCUSED allowed,
roster check skips blocked; unchanged mark not re-checked; bypass option;
planned absence refused after the end; payment with `promiseDate` upserts the
promise and a failing promise keeps the payment. Client: window banners and
disabled rows render; payment hint arithmetic.
