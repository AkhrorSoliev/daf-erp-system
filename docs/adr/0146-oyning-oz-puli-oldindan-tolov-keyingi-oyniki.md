# 0146. «Oyning o'z puli»: keyingi oy uchun oldindan to'lov o'sha keyingi oyniki

- Holati: Qabul qilindi
- Sana: 2026-11-06
- Bog'liq: [0067](0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md) (kassaga tushgan pul uch qismda), `server/src/reports/reports.service.ts` (`getOwnMonthProfit`), `server/src/reports/own-month-profit.ts`, `server/src/reports/reports-excel.summary-sheet.ts`

## Kontekst

ADR-0067 kassaga tushgan pulni uch qismga bo'ldi: `currentMonth` (shu oy uchun), `advance` (keyingi oy uchun oldindan) va `lateTotal` (eski qarzlar uchun). Lekin `getOwnMonthProfit` uchun eski ma'noni qoldirdi: `ownMoney = currentMonth + advance`. Ya'ni oktabrda noyabr uchun to'langan pul «Oktabrning o'z puli»ga qo'shilardi.

Excel «Xulosa» 2-blokidagi qator izohi esa «shu oy darslariga tegishli qismi» deydi. CEO 06.11.2026 da shu nomuvofiqlikni topdi. Farg'ona, oktabr 2026 (prod):

- «Oktabrning o'z puli» = 151 285 379 (oktabr uchun) + 21 146 600 (noyabr uchun oldindan) = **172 431 979**.
- Moliya sahifasidagi «To'landi» = **168 538 240** (oktabr hisobining yopilgan qismi).
- Ikki raqam bir oy uchun bir narsa haqida gapirayotgandek ko'rinadi, lekin birinchisiga keyingi oyning puli kirgan.

Bu pul hech qachon noyabrning «o'z puli»ga ham kirmasdi: noyabrning `currentMonth`i faqat noyabrda kassaga tushgan pulni sanaydi. Shuning uchun oy o'z xarajatini qoplaganmi degan savolga javob bir oyni oshirib, ikkinchisini kamaytirib ko'rsatardi.

## Qaror

1. **`ownMoney(M) = currentMonth(M) + advance(M−1)`.** Shu oy darslari uchun kelgan pul: shu oyda to'langani va o'tgan oyda shu oy uchun oldindan to'langani. M oyining o'z `advance`i M+1 ga tegishli.
2. **Bitta joy.** Hisob faqat `getOwnMonthProfit`da. Excel «Xulosa» (2-blok), «Oylar» va «Filiallar» varaqlari shundan o'qiydi. Hech qayerda qayta hisoblanmaydi.
3. **O'zgarmaydigan joylar.** `getIncomeMonthAttribution` va uning uch qismi; kunlik suratning `collectedForMonth`i (surat qayta qurilmaydi, ma'nosi o'zgarmasligi shart); 2026-09 dan oldingi oylar uchun 21:00 hisobotidagi «Shundan yig'ildi» qatori va `collectionPct`; Excel 4-blokining dars puli bo'linishi (faqat 2026-09 dan oldingi oylar). Kanonik «Sof foyda» bunga tegmaydi: u kassani emas, o'tilgan darslarni sanaydi.
4. **Excel izohi** yangi ma'noni aytadi: «Shu oy darslari uchun kelgan pul: shu oyda to'langani va o'tgan oyda oldindan to'langani. Eski qarz undirish va keyingi oy uchun oldindan to'lov kirmaydi.»

## Oqibatlar

- Farg'ona oktabr «o'z puli»: 172 431 979 → 151 285 379 + sentabrdagi oktabr uchun oldindan pul. Noyabr «o'z puli»ga oktabrdagi 21 146 600 qo'shiladi.
- `getOwnMonthProfit` bitta qo'shimcha `getIncomeMonthAttribution` chaqiruvi qiladi (o'tgan oy uchun).
- **Ma'lum chegara.** M−1 ning `advance`i — o'sha oy oxirida qarzdan ortgan pul. Ikki oy oldinga to'langan bo'lsa ham, hammasi M ga yoziladi. Prod'da bu kam uchraydi; kerak bo'lsa alohida qaror.
- ADR-0067 1-qarorining «`getOwnMonthProfit` eski ma'noni saqlaydi» qismi shu ADR bilan almashtiriladi. ADR-0067 ning qolgan qismi kuchda.
