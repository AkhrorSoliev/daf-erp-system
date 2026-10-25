# Telegramdan jins va tug'ilgan sanani so'rash — dizayn

Holat: QORALAMA, CEO ko'rigi kutadi. Bog'liq: ADR-0039 (ilovaga birinchi kirish).

## Maqsad

Kartasida `gender` yoki `dateOfBirth` bo'sh faol o'quvchilarga Telegram bot orqali
xabar yuborib, shu ikki ma'lumotni yig'ish. Ilova eshigi (ADR-0039) o'zgarmaydi:
Telegram — yana bir yo'l, ikkinchisining o'rniga emas.

## Qamrov (bir martalik kampaniya)

Qamrov: `deletedAt: null`, `status: ACTIVE`, faol/pauzadagi
guruhda ACTIVE yozuv, `telegramChatId` bor, `telegramDisconnectedAt` yo'q va
`gender IS NULL OR dateOfBirth IS NULL`.

## Skript: `server/scripts/send-profile-request.ts`

Bosqichlar (har biri alohida buyruq, CEO ruxsatisiz keyingisiga o'tilmaydi):

1. **Sinov** (flagsiz): hech narsa yuborilmaydi; chatlar soni va namuna matn chiqadi.
2. **`--preview=<chatId>`**: matnlar faqat shu chatga (CEO'ning o'ziga) yuboriladi —
   har variant bittadan: (a) ikkalasi yo'q, (b) faqat jins yo'q, (c) faqat sana yo'q,
   (d) bir chatda ikki o'quvchi. Tugmalar `pf:p:*` — bosilsa **hech narsa yozilmaydi**,
   faqat keyingi qadam matni ko'rinadi. Bot javob matnlari (rahmat, xato, «allaqachon
   kiritilgan») ham shu yerda ketma-ket yuboriladi.
3. **`--apply --expect=<N>`**: CEO matnni tasdiqlagandan keyingina. Son farq qilsa
   yozishdan oldin to'xtaydi.

Qayta ishga tushirish xavfsiz: `SmsMessage`da shu matnli SENT yozuvi bor o'quvchi
o'tkazib yuboriladi. Bitta chatda bir necha o'quvchi bo'lsa — har biriga alohida
xabar (ismi bilan). Tezlik: ~20 xabar/s (`GAP_MS = 50`).

## Xabar matni (qoralama)

Tartib: salom → sabab → harakat → rahmat.

> Assalomu alaykum, {ism}!
>
> Kartangizda {jinsingiz va tug'ilgan sanangiz | jinsingiz | tug'ilgan sanangiz} yo'q.
> Shartnoma va ishtirok guvohnomasi kabi hujjatlar to'g'ri tuzilishi uchun kerak.
>
> Pastdagi tugmalar orqali kiriting — bir daqiqa. Rahmat!

Tugmalar (faqat yetishmaydigani uchun): `👦 O'g'il` `👧 Qiz` · `📅 Tug'ilgan sanani yozish`.

## Bot tomoni

- `callback_data`: `pf:g:<studentId>:M|F`, `pf:d:<studentId>`.
- **Egalik tekshiruvi**: `student.telegramChatId === String(ctx.chat.id)`; aks holda
  rad. Begona chat boshqa kartani o'zgartira olmaydi.
- Jins tugmasi → darrov yoziladi. Sana ham yo'q bo'lsa — sana so'raladi.
- Sana: kichik scene (`PROFILE_FILL`). Format `KK.OO.YYYY`; `YYYY-MM-DD` ga
  aylantirilib `birthDateProblem` tekshiradi (yosh 5–100, kelajak emas, 30-fevral
  emas). Xato bo'lsa sababi aytilib qayta so'raladi; `/bekor` yoki bekor tugmasi chiqaradi.
- Yozish: mavjud `StudentOnboardingService.updateProfile` — tekshiruv, tarix yozuvi
  va `User.gender` sinxroni shu yerda. Bo'sh bo'lmagan maydon qayta yozilmaydi;
  eski tugma bosilsa «Allaqachon kiritilgan».
- Telegram `ctx.from` ma'lumotidan jins/sana **taxmin qilinmaydi**.

## Test

- Sana tahlili: `15.03.2005`, `5.3.2005`, `31.02.2005`, `2030`, bo'sh, matn.
- Egalik: begona chat → yozilmaydi.
- Qamrov so'rovi: kim kiradi/kirmaydi (blok, o'chirilgan, guruhsiz).
- Skript matn quruvchisi: 3 variant + ko'p o'quvchi.

## Hujjat

ADR-0039 ga bitta qator qo'shiladi (Telegram — qo'shimcha yo'l). Yangi ADR yo'q.

## Qilinmaydi (YAGNI)

Avtomatik takror eslatma, yangi o'quvchini avtomatik so'rash, Mini App ichida forma.
Kampaniya natijasi yetmasa — keyin alohida qaror.

## 25.10 o'zgarishi: sana tugmalar bilan tanlanadi

**Nega.** Matn bilan yozilgan sana (`KK.OO.YYYY`) ko'pincha xato chiqadi: o'quvchilar
formatni to'g'ri yozmaydi. Scene va matn tahlili olib tashlandi, o'rniga tugmalar.

**5 ekran** (hammasi bitta xabarni joyida tahrirlaydi; har birida «Bekor qilish», 2–5-da «⬅️ Orqaga»):
1. `Tug'ilgan yilingizni tanlang:` — o'n yilliklar (`1980–1989`), yangisi birinchi, qatorda 2 ta.
   Yillar oralig'i: joriy Toshkent yili − 100 … − 5 (`MAX/MIN_STUDENT_AGE`).
2. `Yilni tanlang:` — shu o'n yillikdagi yillar, qatorda 5 ta.
3. `Oyni tanlang:` — 12 oy, qatorda 3 ta.
4. `Kunni tanlang:` — 1…N (kabisa yilini hisobga oladi), qatorda 7 ta.
5. `Tug'ilgan sana: 15-mart, 2005. To'g'rimi?` — «✅ Ha, saqlash» / «↩️ Qaytadan».

**Holatsiz.** Hamma holat `callback_data`da (≤ 64 bayt): `pf:d:<id>`, `pf:dd:<id>:<o'n yillik>`,
`pf:dy:<id>:<yil>`, `pf:dm:<id>:<yil>-<oy>`, `pf:dc:<id>:<sana>`, `pf:ds:<id>:<sana>`, `pf:x`.
Sessiya ham, scene ham yo'q. `studentId` foydalanuvchi qo'lida, shuning uchun egalik
tekshiruvi (id VA `telegramChatId`) HAR bir tugmada takrorlanadi, faqat saqlashda emas.
Sana qoidasi o'zgarmadi: `birthDateProblem`; yozuv — `fillStudentProfile`.

**Ko'rinish (preview).** O'quvchi raqami 0 — ko'rinish belgisi (haqiqiy raqamlar 10000 dan).
`pf:d:0` haqiqiy tanlagichni bazasiz ochadi, saqlash bosqichi hech narsa yozmaydi
(«Ko'rinish: hech narsa saqlanmadi»). 0 hech qachon `fillStudentProfile`ga yetmaydi.

**Matnlar.** Salom, so'ng sabab, so'ng yopuvchi jumla («Tugmani bosib kiriting. Rahmat!»,
ikkalasi yo'q bo'lsa «Tugmalarni …»). Takror yuborish kaliti: `bosib kiriting. Rahmat!`.
Tugma yorlig'i: «📅 Sanani kiritish».
