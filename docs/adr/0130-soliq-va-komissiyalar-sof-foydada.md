# ADR-0130 — Soliq va komissiyalar sof foydadan ayriladi: stavkalar sozlamada oydan kuchga kiradigan ro'yxat, hisob bitta joyda (`TaxCostsService`)

**Holati:** Qabul qilindi
**Sana:** 2026-10-25
**Bog'liq:** ADR-0038, ADR-0055, ADR-0058, ADR-0079, ADR-0094, `server/src/tax/` (`tax-rates.ts`, `fee-channel.ts`, `tax-costs.ts`, `tax-costs.service.ts`, `tax-settings.service.ts`), `server/src/reports/reports-excel.helpers.ts` (`buildNetProfit`), `server/src/reports/own-month-profit.ts`, `server/src/reports/net-profit-cache.ts`, `server/src/salary/salary-monthly-detail.service.ts`, `client/src/components/settings/tax-settings-client.tsx`, `docs/superpowers/specs/2026-10-25-soliq-va-komissiyalar-design.md`, `docs/superpowers/plans/2026-10-25-soliq-va-komissiyalar.md`

## Kontekst

Tizim soliq hisoblamasdi (`server/CLAUDE.md` da «No tax calculation» qoidasi turardi), to'lov komissiyasi esa sof foydada faqat «memo» qatorida ko'rinardi, ayrilmasdi. Natijada sof foyda haqiqiydan katta chiqardi. CEO oltita qoida berdi: ilova orqali 2–2.5%, integratsiya orqali 2.5%, QR-kod orqali 1% komissiya; rasmiy oylikdan xodimdan 12% ushlanadi va korxona yana 12% ijtimoiy soliq to'laydi, naqd oylik soliqsiz; hisob raqamga tushgan puldan aylanma solig'i 4% (keyin 6% bo'lishi mumkin); bank xarajati aylanmaga qarab; dividend alohida. Stavkalar o'zgaradi, shuning uchun ularni kodga yozib bo'lmaydi. Hozir QR orqali to'lanadigan to'lov usuli ham yo'q edi: o'quvchi bank QR-kodi bilan to'laydi, admin chek bo'yicha qo'lda kiritadi.

## Qaror

1. **Stavkalar `Setting` da, sanali ro'yxat.** Kalitlar: `fees.app.payme`, `fees.app.click`, `fees.app.uzum`, `fees.integration`, `fees.qr`, `payroll.employeeWithholdingPercent`, `payroll.employerSocialPercent`, `tax.turnoverPercent`, `bank.turnoverTiers` (hammasi `companyLevelOnly`, `server/src/settings/settings.types.ts`). Qiymat — `[{ fromMonth: 'YYYY-MM', value }]`, faqat bank kaliti bundan farq qiladi: `[{ fromMonth, tiers }]`; oy uchun `fromMonth <= oy` bo'lgan eng oxirgi qator olinadi (`rateForMonth`, `tiersForMonth`). Stavka o'zgarsa eski oylar o'zgarmaydi. Kodda stavka yo'q.
2. **Kanallar xaritasi bitta funksiyada — `feeChannelOf` (`tax/fee-channel.ts`).** Usul `QR` → `qr`; PAYME/CLICK/UZUM va manba `ADMIN_MANUAL` (o'quvchi ilovada o'zi to'lagan, admin kiritgan) → `app.<usul>`; shu usullar boshqa manbadan (ulanish) kelsa → `integration`; `CASH` va `TRANSFER` → komissiyasiz.
3. **Yangi `PaymentMethod.QR`.** To'lov qabul qilish oynasida «QR-kod», usul yorlig'i bor hamma joyda ham. `QR` naqd emas: aylanmaga kiradi. Eski `TRANSFER` to'lovlar o'zgarmaydi, komissiyasiz qoladi.
4. **Hisob oyi.** Komissiya, aylanma solig'i va bank xarajati **pul tushgan oy** bo'yicha (`Payment.createdAt`, Toshkent oyi). Ijtimoiy soliq oylik **hisoblangan oy** bo'yicha. Tushum esa ADR-0038 bo'yicha o'tgan darslar oyida qoladi; shu farq hisobotda izohlanadi.
5. **Komissiya saqlanmaydi, hisobotda hisoblanadi:** to'lov summasi × kanal stavkasi (to'lov oyi uchun), shuning uchun stavka keyin kiritilsa ham eski oylar to'g'ri chiqadi. Istisno: to'lovda `providerFee` bor bo'lsa (qo'lda biriktirilgan yoki ulanishdan kelgan), o'sha summa olinadi.
6. **Rasmiy oylik.** `User.officialSalary` (bo'sh = 0, faqat `salary.view` egasiga ko'rinadi va o'zgaradi). Oy uchun `rasmiy = min(officialSalary, shu oy hisoblangan oylik)` (`officialSplit`); qolgani naqd. Korxona ijtimoiy solig'i = rasmiy × `employerSocialPercent` — **korxona xarajati**, sof foydadan ayriladi.
7. **Xodimdan ushlanma korxona xarajati EMAS.** U hisoblangan oylik ichida: xodim 88% oladi, 12% budjetga ketadi. Oylik to'lash oynasida «Rasmiy qism · Budjetga · Xodim qo'liga» ko'rsatiladi, lekin naqd + karta yig'indisi avvalgidek oylik summasiga teng. Budjetga to'lovni alohida yozish 1-bosqichga kirmaydi.
8. **Aylanma solig'i va bank xarajati.** Aylanma = pul tushgan oydagi COMPLETED to'lovlar, `CASH` dan tashqari, yalpi summa (komissiya ayirilmasdan). Aylanma solig'i = aylanma × `tax.turnoverPercent`, to'lovning o'z filialiga. Bank xarajati: **kompaniya** aylanmasi tushgan `bank.turnoverTiers` qatorining bitta foizi × butun aylanma (`tierPercentFor`), keyin filiallarga **aylanma ulushi** bo'yicha bo'linadi. Qatorlar 0 dan boshlanadi, kesishmaydi, oralig'i bo'sh qolmaydi, oxirgisi `toAmount: null`.
9. **Qaytarish soliq va komissiyani kamaytirmaydi:** bank ham, to'lov tizimi ham qaytarmaydi.
10. **`missingRates` faqat ishlatilgan narsa uchun.** Shu oy to'lov bo'lgan kanalning, rasmiy oylik bor bo'lsa ushlanma va ijtimoiy soliq stavkasi, aylanma bo'lsa aylanma solig'i va bank jadvalining stavkasi kiritilmagan bo'lsa ro'yxatga tushadi (Uzum orqali to'lov bo'lmagan oyda Uzum stavkasi so'ralmaydi). Kiritilmagan stavka 0 deb hisoblanadi, lekin belgisiz qolmaydi: «Hisob to'liq emas» belgisini faqat Foyda tarkibi oynasi, Excel «Sof foyda» varag'i va Telegram hisobotlari (21:00 hisobot va `rm:cfin` kartasi) chiqaradi. Bosh paneldagi «Pul qayerga ketdi» kartasi `missingRates` ni oladi, lekin belgini ko'rsatmaydi.
11. **Komissiya «memo» dan chiqadi va ayriladi** (oldingi «memo» ko'rinishi, kodda `buildNetProfit`, o'zgaradi). `buildNetProfit` formulasi endi: `tushum + balansdan yechilgan − ustoz oyligi − admin oyligi − boshqa xarajatlar − qaytarish − taxes.total`; `taxes.total` = komissiya + ijtimoiy soliq + aylanma solig'i + bank xarajati. «Oyning o'z foydasi» (`computeOwnMonthProfit`) ham `taxes.total` ni ayiradi, aks holda ikki foyda raqami bir-biriga to'g'ri kelmay qolardi.
12. **Kesh.** `NET_PROFIT_CACHE_VERSION` `v5` dan `v6` ga o'tdi (kesh shakli o'zgardi). Soliq sozlamasi saqlanganda `TaxSettingsService` kompaniyaning foyda keshini `invalidateNetProfitCache` bilan tozalaydi.
13. **Ruxsat `settings.tax`** («Soliq va komissiyalar», `permission-catalog.admin.ts`): sukut bo'yicha faqat CEO'da, CEO «Ruxsatlar» sahifasidan Direktor, Administrator yoki Kassirga bera oladi (ustozga berib bo'lmaydi). Sahifa — `/settings/tax`; har saqlash `entity-history` ga yoziladi, o'tgan oyga tegadigan o'zgarish tasdiq so'raydi.
14. **Ikki marta sanashdan saqlanish.** Aylanma solig'i stavkasi kuchda bo'lgan joriy oyda «Soliqlar» (TAXES) xarajati Xarajatlar sahifasidagi «hali yozilmagan» ogohlantirishiga va Foyda prognoziga kirmaydi (ADR-0094). Sahifa: «Avtomatik hisoblanadigan soliqlarni xarajatga qo'lda yozmang».
15. **Dividend 2-bosqichga qoldi** (soliq 5%, bank 1%, karta 0.5%, o'tkazma 0.5–0.8%): buning uchun «hisob raqamdan yechish» yozuvi va formasi kerak, alohida spec va PR bo'ladi.

## Taqiqlanadi

- Komissiya, ijtimoiy soliq, aylanma solig'i yoki bank xarajatini `TaxCostsService` / `tax/tax-costs.ts` dan boshqa joyda hisoblash.
- Stavkani kodga yozish yoki «taxminan 4%» deb qo'yish: stavka faqat `/settings/tax` dan.
- Kanalni `feeChannelOf` dan tashqarida aniqlash.
- Xodimdan ushlanmani korxona xarajatiga qo'shish.
- Qaytarish uchun soliq va komissiyani kamaytirish (qaytarish soliq va komissiyani kamaytirmaydi).

## Muqobillar

- **Stavkalarni kodda yoki `.env` da saqlash:** har o'zgarishda deploy kerak, eski oylar ham o'zgarib ketardi. Tanlanmadi.
- **Bitta joriy stavka (sanasiz):** stavka o'zgarganda o'tgan oylar foydasi jimgina o'zgarardi. Tanlanmadi.
- **Komissiyani to'lov yozilganda `providerFee` ga saqlash:** stavka keyin kiritilsa eski to'lovlar komissiyasiz qolardi va hammasini qayta yozish kerak bo'lardi. Tanlanmadi.
- **Bank xarajatini har filialning o'z aylanmasi bo'yicha hisoblash:** bank bitta hisob raqam va bitta jadval bilan ishlaydi, filial bo'yicha foiz noto'g'ri bo'lardi. Tanlanmadi.
- **Xodimdan ushlanmani ham xarajat qilish:** pul xodim oylig'idan ushlanadi, ikki marta sanalardi. Tanlanmadi.

## Oqibatlar

- Stavka o'tgan oylardan boshlab kiritilsa, o'sha oylar sof foydasi avvalgi hisobotlardan **past** chiqadi. Tahrirlangan oy bo'yicha eski Excel yoki Telegram raqamlari bilan solishtirganda farq shundan.
- Eski `TRANSFER` to'lovlar komissiyasiz qoladi; QR orqali kelgan to'lov faqat yangi `QR` usuli bilan yozilsagina 1% oladi.
- Bekor qilingan (REVERSED) to'lov COMPLETED to'lovlar asosidan chiqadi, shuning uchun uning komissiyasi va aylanma solig'i ham u bilan birga yo'qoladi; qaytarishdan farqi shu.
- Ushlanma alohida budjet to'lovi sifatida yozilmaydi, faqat ko'rsatiladi.
- Joriy oyda aylanma solig'i faqat shu paytgacha kelgan to'lovlardan hisoblanadi: kelajakdagi tushum uchun prognoz yo'q, oy yopilguncha soliq o'sib boradi.
- Qo'lda «Soliqlar» (TAXES) xarajati yozilgan oyda soliq ikki marta sanaladi: tizim buni to'xtatmaydi, faqat sahifada ogohlantiradi.
- `User.officialSalary` o'zgarganda foyda keshi Toshkent yarim tungacha tozalanmaydi (faqat stavka saqlanganda tozalanadi); o'tgan oy raqami shu vaqtgacha eski bo'lishi mumkin.
- Bosh paneldagi «Pul qayerga ketdi» kartasi soliq va komissiyalarni bitta jamlangan «Soliq va komissiyalar» qatori qilib ko'rsatadi va «Hisob to'liq emas» belgisisiz chiqadi; to'rt qator va belgi faqat Foyda tarkibi oynasida, Excelda va Telegramda.
- Stavka kiritilmagan bo'lsa hisob 0 bilan davom etadi va «Hisob to'liq emas» belgisi bilan chiqadi — belgi yo'qolguncha raqamga to'liq ishonib bo'lmaydi.
- Server avval, sayt keyin chiqadi: yangi sayt eski serverda `taxes` maydonini olmaydi (mijoz buni kechiradi, `taxes` bo'lmasa qatorlar chiqmaydi).
