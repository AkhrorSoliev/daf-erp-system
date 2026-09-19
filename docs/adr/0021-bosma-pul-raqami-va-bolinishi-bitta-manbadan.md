# 0021. Bosma pul raqami va uning bo'linishi bitta manbadan olinadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-19
**Bog'liq:** [0004](0004-balans-haqiqati-ledgerda.md),
[0016](0016-kun-chegarasi-toshkent-boyicha.md),
[dizayn hujjati](../superpowers/specs/2026-09-19-telegram-tushum-tarkibi-design.md)

## Kontekst

Telegram kunlik hisobotining «📅 Oy boshidan» bloki oy boshidan tushgan pulni
bitta raqam bilan ko'rsatardi. CEO undan ko'proq so'radi: shu pulning qanchasi
shu oyning o'zi uchun, qanchasi eski oylarning qarzini yopgani — saytdagi
«Tushum tarkibi» panelidagidek, oylar bo'yicha.

Taqsimotni `getIncomeMonthAttribution` beradi (u amaldagi ledger'ni qayta
o'ynatadi). Bosma sarlavha esa boshqa manbadan kelardi — `Payment` jadvalining
agregati. Ikkalasi bir xil oynani oladi (ADR-0016 dan keyin ikkalasi ham
Toshkent yarim tunidan boshlanadi), lekin **asosi boshqa**: biri kassa
jadvalini, ikkinchisi ledger qatorlarini sanaydi. Ular
«har bir COMPLETED to'lovga aynan bitta tirik `PAYMENT` tranzaksiyasi to'g'ri
keladi» sharti bajarilgandagina teng bo'ladi.

Agar sarlavha bir manbadan, uning ostidagi bo'linish boshqasidan olinsa,
o'quvchi ekranda qo'shilmaydigan uchta raqamni ko'rishi mumkin — va hisobotning
butun ishonchi shu qo'shiluvga tayanadi.

## Qaror

1. **Bosma raqam va uning bo'linishi bitta chaqiruv natijasidan olinadi.**
   Bo'linish chiqadigan joyda sarlavha `getIncomeMonthAttribution(...).total`
   dan o'qiladi (`total = currentMonth + lateTotal` — funksiyaning o'zi shunday
   quradi), demak qatorlar har doim qo'shiladi.
2. **Ikkinchi manba yo'qotilmaydi, solishtiriladi.** `Payment` agregati
   `DailyFinancialSnapshot` uchun qoladi (uni 23:40 dagi cron ham shu asosda
   yozadi) va har kuni bosma raqam bilan taqqoslanadi; farq chiqsa jurnalga
   ogohlantirish yoziladi (`logIncomeBasisDrift` →
   `scripts/audit-finance-reconciliation.ts` dagi G1 tekshiruvi). Farq xabarni
   to'xtatmaydi va yashirilmaydi.
3. **Davr har doim ochiq aytiladi.** `getIncomeMonthAttribution` ni sanasiz
   chaqirish taqiqlanadi: `resolvePeriod` ning standart oyi server vaqt
   mintaqasidan (Railway'da UTC) olinadi, qolgan hamma joy Toshkent bo'yicha
   hisoblaydi.
4. **Matn bitta joyda yasaladi** (`telegram-groups/utils/income-split.util.ts`),
   chunki ikkita sirt (21:00 hisoboti va «Moliyaviy xulosa» kartochkasi) bir xil
   gapirishi kerak.

## Oqibatlar

- Bot va sayt kichik ehtimol bilan boshqacha raqam ko'rsatishi mumkin: sayt
  «Tushumlar» kartasi hamon `Payment` agregatini ko'rsatadi. Bu faqat G1 sharti
  buzilganda yuz beradi va o'shanda jurnalda ogohlantirish turadi — ya'ni farq
  ko'rinmay qolmaydi.
- Kelajakda shunday bo'linish qo'shilayotgan har qanday sirt (Excel, sayt,
  boshqa bot xabari) sarlavhani ham o'sha chaqiruvdan olishi kerak.
- Qarama-qarshi yo'l (bo'linishni kassa agregatiga moslash) rad etildi: ledger
  qayta o'ynatilmasa «qaysi oyga tegishli» degan savolga javob yo'q, ADR-0004
  bo'yicha balansning langari ham ledger.
