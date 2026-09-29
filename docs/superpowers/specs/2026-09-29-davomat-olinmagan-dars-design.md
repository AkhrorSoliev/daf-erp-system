# Davomati olinmagan dars — «Dars bo'ldimi?» savoli

**Sana:** 2026-09-29
**Holati:** CEO bilan kelishildi (chatda), yozma ko'rik kutilmoqda; 12-bo'limdagi
uch savol ochiq
**Bog'liq:** ADR-0053 (bekor qilingan dars puli darhol qaytadi), ADR-0025 (Telegram
yig'ma xabar), PR #608 (ustoz faqat dars kuni davomat kiritadi)

## 1. Muammo

Oylik to'lov modelida o'quvchi oyning barcha darslari uchun oldindan to'laydi.
Davomat pulga tegmaydi — u faqat ikki narsani hal qiladi: ustozga haq yoziladimi
va uzrli dars keyingi oyga kredit bo'ladimi (`lesson-billing.service.ts`,
`processMonthlyAttendance`).

Davomat umuman olinmagan darsda hozir:

- o'quvchi puli markazda qoladi, lekin dars **markaz tushumiga kirmaydi** —
  Foyda kartasi tushumni davomatdan o'qiydi (`valueHeldLessons`), shuning uchun
  foyda kam ko'rinadi;
- ustozga haq yozilmaydi, lekin davomatni keyin istalgan kun administrator
  kiritsa, haq yoziladi — «davomatni o'z vaqtida olmaslik» hech narsaga
  olib kelmaydi;
- dars aslida bo'lmagan bo'lsa, pul hech qachon qaytmaydi, agar kimdir darsni
  qo'lda bekor qilmasa. 29.09 da shunday 19 kun topilgan (≈5,18 mln so'm),
  17 tasi hali hal qilinmagan;
- tizim «dars bo'lmadi» bilan «davomat unutildi»ni ajrata olmaydi (ADR-0053).

**Hajm (prod, sentabr 01–28):** davomati bor 472 darsdan 10 tasining davomati
dars kunidan keyin kiritilgan (≈2%). Bular va izsiz kunlar yangi jarayonga
tushadi. Faol guruhlar 43 ta, hammasi oylik; yakshanba darsi yo'q; har
filialda kamida bitta faol administrator bor (Farg'ona 5, Namangan 4, Qarshi 1).

## 2. CEO qarorlari (29.09.2026)

| #   | Savol                   | Qaror                                                                                                                                         |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Qayerda so'raladi       | Tizimda: «Topshiriqlar» va «Jadval». Telegram faqat xabar beradi                                                                              |
| Q2  | «Bo'ldi» bosilsa        | Administrator kim keldi / kelmadini kiritadi. O'quvchi puli markazda, ustozga bu dars uchun haq **yozilmaydi**, uning ulushi markazda qoladi |
| Q3  | «Bo'lmadi» bosilsa      | Sabab so'raladi, dars bekor qilinadi (pul qaytadi), Telegram guruhiga **darhol** xabar                                                        |
| Q4  | Dars tugagach davomat   | **Yangi** davomatni hech kim kiritolmaydi. Olingan davomatni administrator / direktor / CEO keyin tuzata oladi                                |
| Q5  | Javob bo'lmasa          | Tizim taxmin qilmaydi. Ertasi kun eslatma, 1 kundan ortiq javobsizlar CEO ko'radigan joyda                                                    |
| Q6  | Kim javob beradi        | Administrator, filial direktori, CEO                                                                                                          |
| Q7  | Topshiriq kimga         | Filialning barcha administratorlariga. Birinchi o'zgartirgan admin oladi, boshqalardan olib tashlanadi                                        |
| Q8  | Davomat oynasi          | Hamma rol uchun bir xil: faqat bugun, darsdan 10 daqiqa oldin — dars tugaguncha                                                               |

## 3. Jarayon

### 3.1 Davomat oynasi

- **Yangi** davomat (shu dars uchun hali hech qanday yozuv yo'q) — har qanday rol
  uchun faqat bugungi Toshkent sanasida, `lessonStartTime − 10 daqiqa` dan
  `lessonEndTime` gacha. Tugash vaqti **kirmaydi**: 17:30 da tugaydigan darsga
  17:29:59 gacha. Ko'chirilgan darsda ko'chirishning o'z vaqti.
- **Tuzatish** (yozuvlar bor) — CEO, filial direktori, administrator istalgan
  vaqt. Ustoz tuzata olmaydi (mavjud qoida).
- QR sessiya boshlash — yangi davomat bilan bir xil oyna.
- Oldindan belgilash (`PlannedAbsence`) o'zgarmaydi: admin kelajakdagi kunga
  ham belgilay oladi. Shuning uchun oyna umumiy `validateLessonDate` ga emas,
  davomat saqlash va QR boshlash yo'llariga qo'yiladi. PR #608 dagi «ustoz
  faqat bugun» tekshiruvi `validateLessonDate` da qoladi.
- Dars tugagandan keyin yangi davomat kiritishning **yagona** yo'li — 3.4 dagi
  «Bo'ldi».
- **Poyga:** davomat saqlash va `UnmarkedLesson` yaratish ikkalasi ham
  Serializable tranzaksiyada, har biri ikkinchisini tekshiradi (saqlash —
  yozuv bormi, yaratish — davomat bormi). Bir dars bir vaqtda ham davomatli,
  ham «olinmagan» bo'lib qolmaydi.

### 3.2 Dars tugaganda

Davomat olinmagan, bekor qilinmagan, boshqa kunga ko'chirilmagan, bayram
bo'lmagan har bir tugagan dars uchun:

1. `UnmarkedLesson` yozuvi (holati `PENDING`) yaratiladi.
2. Tizim topshirig'i yaratiladi (3.6).
3. Filial administratorlariga (hozirgi `ATTENDANCE_MISSING_ADMIN` kanallari)
   yangi matn: «Davomat olinmadi. Tizimda topshiriq ochildi: dars bo'ldimi?»
   + `/tasks` havolasi.
4. Ustozga yangi matnlar (eskisi «administrator bilan bog'lanib tiklang»
   derdi — endi noto'g'ri):
   - dars tugashiga 30 daqiqa qolganda: «Davomat dars tugaguncha olinmasa,
     bu dars uchun haq yozilmaydi»;
   - dars tugaganda: «Davomat dars vaqtida olinmadi — bu dars uchun haq
     yozilmaydi. Dars bo'lgan-bo'lmaganini administrator belgilaydi».

Dars kunlari davomat bilan bir xil qoida bo'yicha aniqlanadi: ko'chirilgan
(`LessonReschedule`, yangi vaqti bilan), bekor qilingan, bayram kunlari hisobga
olinadi. Hozirgi eslatma cron'i ko'chirishni bilmaydi — bu ham tuzatiladi.

Yaratish har :00/:30 tickda bugun tugagan barcha yozuvsiz darslar uchun
(o'tkazib yuborilgan tick keyingisida to'ladi), va har kuni 23:00 da kunning
qolgan darslari uchun.

### 3.3 Qayerda javob beriladi

- **Topshiriqlar** — topshiriq kartasidagi «Javob berish» tugmasi Jadvaldagi
  o'sha darsni ochadi.
- **Jadval** — javobi kutilayotgan dars kartasi ustida ochiq turadigan oyna:
  «✅ Bo'ldi» / «❌ Bo'lmadi». Sana tanlagich bilan o'tgan kunlar ham.
- **Guruh sahifasi, Davomat tabi** — o'sha dars ochilganda qulflangan forma
  o'rniga xuddi shu ikki tugma. Adminlar hozir kechikkan davomatni shu yerdan
  kiritadi; busiz ular tushuntirishsiz qulflangan formani ko'radi.
- Topshiriq boshqa admin tomonidan olingan bo'lsa, qolgan adminlar «<Ism
  Familiya> javob bermoqda» yozuvini ko'radi, tugmalar o'chiq. Direktor va CEO
  baribir javob bera oladi.

### 3.4 «Bo'ldi»

1. O'quvchilar ro'yxati ochiladi. Ro'yxat — **o'sha kuni guruhda bo'lgan**
   o'quvchilar (a'zolik oynasi qoidasi, `getLessonSequence` da ishlatilgan), hozir
   faol bo'lganlar emas. Shunda keyin guruhdan chiqqan o'quvchi ham, oxirgi
   darsdan keyin yopilgan guruh ham to'g'ri belgilanadi. Guruh holati:
   o'chirilmagan bo'lsa bo'ldi (`ACTIVE` shart emas). Hamma belgilanishi shart.
2. Saqlashda, bitta Serializable tranzaksiyada:
   - `UnmarkedLesson` → `HELD`, `decidedById`, `decidedAt`;
   - davomat odatdagi billing yo'lidan yoziladi, **ustoz haqi yozilmaydi**
     (5-bo'lim);
   - sababli belgilanganlarga keyingi oy krediti odatdagidek;
   - oldindan belgilangan kelmasliklar odatdagidek iste'mol qilinadi;
   - guruh tarixi: «DAVOMAT_KECH_KIRITILDI» (kim, qachon);
   - topshiriq yopiladi (3.6).
3. `attendance.completed` **yuborilmaydi** — u ustozga «Davomat qabul qilindi.
   Rahmat!» deydi. O'rniga ustozga: «<Guruh>, <sana>: davomat dars vaqtida
   olinmagani uchun bu dars haqi yozilmadi». Bildirishnoma + push darhol,
   Telegram 20:00 yig'mada.
4. Dars `valueHeldLessons` orqali markaz tushumiga kiradi (davomat yozuvlari bor).

### 3.5 «Bo'lmadi»

1. Sabab maydoni (majburiy).
2. Mavjud `LessonCancellationsService.create` — o'sha kunni qamragan barcha
   oylik hisoblar pulni darhol qaytaradi (ADR-0053).
3. Bekor qilish tranzaksiyasi ichida: shu kun uchun `UnmarkedLesson` bo'lsa →
   `NOT_HELD`, `cancellationId`; topshiriq yopiladi. Qaysi yo'ldan bekor
   qilinishidan qat'i nazar (guruh sahifasi, skript, shu oyna).
4. Telegram guruhiga **darhol**, commit'dan keyin (admin bot, tasdiqlangan
   guruhlar, `reportBranchIdsForGroup` bo'yicha o'sha filialni ko'radiganlar):
   «❌ Dars bo'lmadi — <guruh>, <sana> <vaqt>. Sabab: … Belgilagan: <ism>.
   Pul qaytarildi: N o'quvchi, <summa> so'm» (`released.students`,
   `released.refunded`). Faqat `UnmarkedLesson` bor kunlar uchun — darsdan
   oldin qilingan oddiy bekor qilishlar guruhga yuborilmaydi.
5. Ustoz va o'quvchilar odatdagi bekor qilish xabarini oladi.
6. Bekor qilish o'chirilsa (`DELETE /lesson-cancellations/:id`, CEO / direktor):
   - shu kun uchun `UnmarkedLesson` bo'lsa → `PENDING`, yangi topshiriq;
   - yozuv yo'q, lekin dars allaqachon tugagan va davomat yo'q bo'lsa (dars
     oldindan bekor qilingan, keyin bekor qilish xato deb o'chirildi) →
     yangi `PENDING` yozuv, `teacherPayExempt: true` — ustoz bekor qilingan
     darsga davomat kirita olmagan edi, uni jazolash noto'g'ri;
   - pul avtomatik tiklanmaydi (mavjud qoida).

### 3.6 Tizim topshirig'i

- `Comment` (`isTask: true`, `isSystem: true`, `authorId: null`),
  `entityType: 'Group'`, `entityId: groupId`.
- Matn: «#<guruh>, <dd.MM.yyyy> <HH:mm–HH:mm>: davomat olinmadi. Dars bo'ldimi?»
- Muddat: keyingi ish kuni (yakshanba va bayram emas) 10:00 Toshkent. Mavjud
  `TaskReminderService` 09:00 da eslatadi (u bayramda ishlamaydi — shuning
  uchun bayram o'tkazib yuboriladi).
- Beriladi: filialning barcha faol administratorlariga (hozirgi eslatma
  oluvchilar). Administrator yo'q bo'lsa — filial direktorlariga, ular ham
  bo'lmasa — CEO larga.
- Umumiy `task.assigned` bildirishnomasi **yuborilmaydi** — 3.2 dagi xabar
  yetarli, aks holda admin bitta dars uchun ikki xabar oladi.
- **Olish.** Birinchi bo'lib holatni o'zgartirgan admin («Ko'rdim», kartani
  ustunga surish — mavjud `PATCH :id/assignee-status`) yoki darsga javob
  bergan admin topshiriqni oladi: bitta tranzaksiyada qolgan
  `CommentAssignee` qatorlari o'chiriladi, shart bilan (hali hech kim
  olmagan bo'lsa). Ikki admin bir vaqtda bossa, ikkinchisi 409 «Bu topshiriqni
  <ism> oldi» oladi.
- Olingan topshiriq faqat oluvchining «Topshiriqlar»ida ko'rinadi. Eslatma
  ham faqat unga.
- `DONE` faqat javob bilan. Tizim topshirig'ini qo'lda `DONE` qilish,
  tahrirlash, o'chirish — 400.
- Direktor yoki CEO javob bersa — topshiriq yopiladi (qolgan qatorlar `DONE`).
- Guruh o'chirilsa — uning `PENDING` topshiriqlari «Guruh o'chirildi» izohi
  bilan yopiladi, yozuv qoladi (ustozga haq baribir yo'q).
- «Kim berdi»: `author` bo'sh bo'lsa «Tizim». Muallifga ketadigan xabarlar
  (`task.status.changed`) muallifsiz topshiriqda o'tkazib yuboriladi.

### 3.7 Javobsiz qolsa

- Savol ochiq turadi, istalgan vaqt javob berish mumkin.
- 21:00 kunlik hisobotining «🚩 Diqqat» qismida: «N ta dars 1 kundan ortiq
  javobsiz» — guruh ko'radigan filiallar bo'yicha, o'chirilgan guruhlarsiz;
  0 bo'lsa chiqmaydi.

## 4. Ma'lumot modeli

```prisma
enum UnmarkedLessonStatus {
  PENDING
  HELD
  NOT_HELD
}

model UnmarkedLesson {
  id               String               @id @default(uuid())
  companyId        Int
  branchId         Int
  groupId          String
  date             DateTime             @db.Date
  lessonStartTime  String
  lessonEndTime    String
  status           UnmarkedLessonStatus @default(PENDING)
  teacherPayExempt Boolean              @default(false)
  exemptReason     String?
  decidedById      Int?
  decidedAt        DateTime?
  cancellationId   String?
  taskCommentId    String?              @unique
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@unique([groupId, date])
  @@index([companyId, status])
}
```

`Comment.authorId` → `Int?` (muallifsiz = tizim).

**Asosiy invariant:** `UnmarkedLesson` yozuvi bor va `teacherPayExempt = false`
bo'lgan `(groupId, date)` darsi uchun ustozga haq hech qachon yozilmaydi —
holatidan va keyingi tuzatishlardan qat'i nazar.

## 5. Ustoz haqi — ikki qulf

Bitta yuklovchi: `loadForfeitedLessonKeys(db, companyId, range)` →
`Set<"groupId:YYYY-MM-DD">` (yozuv bor, `teacherPayExempt = false`).

1. **Yozish qulfi — `SalaryAccrualService.createAccrual`.** Ustoz haqining
   har bir yozuvi shu yerdan o'tadi: jonli oylik haq, paket `bill()`, kechiktirilgan
   (`settleDeferredAccruals`), oylik kuni «markaz qo'shimchasi». `attendanceId`
   bor va dars yuklovchida bo'lsa — yozmaydi. `attendanceId` yo'q yozuvlar
   (balansdan yechish, `creditTeacher`) tegilmaydi.
2. **Hisob qulfi — `sweepGapLessons` (`salary/shared/gap-sweep.ts`).** Uchala
   hisob — oylik kuni qo'shimcha, oylik sahifasi, «Qolgan (markaz)» — shu bitta
   funksiyadan o'tadi (`gap-sweep.single-source.spec.ts` buni qo'riqlaydi).
   Unga **majburiy** `forfeitedLessons` kirishi qo'shiladi; majburiy bo'lgani
   uchun yangi chaqiruvchi uni unutolmaydi (TypeScript xatosi).

Birinchisisiz jonli yo'l haq yozadi; ikkinchisisiz oylik sahifasi ustozga
qarzdek ko'rsatadi, cron esa (birinchi qulf tufayli) yozmaydi — sahifa va
to'lov bir-biriga zid bo'lib qoladi.

Tushum tomonida o'zgarish yo'q: «Bo'ldi» davomat yozadi, `valueHeldLessons`
uni o'zi topadi.

## 6. Server o'zgarishlari

| Joy                                                         | O'zgarish                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` + migratsiya                         | `UnmarkedLesson`, enum, `Comment.authorId` nullable                                                              |
| `attendance/attendance-window.ts` (yangi)                   | Yangi davomat oynasi — bitta sof funksiya                                                                        |
| `attendance-save.service.ts`                                | Yangi davomat → oyna; yozuv bor bo'lsa rad; kech rejim (ro'yxat, `attendance.completed` yo'q)                    |
| `qr-attendance-session.service.ts`                          | Oyna                                                                                                             |
| `attendance/unmarked-lessons.service.ts` (yangi)            | Yaratish, «Bo'ldi», «Bo'lmadi», olish, jadval / guruh uchun ma'lumot                                             |
| `attendance.controller.ts`                                  | `POST :groupId/date/:date/late`, `POST :groupId/date/:date/not-held` (CEO / direktor / administrator, filial tekshiruvi) |
| `attendance-reminder.service.ts`                            | Yozuv + topshiriq; har tickda to'ldirish; ko'chirish / bekor qilishni bilish; yangi admin va ustoz matnlari      |
| `attendance/unmarked-lessons.cron.ts` (yangi)               | Har kuni 23:00: kunning qolgan darslari                                                                          |
| `salary/salary-accrual.service.ts`                          | Yozish qulfi (5.1)                                                                                               |
| `salary/shared/gap-sweep.ts` + 3 chaqiruvchi                | Hisob qulfi (5.2)                                                                                                |
| `lesson-cancellations.service.ts`                           | Yaratishda `NOT_HELD` + topshiriqni yopish + guruh xabari; o'chirishda 3.5.6                                     |
| `lesson-reschedules.service.ts`                             | 12-bo'lim, Q-B                                                                                                   |
| `comments/*`, `notification-events.listener.ts`, `task-reminder.service.ts` | `author` null; tizim topshirig'i qoidalari; olish; `task.assigned` yo'q                          |
| `groups-write.service.ts`                                   | Guruh o'chirilsa topshiriqlarni yopish                                                                           |
| `dashboard.service.ts`                                      | Har darsga `unmarked: { id, status, claimedBy } \| null`                                                         |
| `telegram-groups/*`                                         | «Bo'lmadi» darhol xabari; 21:00 «Diqqat» qatori                                                                  |
| `telegram-digest`                                           | Ustozga «haq yozilmadi» kategoriyasi                                                                             |
| `direct-send.guard.spec.ts` + ADR-0025 ro'yxati             | Yangi darhol yuboruvchi                                                                                          |
| `scripts/open-unmarked-lessons.ts`                          | Eski izsiz kunlar (dry-run, `--apply`), 12-bo'lim Q-C                                                            |
| `docs/adr/0054-*.md`                                        | Yangi ADR (raqam band bo'lsa merge oldidan qayta raqamlanadi)                                                    |
| `server/CLAUDE.md`                                          | Attendance bo'limi, eslatmalar jadvali                                                                           |

## 7. Sayt (client) o'zgarishlari

- `components/dashboard/schedule-client.tsx` va dars kartasi — ochiq oyna,
  «Bo'ldi» → davomat formasi (kech rejim), «Bo'lmadi» → sabab dialogi.
- `components/groups/attendance/*` — guruh sahifasidagi davomat tabida xuddi
  shu oyna; kech rejimda ogohlantirish: «Ustozga bu dars uchun haq
  yozilmaydi». Oddiy rejimda tugagan dars uchun yangi davomat qulflangan
  (administrator uchun ham), ustoz sahifasida ham.
- `components/tasks/task-card.tsx` — muallif yo'q → «Tizim»; tizim topshirig'ida
  tahrirlash / o'chirish / «Bajarildi» yo'q, «Javob berish» bor.
- Olishdan keyin ro'yxat yangilanadi.
- Client'ga prettier ishlatilmaydi.

## 8. Chegara holatlar

- **Davomat tugashdan bir soniya oldin saqlandi** — 3.1 poyga qoidasi.
- **Ko'chirilgan dars** — asl kunga yozuv ochilmaydi; yangi kunda ko'chirishning
  vaqti bilan.
- **Oldindan bekor qilingan dars** — yozuv ochilmaydi (o'chirilsa — 3.5.6).
- **Cron o'tkazib yuborilsa** — keyingi tick yoki 23:00 yurishi.
- **«Bo'ldi» noto'g'ri bosilgan** — direktor / CEO darsni keyin bekor qila
  oladi → `NOT_HELD`, pul qaytadi.
- **Oxirgi dars davomatsiz, keyin guruh yakunlandi** — «Bo'ldi» ishlaydi
  (guruh holati shart emas, ro'yxat — o'sha kungi a'zolar).
- **O'quvchi darsdan keyin guruhdan chiqdi** — ro'yxatda bor (o'sha kungi a'zo).
  Uzrli belgilansa, kredit yopilgan yozilishning keyingi oyiga tushadi va
  ishlatilmaydi — ADR-0053 dagi ma'lum cheklov, bu ish uni kengaytirmaydi.
- **Ustozni almashtirish (`LessonTeacherOverride`)** — invariant darsga
  bog'langan; «haq yozilmadi» xabari o'sha kungi ustozlarga.
- **Topshiriq egasi ishdan ketsa** — direktor / CEO Jadvaldan javob beradi.
- **Javob kechiksa va oy yopilsa** — oylik 01.10 02:00 da hisoblanadi; kutilayotgan
  dars uchun haq yo'q (davomat yo'q), keyin «Bo'ldi» bo'lsa ham yo'q. Tushum
  o'sha dars kuniga (o'tgan oyga) kiradi — o'tgan oyning Foyda kartasi keyin
  o'zgarishi mumkin.
- **Paketli kurs** — faol paketli guruh yo'q; yozish qulfi baribir qoplaydi.

## 9. Chiqarish

1. Server: migratsiya (`railway up` da `prisma migrate deploy`), keyin server.
2. Sayt: Vercel + beshta domen alias.
3. Skript: eski izsiz kunlar uchun dry-run → CEO ko'radi → `--apply`.
4. Birinchi kun: prodda birinchi yozuvlar, topshiriqlar, Telegram matnlari va
   21:00 qatorini tekshirish.

## 10. Testlar

- Oyna: har rol × (bugun oynada / oynadan oldin / tugash daqiqasida / keyin /
  o'tgan kun / kelajak) × (yangi / tuzatish).
- Poyga: yozuv bor bo'lsa saqlash rad etiladi; davomat bor bo'lsa yozuv
  yaratilmaydi.
- «Bo'ldi»: ro'yxat o'sha kungi a'zolar; ustozga `SalaryAccrual` yo'q; keyin
  EXCUSED→PRESENT tuzatilsa ham yo'q; sababli kredit yoziladi;
  `attendance.completed` yo'q; yopilgan guruhda ishlaydi.
- Yozish qulfi: `createAccrual` yuklovchidagi darsga yozmaydi, `attendanceId`
  siz yozuvga tegmaydi. Hisob qulfi: `sweepGapLessons` o'tkazib yuboradi.
- `teacherPayExempt` darsi odatdagidek haq oladi.
- «Bo'lmadi»: bekor qilish + `NOT_HELD` + topshiriq yopildi + guruh xabari
  (commit'dan keyin); oddiy oldindan bekor qilishda guruh xabari yo'q.
- Bekor qilish o'chirilsa: ikkala holat (3.5.6).
- Olish: birinchisi oladi, ikkinchisi 409; qolgan qatorlar o'chadi; eslatma
  faqat egasiga.
- Tizim topshirig'ini qo'lda `DONE` / tahrir / o'chirish — 400; `task.assigned`
  yuborilmaydi; muallifsiz topshiriqda `task.status.changed` yiqilmaydi.
- Cron: bir darsga ikki yozuv yo'q; ko'chirilgan / bekor qilingan / bayram
  kunlari yozuv yo'q; muddat bayram va yakshanbani o'tkazib yuboradi.
- Controller guard testlari yangi endpointlar uchun.

## 11. Kiritilmagan

- Topshiriqni qaytarish yoki boshqa adminga o'tkazish.
- Telegramda javob berish tugmalari (davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasini kim bosgani ishonchli emas, tugma esa pul qaytaradi).

## 12. Ochiq savollar (CEO)

- **Q-A. Ustoz aybdor bo'lmagan holat.** Ustoz davomatni o'zi aybi bilan emas,
  boshqa sabab bilan ololmasligi mumkin: yangi ustozning akkaunti hali
  ochilmagan (sentabrda ikki ustozda aynan shunday bo'lgan, CEO ularga haq
  berishni buyurgan), dars paytida server ishlamay qolgan yoki deploy bo'lgan.
  Tavsiya: «Bo'ldi» da faqat direktor va CEO ko'radigan belgi — «Ustoz aybdor
  emas, haq yozilsin» + majburiy sabab (`teacherPayExempt`, `exemptReason`).
  Busiz bunday ustozga haq faqat qo'lda kreditlash bilan beriladi.
- **Q-B. Dars bo'lmadi, lekin boshqa kunga ko'chiriladi (qo'shimcha dars).**
  «Bo'lmadi» hozir faqat bekor qilish + pul qaytarish. Agar dars keyin
  o'tiladigan bo'lsa, pulni qaytarish noto'g'ri. Tavsiya: «Bo'lmadi» oynasida
  ikkinchi tanlov — «Boshqa kunga ko'chirish» (mavjud dars ko'chirish,
  pul qaytmaydi, yangi kunda ustoz odatdagidek davomat oladi). Qanday bo'lmasin,
  mavjud «ko'chirish» sahifasidan javobi kutilayotgan kun ko'chirilsa, yozuv
  va topshiriq yopiladi.
- **Q-C. 17 ta eski izsiz kun.** Ular yangi qoidadan oldin bo'lgan. Tavsiya:
  skript ularni `teacherPayExempt: true` bilan ochadi — «Bo'ldi» bo'lsa ustoz
  haq oladi, chunki o'sha kunlarda qoida yo'q edi.
