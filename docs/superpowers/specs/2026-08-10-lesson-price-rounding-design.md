# Dars narxi yaxlitlanishi — design

**Sana:** 2026-08-10
**Kontekst:** `/payments/debt-history` sahifasida 2–12 so'mlik qarzi bor o'quvchilar «qarzdor» bo'lib chiqayotgani aniqlandi. Sabab — dars narxining teng bo'linmasligi.
**Bog'liq:** [lesson-cycle-model.md](../../lesson-cycle-model.md), `server/src/billing/lesson-billing.service.ts`

---

## 1. Muammo

`lesson-billing.service.ts:463`:

```ts
const perLessonCost = Math.round(fullCycleCost / lessonPaymentCount);
```

`400 000 ÷ 12 = 33 333.33` → `33 333`. O'n ikki dars **399 996** yechadi — tsikl narxidan **4 so'm kam**.

Bu farq faqat qarzdorga darslar **bittalab** yozilganda (`SINGLE_UNCOVERED`) va **qisman** to'lovda (`PARTIAL`) to'planadi. To'liq tsiklda (`FULL_CYCLE`) pul yaxlit yechilgani uchun chiqindi yo'q.

**Prod nusxasidagi o'lchov (2026-08-10):**

| | Nechta | Summa |
|---|---|---|
| 1000 so'mdan kichik qoldiq — jami | 117 ta o'quvchi | 8 072 so'm |
| shundan ≤50 so'm (yaxlitlash chiqindisi) | 104 ta | 718 so'm |
| shundan manfiy (qarzdor bo'lib ko'rinadi) | 8 ta | 1 679 so'm |

Misollar: `#10005` — 10 ta dars, 3 so'm chiqindi. `#10008` — 30 ta dars, 10 so'm chiqindi.

**Nima bu muammo emas:** `329`/`659`/`665` so'mlik qoldiqlar yaxlitlashdan emas — o'quvchi yumaloq summa to'laydi (`433 000`), dars esa `33 333` turadi, ular hech qachon to'g'ri kelmaydi. Bu design ularni tuzatmaydi.

---

## 2. Yechim — to'planuvchi yaxlitlash

Har darsning narxi mustaqil yaxlitlanmaydi; **shu darsgacha bo'lgan jami** minus **oldingi darsgacha bo'lgan jami** sifatida hisoblanadi:

```
lessonPriceAt(cycleCost, n, i) =
  round(cycleCost × (i+1) / n) − round(cycleCost × i / n)
```

`400 000 / 12` uchun: `i = 0..10` → **33 333**, `i = 11` → `400 000 − 366 663` = **33 337**. Jami aynan **400 000**.

Kafolatlar: tsikl yig'indisi aynan `cycleCost`; har bir dars o'rtacha narxdan ko'pi bilan 1 so'mga farq qiladi; `n = 1` va `cycleCost = 0` da ham to'g'ri ishlaydi.

Joylashuvi: `server/src/billing/lesson-price.ts` — sof funksiya, Prisma'siz, o'z testi bilan.

---

## 3. Uch rejimda qo'llanishi

### 3.1 `FULL_CYCLE` — tegilmaydi

Hozir ham `discountedFullCycleCost` ni yaxlit yechadi. Chiqindi yo'q.

### 3.2 `PARTIAL` — hisoblagichsiz tuzatiladi

Hozir: `lessonsCovered × perLessonCost` (masalan `3 × 33 333 = 99 999`).
Bo'ladi: `cumulative(lessonsCovered)` (masalan `round(400 000 × 3/12) = 100 000`).

**Diqqat — bu yerda overdraft xavfi bor.** `lessonsCovered` hozir `floor(balance / perLessonCost)` bilan topiladi. Balans `99 999` bo'lsa `N = 3` chiqadi, yangi narx esa `100 000` — balansdan oshib ketadi va `PARTIAL` hech qachon balansni manfiyga tushirmasligi qoidasi buziladi.

Shuning uchun `N` **yangi narx bo'yicha** topiladi: `cumulative(N) ≤ balance` shartini qanoatlantiruvchi eng katta `N`. Amalda `floor` dan boshlab pastga bir-ikki qadam yetadi.

### 3.3 `SINGLE_UNCOVERED` — hisoblagich kerak

Bu yerda «tsiklning nechanchi darsi» degan ma'lumot umuman yo'q — har dars mustaqil `perLessonCost` bilan yoziladi.

**Yangi ustun:** `Enrollment.cycleLessonIndex Int @default(0)`.

- Har `SINGLE_UNCOVERED` yozuvdan keyin **oshadi**; `lessonPaymentCount` ga yetganda **0 ga qaytadi**.
- `FULL_CYCLE` yoki `PARTIAL` yozilganda **0 ga tushadi** (yangi to'plam boshlandi).
- Davomat `PRESENT → ABSENT` ga o'zgartirilib, yozuv bekor qilinsa — **kamayadi** (0 dan pastga tushmaydi).

Dars narxi: `lessonPriceAt(cycleCost, n, enrollment.cycleLessonIndex)`.

---

## 4. Chegaraviy holatlar

**Chegirma.** Chegirma dars narxiga emas, **tsikl narxiga** qo'llanadi, keyin funksiya ishlaydi: `lessonPriceAt(applyDiscount(cycleCost, pct), n, i)`. Aks holda chegirmaning o'zi yangi chiqindi yaratadi.

**`metadata.perLessonCost`.** Bu maydon ko'rsatish, oylik hisobi va prepaid qaytarish uchun ishlatiladi — **nomi va ma'nosi o'zgarmaydi**, unda o'rtacha (nominal) narx qoladi. Yozuvda haqiqatda yechilgan summa `amount` da turibdi, shuning uchun ledger to'g'ri.

**Prepaid qaytarish** (`EnrollmentBillingService`). Hozir `prepaidLessonsRemaining × metadata.perLessonCost`. Yangi usulda `cumulative(n) − cumulative(n − remaining)` bo'ladi — shunda qaytarish ham aniq bo'ladi va yangi chiqindi tug'ilmaydi.

**Oylik hisobi.** `perLessonAccrual` dars narxidan foiz oladi; 4 so'mlik farq ustoz oyligini ~1 so'mga o'zgartiradi. Qayd etiladi, alohida chora ko'rilmaydi.

**Deploy kunida tsikl o'rtasida turganlar.** Oldindan to'laganlarga (102 ta o'quvchi) **ta'sir yo'q** — ularning puli allaqachon yaxlit yechilgan, qolgan darslar faqat sanagichni kamaytiradi. Qarzdorlarda hisoblagich 0 dan boshlanadi; bu ularning o'tmishdagi 3–10 so'mlik chiqindisini qoldiradi, lekin keyingi har bir tsikl aniq bo'ladi.

---

## 5. O'zgarmaydigan narsalar

O'tgan tranzaksiyalar (ledger append-only — qayta hisoblanmaydi) · `Student.balance` · to'lov taqsimoti va retroaktiv hisob · `LessonDeductionMode` enum · `metadata` shartnomasi · mavjud qoldiqlar (117 ta, 8 072 so'm).

---

## 6. Bajarish tartibi

**0-qadam — o'lchash. BAJARILDI (2026-08-10).** `scripts/measure-lesson-rounding-residuals.ts`.

Kurs kesimida bir tsiklning xatosi (`round(narx/dars) × dars − narx`):

| Kurs | Narx / dars | Xato | Yo'nalish |
|---|---|---|---|
| Standart, A 1 | 400 000 / 12 | −4 | kam yozadi → o'quvchi foydasiga |
| Vorbereitung | 550 000 / 12 | −4 | kam yozadi |
| **Standart B2, B1, B1 Telc** | **500 000 / 12** | **+4** | **ortiqcha yozadi → QARZ tug'iladi** |
| A2, Intensive | 450 000 / 12, 690 000 / 20 | 0 | toza |

1000 so'mdan kam qarzi bor 8 ta o'quvchidan **4 tasining qarzi aynan +4 ning karrasi** va ular 500 000 lik kursda: #10435, #10045, #10433 (1 tsikl), #10048 (3 tsikl) — jami 24 so'm. Qolgan 4 tasi (2, 329, 659, 665) yaxlitlashdan emas: uchtasi 400 000 lik kursda, u yerda xato teskari yo'nalishda.

**Muhim natija:** gap faqat hisobot shovqinida emas — 500 000 lik kurslarda o'quvchidan har tsiklda **4 so'm ortiqcha undirilmoqda**. Tuzatish buni to'xtatadi.

**1-qadam** — `lesson-price.ts` + unit testlar (funksiyaning o'zi).
**2-qadam** — migratsiya: `Enrollment.cycleLessonIndex`. Loyihada `prisma migrate dev` buzuq → `diff` + `db execute` + `resolve` ([branch-deploy-runbook.md](../../branch-deploy-runbook.md), 86-qator).
**3-qadam** — `lesson-billing.service.ts` uchta rejimga qo'llash + prepaid qaytarish.
**4-qadam** — testlar: 12 ta bittalab yozilgan dars aynan tsikl narxini beradi; `PARTIAL` balansdan oshmaydi; bekor qilishda hisoblagich kamayadi; chegirmali holat.
**5-qadam** — 0-qadamdagi o'lchovni takrorlash (prod nusxasida yangi kod bilan) va farqni qayd etish.

---

## 7. Qamrovdan tashqari

**Chegara (1000 so'm).** Muhokama qilindi, hozircha **kiritilmaydi**. Sababi: bugungi ma'lumotda u atigi 8 ta qarzdorni (1 679 so'm) olib tashlaydi va shoshilinch emas. Yumaloq to'lovdan kelib chiqadigan qoldiqlar ko'payib ketsa qaytiladi — ish bir kunlik va bitta konstantada turadi.

**Eski qoldiqlarni tozalash.** 5 ta nofaol o'quvchidagi 673 so'mlik manfiy qoldiq. Ixtiyoriy, bir martalik skript. Musbat qoldiqlarga (109 ta, 6 393 so'm) **tegilmaydi** — bu markazning o'quvchiga qarzi.

**Narxni bo'linadigan qilish.** Biznes qarori (masalan `396 000 ÷ 12`), kod ishi emas.
