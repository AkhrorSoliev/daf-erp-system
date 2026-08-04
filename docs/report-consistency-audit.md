# Hisobotlar nomuvofiqligi — to'liq audit

**O'lchangan:** 2026-07-30, 00:30 Toshkent (darslar 01.07–29.07, to'lovlar butun iyul)
**Baza:** PROD (Neon `ep-orange-bonus-akzfn5wr`, Railway `caring-courage`, company `1001`)
**Usul:** kod o'qish + `railway run` orqali faqat-o'qish skriptlar + 6 yo'nalishli parallel audit (53 agent; 47 da'vo adversarial tekshirildi — 34 tasi tasdiqlandi, 13 tasi rad etildi/latent deb topildi)
**Natija:** 32 ta topilma — **H1–H32**
**Holat:** hech qanday kod o'zgartirilmagan — bu faqat diagnostika

---

## 0b. P3 BAJARILDI + YANGI TOPILMA H33 — 2026-08-04

### ✅ H1 / P3 — yagona «Yig'im %»
Telegram `mtdIncome ÷ recognizedRevenueForecast` (109–115%) va /overview `currentMonth ÷ total` (83%) o'rniga **bitta** ko'rsatkich: `ReportsFinancialService.getIncomeMonthAttribution` endi `lessonsValue` (shu davrda **o'tilgan** darslar qiymati = `getRecognizedRevenue`) va `collectionPct = currentMonth ÷ lessonsValue` qaytaradi. Telegram ham, /overview «Tushum tarkibi» paneli ham aynan shu metodni chaqiradi — ikkinchi formula qolmadi.

Prod (2026-08-04, kompaniya bo'yicha):

| Oy | Jami tushum | Shu davr uchun | O'tilgan darslar | **Yig'im** | (eski formula) |
|---|---|---|---|---|---|
| iyun | 171 933 329 | 133 621 653 | 165 086 661 | **81%** | 115% |
| iyul | 170 378 987 | 142 064 938 | 173 783 991 | **82%** | 115% |
| avgust (1–4) | 10 059 000 | 6 742 569 | 13 540 068 | **50%** | 7% |

Eski formulada maxraj har oy bir xil (148.8M prognoz) bo'lgani uchun iyun va iyul **bir xil 115%** chiqardi — ya'ni u oylarni umuman ajratmasdi. Yangisi ajratadi va tuzilishi bo'yicha ma'noga ega. Oy o'rtasida 100% dan oshishi mumkin (o'quvchi keyingi oy tsiklini oldindan to'lasa) — bu haqiqiy signal, avvalgidek har oy takrorlanadigan 11% xato emas.

Prognoz qatori qoldi, lekin **foizsiz**: `• Oylik prognoz (taxminiy reja): X`. Uning `exactDays × 4` xatosi P5 da tuzatiladi.

Tekshiruv skriptlari: `scripts/verify-collection-ratio.ts` (haqiqiy servisni chaqiradi), `scripts/diag-lesson-coverage.ts`, `scripts/diag-coverage-crosscheck.ts`.

### 📌 Nega «dars qoplanishi %» ishlatilmadi
Dastlabki g'oya «qoplangan darslar ÷ o'tilgan darslar» edi. Prodda o'lchandi: **iyun/iyul/avgustda qoplanmagan bitta ham dars yo'q** — iyulda 5 143 ta billable davomatning hammasida tirik `LESSON_CONSUMPTION` bor, hatto bugun qarzdor 284 o'quvchining 3 101 ta darsida ham. Sababi: to'lov kelganda `processRetroactiveBillingForStudent` o'tmishdagi darslarni orqaga qarab hisoblaydi, ya'ni dars **kechroq** qoplanadi. Demak bu nisbat doim 100% — o'lchov emas. Shu bilan birga bu `lessonsValue` ni to'liq maxraj sifatida tasdiqlaydi.

### ❗ H33 — `getRecognizedRevenue` filialni umuman hisobga olmasdi (TUZATILDI)
`ReportsFinancialService.getRecognizedRevenue` imzosi `{ branchId?: number }` ni ochardi, lekin **ikkala chaqiruvchi ham** (`getMonthlyNetProfit`, `reports-excel.service.ts`) P7 dan keyin `branchIds` uzatadi. Ular o'zgaruvchi orqali uzatilgani uchun TypeScript ortiqcha-maydon tekshiruvini o'tkazib yuborgan → `branchId` **doim `undefined`** → filial predikati butunlay yo'qolgan.

Ta'siri: filial tanlanganda Foyda kartasi va Excel «Sof foyda» **butun kompaniyaning** dars tushumidan **bitta filialning** oyligini ayirardi. Namanganda hozircha ma'lumot yo'q, shuning uchun simptom «Namangan tanlansa ham Farg'onaning 173M tushumi chiqadi» ko'rinishida edi — Namangan pul kirita boshlashi bilan raqam butunlay yolg'on bo'lardi.

Tuzatildi: `branchIds: ReportBranchIds` + `group: { branchId: { in } }` + bo'sh qamrovda 0. Qo'riqchi testlar `reports-financial.service.spec.ts` da (`getRecognizedRevenue` describe bloki).

---

## 0a. QAYTA TEKSHIRUV — 2026-07-30 (13 commit'dan keyin)

Har bir topilma joriy kod bo'yicha qayta tekshirildi (10 guruh + har «tuzatildi» da'vosiga qarshi challenge). Testlar: 180 suite / 2253 test o'tdi.

| Holat | Topilmalar |
|---|---|
| ✅ **TUZATILDI** | **H3**, **H5**, **H6**, **H7**, **H8**, **H13**, **H14**, **H15**, **H16**, **H17** |
| ❌ **TUZATILMAGAN** | H1, H2, H4, H9–H12, H18–H32 (22 ta) |
| 🔁 **REGRESSIYA** | yo'q (lekin H5 ichida yangi kesh xatosi — pastga qarang) |

### ✅ H7, H8, H13–H17 — filial qamrovi (2026-08-02, prod'da o'lchandi)

Ildiz sabab bitta edi: hisobot moduli **ikkita raqobatlashuvchi filial parametri** olib yurardi — `branchId`
(switcher tanlagani) va `branchIds` (chaqiruvchining o'z qamrovi) — va har bir so'rov qaysi birini
hurmat qilishni o'zi hal qilardi. `branchWhere()` esa `branchIds` ni **ustun** qo'yardi, ya'ni
foydalanuvchi ataylab tanlagan filial jimgina tashlab yuborilardi.

Endi: `common/finance/report-branch-scope.ts` — **qamrov shift (ceiling), tanlangan filial esa uni
toraytiradi**. HTTP chegarasida bir marta hisoblanadi (`resolveCallerReportBranchIds`), qolgan hamma joyga
tayyor javob uzatiladi. `branchWhere()` va `branchId`+`branchIds` juftligi butunlay o'chirildi — bu
xato sinfini **tiplar darajasida** ifodalab bo'lmaydigan qildi.

Qamrovi bo'sh chaqiruvchi (filiali yo'q direktor yoki o'z qamrovidan tashqaridagi filialni so'ragan)
**403 oladi** — nolga to'la hisobot emas: ba'zi servislar o'z qamrovini `performedById` dan qayta
chiqaradi, ya'ni hisobotning bir qismi baribir to'lardi va hujjat o'z-o'ziga zid bo'lardi.

Prod o'lchovi (2026-08-02):
```
Ko'rsatkich          Farg'ona      Namangan    Σ        Jami
Jami qarz            28 453 233           0    ✅       (avval: Namangan 27 748 684)
Qarzdorlar soni             208           0    ✅       (avval: Namangan 177)
Faol o'quvchilar            404           0    ✅       (avval: Namangan 407)
+ Tushum / Xarajat / Oylik / Dars — hammasi ✅
Filialsiz qator: 0 ta
```

Qo'riqchi test: `reports-branch-scope-coverage.spec.ts` — qamrov berilganda hisobotning **har bir**
so'rovida filial predikati borligini tekshiradi. Mutatsiya bilan sinaldi (bitta predikatni olib
tashlash → 2 test yiqiladi). `scripts/audit-branch-scope-sum.ts` esa haqiqiy bazada Σ(filiallar) = jami
ni o'lchaydi.

### ✅ H3 — to'liq tuzatilgan (prod'da o'lchandi)
`computePeriodBounds` endi `periodStartDate` / `periodEndDateExclusive` juftini ham qaytaradi va `@db.Date` ustunlarga aynan shular beriladi (`lt`, `lte` emas). Prod tekshiruvi:
```
IYUL oynasi (sana): 2026-07-01 … < 2026-08-01
Iyul oynasidagi 3997 accrualdan lessonDate < 01.07 bo'lgani: 0 ta
30.06 accruallari (80 ta) IYUNda qoldi — yo'qolmadi
```
Qoldiq (kichik): `scripts/forecast-full-salary-topup.ts` va `scripts/export-june-salary-excel.ts` hali eski davr mantiqining o'z nusxasini saqlaydi — hisobot yuzasi emas, lekin qayta yurgizilsa hisobotga mos kelmaydi.

**Diqqat:** `scripts/audit-july-clean.ts` dagi «ORTIQCHA (30.06 ikki marta)» qatori endi **noto'g'ri yorliq** — u qonuniy carry-over'ni (407 accrual, 6 945 039 so'm, `creditPeriodDate` orqali «Oldingi oydan») ikki marta sanash deb ko'rsatadi. Qatorni olib tashlash kerak.

### 🟡 H5 — kanonik manba joriy etildi, lekin ikki teshik qoldi
To'rt yuza ham `getMonthlyNetProfit` ga o'tdi, kassa raqami rostgo'y «Kassa harakati (oyliksiz)» yorlig'i bilan qoldirildi. Qolgani:
1. **Kesh kaliti `performedById` ni olmaydi** (`netProfitCacheKey(companyId, branchId, monthKey)`), lekin `getMonthlyNetProfit` ning oylik oyog'i **chaqiruvchiga qarab** qamrovlanadi (CEO → hamma filial, BD → o'z filiali). Ya'ni CEO va filial direktori bitta kesh yozuvini bo'lishadi → biri ikkinchisining raqamini bir kunga «zaharlashi» mumkin.
2. **Karta keshsiz, grafik kunlik keshda** — joriy oy uchun ular kun ichida farq qilishi mumkin.
3. **`profitBasis` frontendda ishlatilmagan** (client'da 0 ta joyda) — kanonik hisob xato bersa grafik jimgina kassa raqamini chizadi, foydalanuvchi bilmaydi.

### 🟡 H6 — oy chegarasidagi davrlar tuzatildi, erkin sana oralig'i emas
`reports-excel.month-range.ts` bilan **oyga tekislangan** exportlar (Telegram `rm:p3/p6/p12`, `rm:py`, web «Oxirgi 3 oy» / «Bu yil») haqiqatan tuzatildi. Lekin H6 nomlagan **erkin sana oralig'i** hali mos emas va endi **teskari tomonga** xato qiladi: tushum va oylik butun kalendar oylarga «yopishadi», xarajat/refund esa aniq kunlarni saqlaydi. O'lchangan: `10.06–15.07` exporti so'ralgan oynadan **tashqaridagi 133 492 800 so'm** tushumni qo'shib yuboradi.
Qo'shimcha: ko'p oylik yo'lda `month=undefined` uzatilgani uchun varaq butun yig'indini «+ markaz qo'shimchasi» deb belgilaydi; «Oyliklar» varag'i va «Tekshiruv» dagi «Hisoblangan oylik (sof, shu oy)» qatori hali faqat boshlang'ich oyni ko'rsatadi (web exportda ogohlantirishsiz); `generate()` ni ko'p oylik oraliq bilan sinaydigan test yo'q.

### 🟡 H7 — argument ulandi, lekin qamrov bir qavat pastda buziladi
`getSalaryMonthly` ga 4-argument (`branchId`) endi ikkala Excel oyog'ida ham berilyapti va o'lchangan simptom (CEO + Namangan: Excel −90.8M vs karta 0) yo'qoldi. Lekin:
- `branchId` **faqat ustozlar ro'yxatini** filtrlaydi (`salary-monthly.service.ts:105`); accrual / attendance / group / groupTeacher so'rovlarida filial predikati **yo'q** → har bir ustoz o'zining **butun kompaniya bo'yicha** covered+gap ini qo'shadi. Ikki filialga biriktirilgan ustoz paydo bo'lishi bilan Σ(filiallar) > kompaniya bo'ladi. **Bu aynan P7 ning go-live sharti.**
- O'sha workbook'ning «Asosiy xulosa» varag'i hali `overview.salary.paid` ni ishlatadi — u company-wide.

### 🟡 H16 — faqat oylik oyog'i tuzatildi
BD `branchId` bermay export qilsa, workbook hali aralash: P&L / To'lovlar / Xarajatlar / Balans / Qarzdorlar `branchIds` bo'yicha, «Asosiy xulosa» / trend / period outflows / recognized revenue esa company-wide. «Tekshiruv» varag'i **har qanday chaqiruvchi uchun** company-wide.

### ❌ Tekshirilgan va o'zgarmagani tasdiqlangan
- **H1** — Telegram qatori o'sha (`{collectionPct}% yig'ildi`), bugun **112%**. `/overview` paneli ham o'sha. Ma'noli yig'im (shu oy to'langan ÷ shu oy hisoblangan) hech qayerda yo'q — `collectionPct` grep faqat o'sha 3 qatorni beradi.
- **H2** — `lessonsPerMonth = exactDays.length * 4` ikkala joyda ham o'zgarmagan; 400 vs 443 dars (11%). Kalendar bo'yicha dars sanalarini hisoblaydigan tayyor kod **allaqachon bor** (`attendance/shared/schedule-resolver.ts`, `GroupScheduleSnapshot` bilan) — prognoz undan foydalanmaydi.
- **H4** — `period-helpers.ts` va `overview-client.tsx` ga umuman tegilmagan (uchala kichik holat ham o'sha).
  > Tuzatishda ehtiyot: `resolvePeriod.endDate` `@db.Date` ustunlarga beriladi (`expenses.service.ts:264` va h.k.) — hamma chegarani −5h siljitish ularni buzadi. H3 dagi kabi **ikki juft** chegara kerak.

---

## 0. Bu hujjatni boshqa chatda qanday ishlatish

Yangi chatda shundan biri bilan boshlang:

```
docs/report-consistency-audit.md ni o'qi. H1 dan boshlaymiz.
```

```
docs/report-consistency-audit.md dagi P1 ni bajaraylik — reja tuzib ber.
```

Qayta o'lchash kerak bo'lsa (oxirgi bo'limdagi skriptlar, hammasi faqat o'qiydi):

```bash
cd server
railway run npx ts-node scripts/diag-report-mismatch.ts
```

> Muhim: quyidagi raqamlar **2026-07-30 holatiga**. Skriptlarni qayta yurgizsangiz raqamlar o'zgaradi — formulalar va `file:line` havolalari esa o'zgarmaydi (kod tuzatilmaguncha).

---

## 1. O'lchangan prod raqamlari — iyul 2026

| Ko'rsatkich | Qiymat |
|---|---|
| Iyul jami tushum (COMPLETED to'lovlar) | 162 127 987 so'm (504 ta to'lov) |
| Shundan **shu oy uchun** | 134 063 914 so'm (83%) |
| Shundan **eski qarz uchun** | 28 064 073 so'm (17%) — iyundan 24 627 442, maydan 3 436 631 |
| Prognoz (`recognizedRevenueForecast`) | 148 789 404 so'm (346 aktiv enrollment) |
| Real hisoblangan darslar (Σ `LESSON_DEDUCTION`) | 167 414 922 so'm |
| Shu oyda **o'tilgan** darslar qiymati (recognized) | 161 055 915 so'm (4 768 ta hisobga olinadigan davomat) |
| Ustoz oyligi — tizim ko'rsatadi | 90 824 433 so'm |
| Ustoz oyligi — sof 01.07…29.07 | 89 005 090 so'm |
| **30.06 ikki marta sanalgani** | **1 819 343 so'm** |
| Iyulda qo'shilgan enrollment | 150 ta |
| Iyulda ketgan / ko'chgan | 132 ta |
| Aktiv guruhlar | 32 ta |
| Dars rejasi — `exactDays × 4` formulasi | 400 dars |
| Dars rejasi — kalendar bo'yicha haqiqiy | 443 dars (bayram 2 kun chiqarilgan) |
| **Formula xatosi** | **43 dars = 11% kam** |

---

## 2. H1 — Bitta "%" belgisi ostida uch xil ko'rsatkich

> ✅ **TUZATILDI 2026-08-04** — 0b bo'limiga qarang. Quyidagisi tuzatishdan oldingi holat.

| Joy | Formula | Qiymat |
|---|---|---|
| Telegram «Oylik prognoz → N% yig'ildi» | jami tushum ÷ prognoz | **109%** |
| /overview «Tushumlar» drill-down | shu oy uchun to'langan ÷ jami tushum | **83%** |
| (mavjud emas) ma'noli yig'im | shu oy uchun to'langan ÷ shu oy hisoblangan | **83%** |

- Telegram: [telegram-group-daily-report.service.ts:310](../server/src/telegram-groups/telegram-group-daily-report.service.ts#L310)
- /overview: [reports-financial.service.ts:565](../server/src/reports/reports-financial.service.ts#L565) `getIncomeMonthAttribution`

Telegram *"rejaning qanchasi yig'ildi"*, /overview *"kelgan pulning qanchasi shu oyga tegishli"* deydi. Ikkisi hech qachon teng bo'lmaydi.
Ikkalasi ham 83% chiqib qolgani **tasodif** (162.1M ≈ 161.1M).

---

## 3. H2 — Prognoz nega 100% dan oshib ketadi (3 sabab)

### a) `exactDays × 4` — har oy 4 hafta deb olinadi
[reports-financial.service.ts:261](../server/src/reports/reports-financial.service.ts#L261) va [telegram-group-daily-report.service.ts:612](../server/src/telegram-groups/telegram-group-daily-report.service.ts#L612):

```ts
const lessonsPerMonth = (e.group.exactDays?.length ?? 0) * 4;
```

Iyul 2026da chorshanba/payshanba/juma **5 marta** keladi → real reja 443, formula 400 → **11% kam**.
Maxraj 11% kichik → foiz 11% oshiq. Faqat shuni tuzatsa: 109% → ~98%.

**`× 4` kodning UCH joyida** (2026-07-30 holatiga, hammasi hali o'sha):
| Fayl | Nimani boshqaradi |
|---|---|
| `reports-financial.service.ts:261` | /overview «Prognoz (bashorat)» + Excel «Prognoz (bashorat)» |
| `telegram-group-daily-report.service.ts:629` | Telegram «Oylik prognoz» + undagi foiz |
| `salary-overview.service.ts:334` (`computeExpectedMonthly`) | `expectedMonthly` — ekranda ko'rsatilmaydi, lekin ⚙ Sozlamalardagi ustozlar ro'yxatining **tartibini** belgilaydi (`:258-259`) |

**Xato har oy boshqacha** (32 aktiv guruh, bayramlar chiqarilgan, sof kalendar):

| Oy | Kalendar | Kod | Farq |
|---|---|---|---|
| may 2026 | 398 | 400 | −0.5% |
| iyun 2026 | 434 | 400 | +8.5% |
| iyul 2026 | 454 | 400 | **+13.5%** |
| avgust 2026 | 432 | 400 | +8% |
| sentyabr 2026 | 434 | 400 | +8.5% |
| oktyabr 2026 | 446 | 400 | +11.5% |
| noyabr 2026 | 420 | 400 | +5% |
| dekabr 2026 | 448 | 400 | +12% |

Kod rejasi **har oy bir xil (400)** — oy 28 kunmi, 31 kunmi, farqi yo'q. Skript: `scripts/diag-four-week-error.ts`.
(Guruh boshi/oxiri chegarasi ham qo'llansa iyul 443 chiqadi — yo'nalish o'zgarmaydi.)

Formula shuni ham hisobga olmaydi: bayramlar, bekor qilingan darslar, guruh boshi/oxiri, o'quvchining o'rtada qo'shilishi, FROZEN holat.

### b) Numerator va maxraj boshqa narsani o'lchaydi
Numeratorga eski qarz to'lovlari (28.06M), oldindan to'lovlar, ketib qolgan o'quvchilar to'lovi kiradi. Maxrajda faqat **hozir aktiv** o'quvchilar bor.

### c) Maxraj muzlatilmaydi
Prognoz oy boshida bir marta hisoblanmaydi — **har so'rovda qaytadan** hisoblanadi (hozirgi `status: ACTIVE` enrollmentlardan). Iyulda maxraj kamida 282 marta siljigan (150 qo'shilgan + 132 ketgan). Shuning uchun kechagi foiz bilan bugungi foizni solishtirish mumkin emas.

### Taklif — dinamik model

Bitta "%" o'rniga **to'rtta alohida** ko'rsatkich:

1. **Reja (muzlatilgan)** — oyning 1-kuni bir marta yoziladi (yangi jadval, masalan `MonthlyPlanSnapshot`). Har enrollment uchun `exactDays × 4` emas, **kalendar bo'yicha real dars sanalari** (bayram, bekor qilingan dars, guruh va enrollment chegaralari hisobga olinadi).
2. **Kutilayotgan (dinamik)** = `shu oyda o'tilgan darslar qiymati (real)` + `bugundan oy oxirigacha qolgan reja`. Bu raqam oy oxirida avtomatik haqiqatga aylanadi (31-kuni kutilayotgan = haqiqiy). Kelib-ketish dinamikasi o'z-o'zidan hisobga olinadi.
3. **Yig'im %** = `shu oy uchun to'langan ÷ shu oy hisoblangan darslar`. Tuzilishi bo'yicha 100% dan oshmaydi. Iyul: 83%.
4. **Reja bajarilishi** = `kutilayotgan ÷ muzlatilgan reja` — o'quvchi oqimini o'lchaydi, pul yig'imini emas.

---

## 4. H3 — 30.06 muammosi. Sabab time zone EMAS, ustun turi

- `SalaryAccrual.lessonDate` va `Attendance.date` — `@db.Date` (sanaviy, vaqtsiz).
- `computePeriodBounds` Toshkentga siljitilgan **timestamp** qaytaradi: [resolve-current-period.ts:106-112](../server/src/salary/shared/resolve-current-period.ts#L106)
  → iyul davri = `2026-06-30T19:00:00Z … 2026-07-31T18:59:59.999Z`
- Prisma `@db.Date` ustunini solishtirganda timestampni **UTC kalendar sanasiga kesadi**: `2026-06-30T19:00Z` → `2026-06-30`.
- Natija: filtr `lessonDate >= '2026-06-30'` bo'lib qoladi.

**Prod dalili** (`scripts/audit-boundary-probe.ts`):

```
IYUN oynasi: birinchi 2026-06-01 … oxirgi 2026-06-30
IYUL oynasi: birinchi 2026-06-30 … oxirgi 2026-07-29   <-- 30.06 IKKI davrda
```

**Ta'siri 1.82M bilan cheklanmaydi** — bu oylik `getSalaryMonthly` orqali quyidagilarga tarqaladi:
- `/payments/salary` sahifasi
- Foyda kartasi ([reports.service.ts:119](../server/src/reports/reports.service.ts#L119) `getMonthlyNetProfit` → `getSalaryMonthly`) → **iyul foydasi 1.82M kam**
- Excel «Sof foyda» + «Oyliklar» + «Tekshiruv»
- Telegram kunlik hisobotning «Ustozlar oyligi» bloki

### Yechim
Davr chegarasini **ustun turiga qarab** berish. Loyihada naqsh allaqachon bor: [format.util.ts:96-125](../server/src/telegram-groups/utils/format.util.ts#L96) (`firstOfThisMonthUtc` vs `firstOfThisMonthDate`).

- TIMESTAMP ustun (`Payment.createdAt`) → Toshkentga siljitilgan bound.
- `@db.Date` ustun (`lessonDate`, `Attendance.date`, `Expense.date`) → **siljitilmagan** `Date.UTC(y,m,d)` bound + yuqori chegara **exclusive** (`lt` keyingi davr boshi), `lte …18:59:59` emas.

`computePeriodBounds` ikki juft chegara qaytarsin:
`{ periodStartTs, periodEndTs, periodStartDate, periodEndDateExclusive }`.

To'g'ri naqsh namunasi allaqachon bor: `getRecognizedRevenue` — `gte Date.UTC(y,m-1,1)`, `lt Date.UTC(y,m,1)` ([reports-financial.service.ts:487](../server/src/reports/reports-financial.service.ts#L487)).

---

## 5. H4 — Vaqt mintaqasi: uch xil muammo

**1) Server oynasi UTC.** [period-helpers.ts:32-36](../server/src/common/finance/period-helpers.ts#L32):

```ts
start:  new Date(startStr),                  // 2026-07-01T00:00:00Z
endTs:  new Date(endStr + 'T23:59:59.999Z'), // 2026-07-31T23:59:59.999Z
```

Toshkent vaqtida bu **01.07 05:00 → 01.08 04:59**. 1-iyul tunidagi (00:00–05:00) to'lov iyulga kirmaydi, 1-avgust tunidagi kiradi. Bugun bu 0 so'm, lekin Payme/Click kechasi ham ishlaydi. Telegram esa to'g'ri Toshkent oynasidan foydalanadi → oy chegarasida ikkisi farq qiladi.

**2) Brauzer mintaqasi.** [overview-client.tsx:38-39](../client/src/components/payments/overview-client.tsx#L38) `startOfMonth(new Date())` — **brauzer** vaqtida. Ish kompyuteri `Europe/Berlin` da. 1-avgust 01:00 Toshkentda Berlinda 31-iyul 22:00 → sahifa iyulni, Telegram avgustni ko'rsatadi.

**3) Server process TZ.** `resolvePeriod` default oyni `now.getFullYear()/getMonth()` bilan oladi — Railway'da bu **UTC**. 1-avgust 02:00 Toshkent = 31-iyul 21:00 UTC → default davr iyul bo'lib qoladi.

### Yechim
Bitta qoida: barcha sana mantiqi `Asia/Tashkent` (UTC+5, DST yo'q) helperlari orqali. **Brauzer sana oralig'ini o'zi hisoblamasin** — sahifa `?month=2026-07` yuborsin, chegarani server qursin. Shundan keyin tizimni istalgan mintaqadan ishlatish xavfsiz.

---

## 6. H5 — «Sof foyda» uchun to'rtta boshqa-boshqa ta'rif

| Joy | Formula | Manba |
|---|---|---|
| /overview «Foyda» kartasi | recognized revenue − deserved ustoz oyligi − admin oyligi − opex − refund | [reports.controller.ts:236-243](../server/src/reports/reports.controller.ts#L236) `getMonthlyNetProfit` ✅ **kanonik** |
| Telegram kunlik 21:00 | `mtdIncome − mtdExpense − mtdAdvance` — **oylik ayirilmaydi** | [telegram-group-daily-report.service.ts:309](../server/src/telegram-groups/telegram-group-daily-report.service.ts#L309) |
| Telegram `rm:cfin` kartasi | eski kassa asosidagi `netProfit` | [telegram-group-report-menu.service.ts:286](../server/src/telegram-groups/telegram-group-report-menu.service.ts#L286) |
| Foyda kartasini **bosganda** chiqadigan grafik | `incomeTotal − (expenses − advancesPaid + salaryPaid + advancesSettled)` — kassa | [reports-financial.service.ts:860-867](../server/src/reports/reports-financial.service.ts#L860) |

Ya'ni Foyda kartasi to'g'ri raqamni ko'rsatadi, lekin **ustiga bosilsa boshqa ta'rifdagi grafik** ochiladi. Telegramning ikki surfaceida ham eski (kodning o'zi «+78M iyun bug» deb ataydigan) asos ishlatiladi — [reports.controller.ts:231-233](../server/src/reports/reports.controller.ts#L231).

Telegram kunlik hisobotdagi «Sof foyda» ayniqsa yomon: **hech qanday oylik ayirilmaydi** (`Expense` jadvaliga oylik hech qachon yozilmaydi), lekin **avans naqdi ayiriladi** — kanonik formula avansni umuman xarajat deb hisoblamaydi. Ustiga-ustak, xuddi shu xabarda pastda «To'liq ishlangan 84.2M» deb yozib turadi.

---

## 7. Excel hisobotdagi muammolar

### H6 — Ko'p oylik export butunlay noto'g'ri (eng og'iri)
[reports-excel.service.ts:117](../server/src/reports/reports-excel.service.ts#L117) `monthStr = query.startDate.slice(0,7)` — faqat **boshlang'ich oy**.

- Tushum (`getRecognizedRevenue`) va ustoz oyligi (`getSalaryMonthly`) → **faqat boshlang'ich oy**
- Admin oyligi, operatsion xarajat (`getProfitLoss`), refund (`getPeriodOutflows`) → **butun tanlangan davr**
- `buildNetProfit` ikkinchisini birinchisidan ayiradi

Ta'sirlangan yo'llar (barchasi live):
- Web: `/payments/overview` presetlari «Oxirgi 3 oy», «Bu yil» ([overview-client.tsx:29-30](../client/src/components/payments/overview-client.tsx#L29)) + erkin sana tanlash
- Telegram menyusi: «Oxirgi 3/6/12 oy», «Yillik» ([telegram-group-report-menu.service.ts:231-255](../server/src/telegram-groups/telegram-group-report-menu.service.ts#L231))

**Eng yomon holat — «Yillik 2026»:** `monthStr = 2026-01`, `systemStartDate = 2026-05` bo'lgani uchun `recognizedRevenue = 0` (yanvarda `Attendance` yo'q), oylik esa `floorMonth` ga (2026-05) qisiladi. Natijada «★ ENG ANIQ raqam» sifatida **butun yillik xarajatning minusi** chop etiladi. Sahifadagi Foyda kartasi esa xuddi shu so'rov uchun ≈0 ko'rsatadi.

«Tekshiruv» varag'i buni **hech qachon ushlay olmaydi** — footing bir xil `np` maydonlarini ikki tomonga qo'yib solishtiradi, ya'ni doim «MOS» chiqadi ([reports-excel.detail-sheets.ts:641-655](../server/src/reports/reports-excel.detail-sheets.ts#L641)).

### H7 — Excel ustoz oyligiga filial berilmagan (tugallanmagan tuzatish)
[reports-excel.service.ts:157](../server/src/reports/reports-excel.service.ts#L157):

```ts
this.reports.getSalaryMonthly(companyId, monthStr, query.performedById ?? 0),
//                                                 ^ 4-chi argument branchId YO'Q
```

Commit `c490d68` (2026-07-29) `getMonthlyNetProfit` va Foyda kartasiga filial qamrovini qo'shdi va o'z izohida Excel «Sof foyda» varag'ini ham nomlab o'tdi — lekin Excel service tahrirlanmadi.

**Prod o'lchov (iyul 2026):** CEO exportni Namangan (#2) filialiga filtrlasa → Excel «Sof foyda» = **−90 824 433** so'm, sahifadagi Foyda kartasi = **0**. «Oyliklar» varag'ida 11 ustoz, filial qamrovida esa 0.

### H8 — Excel `branchId` va `branchIds` ni aralashtiradi
- Faqat `branchId` qabul qiladi: `getFinancialOverview`, `getFinancialTrend`, `getPeriodOutflows`, `getRecognizedRevenue`
- `branchIds` bilan qamrovlanadi: `getProfitLoss`, `getPaymentLineItems`, `getExpenseLineItems`, `getBalanceSheet`, `getDebtorLineItems`
- `branchWhere()` esa `branchIds` ni **ustun qo'yadi** ([period-helpers.ts:50-53](../server/src/common/finance/period-helpers.ts#L50))

**Prod o'lchov:** Filial direktori #10768 (Namangan) default «Barcha filiallarim» bilan export qilsa — «Asosiy xulosa» Tushum = **162 127 987** (Farg'onaning hammasi), «To'lovlar»/«Xarajatlar»/«Foyda va zarar»/«Balans»/«Qarzdorlar» = **0**, muqovada esa «Namangan filali» yozilgan.

### H9 — «Asosiy xulosa» da 8 qatordan 3 tasi doim 0% ko'rsatadi
[reports-excel.sheets.ts:111-113](../server/src/reports/reports-excel.sheets.ts#L111) — «Jami qarz», «Qarzdorlar soni», «Faol o'quvchilar» — bular sana filtrisiz live snapshot, lekin «davrlar taqqoslashi» jadvaliga qo'yilgan. `Joriy` va `O'tgan davr` ustunlari **doim teng**, «Farq 0 / O'zgarish 0.0%» yashil rangda chiqadi.

Ustiga-ustak: `summarySheet` `dropPointInTime` bilan gate qilinmagan, ya'ni **o'tgan oy exportida bugungi qarz o'tgan oyning raqami sifatida** chop etiladi — Balans/Qarzdorlar varaqlari aynan shu sabab olib tashlangan bo'lsa ham.

### H10 — «Tekshiruv» balans aylanmasi live holatga bog'langan
`getReconciliation` da `closing` = sana chegarasi yo'q `student.aggregate` ([reports-financial.service.ts:1440-1443](../server/src/reports/reports-financial.service.ts#L1440)), `opening = closing − activityTotal`. Davr o'tmishda bo'lsa **ikkala chegara ham** `Σ(davrdan keyingi tranzaksiyalar)` ga siljigan bo'ladi. Ya'ni 29-iyulda yasalgan iyun hisobotida iyulning balansi «iyun oxiri» deb yozilgan.

Xuddi shu faylda to'g'ri usul bor va ishlatiladi (`balanceAsOf = balance − Σ tx after monthEnd`, `getMonthlyDebtRecovery`).

### H11 — Excel ekranga zid izohlar
Uch joyda «Ekrandagi dashboard bilan bir xil» deb yozilgan, lekin PR #352 dan keyin ekran boshqa asosga o'tdi:
[reports-excel.sheets.ts:110](../server/src/reports/reports-excel.sheets.ts#L110), `sheets.ts:131`, [reports-excel.comparison-sheets.ts:84](../server/src/reports/reports-excel.comparison-sheets.ts#L84).

Eng zarari «Taqqoslash» varag'ida: u yerda **yagona** «Sof foyda» qatori eski kassa asosida, ogohlantirishsiz, kanonik variant esa umuman berilmagan. Ya'ni oylar bo'yicha foyda taqqoslash eskirgan asosda qilinadi.
Diqqat: [reports-excel.service.spec.ts:413](../server/src/reports/reports-excel.service.spec.ts#L413) hozirgi eskirgan xatti-harakatni test qilib «qulflab» turadi — tuzatishda test ham yangilanadi.

### H12 — KPI varag'idagi davomat izohi formulaga zid
[reports-overview.service.ts:120](../server/src/reports/reports-overview.service.ts#L120) `averageAttendance = (PRESENT+LATE) / Σ(barcha status)` — ya'ni EXCUSED **maxrajda qoladi**. Excel esa [operational-sheets.ts:100](../server/src/reports/reports-excel.operational-sheets.ts#L100) da «sababli (EXCUSED) hisobga olinmagan» deb yozadi — aynan teskarisi.

Boshqa hamma joy EXCUSED ni chiqaradi (attendance-analytics, «Taqqoslash» varag'i, Telegram). Bitta workbookda **bir xil nomli ikki qator, bir xil izoh, boshqa raqam**.

**Prod (iyul 2026):** PRESENT 3947, ABSENT 958, EXCUSED 73, LATE 0. KPI varag'i `3947/4978 = 79%`, izohi va'da qilgan formula `3947/4905 = 80%`. Farq ~1 foiz punkt va EXCUSED ulushiga qarab o'sadi (EXCUSED har 1% ≈ 0.8 pp).

Ta'sir doirasi: KPI varag'i va `GET /reports/kpis` — hech bir web sahifa bu raqamni ko'rsatmaydi. Lekin `ATTENDANCE_LOW_PCT = 75` bayrog'i va 🟡 svetofor EXCUSED-siz raqamdan yuradi, ya'ni bayroq o'zi jamlab beradigan KPI qatoriga zid bo'lishi mumkin.

---

## 8. Filial qamrovi

### H13 — `getFinancialOverview` da 3 ta ko'rsatkich filialni hisobga olmaydi
[reports-financial.service.ts:280-289](../server/src/reports/reports-financial.service.ts#L280) `receivables`, `:356-363` `debtors`, `:365-369` `activeStudents` — filial predikati yo'q. Yonidagi `newStudents` (`:405-407`) esa aynan shu predikatni ishlatadi.

Header switcher'da «barcha filiallar» varianti yo'q ([use-branch-switcher.ts:46](../client/src/hooks/use-branch-switcher.ts#L46) `data[0]` ga tushadi), ya'ni `branchId` **doim yuboriladi**.

**Prod o'lchov:** Namangan (0 o'quvchi) tanlansa — «Jami qarz 27 748 684 so'm», «Qarzdor o'quvchilar 177 ta», Excel «Faol o'quvchilar 407». Haqiqiy: 0 / 0 / 0.
Xuddi shu kartaning ichidagi «Hisobdan chiqarilgan» qatori esa to'g'ri filial bo'yicha 0 ko'rsatadi.
Va `/payments/debtors` sahifasi to'g'ri filial bo'yicha hisoblaydi ([payments-debtors.service.ts:61-74](../server/src/payments/payments-debtors.service.ts#L61)) → **ikki sahifa bir xil «Jami qarz» uchun boshqa raqam beradi**.

### H14 — Filial direktorining `UserBranch` qamrovi moliya endpointlariga qo'llanmaydi
[reports.controller.ts:154-161](../server/src/reports/reports.controller.ts#L154) (`financial-overview`), `:121` (`financial-trend`), `:134-138` (`income-month-attribution`) faqat `query.branchId` ni uzatadi; `getFinancialOverview` da `branchIds` parametri umuman yo'q.
`/branches` esa rol bo'yicha qamrovlanmagan ([branches.service.ts:20-39](../server/src/branches/branches.service.ts#L20)), ya'ni BD switcher'da **barcha filiallarni** ko'radi va default eng eskisiga tushadi.

**Prod o'lchov:** BD #10768 (mainBranch=2) default switcher (#1 Farg'ona) bilan: overview Tushum = 162 127 987, Excel «Daromad»/«Foyda va zarar» Jami daromad = 0; overview «Kechirilgan qarz» = 0, Farg'onaning haqiqiysi = 966 657 (7 ta).

### H15 — «Xarajatlar» sahifasi va Excel varag'i boshqa qoida bilan qamrovlanadi
- `ExpensesService.buildWhere` ([expenses.service.ts:141](../server/src/expenses/expenses.service.ts#L141)) — ro'yxat, kartalar, PDF — **faqat** `query.branchId` bo'yicha. Controller chaqiruvchining qamrovini umuman uzatmaydi.
- `exportAllForReport` ([expenses.service.ts:260](../server/src/expenses/expenses.service.ts#L260)) esa `branchWhere(query)` ishlatadi, ya'ni BD ning `branchIds` i **ustun qo'yiladi** va export dialogida tanlangan filial jimgina e'tiborsiz qoldiriladi.

**Prod o'lchov (iyul 2026):** BD #10768 (Namangan) `/payments/expenses` da **20 377 000** so'm ko'radi (PDF ham), o'sha davr uchun workbook «Xarajatlar» varag'i esa **0**. Butun tarix: 168 668 000 vs 0 (195 xarajatning hammasi 1-filialda).

### H16 — Bitta workbook ichida filial qamrovi aralash (BD uchun)
[reports.controller.ts:383-393](../server/src/reports/reports.controller.ts#L383) BD qamrovini `branchIds` ga soladi, lekin Excel service'da u faqat `branchWhere` asosidagi chaqiruvlarga (P&L, To'lovlar, Xarajatlar, Balans) va `debtorBranchIds` ga yetadi. `getFinancialOverview`, `getSalaryMonthly`, `getFinancialTrend`, `getPeriodOutflows`, `getRecognizedRevenue` faqat `query.branchId` oladi (web client uni default yubormaydi), `getReconciliation` esa filialni umuman qabul qilmaydi — ya'ni **«Tekshiruv» varag'i doim company-wide**.

**Prod o'lchov:** BD #10768 default export — «Foyda va zarar» daromad = 0, «Asosiy xulosa» daromad = 162 127 987, «Oyliklar» = company-wide. Bitta faylda uch xil qamrov.

### H17 — «Yillar kesimida» varag'i pulni filialdan, sanoqni kompaniyadan oladi
[reports-financial.service.ts:951-957](../server/src/reports/reports-financial.service.ts#L951) `getYearlyTrend` da `newStudents` va `payerCount` company-wide, tushum/xarajat/marketing esa filial bo'yicha. [comparison-sheets.ts:210-216](../server/src/reports/reports-excel.comparison-sheets.ts#L210) ikkisini bir varaqqa chiqaradi.

**Prod:** `branchId=2` bilan 2026 yil — Tushum/Chiqim/Foyda = 0, lekin «Yangi o'quvchilar 715», «To'lov qilganlar 551».

---

## 8.5. O'tmish raqamlari keyin o'zgaradi (eng chalkash sinf)

Bu topilmalar bir xil sababdan: hisobot o'tgan davr haqida, lekin **bugungi holatdan** o'qiydi.

### H18 — `/payments/debt-history` da joriy oy qatori «muzlagan» emas
[reports-financial.service.ts:1053](../server/src/reports/reports-financial.service.ts#L1053) oylar ro'yxatiga **joriy oyni ham** qo'shadi. Joriy oy uchun `tashkentMonthEndBoundary` kelasi oyning boshini qaytaradi (kelajakdagi timestamp), shuning uchun:
- `closingDebt` = **live** `Σ|Student.balance|` — har to'lovda o'zgaradi
- `recovered` = 0, `writtenOff` = 0, `remaining` = closingDebt, **`recoveryRate` = 0.0%** — har kuni, tuzilishi bo'yicha

Sahifa esa ([debt-history-view.tsx:145](../client/src/components/payments/debt-history-view.tsx#L145)) va Excel izohi ([detail-sheets.ts:392](../server/src/reports/reports-excel.detail-sheets.ts#L392)) **shartsiz** «bu raqam muzlagan, o'zgarmaydi» deb yozadi. Va 0.0% «Undirish %» ustunidagi rang shkalasini ham buzadi.

Kodda kerakli vosita allaqachon bor — 2026-05 qatoridagi «o'tish davri» belgisi. Joriy oy qatoriga «hali yopilmagan» belgisi kerak yoki qator umuman chiqmasin.

### H19 — Ustoz oyligidagi `gap` bugungi kurs narxidan hisoblanadi
`covered` muzlatilgan (`SalaryAccrual.amount` bazada), `gap` esa **har chaqiruvda qaytadan** hisoblanadi guruhning **hozirgi** `Course.price` va `lessonPaymentCount` idan ([salary-monthly.service.ts:209](../server/src/salary/salary-monthly.service.ts#L209) va `:436`). `CoursePriceSnapshot` ga qaramaydi.

**Prod o'lchov:** #041 va #016 guruhlari ~2026-07-22 da 500 000 so'mlik «Standart B2» kursiga o'tkazilgan. Natijada 1–21 iyul darslarining `covered` qismi 33 333 da muzlatilgan, xuddi shu sanalardagi qoplanmagan darslar esa bugungi 41 667 bo'yicha gapga qo'shilgan. **Iyul gap = 14 346 570 (live narx) vs 14 242 395 (darsning o'z narxi) → +104 175 so'm oshiq**, 25 dars birligida.

Bu farq `fullDeserved` → Foyda kartasi → Excel «Sof foyda» → Telegram oylik blokiga o'zgarmagan holda o'tadi — daromad tomoni esa muzlatilgan narxdan hisoblanadi ([reports-financial.service.ts:521-527](../server/src/reports/reports-financial.service.ts#L521)). Yopilgan oylar (2026-07 dan oldin) qimirlamaydi — `showGap = isTopUpMonth(month)` ularni nolga tushiradi.

### H20 — `/reports/activity` o'tgan davrdan yopilgan guruhlarni yo'q qiladi (eng katta farq)
[reports-center-activity.service.ts:155-161](../server/src/reports/reports-center-activity.service.ts#L155) guruh olamini **live** holatdan quradi (`statusEnum in (ACTIVE, FORMING)`, `deletedAt: null`). SCD2 snapshotlar faqat shu filtrdan o'tgan guruhlar uchun tarixni tiklaydi. Keyinchalik pauza qilingan / tugallangan / bekor qilingan / arxivlangan guruh **har bir o'tgan davrdan yo'qoladi** — ya'ni bir xil iyun raqami vaqt o'tishi bilan kichrayib boradi.

**Prod o'lchov (iyun 2026):** iyunda dars o'tgani aniq bo'lgan **14 guruh** bugun hisobga kirmaydi → 1 027.6 soatdan 356.0 soat yo'qolgan. «Vaqt bandligi» **25.7%** ko'rsatiladi, haqiqiysi **39.4%** (band soatlarning 35% i yo'q). «Bo'sh vaqtlar» xuddi shu 356 soatga oshiq.
Guruh→xona bog'lanishi ham live (`g.roomId`, snapshotda roomId maydoni yo'q): prod'da 21 marta xona ko'chirilgan — masalan #4 guruh 06.07.2026 da ko'chgan, uning 103 iyun darsi endi **yangi xonaga** yozilgan.
Xona yarmi hozircha latent (6 xona ham ACTIVE, soft-delete yo'q).

### H21 — Xona bandligi guruh vaqti tahrirlansa o'tmishga qarab siljiydi
[reports-center-activity.service.ts:311](../server/src/reports/reports-center-activity.service.ts#L311) `sumDistinctScheduleHours(roomGroups)` — `lessonStartTime`/`lessonEndTime`/`exactDays` ni **live** `Group` qatoridan o'qiydi, ikki qator yuqorida ishlatilgan `scheduleOn(..., asOfDate, snaps)` dan foydalanmaydi (`snaps` helperga uzatilmagan).

**Prod o'lchov:** iyun 2026 `utilizationPct` **28.4%** ko'rsatiladi, point-in-time **27.9%** (173 vs 170 soat/hafta). May: 22.8% vs 22.6%. 32 aktiv guruhning 9 tasida allaqachon yopilgan `GroupScheduleSnapshot` bor (#021 hatto `exactDays` ni Se/Pay/Sha → Du/Chor/Ju ga o'zgartirgan). Joriy oy ta'sirlanmaydi.

---

## 9. Boshqa tasdiqlangan holatlar

### H22 — Kartalar bir qatorda, asosi boshqa
«Tushumlar»/«Chiqimlar» — tanlangan **sana oralig'i** bo'yicha. «Foyda»/«Ustoz oyliklari» — `startDate.slice(0,7)` dan olingan **butun oy** bo'yicha ([reports.controller.ts:188-190](../server/src/reports/reports.controller.ts#L188)).
- 1–15 iyul → tushum yarim oy, foyda to'liq oy
- 15.06–15.07 → foyda **iyunni** ko'rsatadi

### H23 — Bitta davrga ikkita oylik yozuvi (eski ma'lumot)
Iyun davri (`2026-05-31T19:00Z`) uchun 6 ustozga 2 ta `SalaryPayment`:
- 1-chisi cron: `2026-06-30T21:00Z` (= 01.07 02:00 Toshkent)
- 2-chisi qo'lda: `2026-07-01T05:37Z` (= 10:37 Toshkent) — jami **764 743 so'm**

Hozirgi kodda merge-idempotentlik bor ([salary-calculation.service.ts:151-183](../server/src/salary/salary-calculation.service.ts#L151)), ya'ni yangi dublikat yaratilmaydi. Lekin `getMonthly` ikkisini **qo'shib** ko'rsatadi (jami to'g'ri), `id` va `status` esa oxirgi qatordan olinadi ([salary-monthly.service.ts:376-385](../server/src/salary/salary-monthly.service.ts#L376)) → breakdown oynasi faqat bittasini ochadi, qatordagi summaga mos kelmaydi.

### H24 — `salary.pending` cheksiz
[reports-financial.service.ts:303](../server/src/reports/reports-financial.service.ts#L303) — `salaryAccrual.aggregate({ where: { companyId, salaryPaymentId: null } })`, sana filtri **umuman yo'q** (butun tarix). Ekranda ko'rsatilmayapti, lekin API javobida bor.

### H25 — Marketing ROI formulasi ROI emas
[reports-financial.service.ts:460-463](../server/src/reports/reports-financial.service.ts#L460): `(jami tushum − marketing) / marketing × 100`. Butun kompaniya tushumini marketing xarajatiga bo'ladi → minglab foiz.

### H26 — Qarz ▲/▼ qaysi kundan noaniq
Yakshanba va bayramlarda kunlik hisobot yuborilmaydi va snapshot yozilmaydi. `findFirst({ date: { lt: today }, orderBy: desc })` eng oxirgi mavjud snapshotni oladi, ya'ni dushanba kuni «▲» 3 kunlik o'zgarishni ko'rsatadi — xabarda esa «kechagi kundan» ma'nosi bor.

### H27 — Eskirgan tooltip
[payments-overview.tsx:386-399](../client/src/components/payments/payments-overview.tsx#L386) CEO ga «Oylik barcha filiallar bo'yicha (Excel kabi)» deb aytadi. `c490d68` dan keyin karta filial bo'yicha qamrovlangan — bu izoh endi Excel'ni ta'riflaydi, kartani emas.

### H28 — Telegram lid sanoqlari arxivlangan lidlarni ham qo'shadi
[telegram-group-daily-report.service.ts:166-174](../server/src/telegram-groups/telegram-group-daily-report.service.ts#L166) ikki `Lead` so'rovida ham `deletedAt: null` yo'q. Web va Excel'ning hamma lid yuzasi esa uni qo'llaydi. Lidni «o'chirish» = LOST + sabab + `deletedAt`, bo'lim o'chirilsa ichidagi lidlar ham arxivlanadi — ya'ni arxivlangan lidlarni **faqat Telegram** sanaydi.

**Prod (2026-07-30):** 249 liddan 195 tasi arxivlangan (78%), 129 tasi LOST.
- Bir kunda yaratilib-arxivlangan: 8 lid, 7 hisobot kunida (o'sha kechalarning «Yangi lidlar» qatori 1–2 ga oshiq edi)
- Kunlik qatorlar yig'indisi vs Excel «Lidlar» voronkasi: may 10 vs 0, iyun 133 vs 5, **iyul 106 vs 49**
- LOST lidlar voronkada umuman ko'rinmaydi (129 ta bo'lsa ham)

### H29 — Lid voronkasi oynasi 5 soat siljigan
[reports-overview.service.ts:317-321](../server/src/reports/reports-overview.service.ts#L317) `getLeadAnalytics` `Lead.createdAt` (TIMESTAMP) ni sanaviy parse bilan cheklaydi: `endDate 00:00Z` = `endDate 05:00 Toshkent`. Ya'ni oxirgi kunning **butun ish kuni** tushib qoladi. Reports'dagi boshqa hamma timestamp chegarasi to'g'ri `+ 'T23:59:59.999Z'` qo'shadi.

**Ta'sir:** iyul exporti amalda `[01.07 05:00 → 31.07 05:00]` ni so'raydi — 31 kun emas, 30 kun + 5 soat. Har oylik workbook voronkani bir ish kuniga kam ko'rsatadi. Bu H28 bilan birga Telegram va Excel lid raqamlarining farqini kuchaytiradi.

### H30 — Excel «Shu oy ketganlar (churn)» — sanoq emas, ikki xil narsaning yig'indisi
[reports-overview.service.ts:141](../server/src/reports/reports-overview.service.ts#L141): `expelledThisMonth + droppedThisMonth` — **o'quvchi sanog'i** (status EXPELLED) ustiga **enrollment qatori sanog'i** (status DROPPED, `distinct` yo'q) qo'shiladi. `StatusCascadeService` chetlatilgan o'quvchining enrollmentlarini ham DROPPED qiladi va bir xil `statusChangedAt` bosadi → har chetlatish **ikki tomonga** tushadi.

**Prod (iyul 2026):** Excel `33 + 125 = 158` yozadi, haqiqatda **117** kishi ketgan → **+41 kishi, +35% oshiq**. (33 chetlatilganning 31 tasi 125 ning ichida ikki marta; 125 qator 115 kishiga to'g'ri keladi.)

### H31 — Qarz «Undirildi» drill-down'i bekor qilingan to'lovlarni manfiy qator qilib ko'rsatadi
`reconstructMonthCohort` (`:1166-1187`) `reversedAt` ni filtrlamaydi — original va bekor qatori bir-birini yo'qqa chiqaradi. `getMonthDebtDetail` (`:1319`, `:1339`) esa `reversedAt: null` qo'shadi → bekor qilingan **originalni tashlab**, manfiy summali **bekor qatorini qoldiradi**.

**Prod (2026-07-30):** 5 ta fantom manfiy qator. May 2026 ro'yxati/Excel «Jami» = **188 492 654**, haqiqiysi **189 492 654** (1 000 000 kam; qatorlar −200 000 / −400 000 / −400 000). Iyun = 77 835 987 vs 78 435 987 (600 000 kam). Asosiy «Undirildi» ustuni ta'sirlanmagan (per-student cap ushlab qoladi).

### H32 — `/reports/payment-reports` «o'tgan oyga nisbatan» — aslida o'tgan oy emas
[reports-payments.service.ts:172-174](../server/src/reports/reports-payments.service.ts#L172) baseline'ni millisekund bo'yicha teng uzunlikda orqaga suradi, kartalar esa «o'tgan oyga nisbatan» deb yozadi ([payment-report-card.tsx:60-62](../client/src/components/reports/payment-reports/payment-report-card.tsx#L60)). 31 kunlik oy uchun baseline **oldingi oydan oldingiga** yetib boradi (iyul 2026 → 31.05…30.06).

**Prod:** baseline = 171 983 329, haqiqiy iyun = 171 533 329 (+450 000, 31.05 dagi 2 to'lov) → kartalar **−6%** ko'rsatadi, «o'tgan oyga nisbatan» esa **−5%**. Xuddi shu kartaning drill-down grafigi to'g'ri kalendar oylardan qurilgani uchun uning iyun ustuni foizga hech qachon mos kelmaydi.
Excel tomoni **to'g'ri** — u ustunni aniq oyna bilan («31.05.2026—30.06.2026») va «oldingi teng davr» izohi bilan belgilaydi.

---

## 10. Rad etilgan / latent — quvmang

13 ta da'vo adversarial tekshiruvda **rad etildi yoki latent** deb topildi — kodda mavjud, lekin bugun noto'g'ri raqam bermaydi:

| Da'vo | Nega latent / rad etilgan |
|---|---|
| Export popover default `"all"`, kartalar `selectedBranch` | Butun moliya ma'lumoti 1-filialda (36 202 tranzaksiya, 195 xarajat, 56 guruh) → farq **0 so'm**. Muqovada «Barcha filiallar» yozilgan. Namangan pul kirita boshlagach live bo'ladi. |
| `Payment.branchId` nullable → `getPerBranchSummary` filialsizni tashlab yuboradi | Prod'da filialsiz to'lov **0 ta** (1352 dan). D5 invarianti filialsiz o'quvchini rad etadi. |
| `getFinancialTrend` payer groupBy + newStudents filialsiz | Latent, hozir 0. |
| `salaryPayment`/`salaryAccrual` aggregatlari filialsiz | `SalaryPayment` da `branchId` ustuni yo'q — ikki tomon ham company-wide, ya'ni simmetrik. |
| `salary.paid` company-wide | Latent, hozir 0. |
| Telegram avansni xarajat deb hisoblaydi, web esa yo'q | `getProfitLoss` ham avansni tannarxga qo'shadi — asos bir xil. |
| Web export o'tgan davrda live varaqlarni saqlaydi, bot tashlaydi | Bu **ataylab** (`dropPointInTime` faqat bot yo'lida) — hujjatlashtirilgan. |
| «Markaz qo'shimchasi» nomi ikki xil ma'noda | Nom ortiqcha yuklangan, lekin raqamlar bir xil. |
| Ustoz o'zgargan guruhda oylik hozirgi rostedan olinadi | Kod xavfi bor, lekin prod'da hozir farq bermaydi. |
| KPI varag'i davrni e'tiborsiz qoldiradi (doim joriy oy) | Varaqning o'zi izohda buni **ochiq yozadi**. |
| Trend oynalari server-local kalendar | Railway UTC + Toshkent UTC+5 → oy chegarasi mos tushadi, hozir farq yo'q. |
| `cutoffDate` `@db.Date` dan keladi (departed/teacher-changes) | Yarim real, latent. |
| `reports-departed-reasons` oxirgi chegarasi process-TZ ga bog'liq | Faqat `setHours` qatorida, hozir farq bermaydi. |

---

## 11. Tavsiya qilingan tartib

| # | Ish | Nima tuzaladi | Og'irligi |
|---|---|---|---|
| ~~**P1**~~ | ~~`computePeriodBounds` ni ustun turiga moslash (H3)~~ | ✅ **BAJARILDI 2026-07-30** — iyul oynasi 01.07 dan boshlanadi, tizim raqami 90 824 433 → 89 005 090 (−1 819 343). H7 ham tuzatildi (PR #375). | — |
| ~~**P2**~~ | ~~Excel ko'p oylik export (H6)~~ | ✅ **BAJARILDI 2026-07-30** — foyda oyoqlari davrdagi oylar bo'yicha yig'iladi (har oy o'z top-up asosi bilan), floordan oldingi oylar tashlanadi. `reports-excel.month-range.ts` | — |
| ~~**P3**~~ | ~~Telegramdagi «% yig'ildi» ni ma'noli formulaga o'tkazish (H1)~~ | ✅ **BAJARILDI 2026-08-04** — yagona formula `getIncomeMonthAttribution.collectionPct` = `shu davr uchun tushum ÷ shu davrda o'tilgan darslar qiymati`. Telegram ham, /overview paneli ham **shu bitta metodni** chaqiradi. Prognozdan foiz butunlay olib tashlandi (u endi shunchaki «taxminiy reja» qatori). Prod: iyun **81%**, iyul **82%**, avgust (4 kun) 50% — avval ikkala oy ham 115% edi. Yo'l-yo'lakay H33 (pastda) tuzatildi. | — |
| ~~**P4**~~ | ~~«Sof foyda» ni bitta manbaga keltirish (H5)~~ | ✅ **BAJARILDI 2026-07-30** — Telegram kunlik + `rm:cfin` kanonik manbaga o'tdi (xato bo'lsa «Kassa harakati» deb rostgo'y yorliq); trend grafigi ataylab kassa asosida qoldi, lekin «Kassa oqimi» deb qayta nomlandi | — |
| **P5** | Prognozni kalendar bo'yicha hisoblash + oy boshida muzlatish (H2) | 11% xato; «dinamik» savol | O'rta-katta (yangi jadval) |
| **P6** | Barcha davr oynalarini Toshkent helperlariga o'tkazish; brauzer sana hisoblamasin (H4) | Mintaqa muammosi, oy chegarasi | O'rta |
| ~~**P7**~~ | ~~Filial qamrovini bir xillashtirish (H7, H8, H13, H14, H15, H16, H17)~~ | ✅ **BAJARILDI 2026-08-02** — bitta `ReportBranchIds` qamrovi (`common/finance/report-branch-scope.ts`) HTTP chegarasida hisoblanadi va hamma joyga uzatiladi; `branchId`+`branchIds` juftligi va `branchWhere()` o'chirildi. Prod: Namangan 28 453 233 → **0**, Σ(filiallar) = jami (7/7 ko'rsatkich). Qo'riqchi: `reports-branch-scope-coverage.spec.ts` | — |
| **P8** | «O'tmish o'zgaradi» sinfi (H18, H19, H20, H21) — snapshot/frozen manbaga o'tkazish | `/reports/activity` iyun bandligi 25.7% → 39.4%; debt-history joriy oy qatori; gap narxi | O'rta-katta |
| **P9** | Lid sanoqlari (H28, H29) — `deletedAt: null` + timestamp chegarasi | Telegram 106 vs Excel 49 | Kichik |
| **P10** | Excel izohlarini tuzatish (H11), KPI davomat (H12), churn sanog'i (H30), «Asosiy xulosa» snapshot qatorlari (H9), Tekshiruv roll-forward (H10), qarz drill-down reversal (H31), payment-reports baseline (H32), kartalar asosi (H22) | Kichik-kichik chalkashliklar | Kichik |

---

## 12. Tekshirish skriptlari

Barchasi `server/scripts/` da, **faqat o'qiydi**, hech narsa yozmaydi. PROD'ga `railway run` bilan tushadi:

```bash
cd server
railway run npx ts-node scripts/diag-collection-pct.ts            # Telegram vs /overview tushum oynasi + prognoz + foiz
railway run npx ts-node scripts/diag-report-mismatch.ts           # atributsiya (83%) + prognoz vs real + o'quvchi oqimi + exactDays*4
railway run npx ts-node scripts/diag-true-collection-rate.ts      # ma'noli yig'im % + kalendar bo'yicha reja
railway run npx ts-node scripts/diag-duplicate-salary-payments.ts # bir davrda >1 SalaryPayment
railway run npx ts-node scripts/audit-boundary-probe.ts           # 30.06 ikki davrda ekanini qat'iy isbotlaydi
railway run npx ts-node scripts/audit-july-clean.ts               # tizim raqami vs sof 01.07… (30.06 farqi)
```

Audit transcripti (agentlarning to'liq mulohazasi):
`~/.claude/projects/-Users-a1111-Desktop-daf-erp-system/eef17755-6f35-404f-9e37-f7179e36bba7/subagents/workflows/wf_284a130a-77a/`
