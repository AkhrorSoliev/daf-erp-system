# Davomat ogohlantirishi Telegram'da o'zi yopiladi — reja

**Sana:** 2026-10-16 · **Holati:** CEO kelishdi (16.10, «ha»)

**Muammo.** Dars ogohlantirishlari (5 tur: `LESSON_STARTED`,
`ATTENDANCE_TEACHER_WARNING`, `ATTENDANCE_ADMIN_ALERT`,
`ATTENDANCE_MISSING_TEACHER`, `ATTENDANCE_MISSING_ADMIN`) qo'ng'iroqchada ish
bajarilganda o'zi yopiladi (ADR-0076, `NotificationResolverService`). Telegram'dagi
nusxasi esa o'zgarmaydi. `AttendanceReminderService.deliver` xabar raqamini
saqlamaydi, shuning uchun admin ertasi kuni ham «o'qituvchi hali davomat olmadi»
xabarini ko'radi, garchi davomat olingan bo'lsa ham.

**Qaror.** Bot ogohlantirishni yuborganda chat va xabar raqamini `Notification`
qatoriga yozadi. Resolver qatorni yopganda o'sha Telegram xabarini tahrirlaydi.
Yangi matn sababni va vaqtni aytadi, dars ma'lumotini qoldiradi, ko'rsatma va
havolani olib tashlaydi. Tahrir tovushsiz. Deploydan oldin yuborilgan xabarlarda
raqam yo'q, ular o'zgarmaydi.

## Global Constraints

- Worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriq-tirik-xabar`,
  shox `feat/davomat-tirik-xabar` (origin/main 5cf41dcd dan). Server buyruqlari
  `server/` dan: `npx jest <path>`, `npm run typecheck`, `npx eslint <files>`,
  `npx prettier --write <touched .ts>`.
- Commit xabarlari va yangi kod izohlari inglizcha, oxirida
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Emoji yoki boshqa
  ASCII bo'lmagan matnni faqat Edit/Write bilan yozing (perl/sed bilan emas).
- Faqat dars ogohlantirishlari (`LESSON_ALERT_TYPES`) tahrirlanadi. Topshiriq va
  to'lov xabarlariga tegilmaydi.

## Matnlar (aynan shunday)

Tahrirdan keyingi xabar (HTML):

```
<b>{HEAD}</b>
<blockquote>{dars ma'lumoti qatorlari, esc}</blockquote>
<i>Avvalgi xabar: {title, esc}</i>
```

- «Dars ma'lumoti» — saqlangan `message` dagi ikkinchi bo'lak
  (`message.split('\n\n')[1]`, `buildDetailsBlock` qatorlari). U yo'q bo'lsa,
  blockquote ham chiqmaydi.
- `{HEAD}` sababga qarab (`HH:mm` — yopilgan payt, Toshkent vaqti):
  - `TAKEN` → `✅ Davomat olindi · HH:mm`
  - `CANCELLED` → `❌ Dars bekor qilindi · HH:mm`
  - `MOVED` → `🔀 Dars ko'chirildi · HH:mm`
  - `HELD` → `✅ «Bo'ldi» deb belgilandi · HH:mm`
  - `NOT_HELD` → `❌ «Bo'lmadi» deb belgilandi · HH:mm`
  - `CLOSED` → `☑️ Savol yopildi`
  - `GROUP_DELETED` → `🗑 Guruh o'chirildi`
  - `EXPIRED` (03:00 tungi tozalash) → `☑️ Yopildi`

---

### Task 1: xabar raqamini saqlash, matn va tahrir

**Files:**
- Create: `server/prisma/migrations/20261016090000_notification_telegram_message/migration.sql`
- Modify: `server/prisma/schema.prisma` (`model Notification`)
- Modify: `server/src/attendance/attendance-reminder.service.ts` (`deliver`)
- Create: `server/src/notifications/lesson-alert-telegram.ts` (+ `.spec.ts`)
- Modify: `server/src/notifications/notification-resolver.service.ts` (+ spec)
- Test: `server/src/attendance/attendance-reminder.service.spec.ts` (yoki deliver'ni qamrab olgan mavjud spec)

**Interfaces:**
- `Notification.telegramChatId String?`, `Notification.telegramMessageId Int?`
- `export type LessonOutcome = 'TAKEN' | 'CANCELLED' | 'MOVED' | 'HELD' | 'NOT_HELD' | 'CLOSED' | 'GROUP_DELETED' | 'EXPIRED';`
- `export function resolvedLessonAlertText(n: { title: string; message: string }, outcome: LessonOutcome, at: Date): string` (sof funksiya)
- `NotificationResolverService.resolve(where, outcome?: LessonOutcome): Promise<number>` — imzo faqat ixtiyoriy parametr bilan kengayadi.

- [ ] **Step 1: migratsiya + sxema.**

```sql
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "telegramMessageId" INTEGER;
```

`model Notification` ga ikki ixtiyoriy maydon qo'shiladi, doc izohi bilan: «The Telegram copy of a lesson alert (ADR-0090): edited when the row is resolved.» `npx prisma generate`.

- [ ] **Step 2: sof matn (TDD).** `lesson-alert-telegram.ts`: `resolvedLessonAlertText`. Testlar:
  - har bir outcome uchun `HEAD` aniq satri;
  - dars ma'lumoti blockquote ichida;
  - `title`/ma'lumotdagi `<`/`&` escaping (`esc` = `escapeHtml` from `../telegram-groups/utils/format.util`);
  - ikkinchi bo'lak yo'q bo'lsa, blockquote yo'q;
  - vaqt Toshkent bo'yicha: `2026-10-16T05:47:00Z` → `10:47`.
  Soat formati uchun `common/date/tashkent` dagi `TASHKENT_OFFSET_MS` dan foydalaning.
- [ ] **Step 3: `deliver` raqamni saqlaydi (TDD).**
  - `sendMessage` natijasini oling. Keyin `prisma.notification.update({ where: { id: notification.id }, data: { telegramChatId: user.telegramChatId, telegramMessageId: sent.message_id } })` ni alohida `try/catch` ichida bajaring: xato faqat jurnalga yoziladi, yuborilgan xabarga ta'sir qilmaydi.
  - Yuboriladigan matnda `title` va `message` ni `esc` dan o'tkazing. Guruh nomi yoki ism `<` belgisini o'z ichiga olsa, hozir Telegram 400 qaytaradi va xabar yo'qoladi.
  - Spec'da tekshiriladi: `update` to'g'ri id'lar bilan chaqiriladi; `update` xato bersa ham `deliver` throw qilmaydi.
- [ ] **Step 4: resolver tahrirlaydi (TDD).**
  - `resolve(where, outcome?)`: `findMany` endi `type`, `title`, `message`, `telegramChatId`, `telegramMessageId` ni ham tanlaydi.
  - `updateMany` dan keyin (`count > 0`) va `outcome` berilgan bo'lsa, `telegramMessageId` bor va `type` `LESSON_ALERT_TYPES` da bo'lgan har qator uchun: `this.telegram.getBot()?.telegram.editMessageText(chatId, messageId, undefined, resolvedLessonAlertText(row, outcome, resolvedAt), { parse_mode: 'HTML' })`.
  - Tahrirlar ketma-ket. Har xato alohida ushlanadi: «message is not modified» jim o'tkaziladi, qolganlari `warn` bilan yoziladi. `resolve` hech qachon throw qilmaydi.
  - `TelegramService` `NotificationsModule` da allaqachon bor (`imports: [TelegramModule]`). Uni konstruktorga qo'shing.
  - Chaqiruvlar: `onAttendanceCompleted` va `onStudentRecorded` → `TAKEN`; `onLessonCancelled` → `CANCELLED`; `onLessonMoved` → `MOVED`; `onLessonHeld` → `HELD`; `onLessonNotHeld` → `NOT_HELD`; `onLessonClosed` → `CLOSED`; `onGroupDeleted` → `GROUP_DELETED`; `closePastLessonAlerts` → `EXPIRED`. `resolveLesson(p, outcome)` va `resolveAnswered(p, outcome)` outcome'ni uzatadi. Topshiriq va to'lov chaqiruvlari outcome'siz qoladi.
  - Spec'da tekshiriladi:
    - outcome bor + raqam bor → `editMessageText` aniq argumentlar bilan;
    - raqam yo'q → tahrir yo'q;
    - outcome yo'q → tahrir yo'q;
    - dars bo'lmagan `type` → tahrir yo'q;
    - tahrir xatosi → `resolve` baribir sonni qaytaradi;
    - bot o'chiq (`getBot()` undefined) → tahrir yo'q.
- [ ] **Step 5: tekshiruv va commit.** `npx jest src/notifications src/attendance`, `npm run typecheck`, `npx eslint src/notifications src/attendance --quiet`, prettier. Commit: `feat(notifications): lesson alerts edit their Telegram copy when resolved`.

### Task 2: ADR, hujjat, to'liq tekshiruv, PR

- [ ] `docs/adr/0090-davomat-ogohlantirishi-telegramda-ozi-yopiladi.md` (o'zbekcha, lotin; shablon `docs/adr/0000-shablon.md`).
  - ADR-0076 dagi «qo'ng'iroqcha qatorini yopish Telegram'ga tegmaydi» qoidasini dars ogohlantirishlari uchun almashtiradi.
  - `docs/adr/README.md` ga qator qo'shiladi; ADR-0076 qatoriga «Qisman almashtirildi — ADR-0090» yoziladi, ADR fayli o'zi tahrirlanmaydi.
  - 0090 band bo'lsa, keyingi bo'sh raqam olinadi.
- [ ] `server/CLAUDE.md`, Notifications bo'limi:
  - 4-kanal punktidagi «Closing a bell row does not touch Telegram.» → lesson alerts are the exception (ADR-0090: stored chat/message id, edited on resolve, outcome headlines);
  - jadval ostiga bitta qator.
- [ ] To'liq tekshiruv: `npm run typecheck`, `npx eslint src --quiet`, `npm test`, `npm run build`.
- [ ] Push + PR (`gh pr create --base main --head feat/davomat-tirik-xabar`, inglizcha). Deploy qilinmaydi.
