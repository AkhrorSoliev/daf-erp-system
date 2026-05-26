# Mock Imtihonlar (Mock Exams) — Implementatsiya Rejasi

> Versiya: 1.0 — 2026-05-25  
> Holat: **Tasdiqlangan, implementatsiyaga tayyor**  
> Mualliflar: Akhror Soliev + Claude  
> Bog'liq: [leads-rebuild-plan.md](leads-rebuild-plan.md)

---

## 1. Maqsad va qisqacha tavsif

DaF ERP tizimida **Mock imtihonlar** — Lidlar (`/leads`) bo'limiga parallel yangi vertikal. Maqsad:

1. Admin har bir mock imtihon hodisasi uchun maxsus **forma yaratadi**
2. Foydalanuvchilar **Telegram bot orqali** ro'yxatdan o'tadi (har bir link Telegram ID ga bog'langan)
3. Imtihondan keyin admin har bir ishtirokchi uchun **natijalar (bo'limlar bo'yicha ballar)** kiritadi
4. Natijalar **Telegram bot orqali ishtirokchiga jo'natiladi**
5. Imtihon ishtirokchisini keyinchalik **o'quvchiga aylantirish** mumkin

**Lidlar bilan o'xshashlik:** Section-based organizatsiya, soft-delete, forma builder pattern, RBAC `[CEO, BD, Admin]`.

**Lidlar bilan farq:** Kanban yo'q (faqat sectionlar + grid). Forma ommaviy URL emas, balki **Telegram-gated**. Har imtihonning hayot tsikli (DRAFT → REGISTRATION_OPEN → ... → ANNOUNCED → ARCHIVED) bor.

---

## 2. Domen modeli

### 2.1 Hayot tsikli (lifecycle)

```
DRAFT
  ↓ admin "Ro'yxatga olishni boshlash" tugmasini bosadi
REGISTRATION_OPEN
  ↓ deadline keladi (cron avtomatik) yoki admin yopadi
REGISTRATION_CLOSED
  ↓ admin "Baholash" rejimini yoqadi
GRADING
  ↓ admin "Natijalarni e'lon qilish" tugmasini bosadi
ANNOUNCED  (Telegram orqali xabarlar yuboriladi)
  ↓ admin arxivga oladi (ixtiyoriy)
ARCHIVED
```

### 2.2 Ro'yxatga olish oqimi (Telegram deep-link)

```
Admin                                           Foydalanuvchi (ishtirokchi)
─────                                           ────────────────────────
1. Mock imtihon yaratadi
2. "Ulashish" → https://t.me/DafBot?start=mock_<examId>
3. Bu havolani ulashadi (Instagram, kanal, ...)
                                  ←─────────── 4. Havolani bosadi
                                  ←─────────── 5. Telegramga o'tadi, /start bosadi
                                                 (payload = "mock_<examId>")
                                                 Bot Telegram ID ni oladi
6. Bot scene'ga kiradi:
   - Ism, familiya, telefon so'raydi (yoki ixtiyoriy formaning maydonlari)
   - Har Telegram ID + examId bo'yicha bitta ro'yxatga
   - MockExamParticipant yaratiladi (telegramChatId saqlanadi)
7. Bot tasdiqlash xabari: "Siz ro'yxatga olindingiz ✅"
                                  ←─────────── 8. Foydalanuvchi imtihon kunini kutadi
9. Admin imtihondan keyin ballarni kiritadi
10. "E'lon qilish" tugmasini bosadi
11. Bot har bir ishtirokchiga shaxsiy
    Telegram xabarini yuboradi (natija + ball)
```

**Diqqat:** Forma ommaviy URL ochmaydi (Lidlar `CustomForm` dan farqli). Yagona kirish nuqtasi — Telegram bot. Bu:
- Har ro'yxatga olingan kishi haqiqiy Telegram akkauntiga ega
- Natija yetkazib berish 100% (bot xabari, SMS emas)
- Linkni ulashish ham, qabul qilish ham bot orqali — Telegram ID generatsiya paytida emas, balki **/start paytida** bot tomonidan olinadi (foydalanuvchi tomonidan emas)

### 2.3 Sectionlar (guruhlash)

Mock imtihonlar **sectionlar** ichida joylashadi:
- "IELTS Mock'lari"
- "SAT Mock'lari"
- "DTM Mashqlari"
- "Ichki testlar"

Section UI da kanban column emas, balki kollapslanuvchi guruh sifatida ko'rinadi (oddiy grid).

---

## 3. Ma'lumotlar modeli (Prisma)

`server/prisma/schema.prisma` ga **6 ta yangi model** + 1 enum qo'shiladi.

### 3.1 `MockExamSection`

```prisma
model MockExamSection {
  id          String     @id @default(uuid())
  name        String
  order       Int        @default(0)
  color       String?    // Hex, masalan "#3b82f6" — UI badge uchun
  createdById Int
  deletedAt   DateTime?
  deletedById Int?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  exams       MockExam[]

  @@index([deletedAt])
}
```

### 3.2 `MockExam`

```prisma
model MockExam {
  id                   String          @id @default(uuid())
  title                String          // "IELTS Mock - Yanvar 2026"
  description          String?
  status               MockExamStatus  @default(DRAFT)
  // Sectionga tegishliligi
  sectionId            String
  section              MockExamSection @relation(fields: [sectionId], references: [id], onDelete: Restrict)
  // Imtihon parametrlari
  examDate             DateTime?
  registrationDeadline DateTime?       // Ro'yxatga olishning oxirgi vaqti — cron avtomatik yopadi
  durationMinutes      Int?
  maxScore             Float           @default(100)
  passingScore         Float?
  // Forma sxemasi
  formFields           Json            // FormFieldShape[] (lidlardagi CustomForm bilan bir xil struktura)
  // Telegram bot kiritish nuqtasi
  botStartPayload      String          @unique  // masalan "mock_a7k2x9" — /start argumentida
  // E'lon qilish
  announcedAt          DateTime?
  announcedById        Int?
  announceMessageTemplate String?     // Telegram xabar shabloni (placeholderlar bilan)
  // Audit
  createdById          Int
  deletedAt            DateTime?
  deletedById          Int?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  // Relations
  subjects             MockExamSubject[]
  participants         MockExamParticipant[]

  @@index([sectionId, status])
  @@index([deletedAt])
  @@index([registrationDeadline])
}

enum MockExamStatus {
  DRAFT
  REGISTRATION_OPEN
  REGISTRATION_CLOSED
  GRADING
  ANNOUNCED
  ARCHIVED
}
```

### 3.3 `MockExamSubject` — imtihon ichidagi bo'limlar (Reading/Writing/...)

```prisma
model MockExamSubject {
  id        String   @id @default(uuid())
  examId    String
  exam      MockExam @relation(fields: [examId], references: [id], onDelete: Cascade)
  name      String   // "Reading", "Writing", "Listening", "Speaking"
  maxScore  Float
  order     Int      @default(0)
  scores    MockExamSubjectScore[]

  @@index([examId])
}
```

### 3.4 `MockExamParticipant` — ishtirokchi

```prisma
model MockExamParticipant {
  id           String   @id @default(uuid())
  examId       String
  exam         MockExam @relation(fields: [examId], references: [id], onDelete: Cascade)
  // Telegram identifikatsiya (majburiy — har ishtirokchi botdan keladi)
  telegramChatId  String
  telegramUsername String?
  telegramFirstName String?
  telegramLastName  String?
  // Forma orqali kiritilgan ma'lumot
  firstName    String
  lastName     String
  phone        String
  formData     Json     // raw form payload (qo'shimcha maydonlar uchun)
  // Lidlardagi kabi mavjud o'quvchiga bog'lash mumkin (avtomatik emas)
  studentId    Int?
  student      Student? @relation(fields: [studentId], references: [id], onDelete: SetNull)
  convertedAt  DateTime?  // O'quvchiga aylantirilgan vaqt
  // Yozilish ma'lumotlari
  registeredAt DateTime @default(now())
  // Natija
  totalScore   Float?
  percentage   Float?
  passed       Boolean?
  feedback     String?
  rank         Int?
  gradedAt     DateTime?
  gradedById   Int?
  // E'lon qilish
  resultSentAt    DateTime?
  resultMessageId String?  // Telegram message ID, qayta yuborish uchun
  // Audit
  deletedAt    DateTime?
  subjectScores MockExamSubjectScore[]

  @@unique([examId, telegramChatId])  // bir Telegram akkaunt = bir imtihonda 1 marta
  @@index([examId, deletedAt])
  @@index([studentId])
}
```

### 3.5 `MockExamSubjectScore` — bo'lim bo'yicha ball

```prisma
model MockExamSubjectScore {
  id            String   @id @default(uuid())
  participantId String
  subjectId     String
  participant   MockExamParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  subject       MockExamSubject     @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  score         Float
  feedback      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([participantId, subjectId])
}
```

### 3.6 Diqqat qiladigan tomonlar

- **`@@unique([examId, telegramChatId])`**: bir Telegram akkaunt bir imtihonda ikki marta yozilmaydi
- **Telegram ID majburiy**: `telegramChatId` `null` bo'lmaydi (Lidlardan farq — bu yerda haqiqiy Telegram akkaunti bo'lishi shart)
- **Migration**: Auto-memorydagi qoida bo'yicha `prisma migrate dev` o'rniga `prisma migrate diff` + `db execute` + `migrate resolve` workflow ishlatamiz
- **Onomastik bog'liqlik**: `Student` model ga teskari relation qo'shiladi: `mockExamParticipations MockExamParticipant[]`

---

## 4. Backend strukturasi (NestJS)

```
server/src/mock-exams/
├── mock-exams.module.ts
├── mock-exam-sections.controller.ts
├── mock-exam-sections.service.ts
├── mock-exams.controller.ts
├── mock-exams.service.ts
├── mock-exam-board.service.ts          # section + imtihon ro'yxati birlashtirilgan
├── mock-exam-participants.controller.ts
├── mock-exam-participants.service.ts
├── mock-exam-subjects.controller.ts
├── mock-exam-subjects.service.ts
├── mock-exam-results.service.ts        # rank, foiz, total hisoblash
├── mock-exam-announce.service.ts       # Telegram xabar yuborish
├── mock-exam-deadline-cron.service.ts  # Avtomatik yopish
├── mock-exam-convert.service.ts        # Ishtirokchi → Student konvertatsiya
└── dto/
    ├── create-section.dto.ts
    ├── create-exam.dto.ts
    ├── update-exam.dto.ts
    ├── change-status.dto.ts
    ├── add-subject.dto.ts
    ├── enter-score.dto.ts
    ├── bulk-enter-scores.dto.ts
    ├── announce-results.dto.ts
    └── convert-to-student.dto.ts
```

### 4.1 Endpointlar

| Metod | URL | Maqsad | RBAC |
|---|---|---|---|
| **Sections** ||||
| GET | `/api/mock-exam-sections` | Sectionlar ro'yxati | CEO, BD, Admin |
| POST | `/api/mock-exam-sections` | Yangi section | CEO, BD, Admin |
| PATCH | `/api/mock-exam-sections/:id` | Section yangilash | CEO, BD, Admin |
| DELETE | `/api/mock-exam-sections/:id` | Soft delete | CEO, BD, Admin |
| PATCH | `/api/mock-exam-sections/reorder` | Tartibni o'zgartirish | CEO, BD, Admin |
| **Exams** ||||
| GET | `/api/mock-exams/board` | Sectionlar + ichidagi imtihonlar | CEO, BD, Admin |
| GET | `/api/mock-exams/:id` | Bitta imtihon detali | CEO, BD, Admin |
| POST | `/api/mock-exams` | Yangi imtihon yaratish | CEO, BD, Admin |
| PATCH | `/api/mock-exams/:id` | Yangilash (DRAFT bo'lganda) | CEO, BD, Admin |
| PATCH | `/api/mock-exams/:id/status` | Lifecycle status o'zgartirish | CEO, BD, Admin |
| POST | `/api/mock-exams/:id/announce` | Natijalarni e'lon qilish | CEO, BD, Admin |
| DELETE | `/api/mock-exams/:id` | Soft delete | CEO, BD, Admin |
| GET | `/api/mock-exams/:id/share-link` | Bot deep-link olish | CEO, BD, Admin |
| **Subjects** ||||
| POST | `/api/mock-exams/:examId/subjects` | Bo'lim qo'shish | CEO, BD, Admin |
| PATCH | `/api/mock-exam-subjects/:id` | Bo'limni yangilash | CEO, BD, Admin |
| DELETE | `/api/mock-exam-subjects/:id` | O'chirish | CEO, BD, Admin |
| **Participants** ||||
| GET | `/api/mock-exams/:examId/participants` | Ishtirokchilar ro'yxati | CEO, BD, Admin |
| POST | `/api/mock-exams/:examId/participants/manual` | Qo'lda qo'shish (Telegram ID majburiy emas) | CEO, BD, Admin |
| DELETE | `/api/mock-exam-participants/:id` | Soft delete | CEO, BD, Admin |
| POST | `/api/mock-exam-participants/:id/convert` | O'quvchiga aylantirish | CEO, BD, Admin |
| **Scores** ||||
| POST | `/api/mock-exam-participants/:id/scores` | Bo'limlar bo'yicha ballarni kiritish | CEO, BD, Admin |
| POST | `/api/mock-exams/:examId/scores/bulk` | Bulk save (jadval ko'rinishida) | CEO, BD, Admin |
| POST | `/api/mock-exams/:examId/recalculate-ranks` | O'rinlarni qayta hisoblash | CEO, BD, Admin |

Hech qanday **public REST endpoint yo'q** — ro'yxatga olish faqat Telegram bot orqali (mavjud `server/src/telegram/` moduliga yangi scene qo'shamiz).

### 4.2 Telegram bot integratsiyasi

**Mavjud:** `server/src/telegram/telegram.service.ts` — `telegraf` Telegraf instance, `/start` payload handling, scenes (Student, Teacher, Employee Registration). Redis session.

**Qo'shiladi:**
- `server/src/telegram/scenes/mock-exam-registration.scene.ts` — yangi scene
- `telegram.service.ts` ichida `/start` payload `mock_*` bilan boshlansa, yangi scene'ga kiritish (mavjud `if (payload.startsWith(...))` patterndan)
- `MockExamAnnounceService` — `TelegramService.getBot()` orqali xabar yuborish (`bot.telegram.sendMessage(chatId, text)`)

**Scene mantiqiy oqimi:**
1. Foydalanuvchi `t.me/DafBot?start=mock_<botStartPayload>` ga bosadi
2. Bot payloadni o'qiydi, `botStartPayload` orqali `MockExam` ni topadi
3. Imtihon `REGISTRATION_OPEN` emas — "Hozir ro'yxatga olish yopiq" javobi
4. `examId + telegramChatId` allaqachon bor — "Siz allaqachon yozilgansiz" javobi
5. Bo'lmasa: scene'ga kiritadi, `formFields` bo'yicha har savolni so'raydi
6. Yakuniy: `MockExamParticipant` yaratiladi (telegramChatId, formData, ism/familiya/tel)
7. Tasdiqlash xabari + imtihon sanasi haqida eslatma

### 4.3 Avtomatik yopish (Cron)

`MockExamDeadlineCronService` — har 5 daqiqada ishlaydi:
- `WHERE status = 'REGISTRATION_OPEN' AND registrationDeadline < NOW()` — barchasini `REGISTRATION_CLOSED` ga o'tkazadi
- NestJS `@Cron('*/5 * * * *')` (mavjud `@nestjs/schedule` paketidan)

### 4.4 Konvertatsiya (Lidlardan o'rganib)

`MockExamConvertService.convert(participantId, { branchId, courseId, ... })`:
- Yangi `Student` yaratadi (mavjud `students.service.ts` patternidan)
- `MockExamParticipant.studentId` ga bog'laydi
- `convertedAt` ni belgilaydi
- Lidlardagi `convertLeadDto` patterniga aniq mos

---

## 5. Frontend strukturasi (Next.js)

```
client/src/app/(dashboard)/mock-exams/
├── page.tsx                       # Sections + imtihonlar grid (asosiy sahifa)
├── new/page.tsx                   # Yangi imtihon yaratish
└── [id]/
    ├── page.tsx                   # Imtihon detali — taxminiy 4 ta tab
    ├── edit/page.tsx              # Forma builder
    └── results/page.tsx           # Natijalar kiritish jadvali
```

`/m/[slug]` ommaviy sahifa **yo'q** — Telegram bot oqimi shu maqsadda.

```
client/src/components/mock-exams/
├── mock-exams-page-client.tsx     # Asosiy state, board fetch
├── section-card.tsx                # Section header + ichidagi imtihonlar
├── exam-card.tsx                   # Status badge, sana, ishtirokchilar soni
├── create-exam-drawer.tsx          # Yangi imtihon — title, section, sana, deadline
├── edit-exam-form-builder.tsx      # form-builder-client.tsx ning adaptatsiyasi
├── share-link-dialog.tsx           # Telegram bot deep-link nusxa
├── exam-detail/
│   ├── exam-header.tsx             # Status, sana, "Status o'zgartirish" tugma
│   ├── overview-tab.tsx            # Info + statistika
│   ├── participants-tab.tsx        # Jadval, qidiruv, eksport
│   ├── results-tab.tsx             # Ball kiritish jadvali (har qator = ishtirokchi)
│   └── announcement-tab.tsx        # Telegram xabar shabloni + e'lon qilish
├── add-manual-participant-dialog.tsx
├── score-entry-row.tsx             # Bitta qator (bo'lim ustunlari)
├── announce-dialog.tsx
├── convert-to-student-dialog.tsx   # Lidlardagi convert-lead-dialog patternidan
├── status-transition-menu.tsx
└── subjects-editor.tsx             # Bo'limlar (Reading/Writing/...) CRUD
```

### 5.1 Sidebar

[client/src/lib/nav-items.ts](../client/src/lib/nav-items.ts) — Lidlardan keyin:
```typescript
{ title: "Mock imtihonlar", url: "/mock-exams", icon: GraduationCap, visibleForRoles: [1, 2, 3] },
```

### 5.2 State management

[client/src/hooks/](../client/src/hooks/) ga:
- `use-mock-exams-board.ts` — sectionlar + imtihonlar, fetch + cache
- `use-mock-exam-detail.ts` — bitta imtihon + ishtirokchilar
- `use-mock-exams-ui.ts` — modallar, tanlangan ishtirokchilar

---

## 6. Fazali implementatsiya

Har Faza alohida PR. Faza nomenklaturasi `leads-rebuild-plan.md` bilan birxil.

### **Faza 0 — Schema asoschi** (1 PR, ~200 qator)
- 6 yangi model + 1 enum schema.prisma ga
- `Student` model ga `mockExamParticipations` teskari relation
- Migration: `prisma migrate diff` + `db execute` + `migrate resolve`
- Seed: 4 ta default section ("IELTS", "SAT", "DTM", "Ichki testlar")
- **Acceptance:** `npx prisma studio` da yangi jadvallar ko'rinadi, lokal DB ga migration qo'llangan

### **Faza 1 — Section CRUD** (1 PR, ~400 qator)
- `mock-exam-sections.module.ts` (backend)
- `/mock-exams` ildiz sahifasi (bo'sh, faqat sectionlar)
- "Section qo'shish", rename, delete, reorder
- Sidebar'da "Mock imtihonlar" qatori
- **Acceptance:** Foydalanuvchi sectionlarni yarata oladi va boshqara oladi

### **Faza 2 — MockExam CRUD (forma builderisiz)** (1 PR, ~600 qator)
- `mock-exams.controller.ts/service.ts` CRUD
- "Yangi imtihon" drawer: title, section, examDate, registrationDeadline, maxScore
- `exam-card.tsx` — har section ichida imtihon kartalari
- Imtihon detali sahifasi (faqat "Overview" tab)
- Status transition menu (faqat DRAFT → REGISTRATION_OPEN avval, qolganlari keyingi fazalarda)
- `botStartPayload` avtomatik generatsiya qilinadi (`nanoid(8)`)
- **Acceptance:** Imtihonni section ichida yaratib, ko'rib boshqarish

### **Faza 3 — Forma builder** (1 PR, ~500 qator)
- `formFields` JSON sxemasini imtihonga bog'lash
- `edit-exam-form-builder.tsx` — Lidlardagi `form-builder-client.tsx` ning adaptatsiyasi
- Forma maydonlari: text, phone (default majburiy), email, select, radio, date, textarea, number
- Live preview (Lidlardagi `form-preview.tsx` patternidan)
- Default maydonlar: `firstName`, `lastName`, `phone` (har imtihon uchun majburiy)
- **Acceptance:** Admin formani tahrir qila oladi, preview ishlaydi

### **Faza 4 — Telegram bot scene + ro'yxatga olish** (1 PR, ~700 qator) ⭐
- `server/src/telegram/scenes/mock-exam-registration.scene.ts` — yangi scene
- `telegram.service.ts` da `/start` handler'ga `mock_*` payload prefix qo'shish
- Scene oqimi:
  - Imtihon validatsiyasi (mavjud + REGISTRATION_OPEN + telegramChatId hali ro'yxatga olinmagan)
  - `formFields` bo'yicha har savolni so'rash (Telegraf `scene.wizard` patterni)
  - Telefon raqamni Telegram orqali olish ham mumkin (Contact button)
  - Tasdiqlash + `MockExamParticipant` yaratish
- "Ulashish" dialogi (frontend): `t.me/{BOT_USERNAME}?start=mock_{botStartPayload}` linki + QR kod
- **Acceptance:** Telegram orqali oxirigacha ro'yxatga olib bo'lish mumkin, DB ga yoziladi

### **Faza 5 — Ishtirokchilar boshqaruvi + bo'limlar (subjects)** (1 PR, ~500 qator)
- Imtihon detali sahifasiga "Ishtirokchilar" tab
- Jadval: ism, familiya, telefon, Telegram username, yozilish sanasi, holati
- Qidiruv + saralash
- Qo'lda ishtirokchi qo'shish (Telegram ID ixtiyoriy bu rejimda)
- Eksport CSV
- Ishtirokchini o'chirish (soft delete, qayta tiklash mumkin)
- `subjects-editor.tsx` — Reading/Writing/Listening/Speaking kabi bo'limlarni boshqarish
- **Acceptance:** Ishtirokchilarni to'liq boshqarish va bo'limlar yaratish

### **Faza 6 — Natijalar kiritish** (1 PR, ~600 qator)
- Imtihon detali → "Natijalar" tab
- Jadval ko'rinishi: har qator = bir ishtirokchi, har ustun = bir bo'lim ball
- Inline tahrir + bulk save (`POST /scores/bulk`)
- Avtomatik hisoblash: `totalScore = SUM(subjectScores)`, `percentage = total/max * 100`, `passed = total >= passingScore`
- "O'rinlarni qayta hisoblash" tugmasi → `rank` ni yangilaydi
- Validation: ball ≤ subjectMaxScore
- Status `REGISTRATION_CLOSED → GRADING` da bo'lganda kiritish mumkin
- **Acceptance:** Admin barcha ballarni kiritib, hisoblanganini ko'ra oladi

### **Faza 7 — Natijalarni Telegram orqali e'lon qilish** (1 PR, ~500 qator) ⭐
- "Announcement" tab — Telegram xabar shabloni tahriri
- Placeholderlar: `{ism}`, `{ball}`, `{maxBall}`, `{foiz}`, `{o'rin}`, `{holat}`, `{bo'limlar}`
- "Preview" — bir ishtirokchi misolida xabar ko'rinishi
- "E'lon qilish" tugmasi:
  - Status `GRADING → ANNOUNCED` ga o'tadi
  - `MockExamAnnounceService` har ishtirokchiga `bot.telegram.sendMessage()` chaqiradi
  - Xato bo'lsa retry (3 marta, exponential backoff)
  - `resultSentAt` va `resultMessageId` ga yoziladi
  - UI da har qator yonida ✅ yoki ❌ ko'rinadi
- Qayta yuborish tugmasi (faqat muvaffaqiyatsizlar uchun)
- **Acceptance:** Barcha ishtirokchilarga Telegram orqali natija keladi

### **Faza 8 — Konvertatsiya + cron + arxiv** (1 PR, ~400 qator)
- `convert-to-student-dialog.tsx` — Lidlardagi `convert-lead-dialog.tsx` patternidan
- Ishtirokchini `Student` ga aylantirish (branch, course, group tanlash)
- `MockExamDeadlineCronService` — har 5 daqiqada deadline tekshirib avtomatik yopish
- `ARCHIVED` statusga o'tish (manual)
- Filter bar: status, sana oralig'i, section
- Imtihon detalida solishtirma (avvalgi mock'lar bilan o'rtacha ball)
- **Acceptance:** To'liq foydalanish, deadline avtomatik ishlaydi, ishtirokchilar o'quvchiga aylantiriladi

---

## 7. Texnik nuances va xavfsizlik

### 7.1 `botStartPayload` xavfsizligi
- 8 belgili `nanoid` ishlatamiz (`abc123XY` formatda) — 64^8 ≈ 281 trillion variant
- Hech kim taxmin qila olmaydi
- Bo'lim aktiv emas bo'lsa bot "Yopiq" javobi beradi — payload mavjudligi haqida informatsiya bermaydi

### 7.2 Telegram chat ID dublikati
- `@@unique([examId, telegramChatId])` DB level'da kafolat
- Scene boshida tekshiriladi — UX uchun "Siz allaqachon yozilgansiz, sanasi: ..." javobi
- Bir Telegram akkaunt = bir ro'yxatga olish (ekspluatatsiyani oldini oladi)

### 7.3 Bot xabari yuborishda xatolar
- `Forbidden: bot was blocked by the user` — `resultSentAt` ga `null`, UI da ❌
- `Bad Request: chat not found` — chat o'chirilgan
- Har xato `MockExamAnnounceService` logiga yoziladi
- Admin "Qayta jo'natish" tugmasi orqali muvaffaqiyatsizlarni qayta urinishi mumkin

### 7.4 Rate limiting
- Telegram API: 30 xabar/sekund. `MockExamAnnounceService` `p-limit` yoki o'xshashi orqali parallelni cheklaydi (default `concurrency: 25`)
- Katta imtihonlar (500+ ishtirokchi) uchun progress bar UI

### 7.5 Permissionlar
- Hozircha company-wide (Lidlar kabi), branch scoping qo'shilmaydi
- Auto-memorydagi qoida: CEO hammasini ko'radi
- Faqat `[CEO, Branch Director, Administrator]` rollar kirishi mumkin

### 7.6 Migration workflow
Auto-memorydagi `[Prisma migration workflow]` qoidasi:
```bash
# Migration yaratish
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_mock_exams/migration.sql

# Bazaga qo'llash
npx prisma db execute --file prisma/migrations/<timestamp>_mock_exams/migration.sql

# Migration tarixiga qayd qilish
npx prisma migrate resolve --applied <timestamp>_mock_exams
```

### 7.7 Test strategiya
- Backend: har xizmatning `.spec.ts` faylida unit testlar (Lidlar patterni)
- E2E: Telegram bot scene'ni mocking bilan testlash (`telegraf-test` yoki o'xshashi)
- Frontend: kritik flowlar uchun Playwright (forma yaratish, ball kiritish, e'lon qilish)

---

## 8. Bog'liq fayllar va o'qish kerakli joylar

Implementatsiya boshlashdan oldin o'qib chiqish kerak:

- [server/prisma/schema.prisma:550-718](../server/prisma/schema.prisma#L550-L718) — Lidlar va CustomForm modellari
- [server/src/leads/](../server/src/leads/) — to'liq modul (CRUD pattern uchun)
- [server/src/telegram/telegram.service.ts](../server/src/telegram/telegram.service.ts) — bot setup, `/start` payload handling
- [server/src/telegram/scenes/student-registration.scene.ts](../server/src/telegram/scenes/student-registration.scene.ts) — scene patterni (bizning yangi scene shu asosida quriladi)
- [client/src/components/forms/form-builder-client.tsx](../client/src/components/forms/form-builder-client.tsx) — forma builder UI
- [client/src/components/leads/convert-lead-dialog.tsx](../client/src/components/leads/convert-lead-dialog.tsx) — konvertatsiya pattern
- [docs/leads-rebuild-plan.md](leads-rebuild-plan.md) — fazali yondashuv

---

## 9. Ochiq savollar (keyin hal qilamiz)

1. **Forma maydonlari Telegram scene wizard'ida qanday tartibda so'raladi?**
   Variant A: `formFields` tartibi bilan ketma-ket
   Variant B: `firstName`, `lastName`, `phone` (default) doim birinchi, qolganlari keyin
   **Taklif:** B variant (UX'da yaxshi, telefon Contact button bilan tezroq)

2. **Imtihon o'tib bo'lganidan keyin (`examDate` o'tgan) yangi ishtirokchi qo'shish ruxsat etilsinmi?**
   **Taklif:** Faqat qo'lda admin tomonidan (Telegram orqali yo'q)

3. **Imtihon o'chirilsa Telegram orqali xabarnoma yuborilsinmi?**
   **Taklif:** Ixtiyoriy "Bekor qilish va xabar yuborish" tugmasi

4. **Bir foydalanuvchi bir nechta imtihonga qatnashishi mumkinmi?**
   **Taklif:** Ha, har imtihon alohida `MockExamParticipant` yozuvi (turli `examId`, bir xil `telegramChatId`)

Ushbu savollar implementatsiya paytida aniqlanadi.

---

## 10. Yangilanish tarixi

- **2026-05-25** — Reja yaratildi, tasdiqlandi. Telegram bot integratsiyasi mavjud, scenes pattern qayta foydalaniladi.
