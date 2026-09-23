# Telegram xabarlarini kunlik yagona xabarga jamlash — dizayn

**Sana:** 2026-09-23
**Holati:** Tasdiqlangan (foydalanuvchi bilan brainstorming + kodga qarshi avtomatik tekshiruvdan o'tgan)
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
| `telegram-group-digest-cron.service.ts` | `0 9,12,15,18,21 * * *`, Redisdan `drain()`, `filterForGroup` orqali filial bo'yicha filtrlaydi (`receivesAllBranches`ni **hisobga olmaydi** — mavjud kichik kamchilik) | `0 20 * * *`ga o'zgaradi, manba Postgres, tanlov mantig'i `receivesAllBranches`ni hisobga oladigan qilib almashtiriladi (`TelegramGroupBroadcastService`dagi so'rovga o'xshash) — bu **eski buferlangan toifalar uchun ham** yashiringan kamchilikni beixtiyor tuzatadi |

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
saqlanadi, hozircha funksional talab emas.

### Umumiy jo'natuvchi — `resolveChatId(kind, id)`

Bitta funksiya, ikkita filtr to'plami — hozirgi eng qattiq mavjud
konvensiyalarni oladi (yangi qoida o'ylab topilmaydi):

- `USER`: `deletedAt: null, isActive: true, status: UserStatus.ACTIVE`
  (attendance-events.listener.ts'dagi eng to'liq filtr)
- `STUDENT`: `deletedAt: null, isActive: true`
  (lesson-reschedule/cancellation listener'laridagi filtr; `Student.isActive`
  status bilan sinxron saqlanadi, shuning uchun alohida status tekshiruvi
  ortiqcha)

Bu **beixtiyor bitta xatoni tuzatadi**: `student-debt-notification.listener.ts`
hozir bu tekshiruvlarning hech birini qilmaydi — ya'ni o'chirilgan yoki
chetlatilgan o'quvchiga xabar ketishi mumkin edi. Bu fayl to'liq yangi
navbatga o'tgani uchun tekshiruv avtomatik qo'llanadi.

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
1. Navbatdagi yozuvlarni `(recipientKind, recipientId)` bo'yicha guruhlaydi
   (faqat STUDENT va USER)
2. Har bir kishi uchun: `resolveChatId()` → topilmasa, shu kishining barcha
   yozuvlari o'chiriladi (doimiy holat, qayta urinilmaydi)
3. Topilsa: kategoriyalar bo'yicha render qiladi (pastga qarang), yuboradi
4. **Yuborish xatosi ikki turga ajratiladi:**
   - **Doimiy** (Telegram xatosi 403 — bot bloklangan/chatdan chiqarilgan,
     yoki 400 "chat not found"/"user is deactivated") → yozuvlar o'chiriladi,
     qayta urinilmaydi
   - **Vaqtinchalik** (tarmoq xatosi, boshqa har qanday xato) → yozuvlar
     **saqlanadi**, ertaga qayta uriniladi
5. **Faqat shu ishlashda o'qilgan yozuvlar** o'chiriladi (`id IN (...)`) —
   yuborish davomida kelib qolgan yangi voqea yo'qolmaydi, ertangi kunga qoladi
6. Xavfsizlik: 7 kundan oshgan har qanday yozuv, muvaffaqiyatidan qat'iy
   nazar, tozalanadi — **shu payt bitta `Logger.warn` yoziladi**, agar bir
   ishlashda 1 tadan ortiq yozuv shu tarzda tozalansa (uzoq muddatli
   nosozlikni sezish uchun)

### Kechqurungi guruh cron (mavjudni o'zgartirish)

`telegram-group-digest-cron.service.ts`: jadval `0 9,12,15,18,21 * * *` dan
`0 20 * * *` ga o'zgaradi. Yakshanba/bayram tekshiruvi **saqlanadi**
(`isTashkentSunday()`, `findActiveHolidayCovering()` — o'zgarishsiz). Manba
Redis `drain()` o'rniga yangi jadvaldan `kind: GROUP, companyId` bo'yicha
o'qiladi.

**Guruh tanlash mantig'i yangilanadi**: hozirgi oddiy `filterForGroup`
(`branchId == null || branchId === group.branchId`) o'rniga
`receivesAllBranches`ni ham hisobga oladigan tanlov ishlatiladi —
`TelegramGroupBroadcastService.broadcast()`dagi so'rovga o'xshash. Bir
kompaniyaning bir nechta guruh chatiga (filiallar bo'yicha) fan-out qilinadi;
har bir chatga yuborish **mustaqil, xato bir chatda bo'lsa boshqasiga
ta'sir qilmaydi** (mavjud xatti-harakat bilan bir xil — `broadcast()` ham
har bir chatni alohida `try/catch`da yuboradi). Yozuvlar barcha chatlarga
urinib bo'lingach o'chiriladi, qat'iy nazar har bir chatning natijasidan
(bugungi kunda ham qayta urinish yo'q — bu yangilik emas).

**403 xatosi** — qaysi chatda bo'lsa, o'sha `TelegramGroup` qatori
faolsizlantiriladi (`broadcast()`dagi mavjud xatti-harakat, endi barcha
guruh xabarlari uchun bir xil qo'llanadi).

### Render qoidalari

**O'quvchi xabari** — bo'limlar tartibi: 💳 To'lovlar → 📚 Guruh → ⚠️ Qarzga
yozilgan darslar. Oxirida **fақат** pul harakati bo'lgan kunlarda —
balans yoki qarz miqdori, **yuborish paytida qayta o'qilgan** holatda. Agar
kun davomida qarz paydo bo'lib, keyin yopilgan bo'lsa, "qarzga yozildi"
ogohlantirishi **ko'rsatilmaydi** (balans ≥0 bo'lsa, DEBT_CHARGE bo'limi
butunlay yashiriladi).

**Xodim xabari** — bo'limlar: ✅ Davomat qabul qilindi (guruh bo'yicha
guruhlangan, nol qiymatlar yozilmaydi) → 📝 Topshiriqlar → 💵 Oylik. CEO
uchun qo'shimcha: ✏️ To'g'irlangan to'lovlar.

**Dedup qoidasi:** bitta `relatedEntityId` (masalan, taskId) bo'yicha bir xil
kategoriyadan bir nechta yozuv bo'lsa, faqat eng oxirgisi (`createdAt` max)
ko'rsatiladi.

**Guruh digesti** — bo'lim nomi "To'lovlar — jami X" dan "Yirik va onlayn
to'lovlar" ga o'zgaradi (chunki u hech qachon kunning **umumiy** tushumini
ko'rsatmagan — faqat yuqorida aytilgan chegaradan o'tgan to'lovlarni; bu nom
aniqlik kiritadi). Holat o'zgarishi (guruh/o'quvchi) endi bitta qatorda: kim,
sabab, kim o'zgartirgani — hozirgi ko'p qatorli xabar o'rniga.

Bu ikki o'zgarish (nom aniqligi, bitta qatorli format) — vazifasi xabarni
o'qishga osonlashtirish bo'lgan **ataylab qilingan, foydalanuvchi bilan
kelishilgan** yaxshilanishlar, tasodifiy qamrov kengayishi emas.

### SmsMessage audit yozuvi

O'quvchiga tegishli yozuvlar (`STUDENT` kind) uchun `SmsMessage` qatori
hozirgidek bitta voqea = bitta qator tarzida saqlanadi, lekin **yuborilgan
payt** (20:00) yoziladi, voqea payti emas. Bir nechta voqea bitta jismoniy
Telegram xabarida ketsa, ularning barchasi bitta `telegramMessageId`ni
baham ko'radi. `student-debt-notification.listener.ts`dan kelgan yozuvlar
ham endi shu jurnalga tushadi — hozir bu xabar turi umuman audit
qoldirmaydi, bu yon-ta'sir sifatida tuzatiladi.

`USER` va `GROUP` turdagi yuborishlar uchun **`SmsMessage`ga teng audit
yozuvi qo'shilmaydi** — bu jadval faqat o'quvchi bilan aloqa tarixini
saqlaydi. Xodimga tegishli voqealarning ba'zilari (`task.*`) allaqachon
`Notification` jadvalida (DB kanali) saqlanadi va bu o'zgarmaydi; Telegram
kanali uchun alohida audit — bugungi kunda ham yo'q, bu dizayn ham
qo'shmaydi.

## Chegara holatlar

| Holat | Yechim |
|---|---|
| Chat ID topilmadi | Yozuv o'chiriladi, qayta urinilmaydi |
| Bot bloklangan / "chat not found" xatosi (Telegram 403 yoki aniq 400) | Doimiy xato — yozuv o'chiriladi |
| Tarmoq/boshqa noaniq xato | Yozuv saqlanadi, ertaga qayta uriniladi |
| 7 kundan oshgan yozuv | Muvaffaqiyatidan qat'iy nazar tozalanadi, `Logger.warn` bilan |
| Yuborish jarayonida yangi voqea keladi | O'chirilmaydi — faqat shu ishlashda o'qilganlar o'chadi |
| Guruh digestida bitta kompaniyaning bir nechta chatidan biriga yuborish xato bersa | Boshqa chatlarga ta'sir qilmaydi; yozuv baribir o'chiriladi (qayta urinish yo'q — mavjud xatti-harakat) |
| Guruh digestida bo'lim bo'sh | Bo'lim butunlay ko'rsatilmaydi |
| Hech kimda voqea yo'q kun | Xabar umuman yuborilmaydi (shaxsiy ham, guruh ham) |
| Guruh digestida Yakshanba/bayram | Butun ishlash o'tkazib yuboriladi (mavjud xatti-harakat) |

## Testlash

Loyihaning odatiy uslubi (`server/CLAUDE.md` → Testing): har bir yangi
xizmat uchun `.spec.ts`, `PrismaService` model bo'yicha mock qilingan,
muvaffaqiyat va xato yo'llari alohida. Alohida e'tibor:

- `resolveChatId()` — faol/nofaol/o'chirilgan holatlar
- Navbat drain — faqat o'qilgan yozuvlar o'chirilishi, doimiy/vaqtinchalik
  xato holatida farqli xatti-harakat
- Render — dedup qoidasi, bo'sh bo'limning yashirinishi, balansning
  yuborish paytida qayta hisoblanishi
- Guruh cron — Yakshanba/bayram skip, `receivesAllBranches` bilan va
  bilansiz guruhlar, bitta chat xato bersa boshqasiga ta'sir qilmasligi

## Amalga oshirish ko'lami (keyingi bosqich uchun)

- 1 ta Prisma migratsiya (2 yangi enum + 1 yangi model)
- ~3-4 ta yangi fayl (`server/src/telegram-digest/`: navbat xizmati,
  resolver, render xizmati, shaxsiy cron)
- ~6 ta mavjud faylni o'zgartirish: `notification-events.listener.ts`
  (qisman — `payment-promise.overdue` tegilmaydi), `payment-events.listener.ts`,
  `sms-events.listener.ts`, `student-debt-notification.listener.ts`,
  `attendance-events.listener.ts`, `telegram-group-broadcast.listener.ts`,
  `telegram-group-digest-cron.service.ts`
- 2 ta faylni olib tashlash (`telegram-group-digest-buffer.service.ts`,
  va agar boshqa chaqiruvchisi qolmasa `TelegramGroupBroadcastService`)
- **Tegilmaydi**: `lesson-reschedule-events.listener.ts`,
  `lesson-cancellation-events.listener.ts`, `SmsService.sendToStudent`
- Loyiha qoidasiga ko'ra shu PR ichida ADR-0025 ham yoziladi
