# ADR-0095 — Kunlik hisobot shaxsiy chatga: CEO oluvchi, filial va bo'limni belgilaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0025, ADR-0058, ADR-0059, ADR-0079, `docs/superpowers/specs/2026-10-16-telegram-shaxsiy-hisobot-design.md`, `server/src/telegram-report/`, `client/src/components/settings/telegram-report/`

## Kontekst

21:00 kunlik hisobot faqat Telegram guruhlarga borardi. CEO uni o'zi tanlagan
xodimlarga shaxsiy chatda, har biriga o'z filiallari, bo'limlari, ko'rinishi va
vaqti bilan yuborishni so'radi (16.10.2026).

## Qaror

1. Oluvchilar `TelegramReportRecipient` jadvalida (bir xodim — bir qator).
   Sahifa va olti yo'l faqat CEO'niki (`@CeoOnly()`, imkoniyat emas).
2. Filial ruxsati xodimning o'z filiali bilan cheklanmaydi: CEO istalgan
   filialni istalgan xodimga ochadi. «Barcha filiallar» keyin ochilganlarni
   ham qamraydi; yopilgan va arxivdagi filiallar berilmaydi.
3. Raqamlar faqat `TelegramGroupDailyReportService.collect()` dan — 21:00
   hisobotining o'zi. 4 ko'rinish (bo'lim bo'yicha, jadval, filial bo'yicha,
   faqat jami) shu ma'lumotdan yoziladi, yangi raqam hisoblamaydi. Guruh xabari
   o'zgarmaydi (snapshot test).
4. Vaqt — har oluvchiga o'zi, yarim soat qadam, 07:00–23:30. Har yarim soatda
   vaqti kelgan va bugun hisobot olmagan oluvchiga yuboriladi; `lastSentDate`
   yuborishdan oldin shartli yoziladi (ikki nusxa server ikki marta
   yubormaydi), vaqtinchalik xatoda qaytariladi. Yakshanba va butun markaz
   bayramida avtomatik yuborilmaydi; bitta filial bayrami to'xtatmaydi.
5. Bu ADR-0025 «darhol» ro'yxatiga qo'shimcha: hisobot 20:00 to'plamiga
   kirmaydi. U `sendTelegramText` orqali ketadi, shuning uchun
   `direct-send.guard.spec.ts` o'zgarmaydi.
6. Botda xodim menyusida «📊 Hisobot»; hisobot tagida filial, «Barchasi» va
   «Yangilash» tugmalari. Har bosishda chat egasi, faol qator va filial ruxsati
   qayta tekshiriladi — uzatilgan xabar boshqa filialni ochmaydi. Bosish
   yo'li cron bilan bir xil qoidani talab qiladi: xodim hisobi tirik bo'lishi
   kerak (`status` ACTIVE va `isActive` true) — faol oluvchi qatori va ruxsat
   berilgan filial bilan birga.
7. ▲/▼ faqat bitta filial yoki butun markaz uchun chiqadi: tanlangan filiallar
   to'plamining kechagi holati saqlanmaydi.

## Oqibatlari

- Moliyaviy raqamlar endi guruhdan tashqari shaxsiy chatga ham boradi; kim
  nimani ko'rishi faqat CEO qo'lida.
- Har oluvchi uchun filial soni + 1 marta `collect()` ishlaydi (bir vaqtdagi
  oluvchilar natijani bo'lishadi).
- Juda ko'p filialda jadval Telegram chegarasidan oshsa, xabar qator chegarasida
  kesiladi.
- Vaqtinchalik Telegram xatosida kunlik «band qilish» qaytariladi, shuning uchun
  xabar aslida yetib borgandan keyin kelgan vaqt tugashi (timeout) hisobotni
  ikki marta yuborishi mumkin (kamida bir marta yetkazish; qabul qilingan).
