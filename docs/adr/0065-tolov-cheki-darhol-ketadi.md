# ADR-0065 — To'lov cheki va to'lov bekor qilingani haqidagi xabar darhol ketadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-02
**Bog'liq:** ADR-0025 (shu ADR bilan ikki xabar «darhol» ro'yxatiga qo'shildi), `server/src/payments/payment-events.listener.ts`, `server/src/payments/payments-write.service.ts` (`announceCommitted`), `server/src/payment-gateways/payme/payme-methods.service.ts`, `server/src/payment-gateways/click/click-methods.service.ts`

## Kontekst

ADR-0025 bo'yicha 24.09.2026 dan o'quvchiga to'lov cheki darhol emas, 20:00
dagi kunlik xabar ichida boradi. 02.10 da o'quvchilar «to'lovdan keyin botdan
chek kelmayapti» deb shikoyat qildi. Prod bazada tekshirildi (24.09–02.10):

- kassada kiritilgan 112 ta to'lovning hammasiga chek borgan (Telegrami
  ulangan o'quvchilar);
- Payme/Click orqali qilingan 20 ta to'lovning birortasiga chek bormagan
  (4 153 317 so'm).

Online to'lovda `createFromExternal` Payme/Click ning tranzaksiyasi ichida
ishlaydi va chek signalini chaqiruvchiga qoldiradi: «tranzaksiyang tugagach,
o'zing yubor». Payme va Click buni hech qachon qilmagan. Shu sabab online
to'lovlar Telegram guruhlarining 20:00 xabariga ham tushmagan. Kech to'lov
ustozning oldingi oy haqini ochganda, ustozga borishi kerak bo'lgan xabar ham
ketmagan.

Ikkinchi muammo: 20:00 gacha kutish. To'lov qilgan odam «pul tushdimi?» deb
javob kutadi, ayniqsa online to'lovda. Chek — OTP kabi vaqtga bog'liq xabar.

## Qaror

1. **To'lov cheki va to'lov bekor qilingani haqidagi xabar darhol ketadi.**
   Bu kassadagi va online to'lovlarga birdek tegishli. `PaymentEventsListener`
   ularni `SmsService.sendToStudent` orqali yuboradi, shuning uchun
   `SmsMessage` yozuvi va profildagi «SMS» tabi avvalgidek ishlaydi. Ikkala
   xabar 20:00 dagi kunlik xabardan chiqariladi, shunda bitta chek ikki marta
   kelmaydi. Bu ikki xabar ADR-0025 dagi «darhol» ro'yxatiga qo'shiladi.
2. **Kim oladi:** o'chirilmagan har qanday o'quvchi (ADR-0025 dagi CEO qarori),
   Telegrami ulangan bo'lsa. Telegrami yo'q o'quvchiga hech narsa yozilmaydi,
   chunki 24.09 gacha ham shunday edi.
3. **Chek faqat to'lov bazaga yozilgandan keyin ketadi.** Payme/Click o'z
   tranzaksiyasini ochadi, shuning uchun `createFromExternal` ularga
   `committed` ni qaytaradi. Ular tranzaksiya tugagach
   `PaymentsService.announceCommitted(committed)` ni chaqiradi. Bu chek,
   guruh xabari va ustoz xabarini birga chiqaradi. Tranzaksiya qulasa, hech
   narsa ketmaydi. Kelajakda o'z tranzaksiyasini beradigan har bir yangi
   chaqiruvchi ham shunday qilishi shart.
4. **Qolganlari o'zgarmaydi:** qarz, guruhga qo'shilish, topshiriqlar va
   Telegram guruhlarining to'lovlar ro'yxati 20:00 da qoladi.

## Oqibatlar

**Yutildi:**

- O'quvchi chekni darhol oladi. Online to'lovga ham chek boradi.
- Guruhlarning 20:00 xabarida online to'lovlar ko'rinadi.
- Ustozga kech to'lov xabari ham boradi.

**Yo'qotildi / narx:**

- Kuniga ikki marta to'lov qilgan o'quvchi ikki xabar oladi, bitta yig'ma emas.
- Shu kuni boshqa xabari ham bo'lsa, 20:00 da yana bitta xabar oladi.
- Chek endi Telegram xatosida qayta urinilmaydi, 24.09 gacha ham urinilmagan.
  Xato `SmsMessage` ga `FAILED` bo'lib yoziladi va profilda ko'rinadi.

**Kuzatish kerak:**

- Deploydan oldin navbatga tushgan chek qatorlari (`PAYMENT_RECEIVED`,
  `PAYMENT_REVERSED`) 20:00 da avvalgidek yuboriladi. Ularni chiqaradigan kod
  shuning uchun qoldirildi. Navbat bo'shagach, u kodni olib tashlash mumkin.
- 24.09–02.10 dagi chek bormagan 20 ta online to'lovga chek bir martalik
  skript bilan alohida yuboriladi.
