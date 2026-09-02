# Oylik to'lov tizimi — dizayn

**Sana:** 2026-09-02
**Holat:** tasdiqlangan, reja yozilmagan
**Muallif:** brainstorming sessiyasi (CEO bilan)

---

## 1. Maqsad

Markaz 12 talik dars paketi asosidagi to'lovdan **kalendar oy** asosidagi
to'lovga o'tadi: 01.09–30.09 uchun 450 000 so'm (Standart) yoki 740 000 so'm
(Intensive). To'lov turlari kelajakda kengayadi, shuning uchun tizim bitta
markaziy sozlamalar panelidan boshqariladi.

Ikki mustaqil natija:

1. **Oylik to'lov modeli** — narx endi darsga emas, oyga bog'lanadi.
2. **`/settings` markaziy paneli** — kengayadigan bo'limlar ro'yxati; birinchi
   bosqichda faqat "To'lov" bo'limi to'ldiriladi.

---

## 2. Hozirgi holat (prod, 02.09.2026)

`server/scripts/_probe-monthly-cutover.ts` va `_probe-sep-lessoncount.ts`
(faqat o'qish) natijalari:

| Ko'rsatkich | Qiymat |
|---|---|
| Aktiv yozilish | 370 (370 noyob o'quvchi, har biri bitta guruhda) |
| Aktiv guruh | 47 (363 yozilish ACTIVE, 7 PAUSED guruhda) |
| Oldindan to'langan darsi borlar | 107 o'quvchi, 444 dars ≈ **16 546 494 so'm** |
| Musbat balans | 143 o'quvchi → 5 479 625 so'm |
| Manfiy balans (qarz) | 141 o'quvchi → −14 936 608 so'm |
| Nol balans | 86 o'quvchi |
| Sentabrdagi davomat | faqat **02.09**: 81 PRESENT, 32 ABSENT, 1 EXCUSED |
| Sentabrda yechilgan pul | `LESSON_DEDUCTION` 70 ta → **3 661 160 so'm** |
| Sentabrda o'qituvchi haqi | `SALARY_ACCRUAL` 52 ta → 957 612 so'm |

### Kurslar

| Kurs | Narx | `lessonPaymentCount` | 1 dars | Guruh |
|---|---|---|---|---|
| Standart | 450 000 | 12 | 37 500 | 51 |
| Intensive | 740 000 | **20** | 37 000 | 4 |
| KKB Vorbereitung | 600 000 | **19** | 31 579 | 2 |
| Standart B2 | 500 000 | 12 | 41 667 | 5 |
| Standart B1 | 475 000 | 12 | 39 583 | 1 |
| Vorbereitung | 500 000 | 12 | 41 667 | 1 |
| B1 Telc | 400 000 | 12 | 33 333 | 1 |
| Standart (filial 2) | 400 000 | 12 | 33 333 | 7 |

### Asosiy topilma

**12 talik sikl allaqachon amalda bir oy.** Sentabr 2026 da:

- 45 guruhda **13 ta dars** (haftada 3 kun) — paket 12
- 1 guruhda 18 ta — paket 19
- 1 guruhda 22 ta (Intensive, haftada 5 kun) — paket 20

Farq 1–2 dars. O'tish yangi iqtisodiyot emas, mavjud iqtisodiyotni
kalendarga bog'lash.

### Hozirgi mexanizm

- Narx: `Course.price` / `Course.lessonPaymentCount`
  (`server/src/billing/lesson-price.ts` — oxirgi dars qoldiqni yutadi)
- To'lov balansga tushadi, keyin paket oldindan yechiladi
  (`LessonDeductionMode`: `FULL_CYCLE` / `PARTIAL` / `SINGLE_UNCOVERED`)
- `Enrollment.prepaidLessonsRemaining` — qolgan oldindan to'langan darslar
- `Enrollment.cycleLessonIndex` — sikl ichidagi o'rin
- Davomat: `PRESENT` / `LATE` / `ABSENT` — uchalasi ham to'lanadi; `EXCUSED` bepul
- O'qituvchi haqi: `salary-accrual.service.ts:197` →
  `amount = round(perLessonCost × foiz / 100)` — **dars narxining foizi**

---

## 3. Qabul qilingan qarorlar

| # | Savol | Qaror |
|---|---|---|
| Q1 | Pul qanday yechiladi | **Oy boshida bitta yechim** — 1-sanada butun oy hisoblanadi |
| Q2 | O'rtada qo'shilgan | **Qolgan darslar soniga proratsiya** — 450 000 × 5/13 |
| Q3 | Uzrli dars | Pul qaytmaydi; **dars krediti** yoziladi |
| Q4 | Kredit qanday ishlatiladi | **Keyingi oy to'lovi kamayadi** (450 000 − 2×34 615 = 380 770) |
| Q5 | To'lov turi qayerda | **Kurs kartochkasida** (guruh/o'quvchi ustidan yozish 1-bosqichda yo'q) |
| Q6 | Qarz qachondan | **Darhol** — 1-sanada to'lanmagani qarz; oy davomida kamayishi yig'im ko'rsatkichi |
| Q7 | O'tish sanasi | **01.09.2026**, orqaga qaytarib |
| Q8 | Telegram | O'tish kuni **jim**, ertasidan odatdagidek |
| Q9 | Sozlamalar qamrovi | Kengayadigan panel; 1-bosqichda faqat "To'lov" bo'limi |
| Q10 | Qarzdorlar ro'yxati | **Qaysi oylar to'lanmagan** + to'lovsiz kirilgan darslar soni |

---

## 4. Ma'lumot modeli

### 4.1 `Course.paymentModel`

```prisma
enum PaymentModel {
  LESSON_PACK  // hozirgi: price / lessonPaymentCount
  MONTHLY      // yangi: price = bir oy narxi
}

model Course {
  // ...
  paymentModel PaymentModel @default(LESSON_PACK)
}
```

`MONTHLY` da `price` bir oy narxi, `lessonPaymentCount` **ishlatilmaydi**
(o'chirilmaydi — `LESSON_PACK` kurslar uchun kerak).

Ikki model yonma-yon yashaydi: `LESSON_PACK` yo'li tegilmaydi.

### 4.2 `EnrollmentMonthlyCharge`

Har yozilish, har oy uchun bitta qator. Bu **oylik modelning yagona
haqiqat manbasi** — narx, dars soni va kredit shu yerda muzlatiladi.

```prisma
model EnrollmentMonthlyCharge {
  id           String   @id @default(uuid())
  enrollmentId String
  studentId    Int
  groupId      String
  branchId     Int
  companyId    Int

  periodYear   Int      // 2026
  periodMonth  Int      // 9

  // Muzlatilgan qiymatlar — jadval keyin o'zgarsa ham qimirlamaydi
  plannedLessons Int    // o'sha oyda guruhda rejalashtirilgan dars soni (13)
  perLessonCost  Int    // round(monthlyPrice / plannedLessons) = 34 615
  monthlyPrice   Int    // 450 000 — kurs narxi snapshot

  coveredLessons Int    // o'quvchi to'laydigan dars soni (o'rtada kelsa 5)
  creditLessons  Int    @default(0)  // o'tgan oydan kelgan uzrli kredit
  creditAmount   Int    @default(0)
  chargedAmount  Int    // balansdan yechilgan yakuniy summa

  excusedLessons Int    @default(0)  // oy davomida to'planadi → keyingi oy krediti

  status        MonthlyChargeStatus @default(CHARGED)
  transactionId String?             // ledger qatori

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([enrollmentId, periodYear, periodMonth])
  @@index([studentId, periodYear, periodMonth])
  @@index([groupId, periodYear, periodMonth])
  @@index([branchId, periodYear, periodMonth])
}

enum MonthlyChargeStatus {
  CHARGED
  REVERSED
}
```

**Nega muzlatiladi:** dars jadvali oy o'rtasida o'zgarsa (dars ko'chirildi,
bayram qo'shildi), o'quvchining hisobi va o'qituvchining haqi qayta
hisoblanmasligi kerak. Bu `moliya` bo'yicha allaqachon o'rnashgan
amaliyot — `CoursePriceSnapshot` va `SalaryAccrual.perLessonCost` xuddi
shu sababdan snapshot saqlaydi.

### 4.3 `plannedLessons` qanday hisoblanadi

```
Group.exactDays × oy kunlari
  − Holiday jadvalidagi kunlar
  − LessonCancellation bilan bekor qilingan kunlar
```

Hisoblash oy boshida bir marta bajariladi va muzlatiladi.

### 4.4 `Setting`

```prisma
model Setting {
  id        String   @id @default(uuid())
  companyId Int
  branchId  Int?     // null = kompaniya darajasida
  key       String   // "payment.defaultModel", "payment.excusedCreditEnabled", ...
  value     Json
  updatedById Int?
  updatedAt   DateTime @updatedAt

  @@unique([companyId, branchId, key])
  @@index([companyId, key])
}
```

Filial darajasidagi qiymat kompaniya darajasidagini ustidan yozadi.
`SettingsService` kalitlarni tipli (typed) qilib o'qiydi — chaqiruvchi
`Json` bilan ishlamaydi.

### 4.5 Nima ishlatilmaydi

`MONTHLY` kurslarda `Enrollment.prepaidLessonsRemaining` va
`cycleLessonIndex` **0 da qoladi va o'qilmaydi**. Ular `LESSON_PACK`
kurslar uchun avvalgidek ishlaydi.

---

## 5. Pul oqimi

### 5.1 Oy boshida (cron, 1-sana 00:05 Toshkent)

Har **ACTIVE** yozilish uchun (ACTIVE guruhda, ACTIVE o'quvchi;
`PAUSED` guruh va `FROZEN` yozilish **chetlab o'tiladi**):

1. `plannedLessons` hisoblanadi va muzlatiladi
2. `perLessonCost = round(monthlyPrice / plannedLessons)`
3. `coveredLessons` — proratsiya (5.3)
4. `creditLessons` — o'tgan oyning `excusedLessons` i
5. `grossAmount = round(monthlyPrice × coveredLessons / plannedLessons)`
   `creditAmount = min(creditLessons × perLessonCost, grossAmount)`
   `chargedAmount = grossAmount − creditAmount`
   Kredit oy hisobidan katta bo'lsa, **ortiqchasi keyingi oyga suriladi** —
   `chargedAmount` hech qachon manfiy bo'lmaydi va o'quvchi balansiga
   kutilmagan pul qo'shilmaydi.
6. Balansdan yechiladi (`TransactionsWriteService` orqali — pul yozuvi
   markazlashgan joyda qoladi)

To'liq oyni o'taydigan o'quvchida `coveredLessons == plannedLessons`, ya'ni
`grossAmount == monthlyPrice` — proratsiya faqat o'rtada qo'shilganda ishlaydi.

Balans yetmasa manfiyga tushadi. **Qarz darhol** (Q6).

Idempotent: `@@unique([enrollmentId, periodYear, periodMonth])` cron ikki
marta ishlasa ham ikkinchi yozuvni to'sadi.

### 5.2 Davomat belgilanganda (`MONTHLY` kurs)

| Holat | Balans | O'qituvchi haqi | Kredit |
|---|---|---|---|
| `PRESENT` / `LATE` / `ABSENT` | **tegilmaydi** | yoziladi (`perLessonCost` muzlatilgandan) | — |
| `EXCUSED` | tegilmaydi | yozilmaydi | `excusedLessons += 1` |
| billable → `EXCUSED` (tuzatish) | tegilmaydi | teskari qilinadi | `excusedLessons += 1` |
| `EXCUSED` → billable (tuzatish) | tegilmaydi | yoziladi | `excusedLessons −= 1` |

Ya'ni oylik modelda davomat **balansga umuman tegmaydi**. Bu
`lesson-billing.service.ts` ni jiddiy soddalashtiradi: `MONTHLY` yo'lida
prepaid, sikl indeksi va `lessonsAffordable` arifmetikasi yo'q.

### 5.3 O'rtada qo'shilgan o'quvchi

`Enrollment.startDate` dan keyin oyda qolgan dars kunlari sanaladi:

```
17.09 da qo'shildi, sentabrda qolgan 5 dars, oyda jami 13
chargedAmount = round(450 000 × 5 / 13) = 173 077
```

Yozilish yaratilganda darhol hisoblanadi (cronni kutmaydi).

### 5.4 O'rtada ketgan o'quvchi

O'tmagan darslar ulushi balansga qaytariladi:

```
20.09 da chiqdi, o'tmagan 4 dars qoldi
qaytariladi = 4 × 34 615 = 138 460
```

`EnrollmentMonthlyCharge.status = REVERSED` yoki qisman tuzatish qatori.
Mavjud qaytarish yo'llari (`refunds/`) shu hisobga bog'lanadi.

### 5.5 Jadval oy o'rtasida o'zgarsa

`plannedLessons` muzlatilgani uchun:

- **Qo'shimcha dars o'tildi** (14-dars, reja 13 edi) → o'quvchidan qo'shimcha
  pul olinmaydi (oylik qat'iy), o'qituvchiga muzlatilgan `perLessonCost`
  bo'yicha haq yoziladi. Markaz bir dars ulushini o'z zimmasiga oladi.
- **Dars bekor bo'ldi va ko'chirilmadi** → o'quvchiga pul qaytarilmaydi
  (oylik qat'iy), o'qituvchiga haq yozilmaydi.

Bu asimmetriya ataylab: oylik narx **joy va oy** uchun, dars sanog'i uchun emas.

---

## 6. O'qituvchi oyligi

`salary-accrual.service.ts` yo'li **o'zgarmaydi** — haq baribir har darsga,
dars narxining foizi sifatida yoziladi. Faqat `perLessonCost` manbasi
o'zgaradi: kurs narxidan emas, `EnrollmentMonthlyCharge.perLessonCost` dan.

Natija — kutilmagan foyda:

| | Hozir | Oylik modelda (sentabr) |
|---|---|---|
| 1 dars narxi (Standart) | 450 000 / 12 = 37 500 | 450 000 / 13 = 34 615 |
| O'qituvchining oy daromadi | dars soniga qarab suzadi | **barqaror** = 450 000 × foiz |

O'qituvchi 12 ta ham, 13 ta ham dars o'tsa, o'sha o'quvchidan bir xil pul
oladi. Markaz uchun oylik xarajat prognozi barqarorlashadi.

**Zaxira yo'l:** agar yozilishda o'sha oyning `EnrollmentMonthlyCharge` i
topilmasa (masalan cron ishlamay qolgan), accrual `monthlyPrice /
plannedLessons` ni joyida hisoblab yozadi va ogohlantirish log qiladi —
o'qituvchi hech qachon haqsiz qolmaydi.

---

## 7. Interfeys o'zgarishlari

### 7.1 O'quvchi profili nishoni

Hozir (`student-profile-card.tsx:156-166`): `balance >= 0` → 🟢,
`balance < 0` → 🔴.

Oylik modelda **1-sanada 367 ta nishon qizil bo'ladi** — rang ma'nosini
yo'qotadi. Shuning uchun rang balansning ishorasi emas, **qarzning yoshi**
bilan belgilanadi:

| Holat | Shart | Nishon |
|---|---|---|
| 🟢 To'langan | `balance >= 0` | `+120 000 balans` |
| 🟡 Kutilmoqda | qarz ≤ shu oy hisobi | `Sentabr: 450 000 kutilmoqda` |
| 🔴 Qarzdor | qarz > shu oy hisobi | `Eski qarz: 380 000` |

🔴 faqat **oldingi oy(lar)dan** qarzi borda yonadi. Oy boshida 367 ta 🟡
bo'ladi va oy davomida 🟢 ga aylanadi — yig'im jarayoni ko'z bilan
kuzatiladi.

### 7.2 Balans kartasi

`balance-summary-card.tsx` ichidagi "N ta darsga keldi × narx" arifmetikasi
oylar jadvaliga almashadi:

```
Sentabr 2026    450 000    ✓ to'langan
Oktabr  2026    380 770    ⏳ kutilmoqda   (2 ta uzrli dars chegirildi)
Noyabr  2026    450 000    ⚠ to'lanmagan
```

- `(≈ 4 dars uchun)` → `(≈ 2 oylik qarz)`
- `12 ta dars to'lanmagan` → **saqlanadi**: davomatdan hisoblanadi, narx
  modeliga bog'liq emas, admin uchun eng amaliy signal

### 7.3 Qarzdorlar ro'yxati

**Hozir:** `qarz 525 000 · 14 ta dars to'lanmagan · joriy sikl: 12 tadan 2 tasi`

**Keyin:** `qarz 830 770 · Sentabr, Oktabr to'lanmagan · to'lovsiz 21 ta darsga
kirdi · oxirgi to'lov 12.08`

`payments-debtors.service.ts` dagi `currentCycle`
(`capacity` / `coveredCount`) **yo'qoladi** — sikl tushunchasi qolmaydi.
O'rniga to'lanmagan oylar ro'yxati.

Jami qarz bitta raqam bo'lib qolaveradi (Q6), lekin yonida taqsimoti
ko'rsatiladi: `shu oy: 169.8 mln · eski qarz: 14.9 mln`.

### 7.4 Telegram

`"darslaringiz tugadi"` → `"Sentabr oyi uchun 450 000 so'm to'lov
kutilmoqda"`. Migratsiya kuni **yuborilmaydi** (Q8).

---

## 8. Sozlamalar paneli

`/settings` — chapda bo'limlar ro'yxati (iOS mantig'i), o'ngda tanlangan
bo'lim. Bo'limlar kodda ro'yxatga olinadi (`SETTINGS_SECTIONS`), keyingi
bo'limlar shu ro'yxatga qo'shiladi.

**1-bosqichda "To'lov" bo'limi:**

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `payment.defaultModel` | yangi kurs uchun standart model | `MONTHLY` |
| `payment.prorationMethod` | o'rtada qo'shilganni hisoblash | `BY_LESSONS` |
| `payment.excusedCreditEnabled` | uzrli dars krediti | `true` |
| `payment.excusedCreditMonthlyCap` | oyiga eng ko'p kredit dars | `null` (limitsiz) |
| `payment.chargeDayOfMonth` | hisoblash sanasi | `1` |
| `payment.debtGraceDays` | qarzga aylanishgacha kun | `0` (darhol) |

Kurs narxlari jadvali ham shu bo'limda ko'rsatiladi (tez ko'rish va
tahrirlash uchun), lekin manba baribir `Course` jadvali — nusxa saqlanmaydi.

Ruxsat: faqat CEO/direktor. Har o'zgarish `updatedById` bilan yoziladi.

---

## 9. Migratsiya — 01.09.2026

Bir martalik skript, `--dry-run` **majburiy birinchi ishga tushirish**.
Serializable tranzaksiya ichida, filial bo'yicha bo'lib.

1. **02.09 pul yechimlari bekor qilinadi** — 70 ta `LESSON_DEDUCTION`
   (3 661 160 so'm) uchun teskari qatorlar yoziladi.
   **Davomat qatorlariga tegilmaydi** — dars o'tgani tarixda qoladi.
   `Math.abs` ishlatilmaydi (ADR-0004 taqiqi — balans haqiqati ledgerda).
2. **Prepaid balansga qaytariladi** — 107 o'quvchi, 444 dars ≈ 16 546 494
   so'm. Mavjud `EnrollmentBillingService.refundPrepaidToBalance()`
   (`enrollment-billing.service.ts:119`) ishlatiladi — yangi arifmetika
   yozilmaydi.
3. `prepaidLessonsRemaining = 0`, `cycleLessonIndex = 0`.
4. **Kurslar `paymentModel = MONTHLY`** ga o'tkaziladi.
5. **370 yozilishga sentabr `EnrollmentMonthlyCharge`** yaratiladi va
   balansdan yechiladi (≈ 169.8 mln).
6. **02.09 `SalaryAccrual` lari** yangi `perLessonCost` bo'yicha qayta
   hisoblanadi (52 ta yozuv, jami farq ≈ 74 ming so'm).
7. **Telegram o'sha kuni jim.**

### Migratsiyadan keyin kutilayotgan holat

| | Migratsiyadan oldin | Keyin |
|---|---|---|
| Qarzdor soni | 141 | ~367 (shundan ~141 eski qarz) |
| Jami qarz | 14.9 mln | ~184.7 mln (169.8 shu oy + 14.9 eski) |
| Qulflangan prepaid | 16.5 mln | 0 |

### Tekshirish (migratsiyadan keyin darhol)

- Har o'quvchi uchun: `eskiBalans + qaytarilganPrepaid − sentabrHisobi
  == yangiBalans` — chetlashish bo'lsa migratsiya to'xtaydi
- Jami ledger yig'indisi migratsiyadan oldin va keyin farqi aynan
  `qaytarilganPrepaid − sentabrHisobi` ga teng bo'lishi kerak
- `_probe-monthly-cutover.ts` qayta ishga tushiriladi va raqamlar
  taqqoslanadi

---

## 10. Xatarlar

| Xatar | Ta'siri | Yumshatish |
|---|---|---|
| Migratsiya balansni buzadi | 370 o'quvchi | `--dry-run` majburiy; har o'quvchi uchun tenglik tekshiruvi; migratsiyadan oldin `pg_dump` |
| Ikki model yonma-yon chalkashlik keltiradi | hisobotlar | `paymentModel` bo'yicha aniq shoxlanish; `LESSON_PACK` yo'li tegilmaydi; testlar ikkala yo'lni qamraydi |
| Cron ishlamay qolsa | oy hisoblanmaydi | Idempotent unique kalit; kunlik tekshiruv — hisobi yo'q ACTIVE yozilish topilsa ogohlantirish |
| `plannedLessons` noto'g'ri | narx va o'qituvchi haqi noto'g'ri | Bayram va bekor qilingan darslar hisobga olinadi; migratsiyadan oldin 47 guruh uchun qo'lda tekshiriladi |
| 🔴 → 🟡 o'zgarishi adminlarni chalkashtiradi | kundalik ish | Panelda qisqa izoh; o'tishdan oldin adminlarga tushuntirish |

---

## 11. Bosqichlar

**1-bosqich — oylik yadro va migratsiya**
`PaymentModel`, `EnrollmentMonthlyCharge`, oy boshi cron'i, davomat
yo'lining `MONTHLY` shoxi, o'qituvchi haqi manbasi, migratsiya skripti.

**2-bosqich — sozlamalar paneli**
`Setting` jadvali, `SettingsService`, `/settings` sahifasi bo'limlar
ro'yxati bilan, "To'lov" bo'limi.

**3-bosqich — interfeys va xabarlar**
Profil nishoni uch holati, balans kartasi oylar jadvali, qarzdorlar
ro'yxati, Telegram matnlari, hisobotlar.

1-bosqich 2 va 3-bosqichlarsiz ham prod'ga chiqishi mumkin: sozlamalar
boshlang'ich qiymatlar bilan kodda turadi, interfeys esa eski matn bilan
to'g'ri raqam ko'rsatadi.

---

## 12. Keyingi bosqichga qoldirilgan

- Guruh yoki o'quvchi darajasida to'lov turini ustidan yozish (Q5)
- Uzrli dars krediti uchun oylik limit (sozlama bor, mantiq keyin)
- Qarzga aylanishgacha muhlat (`debtGraceDays`, hozir 0)
- "To'lov" dan boshqa sozlama bo'limlari
