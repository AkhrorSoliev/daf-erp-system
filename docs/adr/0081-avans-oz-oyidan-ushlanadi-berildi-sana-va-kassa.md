# ADR-0081 — Avans o'z oyining oyligidan ushlanadi; «Berildi» sana va kassa bilan yoziladi; hisoblash davri — kalendar oyi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0006, ADR-0025, ADR-0050, ADR-0051, ADR-0052, ADR-0058, ADR-0072, ADR-0079, `server/src/salary/shared/advance-netting.ts`, `server/src/salary/shared/month-state.ts`, `server/src/salary/salary-monthly.service.ts`, `server/src/salary/salary-monthly-staff.service.ts`, `server/src/salary/salary-monthly-detail.service.ts`, `server/src/salary/salary-payment.service.ts`, `server/src/salary/salary-settle-month.service.ts`, `server/src/salary/salary-events.ts`, `server/src/salary/salary-paid-text.ts`, `server/src/notifications/notification-events.listener.ts`, `server/src/salary/salary-period-settings.service.ts`, `docs/superpowers/specs/2026-10-10-b3-ish-haqi-design.md`, `docs/superpowers/plans/2026-10-10-b3-ish-haqi.md`

## Kontekst

«Ish haqi» sahifasi (`/payments/salary`) B to'plamining 3-qismi sifatida qayta qurildi. Eski
sahifada beshta muammo bor edi:

- **«Avans» yolg'on edi.** Qatorda sanasi shu oyga tushgan avanslar ko'rinardi, cron
  (`applyPendingAdvances`) esa hisoblanmagan HAMMA avansni sanasidan qat'i nazar `createdAt`
  tartibida ushlardi. 1-oktabr soat 01:00 da berilgan avans sentabr oyligidan ushlanardi,
  ushlangan oyida esa avans umuman ko'rinmasdi.
- Oy holati yo'q edi: oy hali davom etyaptimi, hisoblanganmi, tasdiqlanganmi, berilganmi —
  bir qarashda bilib bo'lmasdi.
- «To'lash» hech narsa so'ramasdi: na sana, na kassa; pul jimgina xodim filialining eng eski
  naqd kassasidan chiqardi. CEO 27.09 da «har odam uchun sana va naqd/karta summasi» ni shart
  qildi.
- «Hisoblash davri» ni o'zgartirsa bo'lardi, oylik to'lov tizimi esa kalendar oyiga tayanadi.
- Xodimga oyligi berilgani haqida hech qanday xabar bormasdi.

## Qaror (CEO, 10.10.2026)

1. **Avans bitta funksiya bilan ushlanadi.** `planAdvanceNetting(pending, grossAmount,
   periodEndDateExclusive)` (`salary/shared/advance-netting.ts`) — avanslar ustidan yagona
   yurish. Faqat sanasi davr oxiridan oldingi (`Expense.date < periodEndDateExclusive`,
   `@db.Date` chegarasi) avanslar sanaladi; `createdAt` tartibida (teng bo'lsa id) yuriladi va
   qolgan summaga sig'magan birinchi avansda to'xtaydi — qolganlari keyingi oyga o'tadi
   (bugungi xatti-harakat). Cron (`applyPendingAdvances`, darsbay va FIXED_MONTHLY tarmog'i)
   aynan `settle` ni ushlaydi, hisobot aynan `total` ni ko'rsatadi. Pul bo'yicha yagona
   o'zgarish shu: davr tugagandan keyingi sanadagi avans endi o'sha davr oyligidan ushlanmaydi.
2. **«Avans» har ekranda — shu oy oyligi ushlaydigan summa** (`getMonthly`, `getMonthlyForUser`,
   batafsil oyna, Telegram, Excel, B1 kartasi — hammasi `getMonthly` orqali, ADR-0006):
   - To'lovi bor oy: to'lov ushlagan avanslar (`settledBySalaryPaymentId = payment.id`),
     `netToPay = payment.amount`.
   - Ochiq (joriy) oy, shu oyda hali ishlay oladigan odam uchun — faol ustoz, shu oyda darsi bor
     ustoz yoki har bir xodim qatori (xodim qatori faqat shu oyda oyligi bo'lsa bor): keyingi oy
     boshidan oldingi sanadagi hisoblanmagan HAMMA avans, cheklanmagan holda, chunki oy daromadi
     hali o'syapti va bugungi qisman daromad bilan cheklash oy o'rtasida 0 ko'rsatardi;
     `netToPay = max(0, base − advances)`.
   - Ochiq oy, qolganlar uchun (shu oyda darsi yo'q nofaol ustoz) va to'lovsiz o'tgan oy (cron
     ishlashidan oldingi soatlar): `planAdvanceNetting(hisoblanmagan, base, nextMonthStart).total`
     — cron aynan ushlaydigani. Hech kim ushlamaydigan avans «ushlanadi» deb ko'rsatilmaydi; u
     «Avanslar» tabida ko'rinib turaveradi.
   - `base` — avansdan oldingi summa (top-up oylarida `accrued + gap`, undan oldin `accrued`,
     xodimda `monthly`).
   - B1 kartasining «avans berilgan» satri «avans (ushlanadi)» bo'ldi.
3. **«Berildi» kun va har hisob summasini so'raydi.** `POST /salary/payments/:id/pay` tanasi
   majburiy: `{ paidAt: 'YYYY-MM-DD', cashSlices: [{ cashAccountId, amount }], note? }`
   (`PayPaymentDto`, imkoniyat `salary.pay`, CEO bo'lmagan to'lovchi uchun uy filiali tekshiruvi
   qoldi). Har tekshiruv yozuvdan oldin: to'lov kompaniyaniki va APPROVED; `paidAt`
   `parseSettlePaidAt` qoidasi bilan (kelajak emas, davr boshidan oldin emas); har bo'lak > 0,
   Σ bo'laklar = `payment.amount` (bo'sh — faqat summa 0 bo'lsa); har hisob faol, o'chirilmagan,
   kompaniyaniki va xodim filialiniki (`mainBranch`); filiali yo'q xodim rad etiladi. Yozuv —
   o'z Serializable tranzaksiyasi: qayta o'qish → `recordSalaryPayment` bo'laklar bilan (har
   bo'lakka bitta `CashMovement`) → PAID, `paidAt` = tanlangan kun. Ledger tavsifi «Oylik
   to'landi» bo'lib qoladi. **0 so'mlik to'lov** (avans hammasini olgan) pul ko'chirmaydi: ledger
   qatori ham, kassa harakati ham yo'q, faqat PAID. Ikkinchi bosish 409 «Bu oylik allaqachon
   berilgan». Javobda `notified` — xodimning bot chati bormi (yuborishning o'zi asinxron).
4. **`salary.paid` → xodimga Telegram xabari.** Odam to'lovni PAID qiladigan ikki yo'l —
   bitta «Berildi» va oy bo'yicha tasdiqlash (`settle-month`) — tranzaksiya commit bo'lgandan
   keyin har to'lov uchun bir marta `salary.paid` `{ salaryPaymentId, companyId }` chiqaradi.
   O'tgan oylarni yopadigan skript (`SalarySettleAllocatedService`) chiqarmaydi: eski oylarni
   yopish xodimlarga xabar yubormasligi kerak. Tinglovchi (`NotificationEventsListener`)
   `salary-paid-text.ts` dagi CEO tasdiqlagan matnni (testlar bilan so'zma-so'z mahkamlangan)
   xodimning `telegramChatId` siga yuboradi; chati yo'q bo'lsa — hech narsa, xato logga yoziladi
   va yutiladi, oylikka ta'sir qilmaydi. Xabar darhol ketadi — bu ADR-0025 darhol-ro'yxatiga
   qo'shimcha.
5. **Hisoblash davri — faqat kalendar oyi.** `POST /salary/period-settings` `cycleStartDay`
   1 dan boshqa har qiymatni 400 «Hisoblash davri — kalendar oyi (1-sanadan); o'zgartirilmaydi»
   bilan rad etadi; sozlamalar oynasidan «Hisoblash davri» bo'limi olib tashlandi. Prodakshn
   allaqachon 1 da. `GET` qoladi.
6. **Oy holati.** `getMonthly` yuqori darajada `monthState` qaytaradi (`monthStateOf`,
   `salary/shared/month-state.ts`): `OPEN` (joriy Toshkent oyi), `NOT_CALCULATED` (o'tgan oy,
   ko'rinayotgan doirada bekor qilinmagan to'lov yo'q), `CALCULATED`, `APPROVED`, `PARTLY_PAID`,
   `PAID`, hamda `paidCount` / `payableCount`. Sahifa ko'rsatayotgan ustoz va xodim to'lovlari
   bo'yicha sanaladi (o'sha doira).

## Ko'rib chiqilgan muqobillar

- **Avansni sanasi oyga tushgani bo'yicha ko'rsatishda qoldirish.** Rad etildi: ekran ushlanadigan
  summaga teng bo'lmay qolardi — aynan tuzatilayotgan xato.
- **Hisobot uchun alohida avans formulasi.** Rad etildi: ADR-0006 — oylik raqami bitta manbadan
  o'qiladi; cron va hisobot bitta `planAdvanceNetting` ni chaqiradi.

## Oqibatlari

- **1-sana tongidagi ikki soat.** Cron 02:00 da ishlaydi; 1-sana 00:00–02:00 orasida yopilgan oyning
  hisoblanmagan avansi yangi ochiq oyning ko'rinishida ham chiqadi (u yerda cheklanmagan qoida
  ishlaydi). Cron uni bir necha soatdan keyin ushlaydi.
- **Ochiq oyda avans ishlanganidan katta bo'lishi mumkin.** Ishlay oladigan odamda oyning hamma
  avansi to'liq ko'rinadi, «Beriladi» esa 0 dan pastga tushmaydi; batafsil oyna buni alohida
  satr bilan tushuntiradi. Shu oyda darsi bor nofaol ustoz ham «ishlay oladigan» sanaladi: uning
  avansi daromadi kichik bo'lsa ham to'liq ko'rinadi, cron esa faqat sig'adiganini ushlaydi,
  qolgani keyingi oyga o'tadi.
- **Kassa harakati yaratilgan vaqtini saqlaydi.** `CashMovement` da biznes sanasi yo'q; tanlangan
  kun to'lovning `paidAt` ida turadi, kassa va pul oqimi hisobotlari esa harakatni bosilgan kuni
  ko'radi. Bu ataylab — `CashMovement` ga sana qo'shish spec doirasidan tashqarida.
- **Eski klient bilan birga ishlamaydi.** Eski «To'lash» tana yubormaydi va yangi serverdan 400 oladi:
  server va klient birga chiqariladi.
- **«Markaz qo'shdi» jadvaldan chiqdi, lekin hech narsani almashtirmaydi.** ADR-0052 dagi bo'linish
  (to'lanmagan oylik ulushi markaz ustunida) o'z joyida: xulosa ostidagi bitta satr («shundan
  markaz qo'shdi — X») va batafsil oynadagi bo'linish satri uni ko'rsatadi. «Markaz qo'shimchasi —
  undirish holati» kartasi «Markaz qoplagani» tabiga ko'chdi (ADR-0072).
- `GET /salary/advances/:userId` va `getAdvancesForUser` o'chirildi: avanslar ro'yxati batafsil
  oyna javobida (`GET /salary/monthly/user/:userId/detail`, `advanceItems`) keladi.
- `GET /salary/advance-calendar` sarlavhadagi filial tanlagichiga bo'ysunadi (`@BranchScope()`)
  va har avansga u qaysi oy oyligidan ushlangan yoki ushlanishini (`deductMonth`) qo'shadi.

### Ma'lum cheklovlar

- **Oy bo'yicha tasdiqlash qisman muvaffaqiyatsiz bo'lsa**, o'sha chaqiruvda allaqachon PAID bo'lgan
  qatorlar uchun `salary.paid` chiqmaydi (hodisa hamma yozuv tugagach yuboriladi).
- **`batchPay`** (klientda chaqiruvchisi yo'q) o'zgarmagan: sana va hisob so'ramaydi, eski usulda
  filialning eng eski naqd kassasidan to'laydi va `salary.paid` chiqarmaydi.
- Nofaol qilingan, shu oyda darsi yo'q FIXED_MONTHLY ustoz «ishlay olmaydi» deb hisoblanadi, cron
  esa unga proratsiyalangan oylik yozadi (ustoz jadvali FIXED_MONTHLY to'lovni hech qachon
  modellamagan — eski holat).
