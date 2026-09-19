# Telegram hisobotida «Tushum tarkibi» — dizayn

Sana: 2026-09-19. Holat: CEO tasdiqlagan (suhbatda, oddiy tilda).
Bog'liq: `project_income_month_attribution` (saytdagi panel),
`project_collection_ratio_unified` (bot va sayt bitta yig'im foizini bo'lishadi),
`project_daily_telegram_report_redesign` (21:00 hisoboti tuzilishi).

---

## 1. So'ralgan ish

Saytda `/payments/overview` → «Tushumlar» kartasiga bosilganda «Tushum tarkibi»
paneli ochiladi: davrda kassaga tushgan pulning qanchasi **shu oyning o'zi uchun**
to'langan, qanchasi **eski oylarning qarzini yopish uchun** kelgan, va qarz qismi
qaysi oylarga taqsimlanadi.

CEO shu manzarani Telegram xabarida ham ko'rishni so'radi (2026-09-19): «bu oy
tushgan pullarning qaysi qismlari boshqa oylarga tegishli ekanini» kunlik
hisobotdan bilib turish.

## 2. CEO qarorlari

1. **Qayerga:** 21:00 kunlik hisobotdagi «📅 Oy boshidan» bo'limiga. «💰 Bugungi
   moliya» bo'limi tegilmaydi (bugungi pulning taqsimoti kerak emas).
2. **Nechta oy:** **hammasi** — eski qarz qaysi oylarga tegishli bo'lsa, har biri
   alohida qator bilan. Qisqartirish yo'q.
3. **«💰 Moliyaviy xulosa» kartochkasiga ham** xuddi shu uch qator qo'shiladi
   («Ko'proq imkoniyatlar» menyusidagi `rm:cfin` tugmasi).

## 3. Ko'rinish

### 3.1. Kunlik hisobot (va `/hisobot`)

```
📅 Oy boshidan (1–19 sentyabr)
• Tushum (haqiqiy): 42 500 000
   Shu oy uchun: 31 200 000 (73%)
   Eski qarzlar uchun: 11 300 000 (27%)
      Avgust 2026 — 7 900 000
      Iyul 2026 — 2 600 000
      Iyun 2026 — 800 000
• Xarajat: 12 300 000
...
```

- Oylar **yangisidan eskisiga** qarab (xizmat allaqachon shu tartibda qaytaradi).
- Foiz faqat ikkita asosiy qatorda. `shu oy % = round(currentMonth / total × 100)`,
  `eski qarz % = 100 − shu oy %` — shunda ikkisi doim 100 ga teng chiqadi.
  Oy qatorlarida foiz yo'q (matnda ortiqcha shovqin).
- **Eski qarz uchun to'lov bo'lmasa** ikkita qator o'rniga bitta qator chiqadi:
  `Hammasi shu oy uchun — eski qarz uchun to'lov yo'q`.
- **Tushum 0 bo'lsa** (bayramda, yakshanbada) taqsimot qatorlari umuman
  chiqmaydi — 0 ni 0 ga bo'lish ham, «0 (0%)» ham ma'nosiz.

### 3.2. Moliyaviy xulosa kartochkasi

```
💰 Moliyaviy xulosa — Sentyabr 2026
Bosh filial
• Tushum (haqiqiy): 63 100 000
   Shu oy uchun: 48 400 000 (77%)
   Eski qarzlar uchun: 14 700 000 (23%)
      Avgust 2026 — 11 200 000
      Iyul 2026 — 3 500 000
• Oy oxiriga kutilyapti: …
```

Farqi: kartochka **butun oyni** oladi (1-kundan oy oxirigacha — `getFinancialOverview`
qaysi oynada ishlasa, o'sha), kunlik hisobot esa oy boshidan **bugungacha**.

## 4. Ma'lumot manbai va «qo'shilish» sharti

**Bitta manba:** `ReportsFinancialService.getIncomeMonthAttribution` — saytdagi
`IncomeAttributionPanel` ni ham shu hisoblaydi. U `{ total, currentMonth,
lateTotal, late[{ monthKey, label, amount }] }` qaytaradi va **`total =
currentMonth + lateTotal`** (o'sha funksiyaning `return` i shunday qurilgan), ya'ni
uch qator har doim qo'shiladi — bu xususiyat matnni yozishda emas, xizmatning
o'zida ta'minlangan.

**Muhim tuzatish — sarlavha raqami ham shu manbadan olinadi.** Hozir
«Tushum (haqiqiy)» qatori alohida `payment.aggregate` bilan hisoblanadi
(`createdAt >= firstOfThisMonthUtc()`), taqsimot esa `getIncomeMonthAttribution`
dan keladi (`startDate = firstOfThisMonthDate()` → oynasi UTC yarim tunidan).
Ikki oyna **5 soatga** farq qiladi: oyning 1-kuni Toshkent vaqti bilan
00:00–05:00 orasida tushgan to'lov birinchisiga kiradi, ikkinchisiga kirmaydi.

Prod bazasida o'lchandi (2026-09-19, faqat o'qildi):

| Tekshiruv | Natija |
| --- | --- |
| 2026-04 … 2026-09 oylarining 1-kuni, 00:00–05:00 oralig'idagi to'lovlar | **0 ta** (6 oyning hammasida) |
| Oxirgi 120 kunda **00:00–04:59** (farq oynasi) ichida tushgan to'lovlar, istalgan kun | **6 ta** (soat 05:00 da yana 3 ta — ular oynadan tashqarida) |

Ya'ni bugungacha farq chiqmagan, lekin kechasi to'lov tushishi real hodisa —
oyning 1-kuniga to'g'ri kelsa, xabarda «31.2 + 11.3 ≠ 42.6» ko'rinishi mumkin edi.
Shuning uchun bosma qator `attribution.total` dan olinadi. Yon foydasi: bu oyna
saytdagi «Tushumlar» kartasining oynasi bilan bir xil, demak bot va sayt bitta
raqamni aytadi.

**`DailyFinancialSnapshot` ga yoziladigan `mtdIncome` o'zgarmaydi** — eski
`payment.aggregate` bo'yicha qoladi. Sababi: o'sha qatorni 23:40 dagi
`DailySnapshotCron` ham yozadi, ikkalasi bir xil asosda hisoblashi kerak, aks
holda kunlik grafik 21:00 va 23:40 orasida sakraydi.

## 5. Qamrov

**O'zgaradi:**

- `server/src/telegram-groups/telegram-group-daily-report.service.ts` —
  `computeCollection` endi taqsimot obyektining kerakli qismini (`total`,
  `currentMonth`, `lateTotal`, `late[]`) ham qaytaradi; xabarga uch qator
  qo'shiladi; «Tushum (haqiqiy)» qatori `total` dan o'qiladi.
- `server/src/telegram-groups/telegram-group-report-menu.service.ts` —
  `sendFinancialCard` (`rm:cfin`) bitta `getIncomeMonthAttribution` chaqiradi va
  o'sha uch qatorni chiqaradi.
- Matn yasovchi yordamchi — ikkala joyda bir xil ko'rinish chiqishi uchun bitta
  funksiya (`telegram-groups/utils/` ichida), ikki nusxa matn yozilmaydi.

**Tegilmaydi:** «Bugungi moliya» bo'limi, katta to'lovda darhol ketadigan
«💳 Yangi to'lov» xabari, digest, Excel hisobotlar, saytdagi panel, baza sxemasi
(migratsiya **yo'q**).

**O'zi ergashadi:** `/hisobot` buyrug'i — u `TelegramGroupStatsService
.buildDailyReport` orqali o'sha builder'ga murojaat qiladi, alohida kod yozilmaydi.

## 6. Nosozlikda xatti-harakat

`getIncomeMonthAttribution` xato bersa yoki `null` qaytarsa:

- kunlik hisobotda — `computeCollection` hozir ham `null` qaytarib blokni
  tashlab ketadi; endi «Tushum (haqiqiy)» eski `mtdIncome` dan chiqadi,
  taqsimot qatorlari ko'rinmaydi. Hisobot yiqilmaydi;
- kartochkada — uch qator chiqmaydi, qolgan qatorlar avvalgidek.

Bu «yarim raqam ko'rsatgandan ko'ra, umuman ko'rsatmaslik» qoidasi — xabarning
qolgan qismi kechki hisobotning asosiy vazifasi.

## 7. Filial qamrovi

Yangi qoida yo'q: ikkala chaqiruv ham guruh e'lon qilgan filial doirasini
(`reportBranchIdsForGroup` / `branchIds`) uzatadi, xuddi hozirgi yig'im foizi va
moliyaviy kartochka kabi. Qarzni «eskirtirish» kompaniya bo'yicha ishlaydi
(o'quvchi balansi filialga bo'linmaydi), sanaladigan to'lovlar esa filial
bo'yicha filtrlanadi — bu xizmatning mavjud xulqi, o'zgarmaydi.

## 8. Testlar

`telegram-group-daily-report.service.spec.ts`:

1. eski qarz bor — `late` dagi **hamma** oylar xabarda chiqishi, yangisidan
   eskisiga tartibda;
2. eski qarz yo'q (`late: []`) — bitta «Hammasi shu oy uchun…» qatori;
3. taqsimot xizmati `throw` qilsa — xabar baribir quriladi, uch qator yo'q,
   «Tushum (haqiqiy)» eski manbadan chiqadi;
4. **footing:** xabardagi «Shu oy uchun» + oy qatorlari yig'indisi «Tushum
   (haqiqiy)» raqamiga teng (matndan o'qib tekshiriladi);
5. tushum 0 — taqsimot qatorlari umuman yo'q.

`telegram-group-report-menu.service.spec.ts`:

6. kartochkada uch qator chiqishi va `getIncomeMonthAttribution` kartochka
   oynasi (joriy oy) bilan chaqirilishi;
7. taqsimot xato bersa kartochka avvalgidek chiqishi.

## 9. Chiqarish

Migratsiya yo'q, env o'zgarmaydi. Faqat `server` deploy'i kerak (Railway qo'lda:
`railway up server --path-as-root`). Deploydan keyin tekshirish: guruhda
`/hisobot` → «📅 Oy boshidan» bo'limida uch qator borligi va qo'shilishi.
