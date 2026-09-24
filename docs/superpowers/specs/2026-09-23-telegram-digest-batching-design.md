# Telegram xabarlarini kunlik yagona xabarga jamlash — dizayn

**Sana:** 2026-09-23
**Holati:** Tasdiqlangan (foydalanuvchi bilan brainstorming + kodga qarshi avtomatik tekshiruvdan o'tgan)
**Aniqlashtirildi:** 2026-09-23, reja ko'rigidan keyin
(`docs/superpowers/plans/2026-09-23-telegram-digest-batching-review.md`), asosiy kodga
qo'shilishidan oldin. CEO uchta qaror berdi: (1) o'chirilmagan har qanday o'quvchi
xabar oladi, (2) avtomatik pauza ogohlantirishlari darhol qoladi, (3) guruh xabari
vaqtinchalik xatoda ertasi kuni qayta yuboriladi. Qolgan aniqlashtirishlar — hozirgi
xatti-harakatni saqlash (chek havolasi, «SMS» tarixi, qarz eslatmasi) va xabar
yo'qolishining oldini olish.
**Bog'liq:** ADR-0025, `server/src/telegram-groups/`, `server/src/notifications/`

## Muammo

Markazning Telegram boti kuniga o'nlab alohida xabar yuboradi: har bir to'lov,
har bir guruhga qo'shilish, har bir topshiriq, har bir davomat yakuni — barchasi
alohida push. Guruh digesti ham kuniga 5 marta (har 3 soatda) ishlaydi. Bu
CEO/menejerlar uchun ham, o'quvchi/xodimlar uchun ham ortiqcha shovqin.

Talab: aksariyat xabarlar kuniga 1 marta, kechqurun bitta yaxlit xabarga
jamlanadi. Vaqtga bog'liq bo'lgan bir nechta xabar turi esa darhol ketishda
qoladi.

## Qamrov

### Kechqurun (20:00, Asia/Tashkent) bitta xabarga jamlanadi

**O'quvchiga (shaxsiy):**
- To'lov qabul qilindi / bekor qilindi (`payment.received`, `payment.reversed`)
- Guruhga qo'shildi / guruhdan chiqarildi (`student.enrolled`,
  `student.removed_from_group`)
- Dars puli qarzga yozildi — balans yetmagani (`attendance.student.recorded`
  → SINGLE_UNCOVERED)

**Xodimga (shaxsiy) — faqat Telegram; DB/SSE/push kanali o'zgarmaydi, hozirgidek darhol qoladi:**
- Topshiriq berildi / yangilandi / o'chirildi / holati o'zgardi
  (`task.assigned`, `task.updated`, `task.deleted`, `task.status.changed`)
- Davomat qabul qilindi (`attendance.completed`, o'qituvchiga)
- Oldingi oydan ish haqi qo'shildi (`salary.carried-over`)
- To'lov to'g'rilandi — CEO'larga (`payment.corrected`)

**Telegram guruhiga (kompaniya/filial):**
- Yangi o'quvchilar, yangi guruhlar (hozir ham bufer — faqat jadval va
  saqlash joyi o'zgaradi, pastga qarang)
- Yirik va onlayn to'lovlar
- Guruh holati o'zgarishi (boshlandi/tugadi) — hozir doim darhol, endi bufer
- O'quvchi holati o'zgarishi (muzlatildi/chetlatildi/bitirdi/qaytdi) — hozir
  doim darhol, endi bufer

**Guruh digestiga kiritish chegarasi o'zgarmaydi**: ≥500 000 so'm YOKI onlayn
to'lov usuli (Payme/Click/Uzum) — bu hozirgi `LARGE_PAYMENT_THRESHOLD_SUM`.
Farqi: hozir ≥5 000 000 so'mlik to'lov bu chegaraning ustiga alohida,
digestni kutmay **darhol** ketadi (`INSTANT_PAYMENT_THRESHOLD_SUM`). Bu
alohida darhol-yo'l **butunlay olib tashlanadi** — endi ≥5 mln so'mlik
to'lov ham oddiy ≥500k toifasi bilan bir xil, kechqurunga qo'shiladi.

### O'zgarmaydi — darhol ketishda qoladi

Sabab har birida yozilgan — bular vaqtga bog'liq yoki alohida talab qilingan:

| Xabar | Nega darhol qoladi |
|---|---|
| Dars bekor qilindi / ko'chirildi (o'quvchi **va** o'qituvchiga, ikkalasi ham) | O'quvchi bo'sh darsga kelib qolmasligi kerak; bugungi/ertangi dars haqida kechqurungacha kutish xavfli |
| Admin qo'lda yozgan xabar (`POST /students/:id/sms`) | Admin o'zi tanlagan payt — kechiktirish uning niyatini buzadi |
| Mock imtihon xabarlari (to'lov, natija) | Alohida oqim, ishtirokchi talaba bo'lmasligi mumkin |
| Ro'yxatdan o'tish, parol tiklash, ilovaga kirish tasdig'i (OTP) | Login funksionalligi — kechiktirib bo'lmaydi |
| Bot buyruqlari va menyu javoblari | Foydalanuvchi kutib turibdi, bu javob emas, bildirishnoma |
| Davomat eslatmalari (dars boshlandi/tugadi, 07:00–22:00 cron) | Vaqtga qat'iy bog'liq, digest mantig'iga sig'maydi |
| Avtomatik pauza xabarlari (`absence-pause/`): 1–2-bosqich (o'quvchiga eslatma va ogohlantirish, filial adminlariga) dars kuni kechqurun 20:30 da; pauza (3-bosqich: o'quvchi, adminlar, ustoz, CEO) ertalab 07:30 da | CEO qarori (23.09). Yig'ma xabarga kirmaydi: cron yuborish natijasini shu zahoti `AbsenceWarningLog.sentToStudent` ga yozadi, kechiktirilsa bu maydon noto'g'ri bo'lib qoladi. Dars qoldirgan o'quvchi kechqurun ikki xabar olishi mumkin — 20:00 da yig'ma xabar va 20:30 da pauza eslatmasi (CEO bilgan va qabul qilgan). Hozir prodda o'chiq (`AbsencePauseSetting.enabled=false`) |
| To'lov va'dasi muddati o'tgani — 09:00 | Allaqachon kuniga 1 marta, ish kuni **boshida** foydali; 20:00 ga surish uni foydasiz qiladi |
| 21:00 kunlik moliyaviy hisobot | O'zgarishsiz qoladi, alohida cron |
| Per-student attendance xabari (`STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED`) | Hozir ham o'chirilgan (flag), qamrovdan tashqarida |

In-app bildirishnoma (qo'ng'iroq belgisi, DB yozuvi), SSE va web/native push —
**hech biri o'zgarmaydi**. Faqat Telegram jo'natish payti kechiktiriladi.

## Arxitektura

Telegram jo'natish hozir bir nechta mustaqil joyda nusxalangan holda
yozilgan, filtrlash qoidalari bir-biridan farq qiladi (ba'zilari
o'chirilgan/faol bo'lmagan qabul qiluvchini tekshirmaydi). Guruh digesti
alohida, Redis'da, 26 soatlik TTL bilan ishlaydi — kuniga 1 martaga
o'tganda bu TTL ikki kunlik bayramda butun bufer yo'qolishiga olib keladi.

Yangi arxitektura — **bitta navbat, bitta jo'natuvchi, ikkita cron**:

```
[voqea] → enqueue() → TelegramDigestItem (Postgres)
                              │
              ┌───────────────┴────────────────┐
              │                                 │
   20:00 shaxsiy cron                 20:00 guruh cron
   (STUDENT + USER)                   (GROUP, Yak/bayram skip)
              │                                 │
     resolveChatId() (yagona)          receivesAllBranches'ni hisobga
              │                        oladigan mavjud tanlov mantig'i
      1 kishi = 1 xabar                1 kompaniya = N guruh chat
```

### Aniq qaysi fayl nima qiladi

| Fayl | Bugungi holat | Bu dizaynda |
|---|---|---|
| `notification-events.listener.ts` | `task.*`, `payment.corrected`, `salary.carried-over` — o'zi chat ID topib, o'zi yuboradi (`sendTelegram` xususiy metodi). `payment-promise.overdue` ham shu yerda. | `task.*`, `payment.corrected`, `salary.carried-over` uchun `sendTelegram` o'rniga `enqueue()`. **`payment-promise.overdue` TEGILMAYDI** — 09:00 da o'zgarishsiz qoladi. |
| `payment-events.listener.ts` | `SmsService.sendToStudent`ni chaqiradi (darhol yuboradi + `SmsMessage` yozadi) | `SmsService`ni chaqirishni to'xtatadi, `enqueue()` chaqiradi. `SmsMessage` yozuvi endi cron ichida, yuborilgan paytda yoziladi |
| `sms-events.listener.ts` | Xuddi shunday, `SmsService` orqali | Xuddi shunday — `enqueue()`ga o'tadi |
| `student-debt-notification.listener.ts` | To'g'ridan-to'g'ri `bot.telegram.sendMessage`, hech qanday faol/o'chirilgan tekshiruvi yo'q, audit yozuvi yo'q | `enqueue()`ga o'tadi — filtrlash va audit birinchi marta paydo bo'ladi |
| `attendance-events.listener.ts` | `attendance.completed` → o'qituvchiga to'liq 4-kanal, Telegram qismi shu faylda | Faqat Telegram qismi `enqueue()`ga o'tadi; DB/SSE/push o'zgarmaydi |
| `lesson-reschedule-events.listener.ts` | O'qituvchiga to'liq 4-kanal (Telegram shu faylda), o'quvchiga `SmsService` orqali | **TEGILMAYDI** — ikkala yo'nalish ham darhol qoladi (yuqoridagi jadvalga qarang) |
| `lesson-cancellation-events.listener.ts` | Xuddi shu tuzilma | **TEGILMAYDI** — sababi bir xil |
| `SmsService.sendToStudent` | Darhol yuboradi, faol/o'chirilgan tekshiruvi yo'q | **TEGILMAYDI.** Bu servis hali ham dars bekor qilinishi/ko'chirilishi va admin qo'lda yozgan xabarga xizmat qiladi. Uning faol/o'chirilgan tekshiruvi yo'qligi — **mavjud, alohida xato, bu dizayn uni tuzatmaydi** (kelajakdagi alohida ish) |
| `telegram-group-broadcast.listener.ts` | Voqealarni yo `TelegramGroupDigestBufferService.push()`ga (Redis bufer) yoki `TelegramGroupBroadcastService.broadcast()`ga (darhol yuborish — o'zi emas, shu servis orqali) yo'naltiradi | Barcha yo'nalish `enqueue()`ga o'tadi — na Redis bufer, na darhol-broadcast qolmaydi |
| `TelegramGroupBroadcastService.broadcast()` | Haqiqiy `bot.telegram.sendMessage` shu yerda. 3 ta qo'shimcha vazifasi bor: (1) 30 soniyalik throttling `eventClass` bo'yicha, (2) `receivesAllBranches` guruhlarni ham qamrab oluvchi tanlov, (3) 403 xatosida guruhni avtomatik faolsizlantirish | Endi chaqirilmaydi (barcha chaqiruvchilar `enqueue()`ga o'tgani uchun). **(2) va (3) guruh cron'iga ko'chiriladi** — pastga qarang. (1) throttling endi keraksiz, chunki bir xil turdagi voqealar allaqachon kuniga bitta xabarga jamlanadi |
| `telegram-group-digest-buffer.service.ts` (Redis) | Past ustuvorlikdagi voqealarni buferlaydi | **Butunlay olib tashlanadi** |
| `telegram-group-digest-cron.service.ts` | `0 9,12,15,18,21 * * *`, Redisdan `drain()`, `filterForGroup` orqali filial bo'yicha filtrlaydi (`receivesAllBranches`ni **hisobga olmaydi** — mavjud kichik kamchilik; filialsiz guruhga esa HAMMA narsani beradi) | `0 20 * * *`ga o'zgaradi, manba Postgres, tanlov mantig'i `TelegramGroupBroadcastService` qoidasiga keltiriladi: `receivesAllBranches` hammasini ko'radi, filialli guruh o'z filiali + filialsiz yozuvlarni, **filialsiz eski guruh esa faqat filialsiz yozuvlarni** (fail-closed — `TelegramGroup.receivesAllBranches` sxema izohi bilan bir xil). Prodda 23.09 holatida bunday guruh 0 ta (yagona tasdiqlangan guruh — «Moliya-DaF Fergana», `branchId=1`). Har bir guruh chatiga yetkazish alohida belgilanadi (`deliveredGroupIds`), vaqtinchalik xatoda yozuv saqlanadi va ertasi kuni qayta yuboriladi (CEO qarori) |

### Ma'lumotlar modeli

```prisma
enum TelegramDigestRecipientKind {
  STUDENT
  USER
  GROUP // recipientId = companyId; guruh digestining o'zi
}

enum TelegramDigestCategory {
  PAYMENT_RECEIVED
  PAYMENT_REVERSED
  STUDENT_ENROLLED
  STUDENT_REMOVED
  DEBT_CHARGE
  TASK_ASSIGNED
  TASK_UPDATED
  TASK_DELETED
  TASK_STATUS_CHANGED
  PAYMENT_CORRECTED
  SALARY_CARRIED_OVER
  ATTENDANCE_COMPLETED
  GROUP_NEW_STUDENT
  GROUP_NEW_GROUP
  GROUP_PAYMENT
  GROUP_STATUS_CHANGE
}

model TelegramDigestItem {
  id              String                       @id @default(uuid())
  recipientKind   TelegramDigestRecipientKind
  recipientId     Int                          // STUDENT/USER: shu id; GROUP: companyId
  companyId       Int                          // bayram tekshiruvi uchun (faqat GROUP ishlatadi)
  branchId        Int?                         // faqat GROUP: filial-skoplangan voqea; null = kompaniya bo'ylab e'lon
  category        TelegramDigestCategory
  relatedEntityId String?                      // dedup uchun (masalan, taskId)
  payload         Json                         // strukturaviy maydonlar — TAYYOR MATN EMAS
  deliveredGroupIds String[]                   @default([]) // faqat GROUP: qaysi TelegramGroup.id larga yetib bordi
  createdAt       DateTime                     @default(now())

  @@index([recipientKind, recipientId])
  @@index([companyId])
  @@index([createdAt])
}
```

**Nega `category` enum, satr emas?** Loyihada "category"ga o'xshash yagona
maydon — `Expense.category: ExpenseCategory` — enum. Erkin satr yozilsa,
xato bilan yozilgan qiymat (`'TASK_ASIGNED'`) kompilyatsiyada ushlanmaydi va
render kodida hech qanday bo'limga tushmay, jimgina yo'qolib ketadi (dizayn
qoidasiga ko'ra bo'sh bo'lim ko'rsatilmaydi — demak xato ham ko'rinmaydi).
Enum bu sinfdagi xatoni kompilyatsiya bosqichida ushlaydi.

**Nega `branchId` qo'shildi?** `TelegramGroup` filialga bog'langan bo'lishi
mumkin (yoki `receivesAllBranches=true` bilan barcha filiallarni ko'rishi
mumkin). Hozirgi `telegram-group-broadcast.listener.ts` har bir voqeaga
`branchId`ni bevosita ilova qiladi, aynan shu filialning guruhigagina
yetib borishi uchun. Bu maydonsiz kechqurungi cron voqeani yo har bir
guruh chatiga yuborishga (boshqa filial ma'lumotini oshkor qilib) yoki
umuman yubormaslikka majbur bo'lardi.

**Nega tayyor matn emas, strukturaviy ma'lumot?** To'lov chekidagi "Joriy
balansingiz" qatori ertalab yozilsa, kechqurunga eskirib qoladi. `payload`
faqat voqea raqamlarini saqlaydi (masalan `{amount, method, receiptUrl}`);
matn 20:00 da render qilinganda tuziladi, balans esa **shu paytda** bazadan
qayta o'qiladi.

**Nega `companyId` shaxsiy yozuvlarda ham bor**, garchi ular bayram/yakshanba
tekshiruvidan o'tmasa ham (pastga qarang)? Loyihaning barcha jadvallari
`companyId` bilan skoplangan — konsistentlik va kelajakdagi filtrlash uchun
saqlanadi. Shaxsiy yozuvlarda u audit (`SmsMessage.companyId`) uchun ham ishlatiladi.

**Nega `deliveredGroupIds`?** Bitta kompaniya bir nechta Telegram guruhiga ega
bo'lishi mumkin (filiallar bo'yicha). Bir guruhga yetib borib, boshqasiga tarmoq
xatosi tufayli yetmasa, ertasi kuni faqat yetmagan guruhga qayta yuborish kerak —
yetganiga takror ketmasligi uchun. Yozuv o'zini ko'rishi kerak bo'lgan barcha faol
guruhlarga yetgach o'chiriladi. STUDENT/USER yozuvlarida bu maydon ishlatilmaydi.

**Payload turlari kategoriya bo'yicha qat'iy.** Har kategoriyaning o'z payload
interfeysi bor va `enqueue()` chaqiruvida kategoriya bilan payload mosligi
kompilyatsiyada tekshiriladi (xato yozilgan maydon `undefined` bo'lib jimgina
xabarga tushmasin). Payload'da tayyor matn saqlanmaydi: masalan to'lov
to'g'rilashda eski/yangi summa va usul, topshiriq holatida esa holat qiymati
(`SEEN`/`DONE`) saqlanadi — matn render paytida tuziladi. Istisno — ism
o'rnidagi zaxira: voqea paytida o'quvchi yoki guruh qatori topilmasa, ism
maydoniga `ID <id>` yoziladi (bugungi zaxira xabar kabi); bu ma'lumot, xabar
matni emas.

### Umumiy jo'natuvchi — `resolveChatId(kind, id)`

Bitta funksiya, ikkita filtr to'plami — hozirgi eng qattiq mavjud
konvensiyalarni oladi (yangi qoida o'ylab topilmaydi):

- `USER`: `deletedAt: null, isActive: true, status: UserStatus.ACTIVE`
  (attendance-events.listener.ts'dagi eng to'liq filtr)
- `STUDENT`: faqat `deletedAt: null` (CEO qarori, 23.09). `Student.isActive` faqat
  `ACTIVE` holatda `true` (`students-status.service.ts:268`), shuning uchun
  `isActive: true` filtri muzlatilgan, ketgan va bitirgan o'quvchilarni ham kesib
  tashlardi — eski qarzini to'layotgan yoki pauzadan qaytish uchun pul to'layotgan
  o'quvchi chek olmay qolardi. Bugun to'lov cheki ham, guruh xabarlari ham ularga
  boradi; bu saqlanadi.

Bu **beixtiyor bitta xatoni tuzatadi**: `student-debt-notification.listener.ts`
hozir hech qanday tekshiruv qilmaydi — ya'ni o'chirilgan o'quvchiga xabar ketishi
mumkin edi. Bu fayl to'liq yangi navbatga o'tgani uchun tekshiruv avtomatik
qo'llanadi.

`SmsService.sendToStudent`da **xuddi shu turdagi** filtr yo'qligi alohida,
mavjud kamchilik — lekin bu servis bu dizaynda tegilmagani uchun (yuqoridagi
jadvalga qarang), bu xato **shu ish doirasida tuzatilmaydi**.

Chat ID **enqueue paytida emas, yuborish paytida** qidiriladi — bu kun
davomida xodim ishdan bo'shatilsa yoki o'quvchi arxivlansa, ularga xabar
ketmasligini kafolatlaydi, va enqueue paytida keraksiz DB so'rovini yo'qotadi.

### Voqea yozuvchi tomon o'zgarishi

Digestga o'tadigan har bir joy shu naqshga o'tadi:

```ts
await this.digestQueue.enqueue({
  recipientKind: 'STUDENT',
  recipientId: studentId,
  companyId,
  category: 'PAYMENT_RECEIVED',
  payload: { amount, method, receiptUrl },
});
```

Yuqoridagi jadvaldagi **"TEGILMAYDI"** deb belgilangan fayllar (lesson
reschedule/cancellation, `SmsService.sendToStudent`) hech qanday
o'zgarishsiz qoladi.

### Kechqurungi shaxsiy cron (yangi)

```
@Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })
```

Yakshanba/bayram tekshiruvi **YO'Q** — voqea bo'lmagan kishiga baribir
hech narsa ketmaydi, shuning uchun kunni o'tkazib yuborishning ma'nosi yo'q.

Har ishlashda:
1. **Birinchi navbatda** 7 kundan eski STUDENT/USER yozuvlari o'chiriladi — bot
   sozlanmagan bo'lsa ham (aks holda botsiz muhitda jadval cheksiz o'sadi). Bir
   ishlashda 1 tadan ortiq yozuv shu tarzda o'chsa, bitta `Logger.warn` yoziladi
   (uzoq muddatli nosozlikni sezish uchun)
2. Navbatdagi yozuvlarni `createdAt` bo'yicha tartiblab o'qiydi va
   `(recipientKind, recipientId)` bo'yicha guruhlaydi (faqat STUDENT va USER)
3. **Har bir kishi o'z `try/catch`ida** — bitta kishidagi xato (baza, render)
   qolganlarni to'xtatmaydi
4. `resolveChatId()` → topilmasa, shu kishining yozuvlari o'chiriladi (doimiy
   holat). O'quvchi uchun bugungi `SmsService` kabi guruhga qo'shilish/chiqarilish
   yozuvlariga FAILED «Telegram bog'lanmagan» audit qatori yoziladi (to'lov
   yozuvlariga yozilmaydi — bugun ham yozilmaydi)
5. Topilsa: kategoriyalar bo'yicha render qiladi (pastga qarang). Matn 4000
   belgidan oshsa, qator chegaralarida bir nechta xabarga bo'linadi (Telegram
   chegarasi 4096). Qismlar ketma-ket yuboriladi
6. **Yuborish xatosi to'rt turga ajratiladi:**
   - **Doimiy** (403 — bot bloklangan/chatdan chiqarilgan; 400 "chat not found",
     "user is deactivated", "bot was blocked") → qolgan yozuvlar o'chiriladi,
     o'quvchi uchun FAILED audit qatori yoziladi
   - **Kontent xatosi** (boshqa 400 — "message is too long", "can't parse
     entities") → bu bizning xatomiz: yozuvlar saqlanadi (tuzatish chiqqach
     yuboriladi), `Logger.error` bilan Telegram tavsifi yoziladi
   - **Tezlik chegarasi** (429) → `retry_after` soniya (ko'pi bilan 30) kutib bir
     marta qayta uriniladi; yana xato bo'lsa vaqtinchalik deb hisoblanadi
   - **Vaqtinchalik** (tarmoq, 5xx, boshqa har qanday) → yozuvlar **saqlanadi**,
     ertaga qayta uriniladi
7. Bir nechta qismdan biri yetib borib keyingisi xato bersa, yetib borgan qism
   yozuvlari o'chiriladi — ertaga faqat yetmagan qism qayta ketadi (takror yo'q)
8. **Faqat shu ishlashda o'qilgan yozuvlar** o'chiriladi (`id IN (...)`) —
   yuborish davomida kelib qolgan yangi voqea yo'qolmaydi, ertangi kunga qoladi

### Kechqurungi guruh cron (mavjudni o'zgartirish)

`telegram-group-digest-cron.service.ts`: jadval `0 9,12,15,18,21 * * *` dan
`0 20 * * *` ga o'zgaradi. Yakshanba/bayram tekshiruvi **saqlanadi**
(`isTashkentSunday()`, `findActiveHolidayCovering()` — o'zgarishsiz). Manba
Redis `drain()` o'rniga yangi jadvaldan `kind: GROUP, companyId` bo'yicha
o'qiladi.

**Tozalash birinchi:** 7 kundan eski GROUP yozuvlari har ishlashning boshida
o'chiriladi — bot sozlanmagan, yakshanba yoki bayram bo'lsa ham (1 tadan ortiq
bo'lsa bitta `Logger.warn`). Shundan keyin bot, yakshanba va bayram tekshiruvlari.

**Guruh tanlash mantig'i** — `TelegramGroupBroadcastService.broadcast()`dagi
qoida bilan bir xil: `receivesAllBranches=true` guruh hamma yozuvni ko'radi;
filialli guruh — o'z filiali va filialsiz (kompaniya bo'ylab) yozuvlarni;
filialsiz eski guruh — faqat filialsiz yozuvlarni (fail-closed). Bir
kompaniyaning bir nechta guruh chatiga fan-out qilinadi; har bir chatga yuborish
**mustaqil** — xato bir chatda bo'lsa boshqasiga ta'sir qilmaydi.

**Qayta yuborish (CEO qarori, 23.09):** har bir yozuv qaysi guruhga yetib
borganini `deliveredGroupIds` da saqlaydi. Guruhga faqat unga hali yetmagan
yozuvlar yuboriladi. Qism muvaffaqiyatli ketsa, undagi yozuvlarga shu guruh id si
qo'shiladi. Vaqtinchalik yoki kontent xatosida yozuv saqlanadi va ertasi kuni
(yoki keyingi ish kunida) qayta yuboriladi. Yozuv o'zini ko'rishi kerak bo'lgan
barcha **faol** guruhlarga yetgach o'chiriladi; hech bir faol guruh ko'rmaydigan
yozuv (masalan kompaniyada tasdiqlangan guruh yo'q) darhol o'chiriladi.

**Har bir kompaniya o'z `try/catch`ida** — bitta kompaniyadagi xato qolganlarni
to'xtatmaydi va yetib borgan yozuvlar belgilab qo'yilgani uchun ertaga takror
ketmaydi.

**403 xatosi** — qaysi chatda bo'lsa, o'sha `TelegramGroup` qatori
faolsizlantiriladi (`broadcast()`dagi mavjud xatti-harakat, endi barcha
guruh xabarlari uchun bir xil qo'llanadi).

### Render qoidalari

**O'quvchi xabari** — «Hurmatli {ism}!» bilan boshlanadi; bo'limlar tartibi:
💳 To'lovlar → 📚 Guruh → ⚠️ Qarzga yozilgan darslar. Oxirida **faqat** pul
harakati bo'lgan kunlarda — balans yoki qarz miqdori, **yuborish paytida qayta
o'qilgan** holatda. Agar kun davomida qarz paydo bo'lib, keyin yopilgan bo'lsa,
"qarzga yozildi" ogohlantirishi **ko'rsatilmaydi** (balans ≥0 bo'lsa, DEBT_CHARGE
bo'limi butunlay yashiriladi).

Hozirgi xabarlardagi ma'lumot saqlanadi:
- Har bir to'lov qatori ostida **chek havolasi** — `📄 Kvitansiya: <url>`
  (manzil hozirgidek `INVOICE_BASE_URL`/zaxira manzil bilan voqea paytida
  quriladi va payload'da `receiptUrl` sifatida saqlanadi). Havola oddiy matn
  sifatida qoladi (profildagi «SMS» tabi `<a>` tegini ko'rsatmaydi); havola
  oldindan ko'rinishi o'chiriladi.
- Bekor qilingan to'lovda sabab (bo'lsa).
- Qarz bo'limi oxirida: «Hozirgi qarz», «Iltimos, balansingizni to'ldiring.» va
  «🔗 Profilingiz: https://student.dafzentrum.uz». Dars narxi 0 bo'lsa narx
  yozilmaydi (bugungidek).
- Qarz qatori yuborish paytida qayta tekshiriladi: o'sha davomat uchun bekor
  qilinmagan `SINGLE_UNCOVERED` yechim hali bormi (davomat keyin «sababli»ga
  o'zgartirilgan bo'lsa, qator ko'rsatilmaydi).
- Guruhga qo'shilish/chiqarilish — bugungi shablonlar (`sms-templates.ts`), lekin
  ichidagi erkin matn (guruh, kurs nomi, sabab) HTML-ekranlangan holda; ikki
  xabar orasida bo'sh qator.
- Xabar oxirida bugungi yakuniy qatorlar: bekor qilingan to'lov bo'lsa «Savollar
  bo'lsa, markazga murojaat qiling.», qabul qilingan to'lov bo'lsa «Rahmat!».

**Xodim xabari** — bo'limlar: ✅ Davomat qabul qilindi (guruh bo'yicha,
nol qiymatlar — jumladan «Keldi: 0» — yozilmaydi; bugungi kundan boshqa kunga
tegishli davomat bo'lsa sanasi ko'rsatiladi) → 📝 Topshiriqlar → 💵 Oylik. CEO
uchun qo'shimcha: ✏️ To'g'irlangan to'lovlar (bugungi matn: «X Yning to'lovini
to'g'riladi: 5 000 000 → 400 000 so'm, Naqd → Bank o'tkazmasi. Sabab: …»).
To'lov usuli nomlari yagona manbadan (`payments/shared/method-label.ts`).

**Dedup qoidasi:** bitta `relatedEntityId` bo'yicha bir xil kategoriyadan bir
nechta yozuv bo'lsa, faqat eng oxirgisi (`createdAt` max) ko'rsatiladi. Kalitlar
shunday tanlanadi, ki turli voqealar bir-birini yashirmasin:
- topshiriq berildi/yangilandi/o'chirildi — topshiriq id;
- topshiriq holati — topshiriq id **+ ijrochi id** (bir nechta ijrochili
  topshiriqda «Ali bajardi» ni «Vali ko'rdi» yashirmasin);
- davomat — guruh id + sana; to'lov — to'lov id; qarz — davomat id;
- guruh xabarida — faqat aynan takroriy voqealar (masalan ikki marta bosilgan
  holat o'zgarishi) birlashadi.

**Uzunlik:** Telegram bitta xabarga 4096 belgidan ko'pini qabul qilmaydi. Har
qanday Telegram matni 4000 belgigacha bo'lgan qismlarga qator chegaralarida
bo'linadi; bo'lim sarlavhasi o'z birinchi qatori bilan birga qoladi. Bitta qator
hech qachon bo'linmaydi — erkin matn maydonlari oldindan qisqartiriladi
(topshiriq matni 80, holat o'zgarishida 60 — bugungidek; sabablar 300 belgi).

**Ekranlash:** xabarga tushadigan har qanday erkin matn (ism, guruh, kurs, sabab,
topshiriq matni) `escapeHtml` dan o'tadi.

**Guruh digesti** — bo'lim nomi "To'lovlar — jami X" dan "Yirik va onlayn
to'lovlar" ga o'zgaradi (chunki u hech qachon kunning **umumiy** tushumini
ko'rsatmagan — faqat yuqorida aytilgan chegaradan o'tgan to'lovlarni; bu nom
aniqlik kiritadi). Holat o'zgarishi (guruh/o'quvchi) endi bitta qatorda:
belgi + kim/qaysi guruh + nima bo'ldi + sabab (bo'lsa) + kim o'zgartirgani +
vaqt — hozirgi ko'p qatorli xabar o'rniga. Belgilar bugungidek: 🚀 guruh
boshlandi, 🏁 guruh tugadi, ❄️ muzlatildi, 🚫 chetlatildi, 🎓 bitirdi, ✅ qaytadan
faol. Yangi o'quvchi, yangi guruh va holat o'zgarishi bo'limlarida filial
sarlavhalari (`🏢 Filial (N)`) bugungidek saqlanadi. Vaqt oralig'i boshqa
kundan boshlansa (kechagi 20:00 dan keyingi voqea, yakshanba yoki bayramdan
keyin) sanasi bilan ko'rsatiladi.

Bu ikki o'zgarish (nom aniqligi, bitta qatorli format) — vazifasi xabarni
o'qishga osonlashtirish bo'lgan **ataylab qilingan, foydalanuvchi bilan
kelishilgan** yaxshilanishlar, tasodifiy qamrov kengayishi emas.

### SmsMessage audit yozuvi

O'quvchiga tegishli yozuvlar (`STUDENT` kind) uchun `SmsMessage` qatori
hozirgidek bitta voqea = bitta qator tarzida saqlanadi, lekin **yuborilgan
payt** (20:00) yoziladi, voqea payti emas. Bir nechta voqea bitta jismoniy
Telegram xabarida ketsa, ularning barchasi bitta `telegramMessageId`ni
baham ko'radi (xabar qismlarga bo'lingan bo'lsa — o'z qismining id sini).
`student-debt-notification.listener.ts`dan kelgan yozuvlar
ham endi shu jurnalga tushadi — hozir bu xabar turi umuman audit
qoldirmaydi, bu yon-ta'sir sifatida tuzatiladi.

Audit shakli bugungi `SmsService.sendToStudent` bilan bir xil (u tegilmaydi,
shakl nusxalanadi):
- `SmsMessage`: `studentId`, `content` (o'sha voqeaning xabardagi matni), `type:
  AUTO`, `status: SENT|FAILED`, `senderUserId` (to'lovda — to'lovni kiritgan xodim,
  payload'dagi `performedById`), `telegramMessageId`, `errorMessage`, `companyId`;
- o'quvchi tarixida `EntityHistory` yozuvi: `action: SMS_YUBORILDI` /
  `SMS_YUBORILMADI`, `tur: Avtomatik`, `xabar` (teglarsiz, 100 belgi), `holat`.
FAILED qatorlar faqat yakuniy holatda yoziladi: doimiy Telegram xatosi, yoki chat
yo'q bo'lgan (lekin o'chirilmagan) o'quvchining guruhga qo'shilish/chiqarilish
yozuvi (bugungi bilan bir xil). Telegram matni HTML-ekranlangan bo'ladi, profildagi
«SMS» tabi esa matnni o'zi yana ekranlaydi — shuning uchun auditga `&amp;`, `&lt;`,
`&gt;` o'rniga oddiy belgilar yoziladi (`<b>` teglari qoladi, tab ularni ko'rsatadi).
Vaqtinchalik xatoda audit yozilmaydi — yozuv ertaga qayta yuboriladi. Audit yozish
xatosi yuborishni buzmaydi (alohida `try/catch`, `warn`).

`USER` va `GROUP` turdagi yuborishlar uchun **`SmsMessage`ga teng audit
yozuvi qo'shilmaydi** — bu jadval faqat o'quvchi bilan aloqa tarixini
saqlaydi. Xodimga tegishli voqealarning ba'zilari (`task.*`) allaqachon
`Notification` jadvalida (DB kanali) saqlanadi va bu o'zgarmaydi; Telegram
kanali uchun alohida audit — bugungi kunda ham yo'q, bu dizayn ham
qo'shmaydi.

## Chegara holatlar

| Holat | Yechim |
|---|---|
| Chat ID topilmadi | Yozuv o'chiriladi, qayta urinilmaydi (guruhga qo'shilish/chiqarilish uchun FAILED audit) |
| Bot bloklangan / "chat not found" xatosi (Telegram 403 yoki aniq 400) | Doimiy xato — yozuv o'chiriladi, FAILED audit |
| Xabar juda uzun / HTML xatosi (boshqa 400) | Kontent xatosi — yozuv saqlanadi, `Logger.error`; tuzatish chiqqach ketadi |
| 429 (tezlik chegarasi) | `retry_after` (≤30 s) kutib bir marta qayta; yana xato bo'lsa — vaqtinchalik |
| Tarmoq/boshqa noaniq xato | Yozuv saqlanadi, ertaga qayta uriniladi |
| Xabar 4000 belgidan uzun | Qator chegaralarida qismlarga bo'linadi; yetgan qism yozuvlari o'chadi, yetmagani ertaga |
| 7 kundan oshgan yozuv (har qanday tur) | Har ishlash boshida tozalanadi, bot yo'q/yakshanba/bayram bo'lsa ham; 1 tadan ko'p bo'lsa `Logger.warn` |
| Yuborish jarayonida yangi voqea keladi | O'chirilmaydi — faqat shu ishlashda o'qilganlar o'chadi |
| Bitta kishi yoki kompaniyada baza/render xatosi | Faqat o'shani o'tkazib yuboradi (`try/catch`), qolganlar yuboriladi |
| Guruh digestida bitta kompaniyaning bir nechta chatidan biriga yuborish xato bersa | Boshqa chatlarga ta'sir qilmaydi; yozuv yetmagan chat uchun saqlanadi va ertaga faqat o'sha chatga qayta ketadi (`deliveredGroupIds`) |
| Guruh chatida 403 | Guruh faolsizlantiriladi (bugungidek); yozuv endi u guruhni kutmaydi |
| Guruh chatida boshqa doimiy xato (400 "chat not found", guruh ko'chirilgan) | Guruh faolsizlantirilmaydi, lekin shu ishlashda yozuvlar u chatni kutmaydi (7 kun behuda urinilmaydi), `warn` |
| Kompaniyada tasdiqlangan faol guruh yo'q | GROUP yozuvlari darhol o'chiriladi |
| Guruh digestida bo'lim bo'sh | Bo'lim butunlay ko'rsatilmaydi |
| Hech kimda voqea yo'q kun | Xabar umuman yuborilmaydi (shaxsiy ham, guruh ham) |
| Guruh digestida Yakshanba/bayram | Butun ishlash o'tkazib yuboriladi (mavjud xatti-harakat) |

## Testlash

Loyihaning odatiy uslubi (`server/CLAUDE.md` → Testing): har bir yangi
xizmat uchun `.spec.ts`, `PrismaService` model bo'yicha mock qilingan,
muvaffaqiyat va xato yo'llari alohida. Alohida e'tibor:

- `resolveChatId()` — faol/nofaol/o'chirilgan holatlar
- Navbat drain — faqat o'qilgan yozuvlar o'chirilishi, doimiy/kontent/
  vaqtinchalik/429 xato holatida farqli xatti-harakat, qismlarga bo'lish
- Render — dedup qoidasi, bo'sh bo'limning yashirinishi, balansning
  yuborish paytida qayta hisoblanishi, ekranlash, chek havolasi
- Guruh cron — Yakshanba/bayram skip, `receivesAllBranches` bilan va
  bilansiz guruhlar, filialsiz eski guruh, bitta chat xato bersa boshqasiga
  ta'sir qilmasligi va ertaga faqat o'shanga qayta ketishi, 7 kunlik tozalash
- Ishga tushish tekshiruvi — birlik testlari DI ni tekshirmaydi (servislarni
  soxta nusxa bilan beradi), shuning uchun server build qilinib, botlar
  o'chirilgan holda (`TELEGRAM_BOT_TOKEN=`, `TELEGRAM_ADMIN_BOT_TOKEN=`) lokal ishga
  tushiriladi va «Nest application successfully started» kutiladi

## Amalga oshirish ko'lami (keyingi bosqich uchun)

- 1 ta Prisma migratsiya (2 yangi enum + 1 yangi model)
- `server/src/telegram-digest/` da yangi fayllar: payload turlari, navbat
  xizmati, resolver, dedup, xabarni qismlarga bo'lish, Telegram yuborish
  (xato turlari + 429), render xizmati, audit xizmati, shaxsiy cron
- **Qamrovdan tashqarida (mavjud xatti-harakat):** guruh cron'idagi bayram
  tekshiruvi (`findActiveHolidayCovering(new Date())`) kompaniya yoki filial
  bo'yicha emas, global — istalgan bayram hamma kompaniyaning guruh xabarini
  o'tkazib yuboradi. Bu ish buni o'zgartirmaydi.
- **Qorovul test:** `.sendMessage(` ni to'g'ridan-to'g'ri faqat «darhol» ro'yxatdagi
  fayllar chaqira oladi (`telegram-digest/direct-send.guard.spec.ts`) — ADR-0025
  dagi taqiq shu bilan avtomatik tekshiriladi.
- **Chiqarish eslatmasi:** eski Redis buferida (`tg-group:batch:<companyId>`)
  turgan voqealar yangi kodga o'tmaydi. Eski cron oxirgi marta 21:00 da
  bo'shatadi — shuning uchun ish kuni 21:00 dan keyin chiqarilsa, faqat 21:00 dan
  chiqarishgacha bo'lgan (odatda kechasi bo'lmaydigan) voqealar tushib qoladi
- ~6 ta mavjud faylni o'zgartirish: `notification-events.listener.ts`
  (qisman — `payment-promise.overdue` tegilmaydi), `payment-events.listener.ts`,
  `sms-events.listener.ts`, `student-debt-notification.listener.ts`,
  `attendance-events.listener.ts`, `telegram-group-broadcast.listener.ts`,
  `telegram-group-digest-cron.service.ts`
- 2 ta faylni olib tashlash (`telegram-group-digest-buffer.service.ts`,
  va agar boshqa chaqiruvchisi qolmasa `TelegramGroupBroadcastService`)
- **Tegilmaydi**: `lesson-reschedule-events.listener.ts`,
  `lesson-cancellation-events.listener.ts`, `sms.service.ts` (`SmsService.sendToStudent`),
  `absence-pause/` (avtomatik pauza ogohlantirishlari), `attendance-reminder.service.ts`,
  `student-attendance-notification.listener.ts`, `telegram-group-daily-cron.service.ts`
  (21:00 hisobot), `telegram-group-announcement.service.ts`, bot buyruq/menyu fayllari
  (`telegram-admin-bot-registrar.ts`, `telegram-group-report-menu.service.ts`)
- Loyiha qoidasiga ko'ra shu PR ichida ADR-0025 ham yoziladi
