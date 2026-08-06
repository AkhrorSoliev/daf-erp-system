# «Hisobot» Excel — qayta qurish (design)

**Sana:** 2026-08-06
**Holat:** tasdiqlangan (CEO), amalga oshirish kutilmoqda
**Tegishli:** `/payments/overview` → «Excel yuklab olish» tugmasi
**Prototip:** `server/scripts/_namuna-hisobot-v2.ts` (bir martalik, PROD ma'lumot bilan tekshirilgan)

---

## 1. Muammo

Hozirgi workbook (`ReportsExcelService.generate`) — 22 varaq (taqqoslash bilan 24), 92 qator
izoh matni va 21 atamali lug'at. Bitta fayl to'rt xil auditoriyaga xizmat qilishga urinadi:
direktor, buxgalter, operatsion menejer, marketolog. Natijada hech biri uchun qulay emas.

### 1.1 Bir savolga to'rt javob

Bir xil davr uchun kitobda to'rtta «Sof foyda» bor:

| Qayerda | Manba | Asos |
|---|---|---|
| Asosiy xulosa → «Sof foyda (naqd asosida)» | `overview.netProfit` | kassa |
| Asosiy xulosa → «Sof foyda (aniq)» + «Sof foyda» varag'i | `buildNetProfit` | dars tushumi − hisoblangan oylik |
| Foyda va zarar → «Sof foyda (hisobot uslubida)» | `pl.netProfit` | kassa, boshqa guruhlash |
| Filial kesimida → «Foyda» | oyliksiz | faqat operatsion xarajat |

Yana ikkita vaqt qatori (Oylik dinamika, Yillar kesimida) uchinchi asosda. Kod buni biladi va
izoh bilan himoyalanadi («DIQQAT: bu raqam yuqori ko'rinadi», «bu XATO emas»).

Xuddi shu holat «Tushum» (6 ma'no) va «Ustoz oyligi» (3 asos, 5 joy) bilan takrorlanadi.

### 1.2 Bir kitobda to'rt xil vaqt

Varaq nomidan qaysi davr ekani bilinmaydi: tanlangan davr / davrning faqat birinchi oyi
(Oyliklar) / bugungi holat (Balans, Qarzdorlar, KPI) / doim oxirgi 6 oy (dinamika, lidlar).

### 1.3 Topilgan nuqsonlar

1. Muqova mundarijasi mavjud bo'lmagan «Pul oqimi» varag'ini ro'yxatlaydi
   (`reports-excel.sheets.ts:66`) — `ReportsCashFlowService` bor, lekin `generate()` uni chaqirmaydi.
2. Mundarijada 14 band, kitobda 22 varaq; raqamlash (`i+2`) shartli varaqlar tushganda siljiydi.
3. «Oyliklar» sarlavhasi butun davrni yozadi, ma'lumot esa faqat birinchi oyники
   (`reports-excel.service.ts:401`).
4. Web va Telegram bir xil hisobotni turlicha chiqaradi: bot o'tgan oy uchun «joriy holat»
   varaqlarini tashlab ketadi, web qoldiradi.
5. `activeStudentCount` = `status: ACTIVE` — guruh talab qilinmaydi. PROD'da 503 ta «faol»ning
   76 tasi hech qaysi guruhda yo'q.

---

## 2. Qarorlar

| Savol | Qaror |
|---|---|
| Auditoriya | **Faqat direktor**, tez qaror uchun |
| Nom | «Direktor hisoboti» emas — **«HISOBOT»** |
| Sof foyda ta'rifi | **Dars tushumi asosida** (canonical `getMonthlyNetProfit` bilan bir xil) |
| Markaz qo'shimchasi | **Ko'rinadi** — ustoz oyligi ostida kichik qator (jami ICHIDA) |
| Foizlar | Faqat **«Jamidan %»** va **«Undirish %»**. Marja va «p» (punkt) yo'q |
| Qolgan varaqlar | O'chirilmaydi — **checkbox** ortiga olinadi |

---

## 3. Tuzilma

### 3.1 Sukut bo'yicha (10 varaq)

| # | Varaq | Mazmuni |
|---|---|---|
| 1 | **Xulosa** | 6 blok (§4) |
| 2 | **Oylar** | oyma-oy dinamika — `systemStartDate`dan tanlangan oygacha, oxirgi 12 oy bilan cheklangan |
| 3 | **Filiallar** | filial kesimida (faqat «Barcha filiallar»da) |
| 4 | **Oyliklar** | ustoz kesimida, markaz qo'shimchasi bilan |
| 5 | **Xarajatlar** | bittalab |
| 6 | **To'lovlar** | bittalab |
| 7 | **O'quvchilar** | kim o'qiyapti · statuslar · oy harakati · guruhdan chiqqanlar |
| 8 | **Davomat** | umumiy + eng past/yaxshi guruhlar |
| 9 | **Xonalar bandligi** | to'ldirilish % |
| 10 | **Izoh** | 10 atama |

### 3.2 Checkbox ortida

- ☐ **Buxgalteriya** → Foyda va zarar · Balans · Tekshiruv
- ☐ **Marketing va ustozlar** → Lidlar · O'qituvchilar samaradorligi · O'qituvchi o'zgarishlari
- ☐ **Qarzdorlar ro'yxati** → Qarzdorlar

Mavjud sheet-builder'lar saqlanadi; faqat chaqirilishi shartli bo'ladi.

---

## 4. «Xulosa» varag'i

Ustunlar: `A` nom (40) · `B` joriy (18) · `C` o'tgan oy (18) · `D` farq (11) · `E` izoh (54).
Sarlavha ostida **majburiy** ikki qator: davr (`Davr: 01.07.2026 — 31.07.2026`) va qamrov.

**Taqqoslash ustuni (C, D) faqat 1 va 2-blokda.** Qolgan bloklarda bo'sh ustun qoldirilmaydi.

### Blok 1 — NATIJA

```
  O'tilgan darslar qiymati        173 783 991
− Ustoz oyligi (jami hisoblangan)  95 834 547
     o'quvchilar to'lagan qismi    80 321 275
     markaz qo'shimchasi           15 513 272   ← yuqoridagi summa ICHIDA
− Xodimlar oyligi                           0   (0 bo'lsa ko'rsatilmaydi)
− Xarajatlar                       41 773 000
− O'quvchilarga qaytarilgan           200 000
═ SOF FOYDA                        35 976 444
```

Manba: `buildNetProfit(pl, salary, outflows, month, recognizedRevenue)` — hozirgi «Sof foyda»
varag'i bilan bir xil. **Marja qatori yo'q.**

### Blok 2 — «<OY> o'z xarajatini qopladimi» (YANGI)

```
  Iyulning o'z puli               142 064 938   ← getIncomeMonthAttribution().currentMonth
− Ustoz oyligi (jami)              95 834 547
− Xarajatlar                       41 773 000
− Qaytarilgan                         200 000
═ IYULNING O'Z FOYDASI              +4 257 391
```

Manfiy bo'lsa qizil + izoh: «oy o'zini o'zi boqolmadi, eski qarz undirish yoki oldingi oylar
puli hisobiga yopilgan». PROD'da iyun = **−26 750 444** (may qarzidan 38.3 mln undirilgani
bilan yopilgan), iyul = **+4 257 391**.

Markaz qo'shimchasi **alohida ayirilmaydi** — u `teacherSalary` ichida.

### Blok 3 — PUL QAYERDAN KELDI

`getIncomeMonthAttribution` natijasi: `currentMonth` + har bir eski oy qatori.
Ustunlar: `Qaysi oyning darsi uchun | Summa | Jamidan % | | Izoh`.
Ostida bitta qator: `<N> ta to'lov · <M> ta o'quvchi` + izoh: bitta to'lov ham eski qarzni,
ham shu oy darsini yopishi mumkin, shuning uchun **son oylarga bo'linmaydi, faqat summa**.

### Blok 4 — «<OY> DARSLARINING PULI QAYERDAN KELGAN» (YANGI)

| Qator | Manba |
|---|---|
| `<OY>` ichida to'langan | `attribution(CUR).currentMonth` |
| `<OY>`dan oldin to'langan (balansdagi pul) | qoldiq = `recognized − ichida − keyingi oy` |
| `<KEYINGI OY>`da to'langan (kechikkan) | `attribution(NEXT).late[CUR]` |
| Hali to'lanmay qolgan | `getMonthlyExpectation().remainingValue` |
| **Jami** | `recognizedRevenue` |

`remainingValue === 0` bo'lganda raqam o'rniga yashil **«Yo'q — hammasi to'langan»** yoziladi.

### Blok 5 — PUL QAYERGA KETDI

`pl.costOfServices.teacherSalaries` (naqd) · `teacherAdvances` · `operatingExpenses.byCategory` ·
`adminSalaries` · refunds. 0 bo'lgan qatorlar tushiriladi. **«KASSADA QOLDI» qatori YO'Q** —
u chalkashtiradi va ishonchsiz (§7.3).

### Blok 6 — O'QUVCHILAR

Taqqoslash ustunisiz, faqat «Soni»:

| Qator | Manba |
|---|---|
| Darsga qatnashdi (`<OY>`) | `Attendance` PRESENT/LATE, distinct `studentId` |
| Guruhda o'qiyapti | `status ACTIVE` + `enrollments.some(ACTIVE)` |
| Guruhsiz (statusi faol, guruhi yo'q) | qizil — ish talab qiladi |
| Muzlatilgan / Chetlatilgan / Bitirgan | `student.groupBy(status)` |
| Yangi kelgan / oy harakati | `createdAt` + `EntityHistory.newValues.status` |
| **Sof o'zgarish (o'quvchi soni)** | son formatida — **so'm EMAS** |

---

## 5. Til qoidalari

| Eski | Yangi |
|---|---|
| Dars tushumi | **O'tilgan darslar qiymati** |
| (yo'q edi) | **Kassaga tushgan pul** — alohida ustun |
| Debitorlik | O'quvchilar qarzi |
| Sof marja / Yalpi marja | **olib tashlanadi** |
| «naqd asosida» / «hisoblangan (accrual) asosida» | **olib tashlanadi** — bitta ta'rif |
| Churn / Retention | Ketganlar / Ushlab qolish |
| «Ulush» | **Jamidan %** |
| «+4.0 p» (punkt) | **olib tashlanadi** — foiz qatorlarida farq ustuni yo'q |
| Roll-forward · footing · cash tie-out · GL recon · balanslashuv | faqat «Tekshiruv» varag'ida |
| LTV / CAC / ROI | Xulosada yo'q |

**Har varaq sarlavhasi ostida majburiy davr qatori:** `Davr: DD.MM.YYYY — DD.MM.YYYY` yoki
`Bugungi holat: DD.MM.YYYY`.

---

## 6. Nuqsonlarni tuzatish

| # | Nuqson | Yechim |
|---|---|---|
| 1 | Mundarijadagi mavjud bo'lmagan «Pul oqimi» | Muqova olib tashlanadi (10 varaqli kitobga kerak emas) |
| 2 | Mundarija 14 band ↔ 22 varaq | Muqova bilan birga yo'qoladi |
| 3 | «Oyliklar» sarlavhasi butun davrni yozadi | Sarlavhaga aniq oy: `Iyul 2026 darslari uchun` |
| 4 | Web ↔ Telegram farqi | Ikkalasi ham bir xil qoidada; «bugungi holat» varaqlari aniq belgilanadi |
| 5 | Filial foydasi oyliksiz | Filialga oylik taqsimlanadi (bitta ustoz = bitta filial, D6) |
| 6 | `activeStudentCount` guruh talab qilmaydi | Xulosada «darsga qatnashdi» ishlatiladi |

---

## 7. Ma'lumot sifati bo'yicha muhofazalar

Hisobot ma'lumot muammosini **yashirmasligi** kerak.

### 7.1 O'tish oyi

Ustoz oyligi dars tushumining **15 %idan kam** bo'lsa — oylik to'liq hisoblanmagan deb
belgilanadi, foyda ustuni `—` bo'ladi + izoh. Qat'iy «2026-05» yozilmaydi, qoida ma'lumotdan
kelib chiqadi. (May: dars 152.4 mln, oylik 33 334 → foyda 127.5 mln chiqardi.)

### 7.2 «Boshqa» kategoriyasi

Iyunda operatsion xarajatning **71 %i** (65 515 000) «Boshqa»da. Xarajatlar varag'ida
«Boshqa» ulushi 30 %dan oshsa — ogohlantirish qatori chiqadi.

### 7.3 Oylik naqd to'langan = 0

Iyun va iyulda `pl.costOfServices.teacherSalaries === 0` — hech bir `SalaryPayment` PAID deb
belgilanmagan. Shu sababli «kassada qoldi» raqami ishonchsiz va **bloklardan olib tashlandi**.
Bu kod emas, jarayon muammosi; hisobot uni yaratmaydi va yashirmaydi.

### 7.4 Namangan filiali

84 ta o'quvchi guruhda o'qiyapti, lekin dars tushumi / xarajat / qarz — hammasi 0.
**Alohida tekshiriladi**, bu ish doirasiga kirmaydi.

---

## 8. Frontend o'zgarishlari

### 8.1 `export-options-popover.tsx`

- Taqqoslash checkbox'lari (`prev` / `yoy` / `yearly` / `custom`) **olib tashlanadi** —
  o'tgan oy bilan taqqoslash endi Xulosa varag'ining ichida, doimiy.
- O'rniga uchta checkbox: **Buxgalteriya** · **Marketing va ustozlar** · **Qarzdorlar ro'yxati**.
- Filial tanlash o'zgarishsiz qoladi.
- Fayl nomi: `hisobot-<oy>.xlsx`.

### 8.2 `/payments/overview` Foyda kartasi

«Oyning o'z foydasi» qatori qo'shiladi (blok 2 bilan bir xil hisob). Bu CEO'ning aniq
so'rovi: kartada foyda musbat ko'rinsa ham, oy o'zini o'zi boqmagan bo'lishi mumkin.

---

## 9. Backend o'zgarishlari

- `reports-excel.service.ts` — sheet tarkibi shartli bo'ladi; yangi query param
  (`include=buxgalteriya,marketing,qarzdorlar`).
- Yangi builder fayl: `reports-excel.summary-sheet.ts` (Xulosa, 6 blok).
- Yangi builder: `reports-excel.students-sheet.ts` (O'quvchilar).
- `reports-excel.detail-sheets.ts` — Oylar va Filiallar ustunlari qayta yoziladi
  (ikki tushum ustuni, «Oyning o'z foydasi»).
- `coverSheet` va `glossarySheet` (21 atama) o'rniga qisqargan `Izoh` (10 atama).
- Yangi hisob: «oyning o'z foydasi» — `getIncomeMonthAttribution().currentMonth` minus
  `buildNetProfit`ning chiqim oyoqlari. Bitta joyda (helper), Excel va overview kartasi
  bir manbadan o'qiydi.

**Hech bir mavjud hisob-kitob o'zgartirilmaydi** — `getMonthlyNetProfit`,
`getRecognizedRevenue`, `getMonthly`, `getIncomeMonthAttribution` o'z holicha qoladi.
Bu ish faqat **taqdimot** qatlamiga tegadi, bitta yangi hosila ko'rsatkich qo'shadi.

---

## 10. Tekshirish

1. `npm test` (server) — mavjud `reports-excel.service.spec.ts` yangilanadi.
2. Yangi unit test: «oyning o'z foydasi» hisobi (iyun `−26 750 444`, iyul `+4 257 391`).
3. Yangi unit test: 15 % qoidasi (may `—` beradi).
4. `npm run build` (client).
5. PROD pre-flight: `_namuna-hisobot-v2.ts` chiqargan raqamlar bilan solishtirish.

### Kutilayotgan raqamlar (PROD, 2026-07, 06.08.2026 holatiga)

| Ko'rsatkich | Qiymat |
|---|---|
| O'tilgan darslar qiymati | 173 783 991 |
| Ustoz oyligi (jami) | 95 834 547 |
| ﹒ o'quvchilar to'lagan | 80 321 275 |
| ﹒ markaz qo'shimchasi | 15 513 272 |
| Xarajatlar | 41 773 000 |
| Qaytarilgan | 200 000 |
| **SOF FOYDA** | **35 976 444** |
| Iyulning o'z puli | 142 064 938 |
| **Iyulning o'z foydasi** | **+4 257 391** |
| Kassaga tushgan pul | 170 378 987 |
| Darsga qatnashdi / guruhda / guruhsiz | 444 / 427 / 76 |
| Sof o'zgarish | −62 |

---

## 11. Bu ish doirasiga KIRMAYDI

- Namangan filialining 0 raqamlari (§7.4) — alohida tekshiruv.
- `SalaryPayment` PAID deb belgilanmayotgani (§7.3) — jarayon masalasi.
- Xarajatlarni «Boshqa»dan qayta toifalash — ma'lumot kiritish ishi.
- Telegram bot menyusi — hozirgi `generate()`ni chaqiradi, moslashtiriladi, lekin
  qayta loyihalanmaydi.
- `/payments/overview` sahifasining boshqa kartalari.
