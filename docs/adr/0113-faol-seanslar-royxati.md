# ADR-0113 — Faol seanslar ro'yxati: har kirish bitta qator

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** ADR-0030 (to'ldiradi, almashtirmaydi)

## Kontekst

ADR-0030 da hisobda bitta raqam bor (`User.sessionVersion`): «Boshqa qurilmalardan chiqish» uni oshiradi va hamma eski token o'ladi. Tizim qaysi qurilmalar borligini bilmaydi, shuning uchun Telegramdagidek «faol seanslar» ro'yxatini ko'rsatib, bittasini alohida o'chirib bo'lmaydi.

## Qaror

1. **Yangi jadval `UserSession`:** `id` (uuid), `userId`, `sessionVersion`, `userAgent`, `ip`, `createdAt`, `lastUsedAt`. Har kirish (parol, Telegram OAuth, Mini App, o'quvchi ilovasi) bitta qator ochadi.
2. **Token `sid` ko'taradi** (qator id). `refresh` qatorni bazadan tekshiradi va `lastUsedAt` ni yangilaydi; qator yo'q bo'lsa «Sessiya tugagan». «Oxirgi faollik» = oxirgi refresh (eng ko'pi bilan 1 soat aniqlik).
3. **Bitta qurilmani o'chirish:** qator o'chadi, Redis'ga `user:session-revoked:<sid>` belgisi qo'yiladi (TTL = access token + 5 daqiqa). `JwtAuthGuard` belgini o'qiydi va access token'ni keyingi so'rovdayoq to'xtatadi. Belgi faqat haqiqiy o'chirishda yoziladi va `sid` qayta ishlatilmaydi, shuning uchun bazadan tasdiqlash kerak emas.
4. **Redis ishlamasa fail-open**, ADR-0030 bilan bir xil: so'rov o'tadi, `refresh` bazaga qarab to'xtatadi (eng ko'pi bilan access token'ning qolgan soati).
5. **`sessionVersion` o'z o'rnida qoladi.** Parol o'zgarsa hamma qurilma tugaydi. Ro'yxat faqat hisobning JORIY versiyasidagi qatorlarni ko'rsatadi, shuning uchun parol yozadigan yetti yo'lga tegilmaydi; eski qatorlar keyingi kirishda (`startSession`) o'chiriladi, shuningdek `lastUsedAt` refresh token muddatidan eski qatorlar ham.
6. **«Boshqa qurilmalardan chiqish»** ham qatorlarga ishlaydi: chaqirgan qurilmaning qatori qoladi (versiyasi yangilanadi), qolganlari o'chadi.
7. **Deploy hech kimni chiqarmaydi.** `sid`siz eski token birinchi refresh'da o'z qatorini oladi. Shu paytgacha u ro'yxatda ko'rinmaydi.
8. **Marshrutlar** (`@AnyUser`, faqat o'z hisobi, id token'dan): `GET /users/sessions`, `DELETE /users/sessions/:sid`. O'z qurilmasini shu yo'l bilan o'chirib bo'lmaydi (400): u «Chiqish» tugmasi bilan chiqadi.
9. **Tarix:** qurilma o'chirilsa ham, «boshqa qurilmalardan chiqish» ham hisobning tarixiga yoziladi (`kirishlar`).

## Qoldirilgan (ataylab)

- **Shahar / mamlakat yo'q.** IP bo'yicha joylashuv tashqi xizmat yoki baza talab qiladi. Hozir qurilma nomi (brauzer · tizim) va IP ko'rsatiladi. Keyin kerak bo'lsa, `ip` dan hisoblanadi, jadval o'zgarmaydi.
- **Qurilma nomi `User-Agent` dan**, kutubxonasiz (`describeDevice`). Noma'lum bo'lsa «Noma'lum qurilma». `x-forwarded-for` ni mijoz yozishi mumkin, shuning uchun IP faqat ko'rsatish uchun: hech qanday qaror unga tayanmaydi.
- **Cron yo'q.** Eski qatorlar yangi kirishda tozalanadi.
- **O'quvchi portali ro'yxati** hozir yo'q (qatorlar o'quvchi uchun ham yoziladi, ekran faqat xodim profilida).

## Oqibatlar

- Eski qatorlar `sessionVersion` orqali ro'yxatdan tushib qoladi, shuning uchun `User` ga tegadigan har yangi «sessiyani tugatish» yo'li `endSessionsWrite()` ni ishlatsa, ro'yxat o'zi to'g'ri bo'ladi.
- Yangi kirish yo'li (`AuthService.sessionFor` dan o'tmaydigan) qator ochmasa, qurilma ro'yxatda ko'rinmaydi, lekin ishlaydi.
