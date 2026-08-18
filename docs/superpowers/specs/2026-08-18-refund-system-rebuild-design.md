# Pul qaytarish tizimini qayta qurish

**Sana:** 2026-08-18
**Holat:** Dizayn ma'qullangan (CEO: «darslarni bekor qilib qaytarish»)
**Oldingi hujjat:** `2026-08-18-refund-dialog-last-payment-design.md`

## Nima uchun

2026-08-18 da #10393 Ismatullo Qurbonboyevga 100 000 so'm qaytarildi. Shu bilan
birga tizim uning hisobiga **266 664 so'm mavjud bo'lmagan kredit** yozdi.
Tekshiruv shuni ko'rsatdiki, bu bir martalik xato emas: xuddi shu narsa
2026-07-03 da #10655 Omina Madraximovada ham bo'lgan (233 331 so'm, qo'lda
bekor qilingan, sabab tuzatilmagan).

**Prod ko'lami (2026-08-18):** 420 faol enrollmentdan **281 tasida** xato
takrorlanadi; agar hammasiga qaytarish ochilsa jami **54 876 717 so'm**
noto'g'ri kreditlanadi. Eng kattasi — #10221, 666 660 so'm.

## Ildiz sabab

Tizimda oldindan to'langan darsni balansga qaytarishning to'g'ri mexanizmi bor
— `EnrollmentBillingService.refundPrepaidToBalance`. Pul qaytarish moduli uni
ishlatmay, o'zining xato nusxasini yozgan:

```ts
// refunds-create.service.ts / refunds-eligibility.service.ts
const overDeducted = Math.max(0, ledgerConsumed - attendanceConsumed);
```

bunda `attendanceConsumed` faqat PRESENT/LATE darslarni sanaydi.

Ledgerdagi haqiqiy ayniyat esa bunday:

```
LESSON_DEDUCTION  ==  (barcha davomat qatorlari)  +  prepaidLessonsRemaining
```

Demak `overDeducted` hech qachon «ortiqcha yechilgan pul» emas — u har doim
**ABSENT darslar + oldindan to'langan darslar** yig'indisi. Ikkalasi ham
qaytarilmasligi kerak edi.

Va eng muhimi: `ADJUSTMENT` yoziladi, lekin `prepaidLessonsRemaining`
kamaymaydi — shuning uchun bitta pul ikki joyda turadi.

## Topilgan muammolar

| # | Muammo | Og'irlik |
|---|--------|----------|
| M1 | `overDeducted` = ABSENT + prepaid; kreditlanadi, lekin `prepaidLessonsRemaining` kamaymaydi → pul ikki marta sanaladi | Kritik |
| M2 | `overDeducted` qaytarishdan keyin ham o'zgarmaydi → har yangi qaytarish uni qaytadan kreditlaydi (#10393: limit 266 681 → 433 345) | Kritik |
| M3 | Qaytarilgan summadan qat'i nazar `overDeducted` **to'liq** kreditlanadi (100 000 qaytarildi → 266 664 kreditlandi) | Kritik |
| M4 | Tayyor `refundPrepaidToBalance` ishlatilmagan; xato nusxa yozilgan | Jiddiy |
| M5 | `reverse()` juft `ADJUSTMENT` ni bekor qilmaydi → fantom kredit qoladi | Jiddiy |
| M6 | `Math.round(course.price / lessonPaymentCount)` — chegirma, shartnoma narxi va sikl yaxlitlash qoldig'i e'tiborsiz; `perLessonPrice()`/`resolvePrepaidRefund()` bor | Jiddiy |
| M7 | ABSENT «foydalanilmagan» deb sanaladi; aslida ABSENT to'lanadi | Jiddiy |
| M8 | `previewRefund` istalgan enrollmentni qabul qiladi, `quickRefund` faqat ACTIVE ni → dialog ko'rsatgan guruhda «Qaytarish» 400 beradi | O'rta |
| M9 | «50% o'tilgan» maxraji `lessonPaymentCount` (sikl=12), kursning umumiy darslari emas — bazada bunday maydon umuman yo'q. #10393: 19/12 = 158% | O'rta |
| M10 | Serverda takroriy so'rov himoyasi yo'q — ikki marta bosilsa ikkita qaytarish | O'rta |
| M11 | `create()` oqimi hech qaysi ekranga ulanmagan, lekin API'da ochiq; `paidAmount` o'quvchi darajasida, `consumedAmount` enrollment darajasida → ko'p guruhli o'quvchida ortiqcha qaytarish | O'rta |

## Qaror (CEO)

**«Darslarni bekor qilib qaytarish».** O'quvchi guruhda qolsa ham, qaytarish
uchun kerak bo'lsa oldindan to'langan darslari **bekor qilinadi**: hisoblagich
kamayadi, puli balansga o'tadi, keyin naqd beriladi. Pul ikki marta sanalmaydi.
O'quvchi keyingi darslarga to'lovsiz qoladi — kelsa qarzdor bo'ladi, bu kutilgan
va to'g'ri holat.

## Yechim

### 1. Bitta manba: `EnrollmentBillingService`

Ikkita metod ochiladi (mavjud yopiq mantiqdan):

```ts
// narxlash — chegirma, shartnoma va sikl qoldig'ini hisobga oladi
prepaidRefundValue(tx, enrollmentId, course, lessons): Promise<number>

// N ta darsni bekor qilib, pulini balansga o'tkazish
releasePrepaidLessons(tx, {
  enrollmentId, lessons, reason?, performedById?, metadata?
}): Promise<{ refunded: number; lessons: number } | null>
```

`releasePrepaidLessons` `prepaidLessonsRemaining` ni **aynan `lessons` ga
kamaytiradi** (nolga tushirmaydi — bu uni muzlatishdagi
`refundPrepaidWithOverride` dan farqlaydi). Mavjud `refundPrepaidToBalance`
unga delegatsiya qiladi, ya'ni mantiq bitta joyda qoladi.

### 2. `previewRefund` qayta yoziladi

`ledgerConsumed`/`attendanceConsumed`/`overDeducted` olib tashlanadi. O'rniga:

```
prepaidLessons  = enrollment.prepaidLessonsRemaining
prepaidValue    = prepaidRefundValue(prepaidLessons)
maxRefundable   = max(0, balance + prepaidValue)
```

`lastPayment` (oldingi hujjatdan) o'z joyida qoladi.

### 3. `quickRefund` qayta yoziladi

```
if (amount > maxRefundable) → 400
shortfall = amount - balance
if (shortfall > 0):
    N = eng kichik son, prepaidRefundValue(N) >= shortfall
    releasePrepaidLessons({ lessons: N, metadata: { refundId } })
recordRefund(amount)
```

Dars donaligi tufayli kredit shortfall'dan sal ko'p chiqishi mumkin — bu
qoldiq balansda qoladi va **haqiqiy** pul, chunki dars bekor qilindi.

### 4. `reverse()` to'liq orqaga qaytaradi

`createAdjustment` ixtiyoriy `metadata` qabul qiladi; qaytarish yozgan
`ADJUSTMENT` ga `{ refundId, lessonsReleased }` yoziladi. `reverse()` shu
yozuvni topib bekor qiladi va `prepaidLessonsRemaining` ni `lessonsReleased`
ga qaytaradi.

### 5. Kichik tuzatishlar

- **M8:** `previewRefund` ham faqat ACTIVE enrollmentni qabul qiladi.
- **M9:** «50%» ogohlantirishi olib tashlanadi — to'g'ri maxraj mavjud emas,
  yolg'on foiz ko'rsatgandan ko'ra ko'rsatmagan yaxshi. O'rniga foydali
  ogohlantirish: oldindan to'langan darsi yo'q bo'lsa, faqat balansdan
  qaytarilishi aytiladi.
- **M10:** `quickRefund` Serializable tranzaksiya ichida oxirgi 60 soniyada
  shu enrollment uchun bir xil summali COMPLETED refund borligini tekshiradi.
- **M11:** `create()` + `POST /refunds` olib tashlanadi (UI ulanmagan).

### 6. Ma'lumot tuzatish

`#10393` dagi 266 664 lik `ADJUSTMENT` bekor qilinadi → balans −99 983,
pozitsiya 100 015. Bu to'g'ri holat: darslariga ajratilgan puldan 100 000 naqd
chiqqan.

## Nima o'zgarmaydi

- Naqd oqimi (`recordRefund` → `cashMovements.recordOutflow`) — tegilmaydi.
- Muzlatish/DROPPED oqimlari (`refundPrepaidToBalance`,
  `refundPrepaidWithOverride`) — tashqi xatti-harakati o'zgarmaydi.
- Dialogdagi «Oxirgi to'lov» qatori — o'z joyida qoladi.

## Tekshirish

Har bir tuzatishga birlik test. Ish tugagach prod bazasi qayta auditdan
o'tkaziladi: (a) fantom kredit qolmagani, (b) `overDeducted > 0` ko'rsatkichi
endi ma'nosini yo'qotgani, (c) #10393 pozitsiyasi 100 015.
