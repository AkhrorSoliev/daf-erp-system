# Pulni qaytarish dialogida «Oxirgi to'lov»

**Sana:** 2026-08-18
**Holat:** Dizayn ma'qullangan

## Muammo

«Pulni qaytarish» dialogi o'quvchining **jami to'lagan** summasini ko'rsatadi
(`paidAmount` — barcha COMPLETED to'lovlar yig'indisi), lekin **oxirgi to'lovi**
haqida hech narsa ko'rsatmaydi.

Operator pulni oxirgi to'lovdan qaytaradi — masalan #10393 Ismatullo
Qurbonboyev uchun 100 000 so'm. Buni to'g'ri qilish uchun oxirgi to'lov qancha
bo'lgani va qaysi usulda kelgani ko'rinib turishi kerak. Hozir buning uchun
dialogni yopib, o'quvchi profilidagi to'lovlar jadvaliga o'tish kerak.

## Yechim

Preview javobiga oxirgi to'lov qo'shiladi, dialogda bir qator sifatida
ko'rsatiladi va qaytarish usuli o'sha to'lov usuliga oldindan qo'yiladi.

### Server

`RefundsEligibilityService.previewRefund` (`server/src/refunds/refunds-eligibility.service.ts`)

Mavjud `payment.aggregate` yoniga bitta so'rov qo'shiladi — **aynan o'sha
filtr** bilan:

```ts
const lastPaymentRow = await this.prisma.payment.findFirst({
  where: { studentId, companyId, status: PaymentStatus.COMPLETED },
  orderBy: { createdAt: 'desc' },
  select: { amount: true, method: true, createdAt: true },
});
```

Qaytariladigan yangi maydon:

```ts
lastPayment: { amount: number; method: PaymentMethod; paidAt: Date } | null
```

Filtr `paidAmount` bilan bir xil bo'lgani muhim: «To'langan» va «Oxirgi to'lov»
bitta to'plamdan keladi, shuning uchun ular hech qachon bir-biriga zid
ko'rinmaydi. Barcha `revenueType` lar kiradi (o'quv puli, mock imtihon va h.k.)
— xuddi `paidAmount` kabi.

Boshqa qaytariladigan maydonlar o'zgarmaydi.

### Client

`RefundDialog` (`client/src/components/payments/refund-dialog.tsx`)

1. `RefundPreview` interfeysiga `lastPayment` maydoni qo'shiladi.
2. «To'langan» qatoridan keyin yangi qator:

   ```
   To'langan:        1 500 000 so'm
   Oxirgi to'lov:      500 000 so'm
                  12.08.2026 · Naqd
   ```

   `lastPayment === null` bo'lsa qator umuman chizilmaydi — bu dialogdagi
   mavjud uslub (`overDeducted`, `previousRefunds` qatorlari ham shunday).
3. Preview yuklangach `setRefundMethod(lastPayment.method)` — pul qanday kelgan
   bo'lsa, o'sha usul oldindan tanlanadi. Operator uni o'zgartira oladi; dialog
   yopilganda `resetForm` yana `CASH` ga qaytaradi.
4. Sana `date-fns` `format(new Date(paidAt), "dd.MM.yyyy")` bilan — payments
   bo'limidagi mavjud uslub.

`PaymentMethod` enum qiymatlari (CASH, PAYME, CLICK, UZUM, TRANSFER) dialogdagi
`refundMethods` ro'yxatiga 1:1 mos, shuning uchun moslashtirish jadvali kerak
emas.

## Nima o'zgarmaydi

- `maxRefundable` va `suggestedAmount` hisobi — o'sha-o'sha.
- Pul qaytarish mantig'i (`/refunds/quick`) — tegilmaydi.
- Oxirgi to'lov **chegara emas**: operator undan katta yoki kichik summa
  kiritishi mumkin, chegara avvalgidek `maxRefundable`.

## Testlar

`server/src/refunds/refunds-eligibility.service.spec.ts`:

- to'lov mavjud bo'lganda `lastPayment` summa, usul va sana bilan qaytadi;
- to'lov yo'q bo'lganda `lastPayment` `null` bo'ladi.
