# ADR-0055 — Balansdan yechib olingan pul yechilgan oyning daromadi; oy tanlanmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** `server/src/withdrawals/withdrawals.service.ts`, `server/src/reports/balance-withdrawals.ts`, `server/src/reports/reports-excel.helpers.ts` (`buildNetProfit`), `server/src/reports/reports.service.ts` (`assembleMonthlyNetProfit`), `server/src/reports/reports-profit-composition.service.ts`, ADR-0006, ADR-0038

## Kontekst

«Yechib olish» (`BALANCE_WITHDRAWAL`) o'quvchining musbat balansini unga
bermasdan markaz hisobiga o'tkazadi. U o'quvchi kartasidagi «To'lov» menyusida
va «Qarzdorlik» → «Muzlatilgan puli» tabida («Markaz hisobiga o'tkazish»)
turadi. Hujjat (`withdrawals.service.ts` izohi, DTO, `server/CLAUDE.md`) buni
«tanlangan oy uchun markaz daromadi» deb yozgan edi. Kod esa bu yozuvni hech
qaysi foyda hisobida o'qimasdi: kanonik sof foyda faqat o'tilgan darslar
qiymatidan (`valueHeldLessons`) qurilardi. Oqibat:

- «Ustoz balansiga yozilsinmi?» yoqilsa, ustozning oyligi X ga oshar, daromad
  esa oshmasdi — oy foydasi X ga kamayardi;
- yoqilmasa, markazga o'tgan pul hech qaysi oyning foydasida ko'rinmasdi;
- «Qaysi oy uchun» erkin tanlanardi: o'tgan oy tanlansa, ustoz ulushi oyligi
  yopilgan davrga yozilib, hech qachon to'lanmasdi — cron faqat yangi tugagan
  davrni supuradi.

Prod (30.09.2026, faqat o'qish): bitta ham yechib olish yo'q. «Muzlatilgan
puli» tabida 58 o'quvchida 6 183 884 so'm turibdi. Oylik davri har oyning
1-sanasidan boshlanadi (`cycleStartDay = 1`).

## Qaror (CEO, 30.09.2026)

1. **Yechib olingan pul yechib olingan oyning daromadi.** Kanonik sof foydada
   u alohida qator — `NetProfit.balanceWithdrawals`:
   `netProfit = revenue + balanceWithdrawals − teacherSalary − adminSalary −
   operatingExpenses − refunds`. `revenue` (o'tilgan darslar qiymati) ga
   qo'shib yuborilmaydi: oy oxiri kutilmasi, yig'im foizi va «Foyda tarkibi»
   prognozi `revenue` ni dars qiymati deb o'qiydi. Kassa asosida
   (`revenueBasis = 'cash'`) qo'shilmaydi — pul o'quvchi to'lagan kuni
   tushumda sanalgan.
2. **Oy tanlanmaydi.** Server Toshkent bo'yicha joriy oyni o'zi yozadi. Bitta
   `now` dan `Transaction.createdAt`, `metadata.targetMonth` va ustoz
   ulushining `lessonDate` i (yechib olingan kun — har qanday `cycleStartDay`
   da ochiq oylik davriga tushadi) chiqadi. `CreateWithdrawalDto.targetMonth`
   ixtiyoriy; joriy oydan boshqasi yuborilsa — 400 «Yechib olish faqat joriy
   oy uchun yoziladi».
3. **Hisobot yechib olishni `createdAt` bo'yicha o'qiydi**
   (`loadBalanceWithdrawals`): butun Toshkent oylari oralig'ida, filial
   qamrovi bilan, ishorali yig'indi. Hozir yechib olishni bekor qiladigan
   yo'l yo'q. Qo'shilsa, u ustoz ulushini (bog'langan `SalaryAccrual`) ham
   qaytarishi va `creditTeacher` belgisini saqlashi kerak: `reverseTransaction`
   metadata'ni ko'chirmaydi.

## Ko'rib chiqilgan muqobillar

- **Hujjatni kodga moslash** (yechib olish foydaga ta'sir qilmaydi, oy faqat
  ustoz ulushining oyini belgilaydi). Rad etildi: markazniki bo'lgan pul
  foydada hech qachon ko'rinmasdi, ustozga yozilganda esa aslida yo'q zarar
  chiqardi.
- **Istalgan oyni tanlash qolsin.** Rad etildi: o'tgan oyning foydasi keyin
  o'zgarardi, ustoz ulushi esa yopilgan oylik davrida to'lanmay qolardi.
- **`revenue` ichiga qo'shish.** Rad etildi: prognoz (`expectedValue −
  revenue`) yechib olishni oyning qolgan darslaridan ayirib yuborardi, dars
  kesimidagi qatorlar (kurs, filial) esa jamiga teng bo'lmay qolardi.

## Oqibatlari

- Foyda kartasi, «Foyda tarkibi» (alohida qator, o'quvchilar ro'yxati bilan),
  bosh sahifa «Pul qayerga ketdi», Excel «Xulosa» 1-bloki va «Tekshiruv»
  footing'i, «Filiallar» izohi, Telegram 21:00 hisoboti va `rm:cfin`
  kartasidagi raqam yechib olishni ko'radi. Qator faqat 0 bo'lmaganda
  chiqadi. Sof foyda keshi `v4`.
- «Foyda tarkibi» prognozidagi ustoz ulushi yechib olishdan ustozga yozilgan
  pulni hisobga olmaydi — u dars emas.
- «Ustozga yozilsa foyda o'zgarmaydi» va «o'tgan oylar o'zgarmaydi» degan
  kafolatlar oylik davri kalendar oyga teng bo'lgani uchun (prodda
  `cycleStartDay = 1`) to'liq bajariladi. Boshqa kun tanlansa, ustoz ulushi
  yechib olingan kun tushgan oylik davriga — kanonik foydada boshqa oyga —
  tushadi. O'tilgan darslar bilan ham xuddi shunday.
- «Tushum» (kassa) va «Oyning o'z foydasi» formulasi o'zgarmaydi.
- «Filiallar» varag'ining tasdiqlangan ustunlari o'zgarmaydi.
- Ustoz ulushi hanuz `User.balance` ga `SALARY_ACCRUAL` krediti yozmaydi
  (ADR-0050 dagi umumiy siljish); oylik hisobot va cron accrual'ni o'qiydi,
  shuning uchun to'lov to'g'ri.
