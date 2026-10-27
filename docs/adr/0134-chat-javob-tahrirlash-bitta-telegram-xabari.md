# 0134. O'quvchilar chati: javob berish, 3 soatlik tahrirlash, bitta tahrirlanuvchi Telegram xabari

- Holati: Qabul qilindi
- Sana: 2026-10-27
- Bog'liq: [0129](0129-oquvchilar-chati-telegram-xabari-darhol.md) (3-bandni aniqlashtiradi), [0066](0066-telegram-uzilgan-oquvchi.md), `server/src/chat/`

## Kontekst

Test paytida uch narsa chiqdi: xabarga javob berib bo'lmaydi; yozilgan xabarni tuzatib bo'lmaydi; Telegramdan «yangi xabar» 20–30 marta kelgan. Oxirgisining sababi: suhbat ochiq turganda har kelgan xabar darrov «o'qildi» bo'ladi, shuning uchun ADR-0129 ning «o'qilgach yana mumkin» qoidasi har xabarga yangi bildirishnoma berardi.

## Qaror

1. **Javob.** `ChatMessage.replyToId` — shu suhbatning tirik xabari (boshqa suhbat yoki o'chirilgan xabarga 400). Javob kartasi (`replyTo`: kim, tur, qisqa matn ≤ 120 belgi, o'chirilgan-mi) o'qishda tuziladi, saqlanmaydi; o'chirilgan xabarning so'zlari boshqa odamning javobida ko'rinmaydi.
2. **Tahrirlash.** Faqat o'z MATNLI xabari, yuborilganiga 3 soatdan oshmagan (`EDIT_WINDOW_MS`), chatdan chiqarilgan o'quvchi tahrirlay olmaydi. `editedAt` har tahrirda yoziladi; `originalText` BIRINCHI matnni bir marta saqlaydi va shikoyat nusxasiga (`snapshot[].originalText`) tushadi — haqoratni yozib, so'ng tozalab qo'yib bo'lmaydi. Suhbatdosh `chat.edit` hodisasi bilan darhol ko'radi.
3. **Telegram: bir o'qilmagan davr — bitta xabar.** `ChatNotifyState.telegramMessageId` va `unreadCount`. Davr davom etsa xabar tahrirlanadi («N ta yangi xabar»), yangi ovoz chiqmaydi (tahrir jim; tungi tinch soatda ham). Davr tugagach (o'qilgach) eski xabar o'chiriladi va bitta yangisi yuboriladi, lekin: (a) oxirgi 2 daqiqada o'qigan odamga yuborilmaydi (u chatda), (b) oldingi bildirishnomadan 10 daqiqa o'tmagan bo'lsa eski xabar «1 ta xabar»ga qaytarib tahrirlanadi, yangisi yuborilmaydi. O'quvchi xabarni o'zi o'chirgan bo'lsa tahrir muvaffaqiyatsiz bo'ladi va yangisi yuboriladi. Telegram'da bildirishnomaga `telegramMessageId` yozilishidan oldingi eski qatorlar bitta xabar bo'lib qoladi.

## Ko'rib chiqilgan muqobillar

- Faqat tahrirlash, hech qachon yangi yubormaslik — o'quvchi uzoq vaqtdan keyingi yangi xabarni sezmay qolardi.
- Har safar o'chirib qayta yuborish — har safar jiringlaydi, muammo qoladi.
- Tahrir tarixini to'liq saqlash (har versiya) — CEO uchun birinchi matn yetarli; YAGNI.

## Oqibatlari

- Telegram'da bir davr uchun ko'pi bilan bitta xabar; ketma-ket suhbatda jiringlash 10 daqiqada bir martadan oshmaydi.
- Chat ochiq o'quvchi o'qigan zahoti ketsa va 2 daqiqa ichida xabar kelsa Telegram bildirishnomasi bo'lmaydi; qo'ng'iroqcha va push o'zgarmaydi.
- Har tahrir va har bildirishnoma tahriri bitta Telegram chaqiruvi; `SmsMessage` faqat yangi xabar uchun yoziladi.
