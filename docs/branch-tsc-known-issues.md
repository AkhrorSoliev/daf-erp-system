# `tsc --noEmit` — ma'lum va qamrovdan tashqari xatolar

**Sana:** 2026-08-05 · **Tekshiruvchi:** `npx ts-node scripts/check-tsc-scope.ts`

`tsconfig.build.json` `**/*spec.ts` va `scripts/**/*` ni exclude qiladi, shuning uchun
`nest build` bu xatolardan mustaqil. Bu ro'yxat **filial ishining tip qarzini ko'rinadigan
va chegaralangan** holda ushlab turish uchun.

## Qoida

| Toifa | Ruxsat |
|---|---|
| **Production manba** (`src/**`, `*.spec.ts` emas) | **Hech qachon.** Ro'yxatga qo'shib ham bo'lmaydi — skript rad etadi |
| Boshqa fayl | Faqat quyida nomlangan bo'lsa |

Ro'yxatning **qisqarishi bepul**; **o'sishi** shu faylni tahrirlashni talab qiladi va
PR ko'rib chiqishida ko'rinadi.

## D toifa — filialga aloqasi yo'q (oldindan mavjud)

Bu fayllar filial ishidan oldin ham xato berardi. Ular **faqat raqam uchun
o'zgartirilmaydi** — aloqasiz faylga tegish alohida ishning predmeti.

- `server/src/attendance/attendance.service.spec.ts` — `SaveAttendanceDto` shakli + `possibly undefined`
- `server/src/payment-gateways/click/click.service.spec.ts` — `sign_string` fixture tipi
- `server/src/lesson-reschedules/lesson-reschedules.service.spec.ts`
- `server/src/telegram-groups/telegram-group-report-menu.service.spec.ts`
- `server/src/salary/salary-accrual.service.spec.ts`
- `server/src/salary/salary-calculation.service.spec.ts`
- `server/src/salary/salary-monthly-staff.service.spec.ts`
- `server/src/salary/salary-overview.service.spec.ts` — `res.pending` (Faza 4 da yopiladi)

## B toifa — filial ishidan, 1-bosqichdan oldin

Oldingi batch `branchIds` ni majburiy qilgan, spec'lar esa yangilanmagan. Faza 2 da
mexanik tuzatish 15 tasini yopdi; qolganlari `TS2345` (obyekt shakli) bo'lgani uchun
qo'lda ko'rib chiqishni talab qiladi.

- `server/src/reports/reports-financial.service.spec.ts`
- `server/src/reports/reports-excel.service.spec.ts`
- `server/src/reports/reports-profit-loss.service.spec.ts`
- `server/src/reports/reports-cash-flow.service.spec.ts`
- `server/src/reports/reports-balance-sheet.service.spec.ts`
- `server/src/expenses/expenses.service.spec.ts`

## C toifa — 2-bosqich (Faza 2 da defaultlar olib tashlangandan keyin)

Scope endi **majburiy parametr**, ya'ni bu xatolar mexanizmning ishlayotganini
ko'rsatadi: har biri scope uzatmaydigan chaqiruvchi.

- `server/src/mock-exams/mock-exam-participants.service.spec.ts`
- `server/src/mock-exams/mock-exams.service.spec.ts`
- `server/src/payments/payments.service.spec.ts`
- `server/src/payments/payments-preview.service.spec.ts`
- `server/src/transactions/transactions-read.service.spec.ts`
- `server/src/leads/leads.service.spec.ts`
- `server/src/leads/leads-board.service.spec.ts`
- `server/src/users/users.service.spec.ts`
- `server/src/students/students.service.spec.ts`
- `server/src/students/students-read.service.spec.ts`
- `server/src/groups/groups.service.spec.ts`
- `server/src/dashboard/dashboard.controller.spec.ts`
- `server/src/common/auth/operational-branch-scope.spec.ts`

## E toifa — `scripts/`

Bir martalik PROD diagnostika va backfill skriptlari. `tsconfig.build.json` dan
chiqarilgan; egaligi loyiha egasida, **tegilmaydi**.

- `server/scripts/audit-branch-batch0.ts`
- `server/scripts/audit-branch-isolation.ts`
- `server/scripts/audit-expense-cash-branch.ts`
- `server/scripts/backfill-cash-accounts.ts`
- `server/scripts/calculate-may.ts`
- `server/scripts/close-branchless-cash-accounts.ts`
- `server/scripts/generate-financial-excel.ts`
- `server/scripts/june-income-bases.ts`
- `server/scripts/may-profit.ts`
- `server/scripts/reopen-group-29.ts`
- `server/scripts/send-daily-report-now.ts`
- `server/scripts/verify-monthly-net-profit.ts`

## E toifa — qo'shimcha (Faza 7 dan keyin)

`@default(1001)` olib tashlangandan keyin `companyId` Prisma'da **majburiy** bo'ldi.
`src/` dagi 8 ta yozish yo'li va `prisma/seed.ts` tuzatildi; quyidagi bir martalik
skript esa **tegilmadi** (allaqachon yurgizilgan, egaligi loyiha egasida):

- `server/scripts/backfill-leads-board.ts`
