# ADR-0056 — Mock ro'yxati qayerdan kelgani (bot yoki admin) qatorning o'zida yoziladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** `server/prisma/schema.prisma` (`MockExamParticipant.registeredVia`, `MockRegistrationChannel`), migratsiya `20260930120000_mock_participant_registered_via`, `server/src/telegram/scenes/mock-exam-registration.scene.ts`, `server/src/mock-exams/mock-exam-participants.service.ts` (`addManual`), `server/src/mock-exams/mock-exam-stats.ts`

## Kontekst

CEO 30.09.2026 da mock imtihon statistikasini so'radi. Savollardan biri: nechta
odam bot orqali o'zi yozildi, nechtasini markaz adminlari qo'shdi. Ishtirokchi
qatorida bu fakt yozilmagan. Uni faqat uchta bilvosita belgidan taxmin qilish
mumkin edi:

1. **`telegramFirstName`.** Bot uni doim `ctx.from.first_name` dan yozadi.
   Admin shaklida bunday maydon yo'q.
2. **`EntityHistory` dagi CREATE yozuvi.** Admin qo'shganda uning
   `changedById` si bo'ladi, bot yozganda bo'lmaydi.
3. **`formData`.** Bot odamning javoblarini yozadi, admin esa `{}` qo'yadi.

Prod'da (30.09) 213 ta qatorning hammasida uchala belgi bir xil javob berdi:
102 tasi admin, 111 tasi bot. Lekin 111 ta bot qatoridan 50 tasining tarix
yozuvi yo'q, chunki bot tarix yozishni keyinroq boshlagan.

## Qaror

Qatorga `MockExamParticipant.registeredVia` ustuni qo'shiladi. Uning turi
`MockRegistrationChannel` enum (`BOT`, `ADMIN`). Ustun NOT NULL va standart
qiymatsiz.

Qiymatni ikkala yozuvchi o'zi qo'yadi: bot sahnasi `BOT`, `addManual` esa
`ADMIN` yozadi. Kelajakda uchinchi yo'l qo'shilsa (import, veb-forma), u
qiymatni aytmaguncha kompilyatsiyadan o'tmaydi.

Eski qatorlar migratsiyada shu tartibda to'ldiriladi:

1. Muallifi bor CREATE tarix yozuvi bo'lsa — `ADMIN`.
2. `telegramFirstName` bo'lsa — `BOT`.
3. Qolganlari — `ADMIN`.

Shundan keyin ustun NOT NULL qilinadi.

## Ko'rib chiqilgan muqobillar

- **Ustun qo'shmay, `telegramFirstName` bo'yicha taxmin qilish.** Bugun
  to'g'ri natija beradi. Lekin bu maydon Telegram ismini ko'rsatish uchun
  mo'ljallangan. Admin shakliga Telegram maydoni qo'shilsa yoki uchinchi
  ro'yxat yo'li paydo bo'lsa, statistika xato bermasdan noto'g'ri bo'lib
  qoladi.
- **`EntityHistory` dan o'qish.** 50 ta eski bot qatorining tarix yozuvi yo'q.
  Bundan tashqari, har bir statistika so'rovi tarix jadvalini ham o'qishi
  kerak bo'lardi.
- **Standart qiymatli (`@default(BOT)`) yoki bo'sh bo'la oladigan ustun.**
  Yangi yozuvchi qiymatni unutsa, qator jimgina `BOT` yoki noma'lum bo'lib
  qoladi. Qaror aynan shu xatoning oldini olish uchun qabul qilingan.

## Oqibatlari

- Statistika (`mock-exam-stats.ts`) ro'yxat manbasini faqat shu ustundan
  o'qiydi.
- Saytga chiqarishda eski kod yana taxminan bir daqiqa ishlab turadi. Shu
  oynada u `registeredVia` siz yozishga urinadi va NOT NULL cheklovi uni rad
  etadi. Odam «Xatolik» xabarini ko'radi va qayta urinadi. Shuning uchun
  o'zgarish ro'yxati ochiq imtihon yo'q paytda chiqariladi.
- Ustun ishtirokchini kim qo'shganini (admin ismini) saqlamaydi. Kerak bo'lsa,
  u `EntityHistory.changedById` da bor.
