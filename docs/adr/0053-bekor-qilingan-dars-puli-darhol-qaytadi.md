# ADR-0053 — Bekor qilingan darsning puli oylik to'lovchilarga darhol qaytadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-29
**Bog'liq:** `server/src/billing/cancelled-lesson-release.ts`, `server/src/billing/departure-release.ts` (`cancelledLessonRelease`), `server/src/billing/monthly-charge.service.ts` (`releaseCancelledLesson`, `restoreChargeForReturn`), `server/src/lesson-cancellations/lesson-cancellations.service.ts`, ADR-0042, ADR-0044

## Kontekst

Oylik to'lov modelida oyning hisobi o'sha oyning barcha dars kunlari uchun
oldindan yoziladi (`coveredDates`). Dars bekor qilinganda (`POST
/lesson-cancellations`) pul faqat shu kuni davomati belgilangan o'quvchilarga
tegardi. Ularning davomati EXCUSED ga o'tardi va `excusedLessons` **keyingi
oy** hisobidan bitta darsni chegirib berardi.

Bundan ikki muammo chiqdi:

1. **Davomati belgilanmagan o'quvchiga hech narsa qaytmasdi.** Markaz umuman
   o'tkazmagan darsda odatda hech kim belgilanmaydi. Bir guruhda sentabrda
   ikki kun dars bo'lmagan: davomat ham, bekor qilish ham, ko'chirish ham
   yozilmagan. Shunga qaramay guruhdagi 4 ta o'quvchi bu ikki dars uchun jami
   300 000 so'm to'lagan. Ulardan biri shu sababli qarzdor bo'lib ko'rindi,
   aslida esa unda ortiqcha pul bor edi.
2. **Keyingi oy krediti guruhdan chiqqan o'quvchiga yetmaydi.** Kredit
   yozilishning keyingi oy hisobidan chegiriladi. Boshqa guruhga o'tgan yoki
   ketgan o'quvchida bu yozilishning keyingi oyi yo'q, shuning uchun kredit
   hech qachon qo'llanmasdi.

Prod'da (29.09.2026) shunday "izsiz" dars kuni — oylik hisob qamragan, lekin
guruhda davomat, bekor qilish yoki ko'chirish yozuvi yo'q o'tgan kun — ikkala
filialda 19 ta topildi: 148 o'quvchi-dars, ≈5,18 mln so'm.

## Qaror

1. Dars bekor qilinganda, o'sha kunni qamragan **har bir** oylik hisob (CHARGED)
   o'sha tranzaksiyaning ichida kunni qaytaradi. Davomat belgilangan-
   belgilanmaganidan qat'i nazar:
   - bir darsning puli ketish qoidasi bilan hisoblanadi: chegirmali dars narxi,
     hisobda qolgan summadan oshmaydi (`cancelledLessonRelease`);
   - pul balansga `ADJUSTMENT` bilan darhol qaytadi. U `monthly-release` deb
     belgilanadi (`dates`, `cancellationId`), shuning uchun ko'chirma uni
     oyning darslari ichida ko'rsatadi;
   - kun `frozenOutDates` ga qo'shiladi, ya'ni hisob endi bu kunni
     qoplamaydi. Tushum va ustoz haqi shu ro'yxatga qaraydi.
2. Shu kuni davomati EXCUSED bo'lgan o'quvchida (bekor qilish uni hozir
   o'zgartirgan yoki u oldindan uzrli bo'lgan) `excusedLessons` bittaga
   kamaytiriladi. Pul hozir qaytdi, keyingi oy krediti ikkinchi marta
   berilmaydi.
3. Muzlatishdan qaytish (`restoreChargeForReturn`) bekor qilingan kunni
   qayta hisoblamaydi.
4. Takroriy chaqiruv hech narsa qilmaydi: kun `frozenOutDates` da bo'lsa, pul
   qaytmaydi.
5. Bekor qilishni o'chirish avvalgidek to'lovni avtomatik tiklamaydi. Dars
   aslida o'tgan bo'lsa, admin davomatni qo'lda oladi.

## Oqibatlar

- Markaz o'tkazmagan dars uchun admin darsni **bekor qilishi** yetarli:
  guruhdagi barcha oylik to'lovchilar pulni darhol oladi, ustoz esa haq
  olmaydi, chunki dars bo'lmagan.
- Davomati belgilangan o'quvchilar uchun ham pul keyingi oyga suriladigan
  kredit emas, darhol qaytadigan pulga aylandi. Bu ularga ham adolatli, va
  guruhdan chiqqan o'quvchi krediti yo'qolmaydi.
- Izsiz kunlarni tozalash — har bir kun uchun ikki yo'ldan biri: dars
  o'tgan bo'lsa davomatni belgilash, o'tmagan bo'lsa bekor qilish. Qaysi
  biri to'g'ri ekanini faqat filial biladi.

## Ko'rib chiqilgan va rad etilgan

- **Hammaga keyingi oy krediti (`excusedLessons`)** — guruhdan chiqqan
  o'quvchiga hech qachon yetmaydi, qarz esa shu oyda ko'rinib turaveradi.
- **Izsiz kunlarni tizim o'zi bekor qilsin** — kun dars o'tmagani uchun
  izsiz bo'lishi mumkin, lekin davomat shunchaki unutilgan bo'lishi ham
  mumkin. Pulni qaytarish-qaytarmaslikni tizim taxmin qilmaydi.
