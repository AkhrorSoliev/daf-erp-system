# Dars baholari — o'quvchi darsdan keyin baho qo'yadi — dizayn

**Sana:** 2026-10-13
**Holati:** CEO bilan kelishilgan (13.10.2026, Claude Code suhbati: maqsad, kanal, kim ko'radi, chastota, shkala, ogohlantirish)
**Tayanadi:** ADR-0025 (Telegram: darhol yuboriladiganlar ro'yxati), ADR-0054 (`ended-lessons`, «Dars bo'ldimi?»), ADR-0066 (o'quvchi chati botni rad etishi), ADR-0078 (bot tugmalari `useBeforeScenes` orqali), ADR-0087 (`@CeoOnly()` — imkoniyat emas, kimlik).
**Qaror yozuvi:** yangi ADR — shu PR'da (§8). Raqami — PR paytidagi keyingi bo'sh raqam (yozilish paytida 0089).

## 1. Nima uchun

Rahbariyat dars sifatini faqat shikoyat kelganda yoki o'quvchi ketganda biladi. Har darsdan keyin o'quvchidan bitta bosish bilan baho so'rasak:
- har ustozning o'rtacha bahosi va uning o'zgarishi ko'rinadi;
- past baho bergan o'quvchi bilan u ketmasidan gaplashish mumkin bo'ladi;
- ustozga fikr berish uchun aniq dalil (izohlar) yig'iladi.

Uchala maqsad ham CEO qo'lida: baholarni faqat CEO ko'radi.

## 2. CEO qarorlari (13.10.2026)

1. **Kanal — Telegram bot.** O'quvchilarning ko'pi `dafzentrum_bot`ga bog'langan; ilova va portal bu bosqichda yo'q.
2. **Faqat CEO ko'radi.** Administrator, filial direktori, ustoz — hech kim ko'rmaydi, hech kimga berib bo'lmaydi.
3. **Har darsdan keyin so'raladi.** Baho qo'yilmasa eslatma yuborilmaydi; keyingi darsdan keyin yana so'raladi.
4. **1–5 yulduz + ixtiyoriy izoh.** 1–3 bosilsa «Nima yoqmadi?» deb so'raladi; 4–5 da «Rahmat» va tamom.
5. **Past baho uchun alohida ogohlantirish yo'q.** CEO sahifaga kirib ko'radi.
6. **Ota-ona chati muammo emas:** bola uchun ota-ona baho qo'ysa, u farzandidan so'raydi.

## 3. Kimdan, qachon so'raladi

### 3.1. Qaysi dars

`attendance/shared/ended-lessons.ts`dagi `endedLessonsOn` — «Dars bo'ldimi?» ishlatadigan qoida: jadval, ko'chirilgan va bekor qilingan darslar, filial bayramlari, guruh sanalari, faqat ACTIVE va o'chirilmagan guruhlar. Ikkinchi qoida yozilmaydi.

Hozir bu qoidaning kirishlari (guruhlar, bugungi ko'chirishlar, bekor qilishlar, filial bayramlari) `UnmarkedLessonsService.openForEndedLessons` ichida yuklanadi. Ular bitta yordamchiga chiqariladi — `attendance/shared/load-ended-lessons.ts` (`loadEndedLessonsToday(prisma, holidays, now)` → `{ todayStr, nowMinutes, lessons }`). «Dars bo'ldimi?» ham, baho ham shuni chaqiradi. Bu o'zgarish xatti-harakatni o'zgartirmaydi; mavjud spec'lar buni tasdiqlaydi.

### 3.2. Qachon

- Cron `LessonRatingSenderService` — har 10 daqiqada, 07:00–22:50, dushanba–shanba (`'0 */10 7-22 * * 1-6'`, Asia/Tashkent).
- Dars tugaganiga **kamida 10 daqiqa** va **ko'pi bilan 3 soat** o'tgan bo'lsa yuboriladi. Pastki chegara — o'quvchi xonadan chiqib ulgursin. Yuqori chegara — tizim kun o'rtasida yoqilsa, ertalabki darslar uchun xabarlar to'planib ketmasin; davomat kech olinsa ham 3 soat ichida keyingi aylanish uni ushlaydi.
- Sozlama o'chiq bo'lsa (§6.1) cron hech narsa qilmaydi.

### 3.3. Kimga

Shu dars (`groupId` + bugungi sana) uchun davomatda:
- holati `PRESENT` yoki `LATE`, `cancellationId` bo'sh;
- o'quvchi kartasi o'chirilmagan (`deletedAt: null`);
- `Student.telegramChatId` bor va `telegramDisconnectedAt` bo'sh (bot rad etilgan chatga baho so'rash ma'nosiz);
- shu o'quvchi va dars uchun `LessonRating` qatori hali yo'q.

Bitta chat bir nechta o'quvchiga bog'langan bo'lsa (aka-uka), har o'quvchiga alohida xabar ketadi, xabar o'quvchining ismini aytadi.

### 3.4. Ustoz

Xabar yuborilgan paytdagi dars ustozlari muzlatib yoziladi: shu kun uchun `LessonTeacherOverride` bo'lsa uning `teacherIds`, aks holda guruhning `GroupTeacher` ro'yxati. Keyin ustoz almashsa ham baho o'z egasida qoladi. Guruhda ikki ustoz bo'lsa, baho ikkalasiga ham hisoblanadi.

## 4. Ma'lumot

```prisma
enum LessonRatingStatus {
  SENT    // qator yozildi; messageId bo'lsa xabar yetgan
  FAILED  // Telegram rad etdi — qayta urinilmaydi
}

/// Darsdan keyin o'quvchidan so'ralgan baho (yangi ADR, §8). Bitta dars — bitta qator.
model LessonRating {
  id              String             @id @default(uuid())
  companyId       Int
  branchId        Int                // guruh filiali, yuborilgan paytda muzlatiladi
  groupId         String
  studentId       Int
  date            DateTime           @db.Date
  teacherIds      Int[]              // dars ustozlari, yuborilgan paytda muzlatiladi
  chatId          String
  messageId       Int?               // yetkazilgan xabar; null = yetmagan
  promptMessageId Int?               // «Nima yoqmadi?» so'rovi
  status          LessonRatingStatus @default(SENT)
  score           Int?               // 1–5
  comment         String?            // ≤ 500 belgi
  sentAt          DateTime           @default(now())
  ratedAt         DateTime?
  commentedAt     DateTime?
  failReason      String?

  @@unique([groupId, studentId, date])
  @@index([companyId, date])
  @@index([chatId, promptMessageId])
}
```

`Group`, `Student`, `Company` bilan relatsiyalar odatdagidek. Baho tarixga (`EntityHistory`) yozilmaydi: bu xodimning o'zgartirishi emas, o'quvchining javobi.

**Takror yuborilmaydi:** qator xabardan OLDIN yoziladi; `@@unique` tufayli ikki parallel cron (deploy paytida eski va yangi instans) bitta o'quvchiga ikki marta yubora olmaydi — ikkinchisi `P2002` olib o'tkazib yuboradi.

**Yetkazilgan** = `messageId` bor. Jarayon qator yozilgandan keyin, yuborishdan oldin yiqilsa, qator `SENT` va `messageId` bo'sh qoladi: u «yuborildi» deb sanalmaydi.

## 5. Bot

### 5.1. Xabar

Matn (HTML, nomlar `escapeHtml` bilan):

```
📚 <b>{Ism}</b>, bugungi «{guruh}» darsi qanday o'tdi?
Ustoz: {Ism Familiya}[, {Ism Familiya}]

Baho bering:
```

Bitta qatorda beshta tugma: `1 ⭐` … `5 ⭐`, callback `lr:<ratingId>:<1-5>` (≤ 64 bayt).

Yuborish `sendTelegramText` (`telegram-digest/telegram-send.ts`) orqali — 429 da bir marta kutadi. Muvaffaqiyat → `messageId` yoziladi. Xato → `status = FAILED`, `failReason = describeError(...)`, qayta urinilmaydi (doimiy xato bo'lsa ADR-0066 chatni o'zi belgilaydi).

### 5.2. Tugma bosilganda

`LessonRatingTelegramHandler` `onApplicationBootstrap`da `TelegramService.useBeforeScenes`ga bitta `Composer` qo'shadi (topshiriqlar bilan bir xil yo'l, ADR-0078): ochiq scene bosishni yutib yubormaydi.

Tekshiruvlar, shu tartibda:
1. Qator bor va `ctx.chat.id === row.chatId`. Aks holda: «Bu so'rov sizga emas».
2. `sentAt`dan 48 soat o'tmagan. Aks holda: «Baho berish muddati o'tgan» va tugmalar olib tashlanadi.
3. `score` bo'sh. Yozish shartli: `updateMany({ where: { id, score: null }, data: { score, ratedAt } })`; `count = 0` bo'lsa — «Siz allaqachon baho bergansiz», tugmalar olib tashlanadi.

Muvaffaqiyat: xabar «Rahmat! Siz {n} ⭐ qo'ydingiz.» deb tahrirlanadi (tugmalarsiz).

`score ≤ 3` bo'lsa bot yangi xabar yuboradi: «Nima yoqmadi? Shu xabarga javob qilib yozing (ixtiyoriy).» — `force_reply` bilan; uning `message_id`si `promptMessageId`ga yoziladi.

Har qanday kutilmagan xato loglanadi, foydalanuvchiga «Keyinroq urinib ko'ring» deyiladi; bot yangilanish oqimi yiqilmaydi.

### 5.3. Izoh

Xuddi shu `Composer`dagi `message` ishlovchisi: matnli xabar `reply_to_message.message_id` bo'yicha `(chatId, promptMessageId)` qatoriga mos kelsa, `comment` bo'sh bo'lsa va 48 soatlik muddat ichida bo'lsa — izoh saqlanadi (bo'shliqlar kesiladi, 500 belgigacha qisqartiriladi), javob: «Rahmat, fikringiz yetkazildi.» Boshqa har qanday xabar — `/` bilan boshlangani, rasm, mos kelmagan javob — `next()` bilan botning o'z oqimiga o'tadi. Izohni o'zgartirib bo'lmaydi: birinchisi qoladi.

### 5.4. Darhol yuborish (ADR-0025)

Baho xabari 20:00 yig'masiga qo'shilmaydi: u dars tugagandan keyingi daqiqalarda ma'noga ega. `src/lesson-ratings/` `direct-send.guard.spec.ts`dagi ruxsat ro'yxatiga qo'shiladi; yangi ADR buni ADR-0025 ro'yxatiga qo'shimcha sifatida qayd etadi. Tungi tinchlik kerak emas: cron 22:50 da to'xtaydi.

## 6. CEO sahifasi

### 6.1. Kirish va sozlama

- Barcha `/lesson-ratings/*` route'lari `@CeoOnly()` — imkoniyat emas, kimlik (ADR-0087). Katalogga kalit qo'shilmaydi, «Ruxsatlar» sahifasida ko'rinmaydi, hech kimga berilmaydi. Yangi route'lar `permission-routes.spec.ts` talab qiladigan joylarga yoziladi (`route-access.snapshot.json`, `intentional-access-changes.ts`, kerak bo'lsa `branch-route-policy.ts`).
- Sozlama: `lessonRating.enabled` (`settings.types.ts` registri, `companyLevelOnly: true`, boshlang'ich qiymati `false`). Tizim o'chiq holda chiqadi; CEO yoqadi.
- Klient: `isCeoUser(user)` (`@/hooks/use-auth`). `reports-nav.ts` elementiga `settings-nav.ts`dagidek `ceoOnly` bayrog'i qo'shiladi; `canEnterReports` / `canOpenReportPath` `isCeo`ni oladi.

### 6.2. Endpointlar

Hammasi `@CeoOnly()`, `@BranchScope()` (header'dagi filial; `null` = hamma filial). Oy — `month=YYYY-MM`, Toshkent oyi; standart — joriy oy. Sana chegaralari `common/date/tashkent` orqali (`@db.Date` ustuni, `lt` keyingi oy).

| Route | Javob |
|---|---|
| `GET /lesson-ratings/summary?month=` | `{ enabled, month, totals: { average, rated, delivered, responseRate, low }, previousAverage, teachers: [{ teacherId, name, average, rated, delivered, low, previousAverage }] }` |
| `GET /lesson-ratings/teachers/:id?month=` | `{ teacher, months: [{ month, average, rated }] (oxirgi 6 oy), groups: [{ groupId, name, average, rated }], comments: [{ date, groupName, studentId, studentName, score, comment }] }` |
| `GET /lesson-ratings/low?month=&page=&pageSize=` | 1–3 baholar, eng yangisi birinchi: `{ data: [{ id, date, groupId, groupName, teacherNames, studentId, studentName, score, comment }], total, page, pageSize }` |
| `PATCH /lesson-ratings/settings` `{ enabled: boolean }` | `{ enabled }` — `SettingsService.set` orqali |

Qoidalar (bitta joyda — `lesson-ratings/rating-math.ts`, sof funksiyalar, testlangan):
- `average` — faqat baho qo'yilgan qatorlar bo'yicha, bir xona aniqlikda; baho yo'q bo'lsa `null`.
- `delivered` — `messageId` bor qatorlar; `rated` — `score` bor qatorlar; `responseRate = rated / delivered` (`delivered = 0` bo'lsa `null`).
- `low` — `score ≤ 3`.
- Ustoz bo'yicha hisob `teacherIds` ichidagi har bir ustozga qo'shiladi (ikki ustozli dars ikkalasida ham sanaladi). Shuning uchun ustozlar qatorlarining yig'indisi jami bilan teng bo'lishi shart emas — sahifa jami qatorini qo'shib chiqarmaydi.
- `teachers` tartibi: `average` o'sish tartibida (eng past tepada), baho yo'qlar oxirida.

Hajm kichik (oyiga ~6–7 ming qator), shuning uchun oy qatorlari bitta so'rov bilan o'qiladi va xotirada guruhlanadi.

### 6.3. «Dars baholari» sahifasi — `/reports/dars-baholari`

Hisobotlar menyusida, «O'quvchilar hisoboti» bo'limida. Komponentlar: `components/reports/lesson-ratings/`.

- **Sarlavha qatori:** «Dars baholari», oy tanlagich (`?month=`), o'ngda «Baho so'rash: Yoqilgan / O'chirilgan» `Switch` (`PATCH .../settings`). O'chiq bo'lsa sariq izoh: «Hozir o'quvchilardan baho so'ralmayapti.»
- **Uchta raqam:** «O'rtacha baho» (⭐4.6, o'tgan oyga nisbatan ↑↓), «Javob berganlar» (255 / 340 · 75%), «Past baholar (1–3)».
- **Ustozlar jadvali:** #, Ustoz, O'rtacha, Baholar soni, Javob ulushi, Past baholar, O'tgan oyga nisbatan. Eng past o'rtacha tepada. Paginatsiya qoidasi bo'yicha (10/20/…). Qator bosilsa — drawer: oyma-oy o'rtacha (oxirgi 6 oy), guruhlar kesimi, izohlar ro'yxati (sana, guruh, o'quvchi — profiliga havola, baho, izoh).
- **«Past baholar»:** sana, guruh, ustoz, o'quvchi (profiliga havola), baho, izoh; paginatsiyali.
- Yuklanish — skeleton; javob yo'q bo'lsa xato bloki va «Qayta urinish», bo'sh holat emas.

### 6.4. Ustoz profili — «Baholar» tab'i

`teacher-profile-tabs.tsx`ga `?tab=baholar` qo'shiladi, faqat `isCeoUser` uchun. Tab ochilganda `GET /lesson-ratings/teachers/:id?month=` o'qiladi (lazy) va 6.3 dagi drawer mazmuni ko'rsatiladi. Bitta komponent ikkala joyda ishlatiladi.

## 7. Qilinmaydiganlar

- Ilova va portalda baho oynasi.
- Eslatma va qayta so'rash.
- Bahoni yoki izohni o'zgartirish.
- Past baho uchun ogohlantirish (CEO qarori).
- Excel eksport, dashboard vidjeti, o'quvchi profilida baho tab'i.
- Filial bo'yicha yoqib-o'chirish (sozlama butun kompaniya uchun bitta).

## 8. Hujjatlar

- **Yangi ADR** (0089 yoki keyingi bo'sh raqam): «Dars bahosi — faqat CEO ko'radi (`@CeoOnly()`); Telegram orqali darhol, dars tugagach 10 daqiqa – 3 soat ichida, faqat kelgan o'quvchiga; 48 soat, bitta baho, bitta izoh; ustoz yuborilgan paytda muzlatiladi; ADR-0025 ro'yxatiga qo'shimcha».
- `server/CLAUDE.md` va `client/CLAUDE.md` — qisqa bo'lim.
- `CONTEXT.md` — «Dars bahosi» atamasi.
- Qo'llanma: Hisobotlar bo'limida «Dars baholari» sahifasi (`yollar: ['/reports/dars-baholari']`, rollar — faqat CEO) va `yangiliklar.ts`ga yozuv.

## 9. Sinov

**Server:**
- `rating-math.spec.ts` — o'rtacha, javob ulushi, ikki ustozli dars, bo'sh holatlar.
- `lesson-rating-sender.service.spec.ts` — kimga yuboriladi/yuborilmaydi: ABSENT, EXCUSED, bekor qilingan dars, chat yo'q, chat uzilgan, o'chirilgan karta, allaqachon yozilgan qator; 10 daqiqa va 3 soat chegaralari; sozlama o'chiq; Telegram xatosi → FAILED; `P2002` → o'tkazib yuborish; override ustozlari.
- `lesson-rating-telegram.handler.spec.ts` — boshqa chat, muddat o'tgan, ikkinchi bosish, 1–3 da so'rov, izoh javobi, mos kelmagan javob `next()`ga o'tadi, `/` bilan boshlangan matn.
- `lesson-ratings.service.spec.ts` — filial doirasi, oy chegaralari, `low` ro'yxati.
- `lesson-ratings.controller.spec.ts` — har route `@CeoOnly()` (`routeAccess()`).
- `load-ended-lessons` chiqarilgandan keyin `unmarked-lessons` spec'lari o'zgarishsiz o'tadi.
- `direct-send.guard.spec.ts`, `permission-routes.spec.ts` yashil.

**Klient:** `reports-nav.test.ts` (`ceoOnly`), sahifa modeli uchun vitest (o'rtacha formati, ↑↓), `npm run build`.

**Qo'lda:** lokal botda bitta dars bilan oxirigacha: xabar keladi → 2 ⭐ → «Nima yoqmadi?» → javob → sahifada ko'rinadi.
