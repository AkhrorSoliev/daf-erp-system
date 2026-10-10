# ADR-0076 — Qo'ng'iroqcha: son faqat sizdan ish kutayotganlarni sanaydi, ish bajarilganda xabar o'zi yopiladi, bir xil dars xabarlari bitta qatorga yig'iladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0074 (topshiriq alohida bo'lim — `TASK_*` xabarlari va ularni yopuvchi hodisalar), ADR-0054 («Dars bo'ldimi?» tizim topshirig'i — savol yopilganda uning xabarlari ham yopiladi), ADR-0025 (Telegram 20:00 yig'ma xabari — qo'ng'iroqchadagi yopilish Telegram'ga tegmaydi), dizayn hujjati `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §8, `server/src/notifications/`, `server/scripts/notification-cleanup.ts`, migratsiya `20261010130000_notification_action_state`

## Kontekst

Qo'ng'iroqcha tizimdagi hamma xabarni bir xil sanardi va hech bir xabar o'zi
yopilmasdi. Davomat olingandan keyin ham «Dars tugadi, davomat olinmadi» o'qilmagan
bo'lib turardi. Prod'da oxirgi 14 kunda administratorga kuniga ~10 xabar kelgan,
ularning 86% i davomat haqida; o'qilmagan xabarlar 450–780 taga yetgan. Raqam
«sizdan ish kutayotgan» emas, «siz ochmagan» degani edi, shuning uchun unga hech kim
qaramay qo'ygan va haqiqiy topshiriq yoki buzilgan to'lov va'dasi xabari shu
ko'pchilik ichida yo'qolardi. Mijoz esa ish bajarilganini bilmaydi: davomat boshqa
oynada saqlangan bo'lsa ham xabar o'sha-o'sha turardi.

## Qaror

1. **`Notification` ga uchta ustun.** `actionRequired` (xabar qabul qiluvchidan ish
   kutadi, `false`), `resolvedAt` (kutilgan ish bajarilgan vaqt, `null` = hali ochiq),
   `groupKey` (mijoz bir qatorga yig'adigan xabarlar kaliti, `null`). Ikkita indeks:
   `Notification(relatedEntityId)` va `Notification(taskId)` (yopuvchi qidiruvi
   uchun). Ustunlar hosila: turdan va hodisalardan qayta hisoblanadi, shuning uchun
   xabarlar o'chirilmaydi va hech narsa yo'qolmaydi.
2. **Yagona yozuvchi belgilaydi.** `NotificationsService.create` hamma xabarni
   yozadigan yagona eshik; u `notificationKind()` (toza funksiya, `notification-kind.ts`)
   bilan `actionRequired` va `groupKey` ni qo'yadi. Sizdan ish kutadigan turlar:
   `ATTENDANCE_ADMIN_ALERT`, `ATTENDANCE_TEACHER_WARNING`, `ATTENDANCE_MISSING_TEACHER`,
   `ATTENDANCE_MISSING_ADMIN`, `LESSON_STARTED`, `TASK_ASSIGNED`, `TASK_REMINDER`,
   `TASK_REVIEW`, `PAYMENT_PROMISE_OVERDUE`; qolgani ma'lumot. Topshiriq rejasi
   (`task-notify-plan.ts`) bayroqni xabar bo'yicha o'zgartira oladi: kuzatuvchi qilinish
   — ma'lumot, «Topshiriq qaytarildi» — kutadi. Har xabarning guruhi
   (`task` / `attendance` / `payment` / `system`) serverda bir joyda aniqlanadi
   (`NOTIFICATION_GROUP`, enum ustidagi `Record`) va API hamda SSE har qatorda
   `group` bilan beradi; mijoz turdan guruhni o'zi chiqarmaydi.
3. **Son = `actionRequired && resolvedAt == null && !isRead`**
   (`GET /notifications/unread-count`). «Kutilmoqda» ro'yxati = `actionRequired &&
   resolvedAt == null`, o'qilgan yoki o'qilmaganidan qat'i nazar. O'qish sonni
   kamaytiradi, lekin xabarni «Kutilmoqda»dan chiqarmaydi; uni faqat bajarilgan ish
   chiqaradi.
4. **Xabar o'zi yopiladi.** `NotificationResolverService` tranzaksiya commit
   bo'lgandan keyin chiqadigan hodisalarni tinglaydi, mos OCHIQ `actionRequired`
   qatorlarga (hamma qabul qiluvchida, hodisaning `companyId` si bilan) `resolvedAt`
   qo'yadi va har egasiga SSE orqali `notification.resolved` yuboradi (faqat qator
   haqiqatan o'zgargan bo'lsa). Ma'lumot xabariga tegmaydi. Hodisalar:
   - `attendance.completed`, `attendance.student.recorded` (faqat QR bilan olingan
     davomat shu birini chiqaradi), `lesson-cancellation.created`,
     `lesson-reschedule.created` — o'sha guruh va o'sha kunning besh dars xabari;
   - `unmarked-lesson.held`, `unmarked-lesson.not-held`, `unmarked-lesson.closed` —
     xuddi shular va yopilgan «Dars bo'ldimi?» topshirig'ining xabarlari
     (`closed` — savol javobsiz yopilganda: ko'chirilgan kun darssiz qoldi yoki
     guruh o'chirildi);
   - `group.deleted` — guruhning hamma dars xabari, qaysi kun bo'lishidan qat'i nazar;
   - `task.status.changed`, `task.cancelled`, `task.reviewed` topshiriqni DONE yoki
     CANCELLED qilsa — topshiriqning hamma xabari; `task.reviewed` (qabul ham,
     qaytarish ham) — topshiriqning `TASK_REVIEW` qatorlari; `task.unassigned` —
     olib tashlanganlarning shu topshiriq qatorlari; tizim topshirig'ini birinchi
     ijrochi olsa (`task.status.changed`, topshiriq ochiq va qo'lda berilmagan) —
     uni yo'qotgan administratorlarning xabarlari;
   - `payment.received`, qarz yopilgan bo'lsa (`studentBalance >= 0`, `settleKeptPromises`
     dagi «bajarildi» sinovi) — o'quvchining `PAYMENT_PROMISE_OVERDUE` xabari.
5. **Bir xil dars xabarlari bitta qatorga.** `groupKey = <TURI>:<KUN>` (Toshkent kuni)
   faqat besh dars xabari uchun: `LESSON_STARTED`, `ATTENDANCE_ADMIN_ALERT`,
   `ATTENDANCE_TEACHER_WARNING`, `ATTENDANCE_MISSING_TEACHER`, `ATTENDANCE_MISSING_ADMIN`.
   Kalit turga bog'liq, `attendance:<kun>` emas, shuning uchun «30 daqiqa qoldi» va
   «dars tugadi» bir qatorga qo'shilmaydi. Dars sanasi qatorda saqlanmaydi: dars
   xabarlari darsning o'z kunida yuboriladi (har yarim soatlik tekshiruv va 23:00
   yig'ishtirish faqat bugunga qaraydi), shuning uchun yaratilgan Toshkent kuni dars
   kunidir. Mijoz
   bir kalitli qatorlarni «Davomat olinmagan · 3 guruh» deb bitta qilib ko'rsatadi.
6. **Ish qilib bo'lmaydigan xabar tug'ilmaydi.** Davomat jurnali allaqachon bor
   bo'lsa (dars boshlanishidan oldin olingan) `LESSON_STARTED` yuborilmaydi; bugungi dars
   bekor qilingan yoki boshqa kunga ko'chirilgan guruhga `LESSON_STARTED`,
   `ATTENDANCE_TEACHER_WARNING` va `ATTENDANCE_ADMIN_ALERT` yaratilmaydi (dars
   tugashi bo'yicha tekshiruv ishlatadigan `lessonsOn` qoidasi bilan). Aks holda
   bunday xabar hech qachon yopilmay turardi.
7. **Bir martalik tozalash** (`server/scripts/notification-cleanup.ts`, sinov
   rejimida o'qish-faqat ulanishda; `--apply` bilan hamma qadam bitta tranzaksiyada):
   (1) topshirig'i yopilgan xabarlarni, (2) jurnali, javobi, bekor qilinishi yoki
   ko'chirilishi bo'lgan dars xabarlarini, (3) qarzi yopilgan va'da xabarlarini
   `resolvedAt` bilan yopadi (ish bajarilgan vaqt bilan); (4) boshqa hamma 7 kundan
   eski ochiq `actionRequired` qatorni yopadi, faqat topshirig'i hali ochiq (NEW,
   IN_PROGRESS, IN_REVIEW) `TASK_*` qatorlar qoladi; (5) 7 kundan eski o'qilmagan
   xabarlarni `isRead = true` qiladi. Hech narsa o'chirilmaydi; qayta ishga
   tushirsa, qiladigan ish qolmaydi.
8. **Mijoz.** Qo'ng'iroq panelidagi «Kutilmoqda» va «Hammasi», tur tugmalari va yangi
   `/notifications` («Barcha bildirishnomalar») sahifasi; sahifa `GET /notifications`
   ni `filter` (`pending` | `all`), `type`, `q`, `cursor` bilan o'qiydi, chap ro'yxat
   sonlarini `GET /notifications/counts` beradi. Sonni mijoz hech qachon qatorlardan
   hisoblamaydi; uni server beradi.

## Oqibatlar

- **Raqamning ma'nosi o'zgaradi.** Endi u «o'qilmagan» emas, «sizdan ish kutayotgan
  va hali ochmagan» xabarlar soni. Ma'lumot xabarlari (davomat olindi, to'lov tushdi
  va shu kabilar) sonda ko'rinmaydi; ular panelda va sahifada turadi. Xodimlarga
  qo'llanma va yangiliklarda aytiladi.
- **Eski qo'ng'iroqcha ikki deploy orasida ishlaydi.** `GET /notifications` hamon
  `page` va `pageSize` ni qabul qiladi (`page` e'tiborga olinmaydi) va `data` qaytaradi;
  eski belgi sonni `unread-count` dan oladi, ya'ni oraliqda u yangi qoida bilan
  hisoblanadi.
- **Deploy tartibi.** Avval server (Railway `caring-courage`, production): migratsiya
  ustunlarni qo'shadi va turi bo'yicha to'ldiradi. Darhol keyin tozalash skripti
  (avval sinov rejimida sonlar va eng katta o'nta raqam o'qiladi, keyin `--apply`);
  u ishlamaguncha eski o'qilmagan davomat xabarlari sonda turadi. Oxirida Vercel:
  yangi qo'ng'iroqcha va sahifa yangi maydonlarni o'qiydi, shuning uchun server oldin
  chiqadi. Migratsiyadagi `UPDATE` lar `ALTER TABLE` qulfi ostida ishlaydi — deploy
  oldidan `Notification` qatorlari sonini tekshirish kerak.
- **Yangi sizdan ish kutadigan tur qo'shilsa**, uni yopuvchi hodisa
  `NotificationResolverService` ga ham qo'shiladi, aks holda u faqat tozalash
  skriptigacha kutadi. Yangi `NotificationType` `NOTIFICATION_GROUP` ga qo'yilmaguncha
  kompilyatsiya bo'lmaydi.
- **Hozircha yopilmaydigan xabarlar (ma'lum chegaralar).** Qarz to'lovsiz yopilsa
  (hisobdan chiqarish, markaz qoplashi) — buzilgan va'da hech qachon «bajarildi» bo'lmaydi
  (`settleKeptPromises` bilan bir xil), xabar ochiq qoladi; «Topshiriq qaytarildi»
  ijrochi qayta tekshiruvga yuborgandan keyin ham topshiriq yopilguncha kutadi;
  eslatma yuborilayotgan sekundlarda davomat saqlansa, oxirgi xabar ochiq qolishi
  mumkin. Tozalash skripti faqat bir marta ishlaydi; bunday qoldiqlar ko'paysa, kechki
  yig'ishtirish qo'shilishi mumkin (hozir yo'q).
- Hech qaysi xabar o'chirilmaydi: faqat `resolvedAt` va `isRead` yoziladi; yopilgan
  xabar kulrang bo'lib tarixda turadi.

## Ko'rib chiqilgan va rad etilgan

- **Faqat tozalash skripti** (7 kundan eski o'qilmaganni o'qilgan qilish). Raqam bir
  haftada yana yuzlabga qaytadi: sabab — bajarilgan ishning xabari yopilmasligi —
  qoladi.
- **Ish bajarilganda xabarni o'chirish.** Iz yo'qoladi, «nega meni ogohlantirdi»
  savoliga javob qolmaydi; yopilgan xabar kulrang tarixda turgani yaxshi.
- **Sonni mijozda hisoblash.** Qoida ikki joyda yoziladi va raqam server bilan
  mos kelmay qoladi; shuning uchun son va guruh serverdan keladi.
- **`attendance:<kun>` yagona kalit.** «30 daqiqa qoldi» va «dars tugadi» bir qatorga
  tushardi, ma'nolari esa boshqa.
- **Yig'ilgan qatorlarni serverda qaytarish.** Keyset sahifalash va «ichida har guruh
  o'z tugmasi bilan» murakkablashardi; mijoz bir kunning bir kalitli qatorlarini o'zi
  yig'adi.
