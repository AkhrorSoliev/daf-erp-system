# Oyni yopish: bank xarajati va ijtimoiy soliq — dizayn

Sana: 2026-10-28 · Holat: tasdiqlangan qoidalar (CEO, 28.10.2026) · Almashtiradi: ADR-0130 ning bank va oylik solig'i qismlari

## 1. Nima uchun

ADR-0130 (spec 2026-10-25) ikki narsani real jarayondan boshqacha hisoblaydi:

1. **Bank xarajati** — aylanma pog'onalari bo'yicha foiz. Aslida bank har oy hisob raqamidan aniq summani yechadi va ma'qul shaxs uni oy oxirida kiritadi.
2. **Ijtimoiy soliq** — xodim kartochkasidagi «Rasmiy oylik» maydonidan. Aslida rasmiy oylik = bankdan berilgan oylik. Naqd oylikdan soliq olinmaydi.

## 2. Kelishilgan qoidalar

1. Bank xarajati har oy oxirida **har bir bank hisobi uchun alohida** kiritiladi. Bitta hisob bo'lsa — bitta maydon.
2. Bank xarajati oddiy **xarajat** sifatida yoziladi: shu bank hisobidan chiqim, shu hisobning filialiga tegishli. Hisob qoldig'i bank ko'chirmasiga mos keladi.
3. Oylikning **bank hisobidan** (`CashAccountType.BANK`) berilgan qismi — rasmiy qism. Misol: oylik 2 000 000, bankdan beriladi:
   - xodimdan ushlanadi 12% = 240 000 (xodimning puli, markaz xarajati emas, faqat ko'rsatiladi);
   - xodim kartasiga 1 760 000 tushadi;
   - korxona ijtimoiy solig'i 12% = 240 000 — **markazning qo'shimcha xarajati**, sof foydadan ayriladi.
4. Naqd (`CASH`) berilgan oylikka soliq yo'q. `CARD` turidagi hisobdan berilgani ham soliqqa kirmaydi (bank emas).
5. `User.officialSalary` va bank foiz pog'onalari (`bank.turnoverTiers`) olib tashlanadi.
6. Oyni qulflash 1-bosqichda **yo'q**. O'rniga tekshiruv ro'yxati.
7. Byudjetga to'langan soliq «Soliqlar» xarajati sifatida qayta kiritilmaydi (tizim o'zi hisoblaydi). Cheklov §8 da.

Foizlar (12% va 12%) hozirgidek `/settings/tax` dagi oyga bog'langan stavkalardan olinadi: `payroll.employeeWithholdingPercent`, `payroll.employerSocialPercent`.

## 3. Bank xarajati

### Ma'lumot

- `ExpenseCategory` ga yangi qiymat: `BANK_FEES` («Bank xizmati»).
- `Expense` ga `cashAccountId String?` (FK `CashAccount`). Faqat `BANK_FEES` yozadi; boshqa kategoriyalar `null` (hozirgi «filialning birinchi hisobi» qoidasi o'zgarmaydi).
- `TransactionsWriteService.recordExpense` ixtiyoriy `cashAccountId` oladi va `recordOutflow` ga `cashAccountId` sifatida beradi. Xarajatni tahrirlash yo'li (reverse + qayta yozish) ham uni uzatadi.
- `branchId` = hisobning filiali. Sana: oyning oxirgi kuni (`@db.Date`). Tavsif: `Bank xizmati — <hisob nomi>, <oy>`.

### Bir oy, bir hisob — bitta yozuv

`PUT /month-close/:month/bank-fees` tanasi `{ items: [{ cashAccountId, amount }] }`:

- `amount` — butun so'm, ≥ 0.
- Hisob: shu kompaniyaniki, `type = BANK`, `deletedAt = null`, chaqiruvchining filial doirasida. Aks holda 400/403.
- Har hisob uchun shu oyning tirik `BANK_FEES` xarajati qidiriladi (`cashAccountId` + `date` oy ichida + `deletedAt = null`):
  - yo'q, `amount > 0` → yangi xarajat;
  - bor, summa boshqa → tahrir (xarajat sahifasidagi tahrir yo'li bilan: reverse + qayta yozish);
  - bor, `amount = 0` → o'chirish (soft delete + reverse);
  - bor, summa teng → hech narsa.
- Hammasi bitta Serializable tranzaksiyada; to'qnashuv `rethrowAsConflict` → 409.
- `EntityHistory` va xarajatlar tarixi xarajat sahifasidagi bilan bir xil yoziladi.
- Saqlangach `invalidateNetProfitCache`.

Xarajatlar sahifasida `BANK_FEES` ko'rinadi, lekin u yerda yaratilmaydi (kategoriya ro'yxatida taklif qilinmaydi) — ikki joydan kiritilsa bir oyga ikki yozuv bo'lib qoladi. Tahrir/o'chirish xarajat sahifasidan ham ishlaydi (oddiy xarajat).

### Sof foyda

Bank xarajati endi oddiy xarajat → `operatingExpenses` ga o'zi tushadi. `TaxCosts.bankFees` va `bank.turnoverTiers` hisobi **olib tashlanadi** (aks holda ikki marta ayriladi). Foyda tarkibida u xarajatlar kategoriyasi qatorida «Bank xizmati» bo'lib ko'rinadi.

## 4. Ijtimoiy soliq

### Asos

Oy M uchun, filial doirasida, **bankdan berilgan oylik**:

```
asos(M) = Σ CashMovement.amount (musbat qiymatda)
  qayerda: cashAccount.type = BANK
           type = OUTFLOW, reversedAt = null
           transaction.type = SALARY_PAYMENT
           transaction.salaryPayment.periodStart oy M ga tegishli (Toshkent)
           branchId doirada
+ Σ BANK hisobidan chiqqan TEACHER_ADVANCE xarajatlari,
  qaysiki settledBySalaryPayment.periodStart oy M ga tegishli
```

Avans: `Expense.paymentMethod = CARD` → BANK hisobidan chiqqan (`cashTypeForExpenseMethod`). U oylikdan ushlanadi, demak oylikning bankdan berilgan qismi. Hali hisob-kitob qilinmagan avans o'z oyligi berilganda hisobga tushadi.

Oy — **oylik tegishli oy** (`periodStart` oy ichida, Toshkent), berilgan sana emas: sof foyda ham shu oy bo'yicha. Oylik sahifasi (`payoutOf`) ham to'lovni shu qoida bilan topadi.

### Hisob

```
korxonaSolig'i = round(asos × employerSocialPercent / 100)   → xarajat
ushlangan      = round(asos × employeeWithholdingPercent / 100) → faqat ma'lumot
```

Har xodim bo'yicha emas, jami asosdan (yaxlitlash bir marta). `missingRates`: asos > 0 bo'lib stavka yo'q bo'lsa, hozirgidek.

Oylik hali berilmagan oy uchun soliq 0. Foyda kartasi buni «Oylik hali berilmagan — ijtimoiy soliq oylik berilgach qo'shiladi» deb aytadi (§5 tekshiruv ro'yxati).

### «Berildi» oynasi

Hozirgi «Karta» maydoni BANK va CARD hisoblarini birga ko'rsatadi. O'zgarish:

- tanlangan hisob `BANK` va summa > 0 bo'lsa, ostida bitta qator: «Kartaga tushadi: 1 760 000 · Ushlanadi: 240 000 · Korxona solig'i: 240 000 (alohida)». Raqamlar serverdan (`GET .../detail` stavkalarni qaytaradi), mijozda faqat ko'paytiriladi.
- `CARD` hisob tanlansa qator yo'q.
- To'lov tanasi o'zgarmaydi (`cashSlices`). Bank qismi = hisoblangan (brutto) summa; ushlangan 12% ham oxir-oqibat shu bank hisobidan byudjetga ketadi.
- Eski `official` bloki (`officialOf`, `officialLines`) olib tashlanadi.

## 5. «Oyni yopish» sahifasi

Manzil: `/reports/oyni-yopish`, Hisobotlar menyusida «Moliyaviy hisobotlar» bo'limida. Ruxsat: `settings.tax` (CEO standart; boshqa rollarga «Ruxsatlar» dan).

`GET /month-close/:month` (doira — sarlavhadagi filial):

1. **Oy surati** (faqat o'qish, `getMonthlyNetProfit` dan): tushum, o'qituvchilar oyligi, xodimlar oyligi, xarajatlar, to'lov komissiyasi, aylanma solig'i, korxona ijtimoiy solig'i (+ ushlangan, ma'lumot), sof foyda.
2. **Bank xarajati**: doiradagi har BANK hisobi — nomi, filiali, kiritilgan summa (yoki bo'sh), bitta «Saqlash» tugmasi hammasi uchun.
3. **Tekshiruv ro'yxati**:
   - Bank xarajati: har hisob kiritilganmi (0 kiritilgan = kiritilgan);
   - Oyliklar: berilgan / jami (`monthStateOf`);
   - Stavkalar: `missingRates` bo'sh mi.
   Hammasi ✓ bo'lsa «Oy hisobi to'liq».

Hozirgi oy ham tanlanadi (oy davomida ko'rish uchun); bank xarajati maydoni faqat tugagan oylar uchun faol — joriy oyga kiritib bo'lmaydi (400).

«Hisob to'liq emas» belgisi (foyda kartasi, Telegram `MISSING_RATES_WARNING`): `missingRates` ga yangi kalit `bank.feesEntered` qo'shiladi — tugagan oyda doiradagi kamida bitta BANK hisobi uchun yozuv bo'lmasa. Joriy oyda bu kalit chiqmaydi.

## 6. Olib tashlanadigan narsalar

- `User.officialSalary` — migratsiya ustunni o'chiradi. Deploydan oldin prodda to'ldirilgan qiymatlar soni tekshiriladi (27.10 da ijtimoiy soliq 0 edi, ya'ni hech kimda yo'q edi); qiymat bo'lsa CEO ga ro'yxat ko'rsatiladi. Xodim formasi maydoni, `payOnlySelect`/`omitOfficialSalary`, `salary.view` qoidasi, `UsersService` dagi kesh tozalash ham ketadi.
- `officialSplit`, `computePayrollTax` ning `officialByUser`, `payrollRowsOf`; `TaxCostsService.forMonth` endi `salaries` argumentini olmaydi.
- `bank.turnoverTiers`: `tax-rates.ts` dagi pog'ona parseri, `/settings/tax` dagi «Bank» bo'limi (`tax-bank-tiers.tsx`), `TaxCosts.bankFees`. Settings jadvalidagi eski qator o'qilmaydi (o'chirilmaydi).
- Server CLAUDE.md dagi `User.officialSalary` bandi.

## 7. Boshqa joylar

- `NET_PROFIT_CACHE_VERSION` → v7.
- Excel «Filiallar» varag'idagi soliq ustuni yangi `total` ni oladi (bank xizmati xarajatlar ustunida).
- Yangi marshrutlar: `route-access.snapshot.json`, `branch-route-policy.ts` (BRANCH_SCOPED), `permission-routes.spec.ts`.
- i18n: yangi matnlar en/ru/de (STRICT_FILES).
- Foydalanuvchi qo'llanmasi va «Yangiliklar»: bir yozuv.
- ADR-0139 (raqam merge oldidan tekshiriladi): ADR-0130 ning bank va oylik qismi almashtirildi.

## 8. Ma'lum cheklovlar

- **Byudjetga to'lov qoldiqni o'zgartirmaydi.** Aylanma solig'i va korxona ijtimoiy solig'i hisoblanadi, lekin to'langanda bank hisobi qoldig'idan yechilmaydi (xarajat sifatida kiritilsa — ikki marta). Keyingi bosqich: «Soliq to'lovi» — qoldiqni o'zgartiradi, foydaga kirmaydi.
- `CARD` turidagi hisob bankmi yoki shaxsiy karta — tizim bilmaydi; faqat `BANK` soliqqa kiradi. Rasmiy oylik `CARD` hisobdan berilsa, hisob turi `BANK` ga o'zgartirilishi kerak.
- Oyni qulflash yo'q: yopilgan oyga to'lov/xarajat kiritilaversa raqamlar o'zgaradi.
- Dividend (2-bosqich) bu ishga kirmaydi.

## 9. Testlar

- Bank xarajati upsert: yangi / tahrir / 0 → o'chirish / teng → hech narsa; BANK bo'lmagan hisob 400; boshqa filial hisobi 403; joriy oy 400; harakat to'g'ri hisobdan chiqadi.
- Ijtimoiy soliq asosi: BANK slice kiradi, CASH va CARD kirmaydi; bekor qilingan oylik (`reversedAt`) kirmaydi; BANK avans settled oyiga tushadi; boshqa oyning oyligi kirmaydi; filial doirasi.
- Sof foyda: bank xizmati bir marta ayriladi; `missingRates` `bank.feesEntered` faqat tugagan oyda.
- Prod dalili: oktyabr uchun deploydan keyin raqamlar qo'lda tekshiriladi (27.10 dagidek).
