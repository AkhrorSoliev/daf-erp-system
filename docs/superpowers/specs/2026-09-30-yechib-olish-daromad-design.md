# «Yechib olish» — pul yechilgan oyning foydasiga qo'shiladi

Sana: 30.09.2026. Holat: CEO tasdiqladi («Ha, foydaga qo'shilsin», «Yo'q,
faqat joriy oy», «Ha, boshlang»).
Tarmoq: `claude/goofy-wing-7076af`.

## Muammo

Hujjat va kod bir-biriga zid edi.

- **Hujjat** (`withdrawals.service.ts` izohi, `create-withdrawal.dto.ts`,
  `server/CLAUDE.md` → «Balance Withdrawal»): yechib olingan pul tanlangan oy
  uchun markaz daromadi sifatida tan olinadi.
- **Kod:** `targetMonth` faqat `withdrawals` modulida o'qiladi — tavsif,
  metadata, tarix, javob va (`creditTeacher` yoqilganda) ustoz
  `SalaryAccrual.lessonDate`. Kanonik sof foyda
  (`ReportsService.assembleMonthlyNetProfit`) o'tilgan darslar qiymatidan
  quriladi (`valueHeldLessons`); `BALANCE_WITHDRAWAL` ni hech qaysi foyda
  hisobi o'qimaydi. U faqat balans aylanmasida (Excel «− Balans yechish»),
  o'quvchi hisobotida va ledger ro'yxatida ko'rinadi.

Oqibat:

- `creditTeacher` yoqilsa, ustozning shu oy oyligi X ga oshadi, daromad esa
  oshmaydi — oy foydasi X ga **kamayadi** (xarajat bor, daromad yo'q).
- O'chiq bo'lsa, yechib olish foydaga umuman ta'sir qilmaydi: markazga o'tgan
  pul hech qaysi oyning foydasida hech qachon ko'rinmaydi.
- Oy tanlovi erkin (`MonthPicker` da chegara yo'q). O'tgan oy tanlansa, ustoz
  ulushi oyligi yopilgan davrga yoziladi va hech qachon to'lanmaydi: cron faqat
  yangi tugagan davrni supuradi (`salary-calculation.service.ts`).

Prod (30.09.2026, faqat o'qish): `BALANCE_WITHDRAWAL` qatori — **0 ta**.
«Muzlatilgan puli» tabida 58 o'quvchida 6 183 884 so'm turibdi — markaz
hisobiga o'tkazilsa, hozirgi kodda bu pul foydada ko'rinmaydi.

## Qarorlar (CEO, 30.09.2026)

1. **Yechib olingan pul daromad.** U yechib olingan oyning sof foydasiga
   qo'shiladi. Ustozga yozilsa, daromad ham, ustoz oyligi ham X ga oshadi —
   foyda o'zgarmaydi.
2. **Faqat joriy oy.** «Qaysi oy uchun» maydoni olib tashlanadi; oyni server
   o'zi belgilaydi (Toshkent bo'yicha joriy oy). O'tgan oylarning raqamlari
   yechib olish tufayli hech qachon o'zgarmaydi.

«Tushum» (kassaga kirgan pul) o'zgarmaydi: bu pul o'quvchi to'lagan kuni
tushumga yozilgan.

## Dizayn

### Yozish (`withdrawals`)

- Server bitta `now` oladi va hammasini undan chiqaradi: `targetMonth =
  tashkentMonthKey(now)`, `Transaction.createdAt = now` (aniq beriladi, oy
  chegarasida millisekundlik farq qolmasin), ustoz ulushining `lessonDate` =
  yechib olingan Toshkent kuni (`utcMidnightFromDateStr(tashkentDateStr(now))`).
- `lessonDate` endi oyning 1-sanasi emas, **yechib olingan kun**. Sabab:
  `cycleStartDay` 1 bo'lmaganda (sozlanadi) oyning 1-sanasi allaqachon yopilgan
  davrga tushishi mumkin; bugungi kun esa har doim ochiq davrda. Prodda
  `cycleStartDay = 1`, natija bir xil. Oylik hisobotida qator haqiqiy sana
  bilan ko'rinadi.
- `CreateWithdrawalDto.targetMonth` ixtiyoriy bo'ladi (eski oyna saytdan
  hali ketmagan daqiqalarda yuboradi; `forbidNonWhitelisted` uni rad etmasin).
  Yuborilsa va joriy oyga teng bo'lmasa — 400: «Yechib olish faqat joriy oy
  uchun yoziladi».

### O'qish — kanonik sof foydaga bitta yangi qator

- `ReportsFinancialService.getBalanceWithdrawals(companyId, { months,
  branchIds })` — `BALANCE_WITHDRAWAL` qatorlari `createdAt` bo'yicha
  (`tashkentMonthRangeUtc`, birinchi oy boshidan oxirgi oy oxirigacha),
  `branchIdWhere(branchIds)` bilan. Qaytaradi: `total` (−Σ amount, ishorali —
  bekor qilish qatori bo'lsa o'zi nolga chiqadi), `teacherCredited`
  (`metadata.creditTeacher` bo'lganlari), `students` (o'quvchi bo'yicha jami,
  kattasidan). Bo'sh qamrov — so'rovsiz nol.
- `buildNetProfit(..., recognizedRevenue, balanceWithdrawals = 0)`:
  `NetProfit.balanceWithdrawals`; `netProfit = revenue + balanceWithdrawals −
  teacherSalary − adminSalary − operatingExpenses − refunds`; marja
  `revenue + balanceWithdrawals` ga nisbatan. **Kassa asosida** (`revenueBasis
  = 'cash'`) qo'shilmaydi — bu pul to'langan kuni tushumda sanalgan.
  `revenue` ma'nosi o'zgarmaydi (o'tilgan darslar qiymati) — kutilayotgan oy
  oxiri, yig'im foizi va «Foyda tarkibi» prognozi shunga tayanadi.
- `assembleMonthlyNetProfit` yechib olishni `Promise.all` ga qo'shadi va
  natijani `withdrawals` sifatida qaytaradi. `periodNetProfit` (Excel) davr
  oylari bo'yicha bir so'rov bilan oladi.
- `NET_PROFIT_CACHE_VERSION` v3 → v4.

### Qator ko'rinadigan joylar (faqat 0 bo'lmasa)

| Joy | O'zgarish |
|---|---|
| «Foyda tarkibi» (`/payments/overview`) | Yangi qator «Balansdan yechib olingan» — o'quvchilar ro'yxati bilan; pastki tenglik va sarlavha jumlasi uni qo'shadi; prognozdagi ustoz ulushi yechib olishdan ustozga yozilganni hisobga olmaydi |
| Bosh sahifa «Pul qayerga ketdi» | Foizlar `revenue + balanceWithdrawals` ga nisbatan, sarlavhada «shundan balansdan yechilgan» |
| Excel «Sof foyda» | `+  Balansdan yechib olingan` qatori |
| Excel «Asosiy xulosa» 1-blok | Joriy/o'tgan oy taqqoslash qatori |
| Excel «Filiallar» | Biror filialda bo'lsa, «Balansdan yechilgan» ustuni |
| Excel «Tekshiruv» | Footing qo'shadi |
| Telegram 21:00 va `rm:cfin` | Faqat yakuniy raqam — o'zi yangilanadi |

«Oylar» varag'i o'zgarmaydi (uning ustunlari hech qachon yig'ilmagan).
«Oyning o'z foydasi» formulasi o'zgarmaydi: u shu oy kassaga kirgan pulga
qaraydi, yechib olish esa kassa harakati emas (ustozga yozilgan ulush uning
xarajat tomonida qoladi — oy boshqa oy puli hisobiga yopilgan).

### Oyna (`withdrawal-dialog.tsx`)

`MonthPicker` olib tashlanadi, `targetMonth` yuborilmaydi. Summa ostida:
«Bu pul {Sentabr 2026} foydasiga qo'shiladi». Ustoz tugmasi izohi:
«Ustozning joriy oy oyligiga yoziladi.»

## Doiradan tashqarida

- Ustoz ulushi `User.balance` ga `SALARY_ACCRUAL` krediti yozmaydi
  (to'g'ridan `salaryAccrual.create`). Oylik hisobot va cron accrual'ni
  o'qiydi, shuning uchun to'lov to'g'ri; `User.balance` siljishi ADR-0050 da
  tan olingan umumiy muammo.
- Qo'llanma (`client/src/qollanma/...`) `main` da yo'q — `feat/qollanma`
  tarmog'ida. Bu ish birlashgach u yerda «Yechib olish» bo'limi,
  `sahifalar/tolovlar.ts` dagi `yangilangan` va `yangiliklar.ts` yangilanadi —
  alohida vazifa.

## Testlar

- Server: `withdrawals.service.spec.ts` (oy serverdan, noto'g'ri oy — 400,
  `lessonDate` — bugun, `createdAt` beriladi); `getBalanceWithdrawals`
  (ishorali yig'indi, filial, ustozga yozilgan, bo'sh qamrov);
  `reports-branch-scope-coverage.spec.ts`; `buildNetProfit` (tan olingan
  asosda qo'shadi, kassa asosida yo'q, marja); `assembleMonthlyNetProfit`;
  «Foyda tarkibi» (tenglik, prognoz ulushi); Excel varaqlari; kesh kaliti;
  bosh sahifa grafigi.
- Mijoz (vitest): `chart-breakdown-rows`, `profit-composition-text`.
- `npm run typecheck`, `npm run build`, `npx eslint`, to'liq `npm test`;
  mijozda `npx tsc --noEmit`, `npm test`, `npx eslint`.

## Qaror hujjati

ADR-0055 (0054 `feat/davomat-olinmagan-dars` da band): «Balansdan yechib
olingan pul yechilgan oyning daromadi; oy tanlanmaydi».
