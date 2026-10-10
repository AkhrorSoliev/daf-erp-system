# ADR-0074 — Topshiriq izohning turi emas, alohida bo'lim: bitta holat, tekshiruv bosqichi, yuqoridan pastga berish zinasi, bitta yozish eshigi

**Holati:** Qabul qilindi
**Sana:** 2026-10-07
**Bog'liq:** ADR-0054 («Dars bo'ldimi?» tizim topshirig'i), ADR-0025 (Telegram 20:00 yig'ma xabari — topshiriq xabarlari 2-bosqichda undan chiqadi), ADR-0072 (to'lov va'dasi — keyin `BROKEN_PROMISE` topshirig'ining manbasi), ADR-0028 (rollar bazadan o'qiladi), dizayn hujjati `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md`, `server/src/tasks/`, `server/scripts/migrate-comment-tasks.ts`

## Kontekst

Topshiriq izohning bir turi edi: `Comment.isTask = true` va `CommentAssignee`.
Shu sababli `/tasks` sahifasidan topshiriq berib bo'lmasdi, faqat o'quvchi, guruh,
lid va xodim kartasidagi izoh formasi orqali, u ham faqat CEO va filial
direktoriga ko'rinardi. Ijrochi ro'yxati va muddat (18:00) qattiq yozilgan edi;
muhokama, qadamlar va fayl yo'q edi. Holat uchta (Kutilmoqda → Ko'rildi →
Bajarildi) va har ijrochida alohida bo'lgani uchun beruvchi ishni tekshirib qabul
qila olmasdi. Tizim beradigan yagona topshiriq — «Dars bo'ldimi?» (ADR-0054) —
izoh jadvaliga to'g'ridan-to'g'ri yozilardi; qolgan «yashirin ishlar» (qayta
qo'ng'iroq sanasi, buzilgan va'da, qo'ng'iroq qilinmagan lid) umuman topshiriq
emas edi. Ishlab turgan tizimda jami 34 topshiriq bor (33 tasi «Dars bo'ldimi?»),
shuning uchun ko'chirish kichik.

## Qaror

1. **Alohida bo'lim va alohida jadvallar.** `Task`, `TaskParticipant`
   (`ASSIGNEE` ijrochi, `WATCHER` kuzatuvchi), `TaskStep`, `TaskEvent` (muhokama va
   tarix bitta oqimda), `TaskOutbox`. Modul `server/src/tasks/`. Izoh endi
   topshiriq emas: `POST /comments` `isTask`, `assigneeIds`, `dueDate`, `priority`
   qabul qilmaydi (400), izoh ro'yxati `isTask = true` qatorlarni ko'rsatmaydi,
   `GET /comments/my-tasks`, `created-tasks` va `PATCH /comments/:id/assignee-status`
   o'chirilgan.
2. **Holat topshiriqniki, ijrochiniki emas.** `NEW` → `IN_PROGRESS` → `IN_REVIEW`
   → `DONE`, qo'shimcha `CANCELLED`. Bir nechta ijrochi bo'lsa ham holat bitta:
   bittasi «Bajardim» desa, topshiriq tekshiruvga o'tadi. Har ijrochiga o'z nusxasi
   kerak bo'lsa, «Har biriga alohida» belgilanadi: har ijrochi uchun alohida `Task`,
   hammasi bitta `batchId` bilan. «Muddati o'tdi» holat emas, hisoblanadi
   (`dueAt < now` va holat ochiq).
3. **Tekshiruv bosqichi.** Ijrochi `NEW` → `IN_PROGRESS`, va `NEW` / `IN_PROGRESS`
   → `IN_REVIEW` qiladi. Beruvchi `IN_REVIEW` → `DONE` («Qabul qilish») yoki
   `IN_REVIEW` → `IN_PROGRESS` («Qaytarish», sabab majburiy) qiladi; har qanday ochiq
   topshiriqni bekor qiladi. Faqat o'ziga yozilgan topshiriqda (beruvchi = yagona
   ijrochi) tekshiruv yo'q: u to'g'ridan-to'g'ri `DONE` ga o'tadi. Yopilgan
   (`DONE` / `CANCELLED`) topshiriq qayta ochilmaydi, kerak bo'lsa «Nusxa olish».
   Beruvchi va menejer holatni oddiy o'zgartirish bilan tekshiruvni aylanib o'ta
   olmaydi: ular faqat qabul / qaytarish / bekor qilish yo'li bilan harakat qiladi.
   Hamma o'tishlar bitta jadvalda (`task-transitions.ts`).
4. **Muddat.** Sana tanlanib soat tanlanmasa 18:00 Toshkent. Qo'lda berilganda soat
   08:00–22:00 oralig'ida, yakshanba va topshiriq filialining bayram kuniga
   qo'yilmaydi (400). Tizim topshirig'ining muddati shunday kunga tushsa, keyingi ish
   kuniga suriladi (`task-due.ts`).
5. **Berish zinasi yuqoridan pastga.** Ijrochining **eng yuqori** roli (eng kichik
   `roleId`) hisobga olinadi:

   | Beruvchi | Kimga (rol id) | Filial |
   | --- | --- | --- |
   | CEO (1) | 1–5 | istalgan |
   | Filial direktori (2) | 2–5 | o'z filiali |
   | Administrator (3) | 3–5 | o'z filiali |
   | Ustoz (4), Kassir (5) | faqat o'ziga | — |

   Kuzatuvchi — ijrochi qilib berish mumkin bo'lgan har kim, yoki beruvchining o'zi va
   undan yuqori roldagilar (administrator CEO'ni kuzatuvchi qila oladi, u faqat
   ko'radi). Rollar bazadan o'qiladi (ADR-0028), tokendan emas. Ko'rish: ishtirokchi
   va beruvchi o'z topshiriqlarini; filial direktori o'z filialidagi hammasini; CEO
   hammasini; `view=all` har rol uchun shu ko'rish doirasi bilan toraytiriladi.
   Qoidalar bitta faylda (`task-policy.ts`, sof funksiyalar): Ruxsatlar tizimi
   chiqqanda faqat shu fayl kalitlarga ulanadi.
6. **Tizim topshirig'ini faqat manbasi yopadi.** `kind` ≠ `MANUAL` topshiriqni qo'lda
   `DONE` yoki `CANCELLED` qilib bo'lmaydi (400), tahrirlab ham bo'lmaydi; ijrochi uni
   faqat `IN_PROGRESS` ga oladi. Har manba uchun ko'pi bilan bitta ochiq topshiriq
   (`sourceKey` bo'yicha qisman unikal indeks). Bir nechta ijrochida birinchi harakat
   qilgani oladi, qolganlarning nusxasi o'chadi (`claimSystemTask`, ADR-0054 qoidasi).
   «Dars bo'ldimi?» endi `LESSON_QUESTION` turidagi `Task`: javob berilganda yoki guruh
   o'chirilganda o'zi yopiladi (`AUTO_CLOSED`); ADR-0054 ning qolgan qoidalari
   o'zgarmaydi, faqat `UnmarkedLesson.taskCommentId` o'rniga `taskId` ishlatiladi.
   `CALLBACK`, `BROKEN_PROMISE`, `UNCALLED_LEAD` turlari enum'da bor, ularni yaratish
   4-bosqichda.
7. **Bitta eshik.** `Task*` jadvallariga yozish faqat `server/src/tasks/` ichida
   (`TasksService`, «Dars bo'ldimi?» yozuvchisi `lesson-task.ts`, ketgan xodim
   tinglovchisi) va bir martalik ko'chirish skriptida. Sayt (`TasksController`) va
   keyingi bosqichlarning Telegram hamda avtomatika kodi shu xizmatni chaqiradi: ruxsat,
   filial va o'tish qoidalari bir marta, shu yerda. Boshqa modulda
   `prisma.task.update` yozilsa, `task-write.single-source.spec.ts` yiqiladi.

## Oqibatlar

- **Izoh-topshiriq tugadi.** Eski yo'llar va izoh formasidagi topshiriq rejimi
  o'chirilgan. `Comment.isTask`, `Comment.migratedTaskId`, `CommentAssignee` va
  `UnmarkedLesson.taskCommentId` ko'chirish uchun qoladi va keyingi tozalash PR'ida
  o'chiriladi.
- **Ko'chirish va deploy tartibi.** `scripts/migrate-comment-tasks.ts` eski
  `isTask` izohlarni `Task` ga o'tkazadi: sukut bo'yicha sinov rejimi (ulanish faqat
  o'qish), `--apply` bilan yozadi, `migratedTaskId` bo'lganlarni qayta o'tkazmaydi.
  Tartib: migratsiya (jadvallar) → server → skript `--apply` → sayt. Skript
  bajarilguncha `/tasks` bo'sh ko'rinadi, shuning uchun uni deploydan keyin darhol,
  ish vaqtidan tashqarida yurgizish kerak.
- **Telegram'ga topshiriq xabari 2-bosqichgacha bormaydi.** 20:00 yig'ma xabardan
  `TASK_*` qatorlari chiqdi: yangi topshiriq hodisalari ularni navbatga qo'ymaydi
  (navbatda qolgan eski qatorlar uchun ko'rsatuvchi kod turibdi). Bildirishnoma
  qo'ng'iroqcha, SSE va push orqali darhol ketadi. Telegram'ga darhol xabar, tugmalar
  va tungi tinchlik — 2-bosqich; u ADR-0025 ni o'zgartiradi, shuning uchun alohida
  ADR bilan (ADR-0025 holati o'sha ADR'da o'zgaradi, bu yerda tahrirlanmaydi).
- **Muddat eslatmasi `TaskOutbox` orqali.** Izoh topshiriqlari uchun
  `TaskReminderService` o'chirildi. Muddatdan 1 soat oldingi eslatma va «Muddati
  o'tdi» yaratilishda `TaskOutbox` ga (`INAPP` kanali) yoziladi, muddat o'zgarsa qayta
  yoziladi, har daqiqa cron yuboradi; yuborishdan oldin topshiriq hali ochiqligi va
  xodim faolligi tekshiriladi. Deploy yoki qayta yoqishda yo'qolmaydi.
- **Ishdan ketgan xodim topshiriqsiz qolmaydi.** Oxirgi ijrochi ketsa, qo'lda berilgan
  topshiriq (beruvchi hali faol bo'lsa) beruvchiga o'tadi; aks holda va tizim
  topshirig'i uchun filialning faol administratorlariga (yo'q bo'lsa direktorlarga,
  keyin CEO'ga).
- **Tekshiruv beruvchiga ish qo'shadi:** ijrochi «Bajardim» desa, topshiriq beruvchi
  qabul qilguncha ochiq turadi (o'ziga yozilgan topshiriq bundan mustasno).

## Ko'rib chiqilgan va rad etilgan

- **Izoh jadvalida qoldirib kengaytirish.** `CommentAssignee` holati har ijrochida
  alohida, muhokama, qadam va tekshiruv uchun joy yo'q; topshiriq «izohning bir turi»
  bo'lib qolsa, `/tasks` dan berish va tizim topshiriqlari ham shu jadvalga bog'lanib
  qolardi.
- **Holat har ijrochida alohida.** Beruvchi «bajarildimi?» savoliga bitta javob olmasdi.
  Bitta holat va «Har biriga alohida» ikkala holatni ham qoplaydi.
- **Beruvchi holatni tekshiruvsiz o'zi o'zgartirsin.** Tekshiruv bosqichining ma'nosi
  shu: beruvchi ishni ko'rib qabul qiladi yoki sabab bilan qaytaradi; menejer ham bu
  yo'ldan chetga chiqmaydi.
