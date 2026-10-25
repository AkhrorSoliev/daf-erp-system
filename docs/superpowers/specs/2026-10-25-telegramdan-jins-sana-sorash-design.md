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
