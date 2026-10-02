# ADR-0066 — Botni bloklagan o'quvchi «Telegram uzilgan» deb belgilanadi; botga qaytsa belgi o'zi olinadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** `server/src/telegram/utils/student-chat-reach.ts`, `server/src/telegram/telegram.service.ts`, `server/src/telegram/flows/statement-flow.ts` (`linkChat`), `server/src/telegram/flows/password-reset-flow.ts` (`linkChatIdToStudent`), `server/prisma/migrations/20260930120000_student_telegram_disconnected/migration.sql`, `client/src/components/students/student-contact-badges.tsx`, `client/src/components/students/sms-tab.tsx`, ADR-0025, ADR-0040

## Kontekst

O'quvchi kartasiga Telegram chat faqat bot orqali bog'lanadi
(`Student.telegramChatId`). Tizim uchun «bog'langan» degani «bot xabari
yetib boradi» degani edi: kartada «Telegram botda ro'yxatdan o'tgan»
yozilardi, bot o'quvchilariga yetadigan xabarlar soni ham shu ustundan
sanalardi.

O'quvchi botni bloklasa yoki Telegram hisobini o'chirsa, bog'lanish joyida
qoladi, lekin xabar yetmaydi. Telegram har yuborishga `403` qaytaradi. Kunlik
digest (ADR-0025) bunday qatorlarni tashlab yuboradi, SMS bo'limida esa
yetmagan xabar yuborilgandek ko'rinadi. Chat «bog'langan» bo'lib qolaveradi.

Prod, 30.09.2026: 1 007 ta bog'langan karta. Ulardan 52 tasiga oxirgi
xabar yetmagan: 32 tasi botni bloklagan, 20 tasi Telegram hisobini
o'chirgan. Guruhda o'qiyotgan faol o'quvchilardan (458) botga ulanmagani
29 ta, xabar yetmaydigani 20 ta. Ular «ulangan» deb sanalardi.

CEO topshirig'i: bloklaganlar tizimda uzilgan deb belgilansin, botni blokdan
chiqarib qayta ishlata boshlasa, yana ishlasin.

## Qaror

1. **Belgi — `Student.telegramDisconnectedAt`**: bot chatga yetolmay
   qolganini bilgan vaqt. `null` bo'lsa, chat xabar qabul qiladi.
   **Bog'lanishning o'zi o'chirilmaydi.** Telegram foydalanuvchisining chat
   ID'si blokdan keyin ham o'zgarmaydi, shuning uchun o'quvchi qaytganda
   qayta ro'yxatdan o'tishi kerak emas. Mini App kirishi va bot oqimlari ham
   chatni avvalgidek taniydi.
2. **Belgi chatga tegishli, bitta kartaga emas.** Ota-onaning bitta chati bir
   nechta farzandga bog'langan bo'lishi mumkin. Blok hammasini birdan uzadi,
   qaytish hammasini birdan ulaydi. Faqat o'chirilmagan kartalar yoziladi.
3. **Bot buni ikki yo'l bilan biladi:**
   - Telegram o'zi aytadi: shaxsiy chatdagi `my_chat_member` yangilanishi
     blokda `kicked`, blokdan chiqarilganda `member` bo'ladi. Bu turdagi
     yangilanish `ALLOWED_UPDATES` da allaqachon bor edi, faqat e'tiborsiz
     qolardi.
   - Yuborishning o'zi aytadi: botning API mijozi (`bot.telegram.callApi`)
     o'raladi. Natijada har yuborish, qaysi xizmatdan chiqmasin, o'z
     natijasini yozadi. `telegram-send.ts` dagi `classifyTelegramError`
     «doimiy» deb bilgan xato (403, «chat topilmadi», «hisob o'chirilgan»)
     chatni uzilgan deb belgilaydi. Yetib borgan xabar belgini oladi. Bot
     blokdan chiqarilganini sezmay qolsa ham, keyingi xabar yetishi bilan
     belgi olinadi.
4. **Chat qayta bog'lansa, belgi olinadi.** «💳 To'lovlar» yoki parol
   tiklashda o'z raqamini yuborgan odam hozir botga yozyapti, demak chat
   xabar qabul qiladi. Hisobini o'chirib yangisini ochgan o'quvchi ham shu
   yo'l bilan qaytadi.
5. **Uzilgan chatga yuborish to'xtatilmaydi.** Belgi xodim ko'radigan va
   sanaydigan holat, xolos. Yuborish davom etsa, blokdan chiqarilganlik o'z
   vaqtida sezilmay qolgan holda ham keyingi xabar belgini oladi.
6. **Har o'zgarish o'quvchi tarixida qoladi:** `TELEGRAM_UZILDI` (sabab
   bilan) va `TELEGRAM_QAYTA_ULANDI`, aktori — tizim.
7. **Eski holat migratsiyada tiklanadi.** Har bir chatning `SmsMessage`
   dagi oxirgi haqiqiy urinishi doimiy xato bilan tugagan bo'lsa, chat
   uzilgan deb belgilanadi. Prod'da bu 52 ta tirik karta. Urinish har bir
   kartaga alohida emas, chatga qarab olinadi: ota-onaning boshqa farzandiga
   keyinroq xabar yetgan bo'lsa, chat ishlaydi.

## Oqibatlar

- Kartada «Telegram botda ro'yxatdan o'tgan» o'rniga qizil «Telegram
  uzilgan» belgisi chiqadi, qaysi sanadan beri ekani ham ko'rinadi. SMS
  bo'limida ogohlantirish bor, lekin yuborish yopilmaydi.
- «Bot orqali nechta o'quvchiga yetamiz?» degan savolga bitta ustun javob
  beradi: `telegramChatId` bor va `telegramDisconnectedAt` yo'q.
- Blok vaqtida hech narsa yuborilmagan bo'lsa ham, bot bu haqda Telegram'dan
  darhol xabar oladi. Bu o'zgarishdan oldin bloklangan, lekin shundan beri
  xabar olmagan chat esa keyingi yuborishda aniqlanadi.
- Belgini yozish yuborishni sekinlashtirmaydi va uni buzmaydi: bazaga yozish
  kutilmaydi, xatosi faqat logga tushadi. Tranzaksiya ichidagi yuborish shu
  tranzaksiya ushlab turgan qatorni kutib qolmaydi.
- Xodimning chati (`User.telegramChatId`) bu qarorga kirmaydi. Xodim botni
  bloklasa, faqat shu chatga bog'langan o'quvchi kartalari belgilanadi.

## Ko'rib chiqilgan va rad etilgan

- **`telegramChatId` ni `null` qilish.** Eng kam kod bo'lardi: «bog'lanmagan»
  holatini hamma joy allaqachon tushunadi. Lekin chat ID yo'qolardi, blokdan
  chiqargan o'quvchi qayta ro'yxatdan o'tishi kerak bo'lardi. Mini App ham
  uni tanimay qolardi. CEO talabi — qaytsa, ishlashi kerak.
- **Uzilgan chatga yuborishni to'xtatish.** Keraksiz 403 lar kamayadi, lekin
  blokdan chiqarish haqidagi yangilanish yo'qolsa, o'quvchi hech qachon xabar
  olmay qoladi: qarz eslatmasi ham, to'lov cheki ham. Bir necha o'nlab
  qo'shimcha 403 buning oldida arzimaydi.
- **Har yuboruvchida alohida tekshiruv.** O'quvchiga xabar olti xil joydan
  ketadi (digest, SMS, dars bekor qilish/ko'chirish, avtomatik pauza,
  ko'chirma, mock). Har biriga qo'shilgan tekshiruv yangi yuboruvchi paydo
  bo'lganda esdan chiqadi. API mijozi esa hammasi o'tadigan yagona joy.
- **Bot tomonidan hamma chatni tekshirib chiqish (`sendChatAction` va
  hokazo).** Telegram'da jim tekshiruv yo'q: bu o'quvchilarga ko'rinadigan
  harakat bo'lardi.
