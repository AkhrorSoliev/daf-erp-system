# Ustoz oyligi — yagona oylik modeli (dizayn)

**Sana:** 2026-07-29
**Holat:** tasdiqlangan, implementatsiya kutilmoqda

## Muammo

Bitta ustoz uchun tizim to'rt xil raqam ko'rsatadi va ularning hech biri
"bu ustozga qancha to'lashimiz kerak" degan savolga javob bermaydi.

Prod misoli — #10005 Gulnozaxon Saloxiddinova (2026-07-29 holatiga):

| Qayerda | Raqam | Aslida nima |
|---|---|---|
| `/payments/salary` → To'liq ishlangan | 9 233 518 | Faqat iyul: o'tilgan darslar × stavka |
| Profil kartasi → Balans | 14 133 616 | `User.balance` — iyun+iyul accruallari yig'indisi, hech qachon kamaymagan |
| Profil → Ish haqi → Kutilayotgan (oylik) | 10 200 204 | Prognoz: 51 faol o'quvchi × 12 dars × 16 667 (real darslar emas) |
| Profil → Ish haqi → Haqiqiy yig'ilgan | 7 766 822 | To'lanmagan accruallar, **davr filtri yo'q** (iyun + iyul aralash) |

Sabablari:

1. `SalarySummaryService` mustaqil hisob yuritadi — davr tushunchasi yo'q,
   `expectedMonthly` esa `exactDays.length * 4` qat'iy formulasiga asoslangan
   prognoz.
2. Profil kartasidagi `User.balance` faqat o'sadi: u har accrualda oshadi
   ([salary-accrual.service.ts:363-366]) va faqat oylik `PAID` bo'lganda
   kamayadi. #10005 uchun uchala `SalaryPayment` ham `CALCULATED` holatida.
3. Avans (`TEACHER_ADVANCE`) ledgerga `teacherId` bilan yoziladi, lekin
   `User.balance` ga tegmaydi ([transactions-write.service.ts:618-631]),
   shuning uchun balans real qarzdan avans miqdoricha ko'p ko'rsatadi
   (#10005 uchun 3 400 000).

## Tamoyil

Ustoz oyligining **yagona manbai** — `SalaryMonthlyService.getMonthly`.
Profil tabi, profil kartasi va lehrer portali o'z hisobini yuritmaydi; ular
shu servisdan bitta qator (`row`) oladi. Farq arxitektura darajasida
imkonsiz bo'ladi.

## Backend

### 1. `userId` filtri

- `shared/resolve-monthly-scope.ts`: `SalaryMonthlyQuery` ga `userId?: number`.
  Agar `userId === performedById` (foydalanuvchi o'zini ko'ryapti) — filial
  scope'i chetlab o'tiladi (`branchId = undefined`); aks holda mavjud BD
  cheklovi saqlanadi.
- `salary-monthly.service.ts` va `salary-monthly-staff.service.ts`: roster
  `where` ga `id: userId`.

### 2. `getMonthlyForUser(userId, query, companyId, performedById)`

Qaytaradi: `{ month, floorMonth, period, row }`, bu yerda `row` — ustoz qatori
yoki FIXED_MONTHLY xodim qatori (`StaffRow` da ham `netToPay` bor), topilmasa
`null`.

### 3. Endpointlar

| Endpoint | Ruxsat |
|---|---|
| `GET /salary/monthly/user/:userId?month=` | `@Roles('CEO','Branch Director')` — mavjud `/teachers/:id/salary-summary` bilan bir xil |
| `GET /salary/me/monthly?month=` | Har qanday autentifikatsiyalangan foydalanuvchi, `@CurrentUser('id')` bilan scope |

### 4. Prognozni o'chirish

`salary-summary.service.ts` javobidan `expectedMonthly` (umumiy va guruh
bo'yicha) hamda `expectedPerLesson` **butunlay olib tashlanadi**. Ularni
faqat shu ishda o'zgaradigan ikki komponent o'qiydi (grep bilan tasdiqlangan).
Endpoint guruhlar ro'yxati uchun qoladi: guruh nomi, faol o'quvchi soni,
stavka turi/qiymati, kurs narxi, `hasConfig`.

Maydonni qoldirib qo'yish — uni yana qaytarib chalkashtirish demakdir.

## Frontend

### 1. `components/shared/salary-monthly-panel.tsx` (yangi)

- Props: `{ userId: number; scope: "admin" | "me" }` — endpointni tanlaydi.
- `MonthPicker`: min = javobdagi `floorMonth`, max = joriy oy.
- URL da `?salary_month=` bilan saqlanadi (CLAUDE.md URL-filtr qoidasi;
  sahifadagi `?tab=` bilan to'qnashmasligi uchun alohida nom).
- Kartalar aynan `/payments/salary` ustunlari: **To'liq ishlangan ·
  O'quvchilar to'lagan · Markaz qo'shimchasi · Avans · To'lanishi kerak ·
  Holat**.
- `hasLessonData = false` (may) bo'lganda `—` va tushuntiruvchi banner.
- `SALARY_STATUS_BADGE` / `SALARY_STATUS_LABELS` mavjud
  `components/payments/salary-utils` dan qayta ishlatiladi.

### 2. `components/shared/salary-summary-view.tsx`

Prognoz kartalari olib tashlanadi. Qoladi: guruhlar konteksti (nom, o'quvchi
soni, stavka, kurs narxi) va konfiguratsiya ogohlantirishi.

Tab tarkibi: `<SalaryMonthlyPanel/>` → guruhlar ro'yxati →
`<PossibleDeductionsInfo variant="teacher"/>`.

### 3. Profil kartalari

`teachers/teacher-profile-card.tsx` va `settings/employee-profile-card.tsx`:

- «Balans» o'rniga **«To'lanishi kerak»** — joriy oyning `netToPay` qiymati
  (avans allaqachon ayirilgan), o'sha endpointdan.
- Ostida kichik qator: `To'liq ishlangan X · avans −Y`.
- Ma'lumot yo'q yoki `hasLessonData=false` bo'lsa — `—`.
- Ko'rinish huquqi hozirgidek: CEO / Branch Director.

### 4. Lehrer portali

`components/profile/teacher-salary-client.tsx`: uchta KPI kartasi
(«Kutilayotgan oylik», «Haqiqiy yig'ilgan», «Jami berilgan») o'rniga o'sha
`SalaryMonthlyPanel` (`scope="me"`). Joriy davr breakdown jadvali va guruhlar
ro'yxati pastda qoladi.

## Semantik nuqta (kutilgan xatti-harakat)

`netToPay` bazasi oyga qarab farq qiladi (`TOPUP_EFFECTIVE_MONTH = '2026-07'`,
`salary/shared/topup.ts`):

- **2026-07 va undan keyin:** to'liq ishlangan − avans
- **undan oldin:** o'quvchilar to'lagani − avans

Ya'ni iyun uchun karta iyuldagidan kichikroq raqam ko'rsatadi. Bu to'g'ri va
`/payments/salary` bilan bir xil — o'sha oyning haqiqiy modeli. May oyi
`—` bo'lib qoladi (per-lesson accrual yo'q, konfiguratsiyalar iyunda kuchga
kirgan).

## Qamrovdan tashqarida

- `User.balance` ledger maydoniga tegilmaydi. U hisobot uchun ishlatilmay
  qo'yadi, lekin ledger yaxlitligi uchun joyida qoladi.
- Avansning `User.balance` ga ta'sir qilmasligi (ledger drift) alohida
  masala — bu ishda faqat UI shu maydonga tayanmay qo'yadi.
- `salary-overview.service.ts` dagi prognoz (⚙ Sozlamalar ro'yxati)
  tegilmaydi.

## Testlar

- `resolve-monthly-scope.spec.ts` — `userId` o'tishi + o'zini-ko'rishda
  filial bypass
- `salary-monthly.service.spec.ts` — `userId` bilan aynan bitta qator
- `salary.controller.spec.ts` — ikkala yangi endpoint uchun `@Roles` guard
  metadata testi (loyiha majburiy qoidasi)
- `salary-summary.service.spec.ts` — olib tashlangan maydonlarga moslash
- To'liq: `cd server && npm test`, `cd client && npm run build`
