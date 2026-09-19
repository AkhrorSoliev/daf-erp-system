# Avtomatik pauza — ketma-ket dars qoldirgan o'quvchi (dizayn)

**Sana:** 2026-09-19 (2-tahrir — kod bilan qayta solishtirildi)
**Holat:** CEO tasdiqlagan, implementatsiya kutilmoqda
**Tegishli:** [outreach](../../../server/src/outreach/), [students-status.service.ts](../../../server/src/students/students-status.service.ts), [ADR-0004 — balans haqiqati ledgerda](../../adr/0004-balans-haqiqati-ledgerda.md), [ADR-0008 — ro'yxatdan o'tish aktori oshkora](../../adr/0008-royxatdan-otish-aktori-oshkora.md)

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

### 1. «Pauza» = mavjud «Muzlatish» (o'quvchi darajasida)

Birinchi tahrirda «yozuv (enrollment) darajasida yangi pauza» taklif qilingan
edi — «ikki guruhda o'qiydigan bola bitta guruhga kelmasa, ikkalasidan ham
muzlab qoladi» degan asos bilan. **Bu asos noto'g'ri:** tizimda bitta o'quvchi
bir vaqtda faqat **bitta** faol yozuvga ega bo'la oladi —
[`enrollToGroup`](../../../server/src/students/student-enrollment.service.ts)
mavjud faol yozuvni topsa, uni **ko'chirish** (TRANSFERRED) deb hisoblaydi va
yopadi. Prod ham shuni tasdiqlaydi: 449 faol o'quvchi = 449 faol yozuv.

Shuning uchun **yangi tushuncha kiritilmaydi.** Pauza — bu mavjud
`PATCH /students/:id/status → FROZEN` («Muzlatish»), tizim nomidan
bajariladigan. Nima tayyor:

| | Mavjud |
|---|---|
| Faol yozuvlar `FROZEN` ga o'tadi, `EnrollmentStateLog` + tarix yoziladi | `StatusCascadeService.cascade('Student', id, 'FROZEN')` |
| Oldindan to'langan darslar balansga qaytadi | `refundPrepaidForFreeze` |
| Davomat ro'yxatidan chiqadi → pul yechilmaydi, oylik yozilmaydi | `attendance-read` va `attendance-save` faqat ACTIVE yozuvlarni oladi |
| Filial Telegram guruhiga «❄️ O'quvchi muzlatildi» + sabab | `entity.status.changed` → broadcast listener |
| Profil sahifasida «Faollashtirish» tugmasi | `change-status-dialog.tsx` |
| O'quvchilar ro'yxatida «Muzlatilgan» filtri, qarz hisobotida «Muzlatilgan» bo'limi | bor |
| Qaytarish: `FROZEN → ACTIVE` — faol guruhdagi yozuvlar qayta ochiladi, sabab so'ralmaydi | `cascade('Student', id, 'ACTIVE')` |

Prodda **209 ta** muzlatilgan o'quvchi bor va **57 marta** qaytarilgan —
yo'l sinalgan. Bir kunda qo'lda muzlatilganlarning eng ko'pi — 16 ta
(13.05.2026).

Pauzadagi o'quvchi bilan nima **bo'lmaydi:** qarzi o'chirilmaydi (pauza faqat
YANGI qarzni to'xtatadi); guruhdan chiqarilmaydi; profil, to'lovlar, ledger
o'zgarmaydi.

### 2. Tizim aktori

`StudentsStatusService.changeStatus(id, dto, userId, companyId)` odam uchun
yozilgan: `assertCallerMayTouchStudent` (filial tekshiruvi) va «sozlangan
sabab bo'lsa — ro'yxatdan tanlash majburiy» qoidasi bor. Cronning na
foydalanuvchisi, na filiali bor.

ADR-0008 naqshi takrorlanadi: yadro `applyStatusChange(student, dto, actor)`
ga ajratiladi, `actor: { kind: 'user'; id } | { kind: 'system' }`.

| | `user` | `system` |
|---|---|---|
| Filial tekshiruvi | bor | yo'q (kompaniya ichida ishlaydi) |
| Sabab | ro'yxatdan (`StudentExitReason`, `appliesTo: FREEZE`) | erkin matn: `Avtomatik pauza: 3 ta ketma-ket dars qoldirildi (oxirgisi 12.09.2026)`, `statusChangeReasonId = null` |
| `changedById` | foydalanuvchi | `undefined` → tarixda «Tizim» (`group-status-cron` naqshi) |
| Tarix, cascade, broadcast | bir xil | bir xil |

`GRADUATED` taqiqi va boshqa tekshiruvlar ikkala aktor uchun ham qoladi.
Tizim yo'li **faqat `ACTIVE → FROZEN`** o'tishni biladi — boshqa statusga
o'tkazish so'ralsa rad etadi.

### 3. Sanoq qoidasi — yagona ta'rif

`AbsenceStreakService.computeStreaks` — bitta manba. `/outreach` ro'yxati ham,
cron ham shuni o'qiydi. Ikkita nusxa bo'lsa, ro'yxat va harakat bir-biriga
zid bo'lib qoladi.

Ketma-ketlik oxirgi darsdan orqaga yuriladi:

| Davomat | Sanoqqa ta'siri |
|---|---|
| ABSENT | +1 |
| EXCUSED + `PlannedAbsence.kind = SABABSIZ` | **+1 (yangi)** |
| PRESENT / LATE | **0 ga tushadi** |
| EXCUSED (boshqa har qanday, shu jumladan `SABABLI`) | **0 ga tushadi** |
| Bekor qilingan dars (`cancellationId IS NOT NULL`) | **ko'rinmaydi** — o'tkazib yuboriladi (yangi) |

Faqat `status = ACTIVE` yozuvlar, `statusEnum = ACTIVE` guruhlar, `status =
ACTIVE` o'quvchilar.

**Sanoq oynasi (yangi, hal qiluvchi).** Davomat `(studentId, groupId)` bo'yicha
saqlanadi, yozuvga bog'lanmagan. Oyna chegaralanmasa ikkita xato chiqadi:

1. **Cheksiz halqa.** Admin o'quvchini faollashtiradi; u hali darsga
   kelmagan, oxirgi 3 qator hamon ABSENT → ertalab cron uni **yana** pauza
   qiladi.
2. **Meros.** Guruhdan chiqib, keyin o'sha guruhga qayta yozilgan o'quvchi
   eski 3 ta ABSENT bilan keladi → birinchi kechasiyoq pauza.

Qoida: faqat `date >= max(enrollment.startDate ?? createdAt,
tashkentDate(enrollment.statusChangedAt))` qatorlar sanaladi.
`statusChangedAt` — yozuv `FROZEN → ACTIVE` qaytarilganda cascade yozadigan
maydon; ya'ni **faollashtirish sanoqni noldan boshlaydi** — o'quvchi yangi
imkoniyat oladi (3 ta dars, ≈1 hafta). «Sinov muddati» (qaytgach 1 ta
qoldirsa — darrov pauza) ataylab qilinmaydi — YAGNI.

**`PlannedAbsence` bo'yicha `LEFT JOIN`.** Hozir oldindan belgilangan qoldirish
`SABABLI` ham, `SABABSIZ` ham `EXCUSED` bo'lib tushadi va ikkalasi ham sanoqni
uzadi. Bu «har safar oldindan qo'ng'iroq qilib pauzadan qochish» yo'lini ochiq
qoldiradi. Join `(groupId, studentId, date)` bo'yicha aniq — ikkala jadvalda
ham shu unique; iste'mol qilingan `PlannedAbsence` o'chirilmaydi.

> Proddagi 178 ta oldindan qoldirishning **hammasi `SABABLI`** — bitta ham
> `SABABSIZ` yo'q. Qoida oldini olish uchun yoziladi, bugungi raqamlarni
> o'zgartirmaydi. Bekor qilingan darslar ham: 18 ta bekor qilish, ularga
> bog'langan davomat qatori 0 — himoya, ta'sir yo'q. Lekin `/outreach`
> ro'yxatining ta'rifi ham shu bilan o'zgaradi — bitta funksiya.

### 4. Ogohlantirish

`warnThreshold ≤ streak < pauseThreshold` bo'lgan har bir yozuv uchun.
Sozlamada `pause = 5` qilinsa, 2, 3 va 4-darsda ham xabar ketadi — matn
«pauzagacha N ta dars qoldi» deydi.

**Bir absence — bir xabar.** Cron har kuni yuradi, sanoq esa keyingi darsgacha
o'zgarmaydi; kunlik marker bo'lsa o'quvchi har kuni bir xil xabar oladi.
Marker — `AbsenceWarningLog` jadvali, `@@unique([enrollmentId, absenceDate])`:
`lastAbsenceDate` uchun qator bo'lsa — yuborilmaydi. Jadval bir vaqtda
**samaradorlik jurnali** ham: bir oydan keyin «ogohlantirilganlarning nechtasi
qaytdi?» savoliga aynan shu jadval javob beradi.

Kimga:

| Qabul qiluvchi | Kanal | Manba |
|---|---|---|
| O'quvchi | Telegram (`Student.telegramChatId`) | prodda faol o'quvchilarning **94%** ida bor (420/449) |
| Guruh filialidagi `Administrator`lar | 4 kanal (DB + SSE + Push + Telegram) | `attendance-reminder` bilan bir xil qabul qiluvchi filtri: `deletedAt: null` + `isActive` + `status: ACTIVE` |

> **Ota-onaga xabar hozir imkonsiz:** faol 449 o'quvchining **bittasida ham**
> `parentPhone` yo'q. Telefonlarni yig'ish — alohida ish.

Pauzada (`ENROLLMENT_AUTO_PAUSED`): o'quvchiga «yozuvingiz pauzaga o'tdi,
qaytish uchun markazga murojaat qiling»; filial adminlariga va **guruh
ustoz(lar)iga** 4 kanal orqali — ustoz ertalab ro'yxati qisqarganini
sababsiz ko'rmasin. Filial Telegram guruhiga «❄️ muzlatildi» broadcast
o'z-o'zidan ketadi (mavjud listener).

Yangi `NotificationType`: `ABSENCE_WARNING`, `ENROLLMENT_AUTO_PAUSED`.
Telegram yuborish xatosi pauzani **yiqitmaydi** — `warn` log, davom.

### 5. Cron

`AbsenceAutoPauseCronService` — `@Cron('0 30 7 * * *', { timeZone: 'Asia/Tashkent' })`.

Nega 07:30, 23:50 emas: prodda eng erta dars 08:00, eng kech tugash 20:00.
Ertalab kechagi davomat yakunlangan (kechki tuzatishlar ham kirgan), pauza
birinchi darsdan **oldin** ro'yxatga tushadi, xabarlar esa yarim tunda emas,
odam o'qiydigan vaqtda keladi. Yakshanba va bayram kunlari ham ishlaydi
(davomatsiz kun sanoqni o'zgartirmaydi, tuzatishlarni ushlaydi).
`CRONS_ENABLED=false` bo'lgan lokal serverda `ScheduleModule` umuman
yuklanmaydi — alohida gate kerak emas.

Har kompaniya uchun:

1. Sozlamani o'qiydi (yo'q bo'lsa `enabled = false` bilan yaratadi);
   o'chiq bo'lsa — chiqadi.
2. `computeStreaks({ threshold: warnThreshold })` **bir marta**; natija
   `>= pauseThreshold` (pauza) va `[warn, pause)` (ogohlantirish) ga ajratiladi.
3. **Kunlik chegara — fail-closed.** Pauza nomzodlari `dailyCap` dan ko'p
   bo'lsa — **hech kim pauza qilinmaydi**, CEO larga `SYSTEM` xabar:
   «N ta nomzod, chegara M — tekshiring». Ommaviy xato (davomat noto'g'ri
   kiritilgan kun, migratsiya) bir kechada yuzlab o'quvchini muzlatib
   qo'ymasin. Hisoblagich yo'q — bitta yurishda tekshiriladi. Ertasi kun
   ham shu holat bo'lsa — yana xabar; CEO chegarani oshiradi yoki ma'lumotni
   tuzatadi; shu orada admin `/outreach` dan qo'lda muzlatadi.
   Ogohlantirishlar chegaraga bog'liq emas — yuboriladi.
4. Har bir nomzod alohida qayta ishlanadi: o'quvchi **qayta o'qiladi**
   (hamon `ACTIVE` mi — admin shu paytda chiqarib yuborgan bo'lishi mumkin),
   keyin tizim aktori bilan `FROZEN`. Bittasi yiqilsa — log, qolganlari
   davom etadi; xatolar CEO xabariga qo'shiladi.
   **Bitta yurish yaxlit tranzaksiya EMAS:** mavjud status oqimi
   (`changeStatus`) tranzaksion emas — ichida faqat oldindan to'langan
   darslarni qaytarish o'z `Serializable` tranzaksiyasida ketadi. Buni
   yaxlitlash butun status oqimini qayta yozishni talab qiladi va bu ishning
   doirasidan tashqarida; oqibati esa bezarar — nomzodlar bir-biridan
   mustaqil.
5. Ogohlantirishlar yuboriladi, `AbsenceWarningLog` ga yoziladi.

### 6. Pauzadan keyin

- **Davomatini tuzatib bo'lmaydi.** `attendance-save` faqat ACTIVE yozuvlar
  uchun qator qabul qiladi. Noto'g'ri pauza bo'lsa (ustoz kech tuzatgan —
  prodda davomatning 5,6% i keyingi kundan keyin o'zgartiriladi): avval
  **Faollashtirish**, keyin davomatni tuzatish. Faollashtirish sanoq oynasini
  yangilaydi, shuning uchun tuzatilgan eski qatorlar qayta pauzaga olib
  kelmaydi.
- **Qaytgan o'quvchi:** admin profil yoki `/outreach` dan «Faollashtirish»
  bosadi — `PATCH /students/:id/status { status: ACTIVE }`, sabab so'ralmaydi.
  Yozuv `ACTIVE` ga qaytadi (guruh hamon `ACTIVE` bo'lsa — mavjud cascade
  filtri), keyingi dars odatdagidek balansdan yangi paket ochadi. Ustoz uni
  ro'yxatda ko'radi. Filial guruhiga «✅ qaytadan faol» ketadi.
- **Qaytmagan o'quvchi:** muzlatilgan o'quvchining mavjud yo'llari —
  profil sahifasidagi qarzni hisobdan chiqarish (FROZEN yozuv uchun bor),
  `ARCHIVED`. `FROZEN → EXPELLED` to'g'ridan-to'g'ri yo'q (status
  o'tishlari `FROZEN: [ACTIVE, ARCHIVED]`) — bu hozirgi qoida, o'zgarmaydi.
- **O'quvchi ilovasi:** muzlatilgan o'quvchi kira oladi; guruhi jadvaldan
  yo'qoladi (portal ACTIVE yozuvlarni o'qiydi). Nega — Telegram xabari
  tushuntiradi. Ilovada alohida «pauzada» ekrani **qilinmaydi** (YAGNI).
- **Ko'chirish:** pauzadagi o'quvchini boshqa guruhga qo'shish —
  `enrollToGroup` faol yozuv topmaydi va yangi yozuv ochadi, muzlatilgan
  eski yozuv ochiq qoladi. Bu mavjud xatti-harakat (qo'lda muzlatilganlar
  uchun ham shunday) va bu ishning doirasidan tashqarida — ko'chirish
  dialogiga **hech narsa qo'shilmaydi**. To'g'ri tartib: avval
  faollashtirish, keyin ko'chirish.

### 7. Sozlamalar

```prisma
model AbsencePauseSetting {
  id             String   @id @default(uuid())
  companyId      Int      @unique
  company        Company  @relation(fields: [companyId], references: [id])
  enabled        Boolean  @default(false)
  warnThreshold  Int      @default(2)   // 1..10
  pauseThreshold Int      @default(3)   // 2..20, > warnThreshold
  dailyCap       Int      @default(10)  // 1..100
  updatedById    Int?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model AbsenceWarningLog {
  id            String     @id @default(uuid())
  enrollmentId  String
  enrollment    Enrollment @relation(fields: [enrollmentId], references: [id])
  studentId     Int
  groupId       String
  absenceDate   DateTime   @db.Date   // sanoqdagi oxirgi ABSENT sanasi
  streak        Int
  sentToStudent Boolean               // Telegram yetdimi
  companyId     Int
  createdAt     DateTime   @default(now())

  @@unique([enrollmentId, absenceDate])
  @@index([studentId])
}
```

SCD2 emas — prognoz yoki oylik hisobiga kirmaydi; o'zgarish tarixi
`EntityHistory` ga tushadi. Filial bo'yicha alohida chegara **yo'q** (YAGNI).

Sahifa `/settings/absence-pause` — «Administratsiya» bo'limi
(`settings-nav.ts`): yoqish/o'chirish, ikki chegara, kunlik chegara, va
«Pauzadagilar» ro'yxatiga havola. **Yozish — faqat CEO** (sozlama butun
kompaniyaga taalluqli; Branch Director o'zgartirsa ikkinchi filialga ham
ta'sir qiladi). O'qish — CEO / Branch Director.

### 8. `/outreach`

- **«Ko'p dars qoldirganlar»** tabi: chegara `3` qat'iy edi — endi
  sozlamadagi `warnThreshold` (2). Javobga `pauseThreshold` qo'shiladi
  («pauzagacha N dars» ustuni shundan hisoblanadi) va har qatorga
  `warnedAt` — o'quvchi ogohlantirilgan sana (`AbsenceWarningLog` dan),
  «Ogohlantirildi 12.09» belgisi uchun. Avtomatika yoqilgach bu ro'yxat —
  adminning qo'ng'iroq ro'yxati: chegaraga yetganlar ertalab o'zi pauzaga
  tushadi.
- **«Pauzadagilar»** — yangi 4-tab, `GET /outreach/auto-paused`: `status =
  FROZEN` va `statusChangeReason` `Avtomatik pauza` bilan boshlanadigan
  o'quvchilar; qachon, necha darsdan keyin, oxirgi kelgan sanasi, qarzi,
  «Bog'lanildi» belgisi va **«Faollashtirish»** tugmasi (mavjud endpoint).
  Filial qamrovi — `@BranchScope()` orqali, boshqa tablar kabi.

## Texnik tarkib

### Server

| Fayl | O'zgarish |
|---|---|
| `outreach/absence-streak.service.ts` | sanoq oynasi (`startDate`/`statusChangedAt`), `PlannedAbsence` join, `cancellationId` filtri; `lastAbsenceDate` qaytarishi bor |
| `students/students-status.service.ts` | `applyStatusChange` + `StatusChangeActor`; `changeStatus` — `user` aktori bilan yupqa o'ram |
| `absence-pause/` (**yangi modul**) | `AbsencePauseSettingService` (o'qish/yozish), `AbsenceAutoPauseCronService`, `AbsencePauseController` (`GET/PATCH /absence-pause/settings`) |
| `outreach/outreach.service.ts` + controller | `getRemovalQueue` chegarasi sozlamadan; `getAutoPaused` |
| `notifications/notification-events.listener.ts` | 2 ta yangi turni tarqatish |
| `prisma/schema.prisma` | 2 ta model + 2 ta `NotificationType` |

`src/` da `settings` moduli yo'q — sozlama sahifalari o'z modulidan
oziqlanadi (`student-exit-reasons` kabi), shuning uchun alohida modul.

### Klient

| Fayl | O'zgarish |
|---|---|
| `app/(dashboard)/settings/absence-pause/` | **yangi** sahifa |
| `lib/settings-nav.ts` | menyu qatori |
| `components/outreach/paused-tab.tsx` | **yangi** tab |
| `components/outreach/removal-queue-tab.tsx` | «pauzagacha N» ustuni, «Ogohlantirildi» belgisi |
| `components/outreach/outreach-page-client.tsx` | 4-tab |

### Migratsiya

`prisma migrate dev` bu repoda ishlamaydi — qabul qilingan tartib:
`prisma migrate diff` → `prisma db execute` → `prisma migrate resolve`.

Seed shart emas: sozlama qatori birinchi o'qishda `enabled = false` bilan
tug'iladi. **Migratsiya o'z-o'zidan hech kimni pauza qilmaydi** — CEO
sahifadan yoqmaguncha cron bo'sh yuradi. Yoqish tugmasi — deploydan keyingi
oxirgi, ongli qadam.

### ADR

Bu ish **ADR talab qiladi** (CLAUDE.md qoidasi): pul semantikasi o'zgaradi
(tizim o'zi hisoblashni to'xtatadi) va yangi fail-closed tanlov kiritiladi
(kunlik chegara oshsa — hech kim). Shu PR ichida —
`docs/adr/0022-avtomatik-pauza-chiqarmaydi.md`: **«Avtomatik pauza
o'quvchini guruhdan chiqarmaydi»** — nega harakat `FROZEN` (mavjud
muzlatish), `DROPPED` emas; nega chegara oshganda tizim hech narsa
qilmaydi; nega faollashtirish sanoqni noldan boshlaydi.

## Testlar

- `absence-streak.service.spec.ts` — SABABSIZ oldindan qoldirish sanaladi,
  SABABLI uzadi; bekor qilingan dars ko'rinmaydi; PRESENT uzadi;
  **faollashtirilgan yozuvda eski ABSENT lar sanalmaydi**; qayta yozilgan
  o'quvchi eski tarixni meros qilmaydi
- `students-status.service.spec.ts` — `system` aktori filial tekshiruvini
  va sabab ro'yxatini chetlab o'tadi, lekin faqat `ACTIVE → FROZEN` ni
  biladi; `user` aktori avvalgidek
- `absence-auto-pause.cron.spec.ts` — chegaradan oshganda **hech kim** pauza
  qilinmaydi va CEO xabar oladi; `enabled = false` da hech narsa; bitta
  yozuv yiqilsa qolganlari davom etadi; tranzaksiya ichida `ACTIVE`
  bo'lmagan yozuv o'tkazib yuboriladi; bir `absenceDate` uchun ikkinchi
  ogohlantirish ketmaydi; Telegram xatosi pauzani yiqitmaydi
- `outreach.service.spec.ts` — `getAutoPaused` faqat avtomatik muzlatilganlarni
  beradi, filial qamrovi ishlaydi
- `absence-pause.controller.spec.ts`, `outreach.controller.spec.ts` — `@Roles`
  bor, `Student` rad etiladi, sozlamani yozish faqat CEO
- Vaqtga bog'liq test yozilmaydi (CI 23:40–00:02 da yiqiladigan naqsh bor):
  cron metodi to'g'ridan-to'g'ri chaqirib sinaladi

## Kutilayotgan ta'sir

Birinchi ertalab (2026-09-19 holati, yangi sanoq qoidasi bilan):

| | |
|---|---:|
| Pauza bo'ladi | **≤ 5** yozuv (sanoq oynasi qaytarilganlarni chiqarib tashlashi mumkin) |
| Ogohlantirish oladi | **21** yozuv |

Kunlik chegara (10) oshmaydi. Zaxira yo'q — eng uzun holat 4 ta dars.

Doimiy rejimda: haftasiga ≈10 ta pauza, shundan ≈4 tasi qaytib kelib
faollashtirish talab qiladi.

**Ko'rinadigan yon ta'sirlar:**

- «Faol o'quvchi» ko'rsatkichi pauzadagilar hisobiga tushadi (hozir 5 ta) —
  ta'rif «statusi ACTIVE va faol guruhda faol yozuvi bor»
  ([CONTEXT.md](../../../CONTEXT.md)); to'g'ri xatti-harakat.
- «Muzlatilgan» ro'yxatida avtomatik va qo'lda muzlatilganlar aralash turadi —
  sabab matni ajratadi.
- Telegram kunlik hisobotda «ketganlar» o'zgarmaydi — u faqat `DROPPED` ni
  sanaydi.
- Kosmetik: guruhning «Davomat (nuqtalar)» tabida qaytarilgan o'quvchining
  pauza davri «Belgilanmagan» bo'lib ko'rinadi (a'zolik oynasi
  `FROZEN` oralig'ini bilmaydi). Qo'lda muzlatilganlarda ham shunday;
  tuzatilmaydi.

## Nima QILMAYMIZ

- **Yozuv darajasidagi yangi pauza** — bir o'quvchi = bir faol yozuv, mavjud
  muzlatish yetarli
- **Avtomatik guruhdan chiqarish** — 3 ta qoldirganlarning 42% i qaytib keladi
- **Avtomatik faollashtirish** (davomat tuzatilganda) — pauzadagi davomat
  tuzatilmaydi, admin avval faollashtiradi
- **Avtomatik qarz kechirish** — pauza pulga tegmaydi
- **Filial bo'yicha alohida chegara**, **sinov muddati**, **SMS** (Eskiz
  faol emas), **ota-onaga xabar** (telefon yo'q), **ilovada pauza ekrani**
- **Quruq rejim** — CEO darrov yoqishni tanladi; o'rniga: migratsiya
  `enabled = false`, kunlik chegara, o'chirish tugmasi

## Xavflar

| Xavf | Nima qilamiz |
|---|---|
| 2026-07-14 dagidek kutilmagan ommaviy o'zgarish | Kunlik chegara **fail-closed**; migratsiya o'chiq holda chiqadi; sozlamada o'chirish tugmasi |
| Faollashtirilgan o'quvchi o'sha kuni yana pauzaga tushadi | Sanoq oynasi `statusChangedAt` dan — testda qotirilgan |
| Ustoz davomatni kech tuzatadi → noto'g'ri pauza | Cron ertalab (kechki tuzatishlar kiradi); noto'g'ri bo'lsa faollashtirish bir tugma, pul yo'qolmaydi |
| O'quvchi har kuni bir xil ogohlantirish oladi | `AbsenceWarningLog` unique `(enrollmentId, absenceDate)` |
| Ustoz ro'yxati sababsiz qisqaradi | Ustozga bildirishnoma + filial guruhiga broadcast |
| `/outreach` ro'yxati ta'rifi o'zgaradi | Bitta funksiyadan o'qiladi — ro'yxat va harakat zid bo'lmaydi |
| Branch Director sozlamani o'zgartirib boshqa filialga ta'sir qiladi | Yozish faqat CEO |
