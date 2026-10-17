# ADR-0097 — Xodimning Telegrami: xabar yetib borishi sahifada ko'rinadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0066, ADR-0095, `docs/superpowers/plans/2026-10-17-telegram-hisobot-sahifa.md`, `server/src/telegram-report/`, `server/src/telegram/utils/student-chat-reach.ts`

## Kontekst

ADR-0095 sahifasi faqat «Telegram ulanganmi» ni ko'rsatardi. Xodim botni
bloklagan bo'lsa ham «ulangan» turardi va hisobot yetib bormasdi. CEO
(17.10.2026) xabar yetib borishini, oluvchilar ichida qidiruvni va qulayroq
sahifani so'radi.

## Qaror

1. `User.telegramDisconnectedAt` — o'quvchilardagi `Student.telegramDisconnectedAt`
   (ADR-0066) bilan bir xil qoida: bot xodim chatiga xabar yubora olmasa
   (bloklangan, hisob o'chirilgan) yoki Telegram `my_chat_member` orqali
   bloklanganini aytsa belgilanadi; xabar yetsa yoki blokdan chiqarsa
   o'chadi. Yozuvchi — o'sha `StudentChatReach` (xodim qatorlari ham, tarix
   qatori ham). Belgi yuborishni to'xtatmaydi. Chatni o'zgartiradigan ulash belgini o'chiradi: `staff-link.ts` har
   `User.telegramChatId` yozuvi bilan birga `telegramDisconnectedAt: null`
   yozadi (ham ulanayotgan hisobga, ham chat olib qo'yilayotgan hisobga);
   chat o'zgarmasa (`target.telegramChatId === chatId`) yozuv o'tkazib
   yuboriladi va belgi qoladi — botga yozish uchun xodim uni blokdan
   chiqargan bo'lishi kerak, bot blokdan chiqarishni o'zi eshitadi.
2. «Ulanishni tekshirish» — `sendChatAction('typing')`: xodimning chatida
   hech narsa ko'rinmaydi. `classifyTelegramError` doimiy deb bilgan har xato belgini qo'yadi (403
   «bloklagan»; 400 «chat not found», PEER_ID_INVALID, «user is deactivated»);
   boshqa xato belgini o'zgartirmaydi. Belgi shu yerning o'zida yoziladi
   (fon yozuvi sahifaning qayta yuklashiga yetib kelmasligi mumkin), shuning
   uchun bu yo'lda tarix qatori yozilmaydi.
3. Oluvchi qatorida oxirgi yuborish urinishi saqlanadi (`lastAttemptAt/Ok/Note`),
   `deliver()` ning o'zida: avtomatik yuborish ham, «Hozir yuborish» ham.
4. Holat to'rtta: `BLOCKED`, `UNLINKED`, `DELIVERED`, `LINKED` (tartib:
   ulanmagan → bloklangan → oxirgi urinish yetgan → ulangan, hali
   yuborilmagan). «Yetadi» faqat haqiqiy yetgan urinishdan keyin chiqadi.
5. «Bot ishlayaptimi» — `getMe()` javobi, 60 soniya keshlanadi.
6. «Namunani ko'rish» — oluvchining sozlamasi bilan hozirgi haqiqiy raqamlar,
   oddiy matn. Faqat CEO ko'radi (yangi yo'llarning hammasi `@CeoOnly()`).
7. Sahifa: qidiruv, filtr (Hammasi / Yetmaydi / O'chirilgan), tepada
   umumiy raqamlar, ixcham jadval va yon panel.

## Oqibatlari

- Bazaga to'rt ustun qo'shiladi (migratsiya `20261017120000_telegram_staff_reach`).
- Belgi «yetmaydi» desa ham yuborish urinishi davom etadi (ADR-0066); xodim
  blokdan chiqarsa, keyingi xabar yetadi va belgi o'zi o'chadi.
- Xodim botni hech qachon bloklamagan, lekin hisobi o'chirilgan bo'lsa,
  sabab oxirgi urinish izohida ko'rinadi.
- Sahifadagi «Yetmaydi» hisoblagichi o'chirilgan oluvchini ham sanaydi, agar
  uning chati yetmasa; qatorning yorlig'i esa «O'chirilgan» deydi. Qatordagi
  yorliq kuchliroq fakt, hisoblagich esa «kimning Telegrami muammoli» degan
  savolga javob beradi.
- Tekshiruv belgini o'zi yozadi (javob shu zahoti belgini aks ettirishi uchun),
  shuning uchun o'sha yozuv uchun tarix qatori qolmaydi. `StudentChatReach` ning
  fon yozuvchisi poygada yutsa, tarix qatorini o'zi yozadi.
