# ADR-0090 — Dars ogohlantirishi yopilganda Telegram'dagi nusxasi ham tahrirlanadi: sabab va vaqt yoziladi, ko'rsatma va havola olinadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0076 (qo'ng'iroqcha o'zi yopiladi; shu qaror uning «qo'ng'iroqcha qatorini yopish Telegram'ga tegmaydi» qoidasini dars ogohlantirishlari uchun almashtiradi), ADR-0089 (topshiriq kartasi — tahrir tovushsiz, «message is not modified» xato emas), ADR-0025 (dars ogohlantirishlari darhol yuboriladi), `server/src/notifications/lesson-alert-telegram.ts` (`resolvedLessonAlertText`), `notification-resolver.service.ts` (`resolve(where, outcome?)`), `server/src/attendance/attendance-reminder.service.ts` (`deliver`), migratsiya `20261016090000_notification_telegram_message`, reja `docs/superpowers/plans/2026-10-16-davomat-tirik-xabar.md`

## Kontekst

Dars ogohlantirishlari besh tur: `LESSON_STARTED`, `ATTENDANCE_TEACHER_WARNING`,
`ATTENDANCE_ADMIN_ALERT`, `ATTENDANCE_MISSING_TEACHER`, `ATTENDANCE_MISSING_ADMIN`
(`LESSON_ALERT_TYPES`). Har biri to'rt kanalga ketadi: baza, SSE, push va
Telegram — darhol (ADR-0025). ADR-0076 dan beri qo'ng'iroqchadagi qatori ish
bajarilganda o'zi yopiladi: davomat olinsa, dars bekor qilinsa yoki ko'chirilsa,
«Dars bo'ldimi?» javob olsa, guruh o'chirilsa, yoki 03:00 tungi tozalashda.

Telegram'dagi nusxasi esa o'zgarmasdi. `AttendanceReminderService.deliver`
`sendMessage` natijasini tashlab yuborardi — xabar raqami saqlanmasdi, keyin uni
topib bo'lmasdi. Natija: administrator ertasi kuni ham «O'qituvchi hali davomat
olmadi» xabarini ko'rardi, garchi davomat o'sha kuni olingan bo'lsa ham. Qaysi
ogohlantirish hali kuchda, qaysi biri eskirganini chatdan bilib bo'lmasdi.

Yo'l-yo'lakay topilgan xato: `deliver` sarlavha va matnni HTML sifatida
yuborardi, lekin `escapeHtml` dan o'tkazmasdi. Guruh nomi yoki ism `<` yoki `&`
belgisini o'z ichiga olsa, Telegram 400 qaytarardi va xabar yo'qolardi.

## Qaror

1. **Bot ogohlantirishni yuborganda chat va xabar raqamini `Notification`
   qatoriga yozadi** (`telegramChatId`, `telegramMessageId`). Yozuv yuborishdan
   keyin, alohida `try/catch` ichida: xato faqat jurnalga tushadi, yuborilgan
   xabarga ta'sir qilmaydi.
2. **Resolver qatorni yopganda o'sha Telegram xabarini tahrirlaydi.**
   `NotificationResolverService.resolve(where, outcome?)` — faqat `outcome`
   berilganda, faqat `telegramMessageId` bor va turi `LESSON_ALERT_TYPES` da
   bo'lgan qatorlar uchun, faqat yozuv haqiqatan qator o'zgartirgan bo'lsa.
   Har dars hodisasi o'z sababini uzatadi: davomat (`attendance.completed`,
   `attendance.student.recorded`) → `TAKEN`; bekor → `CANCELLED`; ko'chirish →
   `MOVED`; «Bo'ldi» → `HELD`; «Bo'lmadi» → `NOT_HELD`; savol javobsiz yopildi →
   `CLOSED`; guruh o'chirildi → `GROUP_DELETED`; 03:00 tozalash → `EXPIRED`.
   Topshiriq va to'lov chaqiruvlari `outcome` bermaydi — ularning xabarlariga
   tegilmaydi.
   **Birinchi yopgan hodisa yutadi**: xabar bir marta tahrirlanadi (`count > 0`
   bo'lgan yozuvda), keyingi hodisa yopiq qatorni topmaydi va hech narsa
   qilmaydi. Shuning uchun `HELD`, `NOT_HELD` va `CLOSED` amalda zaxira
   sarlavhalar: «Bo'ldi» (`saveLate`) `UNMARKED_LESSON_HELD` dan oldin
   `attendance.student.recorded` chiqaradi — administrator «✅ Davomat olindi»
   ko'radi; «Bo'lmadi» avval bekor qilish yoki ko'chirish yozadi — «❌ Dars bekor
   qilindi» yoki «🔀 Dars ko'chirildi»; guruh o'chirilganda `GROUP_DELETED`
   savol yopilishidan oldin keladi — «🗑 Guruh o'chirildi». Uchta zaxira
   sarlavha faqat o'sha oldingi hodisa qator yopmagan holda (masalan, ro'yxati
   bo'sh kunda «Bo'ldi») ko'rinadi.
3. **Yangi matn** (`resolvedLessonAlertText`, sof funksiya): qalin sarlavha —
   sabab va yopilgan payt Toshkent vaqtida (`✅ Davomat olindi · 10:47`,
   `❌ Dars bekor qilindi · HH:mm`, `🔀 Dars ko'chirildi · HH:mm`,
   `✅ «Bo'ldi» deb belgilandi · HH:mm`, `❌ «Bo'lmadi» deb belgilandi · HH:mm`;
   vaqtsiz: `☑️ Savol yopildi`, `🗑 Guruh o'chirildi`, `☑️ Yopildi`); keyin dars
   ma'lumoti (`buildDetailsBlock` qatorlari — saqlangan `message` ning ikkinchi
   `\n\n` bo'lagi) blockquote ichida; oxirida `Avvalgi xabar: {title}` kursivda.
   Ko'rsatma («Iltimos, o'qituvchini ogohlantiring») va havola olib tashlanadi —
   qiladigan ish qolmadi. Hamma matn `escapeHtml` dan o'tadi.
4. **Tahrir tovushsiz va ketma-ket.** Har xato alohida ushlanadi: «message is
   not modified» jim o'tkaziladi, qolganlari `warn` bilan yoziladi; `resolve`
   hech qachon throw qilmaydi va sonini baribir qaytaradi. Bot o'chiq bo'lsa
   (`getBot()` yo'q) tahrir yo'q.
5. **`deliver` sarlavha va matnni `escapeHtml` dan o'tkazadi.**

Taqiqlanadi: topshiriq va to'lov xabarlarini shu yo'l bilan tahrirlash
(topshiriq kartasi o'z tizimida — ADR-0089; to'lov xabarlari yig'ma orqali
ketadi va bir xabarda bir necha qator bo'ladi). Resolver orqali yangi xabar
yuborish ham taqiqlanadi — tahrir bor, shovqin yo'q.

## Ko'rib chiqilgan muqobillar

- **Yopilganda yangi xabar yuborish («Davomat olindi»).** Chat ikki baravar
  to'ladi va eski xabar o'zgarmay turaveradi — muammo shu edi. Rad etildi.
- **Eski xabarni o'chirish.** Dars ma'lumoti yo'qoladi; administrator «qaysi
  dars edi?» deb so'raydi. Rad etildi — tahrir tarixni saqlaydi.
- **Alohida jadval (`NotificationTelegramMessage`, ADR-0089 dagi
  `TaskTelegramMessage` kabi).** Dars ogohlantirishida har qatorga ko'pi bilan
  bitta Telegram xabar to'g'ri keladi; ikki ustun yetarli. Jadval kerak bo'lsa —
  bir odamga bir qator bo'yicha bir necha xabar kerak bo'lganda.
- **Deploydan oldingi xabarlarni ham tahrirlash.** Raqami yo'q, topib bo'lmaydi.
  Ular o'zgarmaydi; birinchi kundan keyin hammasi yangi tartibda.
- **Tahrirni parallel yuborish.** Bir guruhning besh ogohlantirishi bir onda
  yopiladi; parallel yuborish 429 ga uradi. Ketma-ket — oddiy va yetarli.

## Oqibatlari

**Yutuq:** chatda qaysi ogohlantirish kuchda, qaysi biri yopilgani bir qarashda
ko'rinadi; eskirgan «davomat olinmadi» xabari qolmaydi; `<`/`&` li guruh nomi
xabarni yo'qotmaydi.

**Narx:** `Notification` ga ikki ixtiyoriy ustun (`ADD COLUMN IF NOT EXISTS`,
indekssiz — qator `id` bo'yicha yangilanadi); yopish paytida har qator uchun bir
Telegram chaqiruvi, ketma-ket. Deploydan oldin yuborilgan xabarlar o'zgarmaydi.
Tahrir ovozsiz — odam o'zgarishni faqat chatga qarab biladi (ADR-0089 dagi kabi,
ataylab). `deliver` da `escapeHtml` matnni o'zgartirmaydi (hozirgi matnlarda
`<`, `>`, `&` yo'q), faqat shunday belgili nomlar endi yetib boradi.

**Kuzatish:** `lesson alert edit failed` jurnalda ko'paysa — bot bloklangan yoki
xabar o'chirilgan chatlar; raqam qatorda qoladi, qayta urinilmaydi (qator
allaqachon yopilgan).
