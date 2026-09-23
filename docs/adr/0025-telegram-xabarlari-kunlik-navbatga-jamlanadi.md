# ADR-0025 — Ko'pchilik Telegram xabari kunlik yagona navbatga jamlanadi, darhol yubormaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-23
**Bog'liq:** `docs/superpowers/specs/2026-09-23-telegram-digest-batching-design.md`, `server/src/telegram-groups/`, `server/src/notifications/notification-events.listener.ts`

## Kontekst

Telegram jo'natish 5 ta mustaqil faylda nusxalangan holda yozilgan edi
(`notification-events.listener.ts`, `lesson-reschedule-events.listener.ts`,
`lesson-cancellation-events.listener.ts`, `attendance-events.listener.ts`,
`student-debt-notification.listener.ts`) — har biri o'zi chat ID topadi va
o'zi yuboradi. Filtrlash qoidalari orasida farq bor edi:
`attendance-events.listener.ts` `deletedAt + isActive + status` uchtasini
tekshiradi, `student-debt-notification.listener.ts` va
`SmsService.sendToStudent` esa hech birini — ya'ni o'chirilgan yoki
chetlatilgan o'quvchiga xabar ketishi mumkin edi.

Guruh digesti (`TelegramGroupDigestBufferService`) Redis'da, 26 soatlik
TTL bilan ishlaydi. Kuniga 5 marta (har 3 soatda) ishlaganda bu xavfsiz
edi. Kuniga 1 martaga tushirilganda, 2 kunlik bayramda butun bufer
o'zi o'chib ketadi — ma'lumot qaytarib bo'lmaydigan tarzda yo'qoladi.

Markaz kuniga o'nlab alohida Telegram xabari yuborardi: har bir to'lov,
guruhga qo'shilish, topshiriq, davomat yakuni — barchasi alohida push.
Bu CEO/menejerlar va o'quvchi/xodimlar uchun ortiqcha shovqin edi.

## Qaror

**Ko'pchilik Telegram xabari (o'quvchiga, xodimga, Telegram guruhiga)
darhol emas, kuniga bir marta — soat 20:00 (Asia/Tashkent) — bitta
yaxlit xabar bo'lib ketadi.** Bitta yangi `TelegramDigestItem` jadvali
va bitta umumiy `resolveChatId()` funksiyasi barcha eski nusxalangan
kodning o'rnini oladi.

**Taqiqlanadi:** yangi kodda `bot.telegram.sendMessage(...)`ni to'g'ridan
to'g'ri chaqirish — quyidagi ro'yxatdagi darhol-qoladigan holatlardan
tashqari, har qanday yangi Telegram xabari shu umumiy navbat orqali
o'tishi shart.

**Darhol qolganlar** (vaqtga bog'liq yoki alohida talab):
- Dars bekor qilinishi / ko'chirilishi
- Admin qo'lda yozgan xabar
- Mock imtihon xabarlari, ro'yxatdan o'tish, parol tiklash, OTP
- Bot buyruqlari/menyu javoblari, davomat eslatmalari (07:00–22:00 cron)
- 09:00 to'lov va'dasi xabari, 21:00 kunlik moliyaviy hisobot

**Yangi qoida:** kechqurungi navbatga yozuv **tayyor matn emas, strukturaviy
ma'lumot** (`payload: Json`) sifatida yoziladi. Matn faqat 20:00 da
render qilinganda tuziladi, balans esa shu paytda bazadan qayta o'qiladi
— ertalab yozilgan raqam kechqurunga eskirib qolmasin.

**Yuborish xatosi:** doimiy xato (bot bloklangan, chat topilmadi) — yozuv
o'chiriladi, qayta urinilmaydi. Vaqtinchalik xato (tarmoq) — yozuv
saqlanadi, ertaga qayta uriniladi. 7 kundan oshgan yozuv, muvaffaqiyatidan
qat'iy nazar, tozalanadi.

## Ko'rib chiqilgan muqobillar

**Har bir joyda alohida "hozircha yubormay, ro'yxatga yoz" qo'shish**
(mavjud 5 nusxani saqlab qolib). Tezroq yoziladi, lekin nusxalanishni
yanada ko'paytiradi va filtrlashdagi nomuvofiqlikni tuzatmaydi.

**Mavjud `Notification` jadvalini kengaytirish** (o'quvchi ustuni +
"Telegram yuborildimi" belgisi qo'shib). Bu jadval faqat xodimlar uchun
ilova ichidagi "qo'ng'iroq belgisi"ga xizmat qiladi; uni o'quvchilarga
ham tatbiq qilish, aslida yo'q bo'lgan narsa ("o'quvchi ilovasidagi
bildirishnoma paneli") uchun poydevor qo'yish bilan barobar bo'lardi.

**Guruh digestini Redisda qoldirish.** Kuniga 1 martaga tushganda 26
soatlik TTL ikki kunlik bayramda ma'lumotni butunlay yo'qotadi — bu
xavfni CEO ko'rmasdan qabul qilib bo'lmaydi.

**Barcha xabarlarni (jumladan dars bekor qilinishi/ko'chirilishini) ham
kechqurunga surish.** Ko'rib chiqilgan, lekin rad etilgan: o'quvchi bugun
14:00 da bekor qilingan 18:00dagi darsni 20:00 da bilib qolsa, bo'sh
darsga kelib qoladi. Faqat Telegram kanali bor o'quvchi uchun bu haqiqiy
xavf — ilova ichidagi bildirishnoma/push faqat xodimlarda mavjud.

## Oqibatlari

**Yutuq:** bitta joy, bitta filtr qoidasi — o'chirilgan/chetlatilgan
qabul qiluvchiga xabar ketishi mumkin bo'lgan mavjud xato
(`student-debt-notification.listener.ts`) beixtiyor tuzatiladi, shu bilan
birga bu xabar turi birinchi marta audit yozuvi (`SmsMessage`) oladi. Guruh
digestining Redis TTL xavfi yo'qoladi. Guruh cron'ining `receivesAllBranches`
qamrovi ham tuzatiladi. Bildirishnoma shovqini keskin kamayadi.

**Narx:** ≥5 mln so'mlik to'lov haqidagi guruh xabari, hozir darhol
ketayotgani, endi 20:00 gacha kutadi — CEO buni real vaqtda ko'rmaydi.
Yangi jadval (2 enum + 1 model), yangi migratsiya, ~3-4 ta yangi fayl,
~6 ta mavjud faylni o'zgartirish, 1-2 ta faylni olib tashlash.

**Qamrovdan tashqarida:** `SmsService.sendToStudent`da xuddi shunday
faol/o'chirilgan tekshiruvi yo'qligi — bu mavjud, alohida xato, shu qaror
uni tuzatmaydi.

**Endi taqiqlangan:** yangi Telegram-yuboradigan kod to'g'ridan-to'g'ri
`bot.telegram.sendMessage`ni chaqirmaydi — darhol-qoladigan ro'yxatdagi
holatlardan tashqari, har doim umumiy navbat orqali o'tadi.
