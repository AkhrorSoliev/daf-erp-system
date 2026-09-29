# Davomati olinmagan dars — «Dars bo'ldimi?» savoli

**Sana:** 2026-09-29
**Holati:** CEO bilan kelishildi (chatda), yozma ko'rik kutilmoqda
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

## 2. CEO qarorlari (29.09.2026)

| # | Savol | Qaror |
|---|-------|-------|
| Q1 | Qayerda so'raladi | Tizimda: «Topshiriqlar» va «Jadval». Telegram faqat xabar beradi |
| Q2 | «Bo'ldi» bosilsa | Administrator kim keldi / kelmadini kiritadi. O'quvchi puli markazda, ustozga bu dars uchun haq **yozilmaydi**, uning ulushi markazda qoladi |
| Q3 | «Bo'lmadi» bosilsa | Sabab so'raladi, dars bekor qilinadi (pul qaytadi), Telegram guruhiga **darhol** xabar |
| Q4 | Dars tugagach davomat | **Yangi** davomatni hech kim kiritolmaydi. Olingan davomatni administrator / direktor / CEO keyin tuzata oladi |
| Q5 | Javob bo'lmasa | Tizim taxmin qilmaydi. Ertasi kun eslatma, 1 kundan ortiq javobsizlar CEO ga |
| Q6 | Kim javob beradi | Administrator, filial direktori, CEO |
| Q7 | Topshiriq kimga | Filialning barcha administratorlariga. Birinchi o'zgartirgan admin oladi, boshqalardan olib tashlanadi |
| Q8 | Davomat oynasi | Hamma rol uchun bir xil: faqat bugun, darsdan 10 daqiqa oldin — dars tugaguncha |

## 3. Jarayon

### 3.1 Davomat oynasi

- **Yangi** davomat (shu dars uchun hali hech qanday yozuv yo'q) — har qanday rol
  uchun faqat bugungi Toshkent sanasida, `lessonStartTime − 10 daqiqa` dan
  `lessonEndTime` gacha (ko'chirilgan darsda ko'chirishning o'z vaqti).
- **Tuzatish** (yozuvlar bor) — CEO, filial direktori, administrator istalgan
  vaqt. Ustoz tuzata olmaydi (mavjud qoida).
- QR sessiya boshlash — yangi davomat bilan bir xil oyna.
- Oldindan belgilash (`PlannedAbsence`) o'zgarmaydi: admin kelajakdagi kunga
  ham belgilay oladi. Shuning uchun oyna umumiy `validateLessonDate` ga emas,
  davomat saqlash va QR boshlash yo'llariga qo'yiladi.
- Dars tugagandan keyin davomat kiritishning **yagona** yo'li — 3.4 dagi
  «Bo'ldi».

### 3.2 Dars tugaganda

Davomat olinmagan, bekor qilinmagan, boshqa kunga ko'chirilmagan, bayram
bo'lmagan har bir tugagan dars uchun:

1. `UnmarkedLesson` yozuvi (holati `PENDING`) yaratiladi.
2. Tizim topshirig'i yaratiladi (3.6).
3. Filial administratorlariga Telegram / push xabari: «Davomat olinmadi.
   Tizimda topshiriq ochildi: dars bo'ldimi?» + havola. Bu hozirgi
   `ATTENDANCE_MISSING_ADMIN` matnining o'rnini egallaydi. Ustozga ketadigan
   `ATTENDANCE_MISSING_TEACHER` matni o'zgarmaydi.

### 3.3 Qayerda javob beriladi

- **Topshiriqlar** sahifasi — topshiriq kartasidagi «Javob berish» tugmasi
  Jadvaldagi o'sha dars oynasini ochadi.
- **Jadval** sahifasi — javobi kutilayotgan dars kartasi ustida ochiq turadigan
  oyna: «✅ Bo'ldi» / «❌ Bo'lmadi». Sana tanlagich bilan o'tgan kunlar ham.
- Topshiriq boshqa admin tomonidan olingan bo'lsa, qolgan adminlar oynada
  «<Ism Familiya> javob bermoqda» yozuvini ko'radi, tugmalar o'chiq.
  Direktor va CEO baribir javob bera oladi.

### 3.4 «Bo'ldi»

1. O'quvchilar ro'yxati ochiladi (mavjud davomat formasi). Hamma belgilanishi
   shart (mavjud to'liq ro'yxat qoidasi).
2. Saqlashda, bitta Serializable tranzaksiyada:
   - `UnmarkedLesson` → `HELD`, `decidedById`, `decidedAt`;
   - davomat odatdagi `AttendanceSaveService` yo'lidan yoziladi, **ustoz haqi
     yozilmaydi**;
   - sababli belgilanganlarga keyingi oy krediti odatdagidek yoziladi;
   - topshiriq yopiladi (3.6).
3. Ustozga xabar: «<Guruh>, <sana>: davomat dars vaqtida olinmagani uchun bu
   dars haqi yozilmadi». Bildirishnoma + push darhol, Telegram 20:00 yig'mada.
4. O'quvchilar pulini markazda qoldiradi; dars `valueHeldLessons` orqali
   markaz tushumiga kiradi (davomat yozuvlari bor).

### 3.5 «Bo'lmadi»

1. Sabab maydoni (majburiy).
2. Mavjud `LessonCancellationsService.create` chaqiriladi — o'sha kunni
   qamragan barcha oylik hisoblar pulni darhol qaytaradi (ADR-0053).
3. Bekor qilish tranzaksiyasi ichida: shu kun uchun `UnmarkedLesson` bo'lsa →
   `NOT_HELD`, `cancellationId`; topshiriq yopiladi. Bu qaysi yo'ldan bekor
   qilinishidan qat'i nazar ishlaydi (guruh sahifasi, skript, shu oyna).
4. Telegram guruhiga **darhol** xabar (admin bot, tasdiqlangan guruhlar,
   `reportBranchIdsForGroup` bo'yicha o'sha filialni ko'radigan guruhlarga):
   «❌ Dars bo'lmadi — <guruh>, <sana> <vaqt>. Sabab: … Belgilagan: <ism>.
   O'quvchilarga pul qaytarildi: N ta, <summa> so'm».
5. Ustoz va o'quvchilar odatdagi bekor qilish xabarini oladi (mavjud
   `LessonCancellationEventsListener`).
6. Bekor qilish o'chirilsa (`DELETE /lesson-cancellations/:id`) va shu kun
   uchun `UnmarkedLesson` bo'lsa → `PENDING` ga qaytadi, yangi tizim topshirig'i
   ochiladi. Pul avtomatik tiklanmaydi (mavjud qoida).

### 3.6 Tizim topshirig'i

- `Comment` (`isTask: true`, `isSystem: true`, `authorId: null`),
  `entityType: 'Group'`, `entityId: groupId`.
- Matn: «#<guruh>, <dd.MM.yyyy> <HH:mm–HH:mm>: davomat olinmadi. Dars bo'ldimi?»
- Muddat: keyingi ish kuni 10:00 (Toshkent). Mavjud `TaskReminderService`
  09:00 da eslatadi — bu Q5 dagi «ertasi kun eslatma».
- Beriladi: filialning barcha faol administratorlariga (hozirgi eslatma
  oladiganlar bilan bir xil ro'yxat).
- **Olish (claim).** Birinchi bo'lib holatni o'zgartirgan admin («Ko'rdim»,
  kartani ustunga surish) yoki darsga javob bergan admin topshiriqni oladi:
  bitta tranzaksiyada qolgan `CommentAssignee` qatorlari o'chiriladi. Shart bilan
  (hali boshqa hech kim olmagan bo'lsa) — ikki admin bir vaqtda bossa, ikkinchisi
  409 «Bu topshiriqni <ism> oldi» oladi.
- Olingan topshiriq faqat oluvchining «Topshiriqlar»ida ko'rinadi.
- `DONE` faqat javob bilan qo'yiladi. Tizim topshirig'ini qo'lda `DONE` qilish,
  tahrirlash, o'chirish — 400.
- Direktor yoki CEO javob bersa — topshiriq yopiladi (qolgan qatorlar `DONE`).
- «Kim berdi»: `author` bo'sh bo'lsa «Tizim».

### 3.7 Javobsiz qolsa

- Savol ochiq turadi, istalgan vaqt javob berish mumkin.
- 21:00 kunlik hisobotining «🚩 Diqqat» qismida: «N ta dars 1 kundan ortiq
  javobsiz» (0 bo'lsa chiqmaydi).

## 4. Ma'lumot modeli

```prisma
enum UnmarkedLessonStatus {
  PENDING
  HELD
  NOT_HELD
}

model UnmarkedLesson {
  id              String               @id @default(uuid())
  companyId       Int
  branchId        Int
  groupId         String
  date            DateTime             @db.Date
  lessonStartTime String
  lessonEndTime   String
  status          UnmarkedLessonStatus @default(PENDING)
  decidedById     Int?
  decidedAt       DateTime?
  cancellationId  String?
  taskCommentId   String?              @unique
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@unique([groupId, date])
  @@index([companyId, status])
}
```

`Comment.authorId` → `Int?` (muallifsiz = tizim).

**Asosiy invariant:** `UnmarkedLesson` yozuvi bor `(groupId, date)` darsi uchun
ustozga haq hech qachon yozilmaydi — holatidan va keyingi tuzatishlardan qat'i
nazar. Yozuv faqat dars tugagandan keyin, davomat yo'q bo'lganda yaratiladi.

## 5. Ustoz haqi — to'rt joy

Bitta yordamchi: `loadUnmarkedLessonKeys(db, companyId, range)` →
`Set<"groupId:YYYY-MM-DD">`. Uni o'qiydigan joylar:

1. Jonli haq yozish — `LessonBillingService.processMonthlyAttendance` /
   `accrueMonthlySalary` (va paketli `bill()` — faol paketli guruh hozir 0, lekin
   qoida bir xil bo'lishi kerak).
2. Oylik kuni «markaz qo'shimchasi» — `salary-calculation.service.ts`
   gap-sweep (davomatni o'qiydigan so'rovlar, ~574 va ~795 qatorlar).
3. Oylik sahifasi hisobi — `salary-monthly.service.ts` (~213).
4. «Qolgan (markaz)» — `salary-center-topup.service.ts` (~90).

Busiz oy oxirida 2–4 davomatni ko'rib «haqi yozilmagan dars» deb topadi va
ustozga markaz hisobidan haq yozadi — qoida jimgina buziladi.

Tushum tomonida o'zgarish yo'q: «Bo'ldi» davomat yozadi, `valueHeldLessons`
uni o'zi topadi.

## 6. Server o'zgarishlari

| Joy | O'zgarish |
|-----|-----------|
| `prisma/schema.prisma` + migratsiya | `UnmarkedLesson`, enum, `Comment.authorId` nullable |
| `attendance/attendance-window.ts` (yangi) | Yangi davomat oynasi — bitta sof funksiya |
| `attendance-save.service.ts` | Yangi davomat → oyna; `forfeitTeacherPay` bayrog'i |
| `qr-attendance-session.service.ts` | Oyna |
| `attendance/unmarked-lessons.service.ts` (yangi) | Yaratish, «Bo'ldi», «Bo'lmadi», olish, ro'yxat |
| `attendance.controller.ts` | `POST :groupId/date/:date/late`, `POST :groupId/date/:date/not-held` (ikkalasi CEO / direktor / administrator, filial tekshiruvi bilan) |
| `attendance-reminder.service.ts` | Dars oxirida yozuv + topshiriq; har tickda bugungi tugagan, yozuvsiz darslarni to'ldirish; ko'chirilgan / bekor qilingan darslarni hisobga olish; yangi admin matni |
| `attendance/unmarked-lessons.cron.ts` (yangi) | Har kuni 23:00 (yakshanba ham): shu kunning qolib ketgan darslari uchun yozuv + topshiriq |
| `lesson-billing.service.ts` | `UnmarkedLesson` bor darsga haq yozmaslik |
| `salary/*` (3 fayl) | 5-bo'lim |
| `lesson-cancellations.service.ts` | Yaratishda `NOT_HELD` + topshiriqni yopish; o'chirishda `PENDING` + yangi topshiriq |
| `comments/*` | `author` null; tizim topshirig'i qoidalari; `task.status.changed` muallifsiz o'tkazib yuboriladi; olish mavjud `PATCH :id/assignee-status` ichida (alohida endpoint yo'q) |
| `dashboard.service.ts` | Har darsga `unmarked: { id, status, claimedBy } \| null` |
| `telegram-groups/*` | «Bo'lmadi» darhol xabari; 21:00 «Diqqat» qatori |
| `telegram-digest` | Ustozga «haq yozilmadi» kategoriyasi |
| `direct-send.guard.spec.ts` + ADR-0025 ro'yxati | Yangi darhol yuboruvchi |
| `scripts/open-unmarked-lessons.ts` | Eski izsiz kunlar uchun yozuv + topshiriq (dry-run, `--apply`) |
| `docs/adr/0054-*.md` | Yangi ADR |
| `server/CLAUDE.md` | Attendance bo'limi |

## 7. Sayt (client) o'zgarishlari

- `components/dashboard/schedule-client.tsx` va dars kartasi — javob kutilayotgan
  darsda ochiq oyna, «Bo'ldi» → davomat formasi (`late` rejimi), «Bo'lmadi» →
  sabab dialogi.
- `components/groups/attendance/attendance-form.tsx` — `late` rejimi (tugagan
  darsda saqlash yangi endpointga ketadi; ogohlantirish: «Ustozga bu dars uchun
  haq yozilmaydi»). Oddiy rejimda tugagan dars uchun yangi davomat qulflangan
  (administrator uchun ham).
- `components/tasks/task-card.tsx` — muallif yo'q → «Tizim»; tizim topshirig'ida
  tahrirlash / o'chirish / «Bajarildi» yo'q, «Javob berish» havolasi bor.
- Topshiriqlar ro'yxati olingandan keyin yangilanadi (boshqa adminlarda yo'qoladi).
- Client'ga prettier ishlatilmaydi.

## 8. Chegara holatlar

- **Dars tugashidan bir soniya oldin saqlangan davomat** — yozuv yaratilmaydi
  (davomat bor). Yaratish ham shart bilan: davomat yo'q bo'lsagina.
- **Ko'chirilgan dars** — asl kunga yozuv ochilmaydi; yangi kunda ko'chirishning
  vaqti bilan.
- **Oldindan bekor qilingan dars** — yozuv ochilmaydi.
- **Cron o'tkazib yuborilsa** (deploy, uzilish) — keyingi tickda bugungi barcha
  tugagan darslar to'ldiriladi; kun oxirida 23:00 yurishi qolganini yopadi
  (eslatma cron'i ishlamaydigan yakshanba ham).
- **ADR raqami** — 0054 band bo'lsa, merge oldidan `docs/adr/README.md` ga
  qarab qayta raqamlanadi.
- **«Bo'ldi» noto'g'ri bosilgan** — direktor / CEO keyin darsni bekor qila
  oladi → `NOT_HELD`, pul qaytadi (ustozga baribir haq yo'q edi).
- **Ustozni almashtirish (`LessonTeacherOverride`)** — invariant darsga
  bog'langan, qaysi ustoz bo'lishidan qat'i nazar.
- **Topshiriq egasi ishdan ketsa** — direktor / CEO Jadvaldan javob beradi.
- **Paketli kurs** — hozir faol paketli guruh yo'q; «Bo'ldi» odatdagi billing
  yo'lidan yozadi, faqat ustoz haqi o'tkazib yuboriladi.

## 9. Chiqarish

1. Server: migratsiya (`railway up` da `prisma migrate deploy`), keyin server.
2. Sayt: Vercel + beshta domen alias.
3. Skript: eski izsiz kunlar uchun dry-run → CEO ko'radi → `--apply`.
4. Birinchi kun: prodda birinchi yozuvlar, topshiriqlar va 21:00 qatorini
   tekshirish.

## 10. Testlar

- Oyna: har rol × (bugun oynada / oynadan oldin / keyin / o'tgan kun /
  kelajak) × (yangi / tuzatish).
- «Bo'ldi»: davomat yoziladi, ustozga `SalaryAccrual` yo'q; keyin
  EXCUSED→PRESENT tuzatilsa ham yo'q; sababli kredit yoziladi.
- Oylikning uch hisobi `UnmarkedLesson` darsini tashlab ketadi.
- «Bo'lmadi»: bekor qilish + `NOT_HELD` + topshiriq yopildi + guruh xabari.
- Bekor qilish o'chirilsa: `PENDING` + yangi topshiriq.
- Olish: birinchisi oladi, ikkinchisi 409; qolgan qatorlar o'chadi.
- Tizim topshirig'ini qo'lda `DONE` / tahrir / o'chirish — 400.
- Cron: bir darsga ikki yozuv yo'q; ko'chirilgan / bekor qilingan / bayram
  kunlari yozuv yo'q.
- Controller guard testlari yangi endpointlar uchun.

## 11. Kiritilmagan

- Topshiriqni qaytarish yoki boshqa adminga o'tkazish.
- Telegramda javob berish tugmalari (davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasi pul qaytaradi, kim bosgani ishonchli emas).
- Ustoz sahifasida o'tgan kun uchun «Saqlash» tugmasini qulflash — 7-bo'limdagi
  forma o'zgarishi bilan birga o'zi hal bo'ladi.
