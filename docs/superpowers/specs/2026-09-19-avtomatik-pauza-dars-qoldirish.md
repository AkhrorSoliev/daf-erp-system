# Avtomatik pauza — ketma-ket dars qoldirgan o'quvchi (dizayn)

**Sana:** 2026-09-19
**Holat:** CEO tasdiqlagan, implementatsiya kutilmoqda
**Tegishli:** [outreach](../../../server/src/outreach/), [ADR-0004 — balans haqiqati ledgerda](../../adr/0004-balans-haqiqati-ledgerda.md), [ADR-0002 — fail-closed qamrov](../../adr/0002-filial-qamrovi-fail-closed.md)

## Muammo

O'quvchi guruhga kelishni to'xtatadi, lekin yozuvi ACTIVE bo'lib qolaveradi.
Har bir o'tgan dars uchun:

- unga **to'liq dars narxi yoziladi** (ABSENT ham billable — «dars o'tdi = dars
  to'landi», [`lesson-billing.service.ts`](../../../server/src/billing/lesson-billing.service.ts)),
- **ustozga oylik yoziladi**, va balansi yetmasa bu pulni **markaz o'z
  cho'ntagidan** to'laydi (`isCenterTopUp` accrual).

Ya'ni o'quvchi ketgan, lekin pul hisoblagichi ishlab turaveradi.

### Prod o'lchovi (2026-09-19, `companyId=1001`)

Oxirgi 90 kun, davomat va ustoz oyligi:

| Holat | Darslar | Ustoz oyligi | Markaz qoplagani | Hali qaytmagani |
|---|---:|---:|---:|---:|
| PRESENT | 11 494 | 190 006 956 | 18 499 501 | 4 086 420 |
| **ABSENT** | **2 812** | **43 320 915** | **7 711 338** | **4 294 663** |
| EXCUSED | 197 | 0 | 0 | 0 |
| LATE | 16 | 281 625 | 0 | 0 |

**Muhim aniqlik:** kelmagan dars uchun markaz HAR DOIM to'lamaydi. 43,3 mln
ustoz oyligining ~35,6 mln ini o'quvchilarning o'zi to'lagan (balansidan
yechilgan). Markazning haqiqiy cho'ntagidan ketgani — 7,7 mln, qaytmagani
4,3 mln. **Muammo «kelmagan o'quvchi» emas, «kelmagan va puli yo'q
o'quvchi».**

### Hozirgi jarayon yomon emas

| | |
|---|---:|
| Hozir 2+ ketma-ket qoldirgan faol yozuv | 21 |
| Hozir 3+ qoldirgan | 5 |
| Eng uzun holat | 4 dars |
| 90 kunda guruhdan chiqarilgan | 564 |
| Shundan 3 ta qoldirgunicha chiqarilgan | **91%** |

`/outreach` sahifasida «Ko'p dars qoldirganlar» ro'yxati (3 ta chegara) bor va
adminlar undan foydalanmoqda. Avtomatika **buzilgan narsani tuzatmaydi** — u
qo'lda bajarilayotgan ishni kafolatlaydi va dumini ushlaydi.

### Chegarani tanlash uchun dalil

Butun tarix bo'yicha 1 808 ta «ketma-ket qoldirish orolchasi» tahlili —
K ta darsni ketma-ket qoldirgandan keyin o'quvchi qaytib kelganmi:

| Ketma-ket qoldirgan | Qaytib kelgan | Qaytmagan |
|---|---:|---:|
| 2 ta | **66%** | 32% |
| 3 ta | **42%** | 55% |
| 4 ta | **23%** | 77% |

2 tada avtomatik harakat qilish — qaytib keladigan har 3 o'quvchidan 2 tasiga
teginish demak. 3 ta — qaytish ehtimoli birinchi marta yarimdan pastga
tushadigan nuqta.

Avtomatika to'xtatadigan behuda darslar (butun tarix, ≈5 oy):

| Chegara | Ortiqcha dars | Ustoz oyligi | O'quvchiga yozilgan qarz |
|---|---:|---:|---:|
| 3 | 273 | 3,1 mln | 8,8 mln |
| 2 | 511 | 5,8 mln | 16,5 mln |

Taqqos: shu paytgacha jami hisobdan chiqarilgan qarz — 10,9 mln so'm.

## CEO qarorlari

1. **Harakat:** avtomatik **pauza** (guruhdan chiqarish emas). Chiqarish qo'lda
   qoladi.
2. **Chegara:** 3 ta ketma-ket sababsiz qoldirish.
3. **Ogohlantirish:** 2-darsda o'quvchiga Telegram + adminga bildirishnoma.
4. **Uzrli darslar:** sanalmaydi — sanoqni uzadi.
5. **Oldindan aytilgan SABABSIZ qoldirish:** sanaladi (teshikni yopadi).
6. **Quruq rejim yo'q** — chiqqan kunidan haqiqiy ishlaydi.

## Yechim

### 1. Sanoq qoidasi — yagona ta'rif

`AbsenceStreakService.computeStreaks` — bitta manba. `/outreach` ro'yxati ham,
cron ham shuni o'qiydi. Ikkita nusxa bo'lsa, ro'yxat va harakat bir-biriga
zid bo'lib qoladi.

Ketma-ketlik oxirgi darsdan orqaga yuriladi:

| Davomat | Sanoqqa ta'siri |
|---|---|
| ABSENT | +1 |
| EXCUSED + `PlannedAbsence.kind = SABABSIZ` | **+1 (yangi)** |
| PRESENT / LATE | **0 ga tushadi** |
| EXCUSED (boshqa har qanday) | **0 ga tushadi** |
| Dars bekor qilingan (`cancellationId`) | **0 ga tushadi** — o'quvchining aybi emas |

Faqat `status = ACTIVE` yozuvlar va `statusEnum = ACTIVE` guruhlar.

**Yangi qism** — `PlannedAbsence` bo'yicha `LEFT JOIN`. Hozir oldindan
belgilangan qoldirish `SABABLI` ham, `SABABSIZ` ham `EXCUSED` bo'lib tushadi va
ikkalasi ham sanoqni uzadi. Bu «har safar oldindan qo'ng'iroq qilib pauzadan
qochish» yo'lini ochiq qoldiradi.

> **Ogohlantirish:** proddagi 178 ta oldindan qoldirishning **hammasi
> `SABABLI`** — bitta ham `SABABSIZ` yo'q. Ya'ni bu teshik hozircha faqat
> nazariy; qoida oldini olish uchun yoziladi, bugungi raqamlarni
> o'zgartirmaydi. Lekin `/outreach` ro'yxatining ta'rifi ham shu bilan
> o'zgaradi — ikkalasi bitta funksiyani o'qiganligi uchun.

### 2. Pauza — yozuv darajasida, o'quvchi darajasida emas

**Ishning eng katta qismi shu.** Bugun tizimda muzlatish faqat butun O'QUVCHI
uchun bor (`PATCH /students/:id/status` → `FROZEN`) va u o'quvchining
**barcha** yozuvlarini muzlatadi. Ikki guruhda o'qiydigan bola bitta guruhga
kelmasa, ikkalasidan ham muzlab qoladi — bu noto'g'ri.

Yangi amal: bitta `Enrollment` ni `ACTIVE → FROZEN`.

`EnrollmentStatus` da `FROZEN` allaqachon bor va `ACTIVE → FROZEN → ACTIVE`
o'tishi [`status-transitions.ts`](../../../server/src/common/status/status-transitions.ts)
da ruxsat etilgan. Prodda **209 ta** FROZEN yozuv bor va **57 marta** ACTIVE
ga qaytarilgan — yo'l sinalgan.

Pauza nima qiladi:

| | |
|---|---|
| Davomat ro'yxati | O'quvchi chiqadi (`attendance-read` faqat ACTIVE yozuvlarni oladi) |
| Pul | Yangi `LESSON_DEDUCTION` / `LESSON_CONSUMPTION` yozilmaydi |
| Ustoz oyligi | Yangi `SalaryAccrual` yozilmaydi |
| Oldindan to'langan darslar | `EnrollmentBillingService.releasePrepaidLessons` orqali balansga qaytadi — `removeFromGroup` qanday qilsa, xuddi shunday |
| Mavjud qarz | **Tegilmaydi.** Pauza faqat YANGI qarzni to'xtatadi |
| Guruh a'zoligi | Saqlanadi — o'quvchi guruhdan chiqarilmaydi |

Yozuv `StatusCascadeService.cascadeEnrollmentStatus({ id: enrollmentId }, …)`
orqali o'tkaziladi — u `EnrollmentStateLog` va `EntityHistory` ni o'zi
yozadi, shuning uchun hisobot tarixi buzilmaydi. Guruh tarixiga
`OQUVCHI_MUZLATILDI`, o'quvchi tarixiga status o'zgarishi tushadi;
`statusChangeReason` = `Avtomatik: 3 ta ketma-ket dars qoldirildi
(oxirgisi 12.09.2026)`.

### 3. Qaytarish

`POST /students/:id/enrollments/:enrollmentId/resume` → `FROZEN → ACTIVE`.

- Rollar: CEO / Branch Director / Administrator
- `assertCallerMayTouchStudent` bilan filialga bog'lanadi
- Guruh tarixiga `OQUVCHI_QAYTDI`
- Balans o'zgarmaydi: keyingi dars odatdagidek balansdan yangi paket ochadi

Qo'lda pauza qilish uchun juft endpoint ham beriladi —
`POST /students/:id/enrollments/:enrollmentId/pause` — admin 3 ta darsni
kutmasdan pauzaga qo'ya olsin (sabab majburiy).

### 4. Cron

`AbsenceAutoPauseCronService` — `@Cron('0 50 23 * * *', { timeZone: 'Asia/Tashkent' })`.

Kunning oxirida bir marta, chunki ustoz davomatni kun davomida tuzatishi
mumkin. Yakshanba va bayram kunlari ham ishlaydi (davomat bo'lmagan kun
sanoqni o'zgartirmaydi, lekin kechiktirilgan tuzatishlarni ushlaydi).

Har kompaniya uchun:

1. Sozlamani o'qiydi; `enabled = false` bo'lsa — chiqadi.
2. `computeStreaks({ threshold: warnThreshold })` bir marta chaqiriladi;
   natija ikkiga ajratiladi — `>= pauseThreshold` (pauza) va
   `== warnThreshold` (ogohlantirish).
3. **Kunlik chegara (fail-closed):** agar pauza nomzodlari soni `dailyCap` dan
   ko'p bo'lsa — **hech kim pauza qilinmaydi**, CEO ga ogohlantirish ketadi.
   Ommaviy xato (davomat noto'g'ri kiritilgan kun, migratsiya) bir kechada 200
   o'quvchini pauzaga tashlab yuborishining oldini oladi. Sanamaydi, bitta
   yurishda tekshiradi — hisoblagich saqlash shart emas.
4. Har bir nomzod alohida `Serializable` tranzaksiyada pauza qilinadi; bittasi
   yiqilsa, qolganlari davom etadi (xatolik log + CEO xabariga tushadi).
5. Ogohlantirishlar yuboriladi.

### 5. Ogohlantirish

**2-darsda** (`warnThreshold`):

- **O'quvchiga Telegram** — prodda faol o'quvchilarning **94%** ida
  (420 / 449) `telegramChatId` bor, demak deyarli hammasiga yetadi.
- **Adminga** — 4 kanal orqali (DB + SSE + Push + Telegram), guruh filialidagi
  `Administrator` rolidagi xodimlarga. Qabul qiluvchi filtri
  `deletedAt: null` + `isActive: true` + `status: ACTIVE` (CLAUDE.md qoidasi).

> **Ota-onaga xabar hozir imkonsiz:** bazada faol o'quvchilarning
> **bittasida ham** `parentPhone` yo'q (0 / 449). Shuning uchun dizaynga
> kiritilmadi.

**3-darsda** (pauza bo'lganda): o'quvchiga «yozuv pauzaga o'tdi, qaytish uchun
markazga murojaat qiling» xabari + adminga bildirishnoma.

Idempotentlik: bitta `(enrollmentId, type)` uchun kuniga bitta xabar —
`Notification` jadvalidagi bugungi qator marker bo'ladi (attendance-reminder
crondagi bilan bir xil naqsh, yangi jadval kerak emas).

Yangi `NotificationType` qiymatlari: `ABSENCE_WARNING`, `ENROLLMENT_AUTO_PAUSED`.

### 6. Sozlamalar

Yangi model:

```prisma
model AbsencePauseSetting {
  id             String   @id @default(uuid())
  companyId      Int      @unique
  enabled        Boolean  @default(false)
  warnThreshold  Int      @default(2)   // 1..10
  pauseThreshold Int      @default(3)   // 2..20, > warnThreshold
  dailyCap       Int      @default(10)  // 1..100
  updatedById    Int?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

SCD2 emas — bu prognoz yoki oylik hisobiga kirmaydi, o'tmishni qayta
o'qishning hojati yo'q. O'zgarish tarixi `EntityHistory` ga tushadi.

Filial bo'yicha alohida sozlash **kiritilmaydi** (YAGNI) — CEO so'ramadi va
ikkala filialda qoida bir xil.

Sahifa: `/settings/absence-pause` — «Administratsiya» bo'limiga qo'shiladi
(`settings-nav.ts`). Rollar: **CEO / Branch Director** (bu qoida pul oqimini
to'xtatadi).

### 7. Admin ko'radigan joy

`/outreach` ga to'rtinchi tab: **«Pauzadagilar»**.

- Avtomatik pauza qilingan yozuvlar, qachon va necha darsdan keyin
- Har qatorda **«Faollashtirish»** tugmasi
- Mavjud «Ko'p dars qoldirganlar» tabi saqlanadi — u endi «pauzagacha 1 dars
  qolgan»larni ko'rsatadi

## Texnik tarkib

### Server

| Fayl | O'zgarish |
|---|---|
| `outreach/absence-streak.service.ts` | `PlannedAbsence` va `cancellationId` qoidasi; `kind` ni qaytarish |
| `students/student-enrollment.service.ts` | `pauseEnrollment` / `resumeEnrollment` |
| `students/students.controller.ts` | 2 ta yangi endpoint + guard testlari |
| `attendance/absence-auto-pause.cron.ts` | **yangi** — kunlik yurish |
| `absence-pause/` (modul) | **yangi** — sozlamani o'qish/yozish + controller. `src/` da `settings` moduli yo'q; sozlama sahifalari o'z modulidan oziqlanadi (`student-exit-reasons` kabi) |
| `notifications/notification-events.listener.ts` | 2 ta yangi turni tarqatish |
| `prisma/schema.prisma` | `AbsencePauseSetting` + 2 ta `NotificationType` |

### Klient

| Fayl | O'zgarish |
|---|---|
| `app/(dashboard)/settings/absence-pause/` | **yangi** sahifa |
| `lib/settings-nav.ts` | menyu qatori |
| `components/outreach/paused-tab.tsx` | **yangi** tab |
| `components/outreach/outreach-page-client.tsx` | 4-tab |

### Migratsiya

`prisma migrate dev` bu repoda ishlamaydi — qabul qilingan tartib:
`prisma migrate diff` → `prisma db execute` → `prisma migrate resolve`.

Deploydan keyin seed shart emas: sozlama qatori birinchi o'qishda `upsert`
bilan tug'iladi va **`enabled = false`** bo'ladi. Ya'ni migratsiya
o'z-o'zidan hech kimni pauza qilmaydi — CEO sahifadan yoqmaguncha cron
bo'sh yuradi.

### ADR

Bu ish **ADR talab qiladi** (CLAUDE.md qoidasi): pul semantikasi o'zgaradi
(tizim o'zi hisoblash to'xtatadi) va yangi fail-closed tanlov kiritiladi
(kunlik chegara oshsa — hech kim pauza qilinmaydi). ADR shu PR ichida yoziladi —
`docs/adr/0022-avtomatik-pauza-chiqarmaydi.md`: **«Avtomatik pauza
o'quvchini guruhdan chiqarmaydi»** — nega
harakat DROPPED emas, FROZEN ekani va nega chegara oshganda tizim hech
narsa qilmasligi.

## Testlar

- `absence-streak.service.spec.ts` — SABABSIZ oldindan qoldirish sanaladi;
  SABABLI sanalmaydi; bekor qilingan dars uzadi; PRESENT uzadi
- `absence-auto-pause.cron.spec.ts` — chegaradan oshganda **hech kim** pauza
  qilinmaydi; `enabled = false` da hech narsa qilinmaydi; bitta yozuv
  yiqilsa qolganlari davom etadi
- `student-enrollment.service.spec.ts` — pauza oldindan to'langan darslarni
  balansga qaytaradi; qarzga tegmaydi; `FROZEN → ACTIVE` qaytaradi
- `students.controller.spec.ts` — yangi endpointlarda `@Roles` bor va
  `Student` roli rad etiladi
- Vaqtga bog'liq test yozilmaydi (CI 23:40–00:02 da yiqiladigan naqsh bor) —
  cron vaqti `jest.useFakeTimers` bilan emas, to'g'ridan-to'g'ri metod
  chaqirib sinaladi

## Kutilayotgan ta'sir

Birinchi kechada (2026-09-19 holati, yangi qoida bilan hisoblangan):

| | |
|---|---:|
| Pauza bo'ladi | **5 ta** yozuv |
| Ogohlantirish oladi | **21 ta** yozuv |

Kunlik chegara (10) oshmaydi. Orqada to'planib qolgan zaxira yo'q — eng uzun
holat 4 ta dars.

Doimiy rejimda: haftasiga ≈10 ta pauza, shundan ≈4 tasi qaytib kelib
faollashtirish talab qiladi.

**Ko'rinadigan yon ta'sir:** «Faol o'quvchi» ko'rsatkichi pauzadagilar hisobiga
biroz tushadi (hozirgi ma'lumotda 5 ta). Bu to'g'ri xatti-harakat —
[faol o'quvchi ta'rifi](../../../CONTEXT.md) faol yozuvga asoslanadi.

## Nima QILMAYMIZ

- **Avtomatik guruhdan chiqarish** — 3 ta qoldirganlarning 42% i qaytib keladi
- **Avtomatik qarz kechirish** — pauza pulga tegmaydi
- **Filial bo'yicha alohida chegara** — so'ralmadi
- **SMS ogohlantirish** — Eskiz akkaunti hali faol emas; Telegram 94% ni
  qoplaydi
- **Ota-onaga xabar** — bazada bitta ham ota-ona telefoni yo'q
- **Quruq rejim** — CEO darrov yoqishni tanladi; o'rniga kunlik chegara +
  o'chirish tugmasi himoya qiladi

## Xavflar

| Xavf | Nima qilamiz |
|---|---|
| 2026-07-14 dagidek kutilmagan ommaviy o'zgarish | Kunlik chegara **fail-closed** — oshsa hech kim pauza qilinmaydi; sozlamada o'chirish tugmasi |
| Ustoz davomatni kech kiritadi → noto'g'ri pauza | Cron kun oxirida (23:50); pauzani admin bir bosishda qaytaradi, ma'lumot yo'qolmaydi |
| Qaytgan o'quvchi ro'yxatda yo'q, ustoz belgilay olmaydi | «Pauzadagilar» tabi + guruh sahifasida ko'rinadi; faollashtirish bir tugma |
| `/outreach` ro'yxati ta'rifi o'zgaradi | Bitta funksiyadan o'qiladi, shuning uchun ro'yxat va harakat hech qachon zid bo'lmaydi |
