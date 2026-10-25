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
2. **`--preview=<chatId>`**: so'rov xabari va botning javob matni faqat shu chatga (CEO'ning o'ziga)
   yuboriladi. Tugma (`pf:s:0`) haqiqiy savol-javobni ochadi, lekin **hech narsa yozilmaydi**
   va bazaga tegilmaydi.
3. **`--apply --expect=<N>`**: CEO matnni tasdiqlagandan keyingina. Son farq qilsa
   yozishdan oldin to'xtaydi.

Qayta ishga tushirish xavfsiz: `SmsMessage`da shu matnli SENT yozuvi bor o'quvchi
o'tkazib yuboriladi. Bitta chatda bir necha o'quvchi bo'lsa — har biriga alohida
xabar (ismi bilan). Tezlik: ~20 xabar/s (`GAP_MS = 50`).

## Xabar matni va savol-javob (25.10 (2): bitta xabar va bitta tugma)

Hamma o'quvchiga BITTA matn, qaysi maydon yetishmasligi aytilmaydi (hujjat so'zlari yo'q):

> Assalomu alaykum, {ism}! 😊
>
> Markazimizda siz haqingizda ba'zi ma'lumotlar yetishmayapti. Ular bizning statistikamiz uchun kerak edi, o'quvchilarimizni yaxshiroq tushunishga yordam beradi.
>
> Pastdagi tugmani bosing, bir necha soniya vaqtingizni oladi. Rahmat! 🙏

Bitta tugma: `📝 Ma'lumotlarni kiritish` (`pf:s:<id>`). Takror yuborish kaliti: `Pastdagi tugmani bosing`.

Tugma bosilgach xuddi shu xabar joyida tahrirlanadi (scene ham, sessiya ham yo'q; holat `callback_data`da, ≤ 64 bayt):
1. **Jins** (faqat kartada jinsi yo'q bo'lsa): `Jinsingizni tanlang:` — `👨 Erkak` / `👩 Ayol` (`pf:g:<id>:M|F`).
2. **Yil** (o'n yilliklar) → **oy** → **kun** (faqat sanasi yo'q bo'lsa): `pf:dd|dy|dm:<id>:<g>:…`, `g` ∈ M/F/N
   (N = jins so'ralmaydi). Yillar: joriy Toshkent yili − 100 … − 5. Har ekranda «⬅️ Orqaga» va «Bekor qilish».
3. **Tekshirish**: «Tekshirib ko'ring: Jins: … / Tug'ilgan sana: … / Hammasi to'g'rimi?» — `✅ Ha, saqlash` (`pf:ds:<id>:<g>:<sana|->`) / `↩️ Qaytadan`.
4. **Saqlash**: hammasi shu yerda, `fillStudentProfile`ning bitta chaqiruvi bilan; faqat kartada hali bo'sh maydonlar yoziladi,
   oraliqda to'ldirilgani o'tkazib yuboriladi. So'ng «✅ Rahmat! Ma'lumotingiz saqlandi.» (tugmasiz).
- «Bekor qilish» (`pf:x:<id>`) xabarni asl so'rov matni va yagona tugmasiga qaytaradi.
- Egalik (karta shu chatga bog'langanmi) HAR bir tugmada tekshiriladi; begona chat — «Bu tugma sizning hisobingizga tegishli emas».
- Ko'rinish (preview): `<id>` = 0, bazaga hech qachon tegilmaydi, oxirgi saqlash faqat «hech narsa saqlanmadi» deydi.
- Qolgan qoidalar o'zgarmadi: sana `birthDateProblem`dan, yozuv `fillStudentProfile`dan; Telegram `ctx.from` ma'lumotidan jins/sana taxmin qilinmaydi.

## Test

- Tugma yo'llari: jins+sana, faqat jins, faqat sana; oraliqda to'ldirilgan maydon; qoida xatosi; bekor qilish.
- Egalik: begona chat → yozilmaydi.
- Qamrov so'rovi: kim kiradi/kirmaydi (blok, o'chirilgan, guruhsiz).
- Skript matn quruvchisi: bitta matn + ko'p o'quvchi.

## Hujjat

ADR-0039 ga bitta qator qo'shiladi (Telegram — qo'shimcha yo'l). Yangi ADR yo'q.

## Qilinmaydi (YAGNI)

Avtomatik takror eslatma, yangi o'quvchini avtomatik so'rash, Mini App ichida forma.
Kampaniya natijasi yetmasa — keyin alohida qaror.
