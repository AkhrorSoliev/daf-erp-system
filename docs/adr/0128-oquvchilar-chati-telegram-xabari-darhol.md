# 0128. O'quvchilar chati: «yangi xabar» Telegram xabari darhol yuboriladi

- Holati: Qabul qilindi
- Sana: 2026-10-26
- Bog'liq: [0025](0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md), [0066](0066-telegram-uzilgan-oquvchi.md), `docs/superpowers/specs/2026-10-25-oquvchilar-chati-design.md`, `server/src/chat/notify/`

## Kontekst

ADR-0025 shaxsiy Telegram xabarlarini 20:00 dagi bitta xabarga jamlaydi. O'quvchilar chati uchun bu mantiqsiz: «yangi xabar» kechgacha kutsa, suhbat o'ladi. CEO talabi: xabar kelsa darhol, tugma bilan Mini App'da chatni ochsin.

## Qaror

1. «Yangi xabar» Telegram xabari ADR-0025 ning «darhol yuboriladigan» ro'yxatiga qo'shiladi; `SmsService.sendToStudent` orqali ketadi (yangi `.sendMessage(` yo'q).
2. Mazmun Telegramga chiqmaydi — faqat kim yozgani.
3. Bir suhbatdan o'qilmaguncha bitta xabar (`ChatNotifyState.notifiedAt`; o'qilgach yana mumkin).
4. 22:00–08:00 oralig'ida yuborilmaydi, 08:00 da bir marta (`ChatNotifyService.sendMorning`) — faqat hali o'qilmagan bo'lsa.
5. Uzilgan chat (`Student.telegramDisconnectedAt`, ADR-0066) o'tkazib YUBORILADI (ADR-0117 misoli): bu xabar ADR-0066 dagi «baribir yubor» darajasida muhim emas, aks holda har bloklagan o'quvchi har o'qilmagan sikl uchun FAILED `SmsMessage` va tarix qatorini to'plar edi. Qo'ng'iroqcha va push o'zgarmaydi.
6. Tugma `web_app`: `TELEGRAM_MINI_APP_URL?next=/portal/chat/<id>`. `TELEGRAM_MINI_APP_URL` o'rnatilmagan yoki noto'g'ri bo'lsa xabar tugmasiz ketadi.
7. 08:00 yurishi bir yurishda ko'pi bilan 500 ta ushlab turilgan qatorni oladi; yuborishdan oldin qabul qiluvchini (o'chirilmagan, chat bor, uzilmagan) va `chat.enabled` kalitini qayta tekshiradi, bo'lmasa kutishni tozalaydi.

## Ko'rib chiqilgan muqobillar

- 20:00 jamlanmasi — chat o'ladi, rad etildi.
- Har xabarga Telegram — spam, rad etildi.
- Mazmunni ko'rsatish — maxfiylik, rad etildi.

## Oqibatlari

- Har bildirishnoma bitta `SmsMessage` va Student tarixi qatorini yozadi.
- Xabar Telegram 403 javob bersa ham «yuborilgan» deb belgilanadi (`SmsService` istisno otmay FAILED yozadi); uzilgan chatni o'tkazib yuborish buni kam uchraydigan qiladi.
- Bir lahzada kelgan ikki xabar ikkita Telegram xabar berishi mumkin (poyga qabul qilingan).
