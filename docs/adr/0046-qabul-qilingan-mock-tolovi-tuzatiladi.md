# ADR-0046 — Admin qabul qilgan mock to'lovi tuzatiladi va bekor qilinadi; onlayn va balans to'lovi — yo'q

**Holati:** Qabul qilindi
**Sana:** 2026-09-28
**Bog'liq:** `server/src/mock-exams/mock-payment-source.ts`, `server/src/mock-exams/mock-exam-participants.service.ts` (`updatePayment`, `cancelPayment`), `server/src/mock-exams/mock-exam-gateway-billing.service.ts`, migratsiya `20260928120000_mock_payment_details`, `client/src/components/mock-exams/edit-payment-dialog.tsx`

## Kontekst

«To'lov qabul qilish» (`markPaid`) ishtirokchini `paid = true` qilardi, to'lov
turi va izoh esa faqat tarix yozuviga berilardi. Tarix servisi
(`computeChangedFields`) faqat eski qiymatlarda ham bor kalitlarni saqlaydi,
`oldValues` esa `{ paid: false }` edi — tur va izoh **hech qachon
saqlanmagan**. Payme/Click yo'li (`markCompleted`) provayder va tranzaksiya
id sini xuddi shunday yo'qotgan.

Qabul qilingan to'lovni tahrirlash yo'li yo'q edi. Xato bosilgan to'lovni
(boshqa odam, boshqa tur) tuzatishning yagona yo'li — ishtirokchini «pul
qaytarildi» tasdig'i bilan o'chirish edi: u ro'yxatni, Telegram bog'lanishini
va natijani ham olib ketardi, odam qayta yozilishi kerak bo'lardi.

Mock puli uch joyda bo'ladi: kassada (admin qabul qilgan), Payme/Click'da
(onlayn to'lov) va o'quvchi balansida (2026-08 gacha eski yechim,
`MOCK_EXAM_FEE`). Faqat birinchisi admin qo'lida.

## Qaror

1. To'lov turi, izoh va qo'lda qabul qilgan xodim qatorning o'zida turadi:
   `MockExamParticipant.paymentMethod`, `paymentNote`, `paidById`. `paid` ni
   qo'yadigan ikki yo'l (`markPaid`, `markCompleted`) ularni yozadi, `paid` ni
   tushiradigan yo'llar (bekor qilish, Payme/Click qaytarishi) tozalaydi.
2. To'lov manbai pul yozuvlaridan aniqlanadi (`mockPaymentSource`):
   yakunlangan shlyuz tranzaksiyasi — `GATEWAY`, qaytarilmagan
   `MOCK_EXAM_FEE` — `BALANCE`, qolgani — `MANUAL`.
3. Faqat `MANUAL` to'lov o'zgaradi:
   - `PATCH /mock-exam-participants/:id/payment` — tur va izoh. Summa
     o'zgarmaydi, shuning uchun sabab so'ralmaydi (dars to'lovining faqat
     usulini tuzatish kabi).
   - `POST /mock-exam-participants/:id/cancel-payment` — sabab majburiy.
     Ishtirokchi o'chmaydi: yana «to'lanmagan» bo'ladi va mock daromadidan
     chiqadi.

   Ikkalasi shartli yozadi (`paid: true` va o'qilgan `paidAt`), rollari
   `markPaid` niki bilan bir xil.

**Taqiqlanadi:** onlayn yoki balans to'lovini panel orqali o'zgartirish yoki
bekor qilish. Pul o'z joyida qolardi (Payme/Click'da yoki balansdan
yechilgancha), ro'yxat esa «to'lanmagan» bo'lib, odamdan pul yana so'ralardi.
Onlayn to'lovni to'lov tizimi qaytaradi (uning bekor qilishi ishtirokchini
o'zi «to'lanmagan» qiladi), balans to'lovi ishtirokchi o'chirilganda balansga
o'zi qaytadi.

## Ko'rib chiqilgan muqobillar

- **Turni tarixdan o'qish.** Tarixda u yo'q edi (yuqoridagi diff).
- **Manbani `paidById` dan aniqlash.** Migratsiyagacha qo'lda qabul qilingan
  to'lovning tarix yozuvi bo'lmasa `paidById` bo'sh qoladi va u abadiy
  tuzatib bo'lmaydigan bo'lardi. `paidById` — faqat «kim qabul qildi».
- **Summani ham tahrirlash.** Bitta ro'yxat — bitta to'lov, `feeAmount`
  ro'yxatdan o'tishda qotiriladi; qisman to'lov modeli yo'q.
- **Bekor qilinganda Telegram xabari.** Qo'shilmadi: pul haqidagi avtomatik
  «to'lovingiz bekor qilindi» xabari admin odam bilan gaplashmasdan ketardi.
- **Eski qatorlarga turni taxmin qilish («Naqd»).** Qilinmadi: noma'lum
  qoladi, admin tahrirlash oynasida belgilaydi.

## Oqibatlari

**Yutuq:** xato qabul qilingan to'lov ishtirokchini o'chirmasdan tuzatiladi;
tanlangan tur va izoh endi yo'qolmaydi; jadvalda to'lov qanday o'tgani
ko'rinadi.

**Narx:** ro'yxat har ochilganda to'langan qatorlar uchun shlyuz
tranzaksiyalari bitta qo'shimcha so'rov bilan tekshiriladi. Migratsiyagacha
qo'lda qabul qilingan to'lovlarning turi noma'lum: shlyuz to'lovlariniki
tranzaksiyadan, qabul qilgan xodim tarixdan tiklandi, qo'lda tanlangan tur
esa hech qayerda yo'q edi.

**Endi taqiqlangan:** yuqoridagi taqiq.
