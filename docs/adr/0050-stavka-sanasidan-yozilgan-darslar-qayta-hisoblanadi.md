# ADR-0050 — Stavka o'z sanasidan beri yozilgan, oyligi hisoblanmagan darslarga ham qo'llanadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-29
**Bog'liq:** `server/src/salary/shared/rate-reapply.ts`, `server/src/salary/shared/rate-write-tx.ts`, `server/src/salary/salary-config.service.ts` (`createConfig`, `previewConfig`, `updateConfig`, `applyGlobalConfig`), `POST /salary/config/preview`, `server/src/salary/salary-accrual.service.ts` (`applyAccrualToBalance`, `reverseAccrualBalance`), `client/src/components/payments/salary-config-row-sheet.tsx`, `salary-config-reapply-dialog.tsx`

## Kontekst

Stavkaning har bir versiyasi `effectiveFrom` sanasidan kuchga kiradi va dars
haqi (`SalaryAccrual`) dars sanasidagi versiya bo'yicha yoziladi. Lekin haq
dars belgilangan PAYTDA yoziladi. Stavka keyin, o'tgan sana bilan saqlansa,
yangi versiya faqat bundan keyin belgilanadigan darslarga yetardi — o'sha
sanadan beri allaqachon yozilgan darslar eski stavkada qolardi va oy shu bilan
yopilardi.

Prod misoli (29.09.2026): Intensive kursidagi guruh 24.09 da ochilgan, ustozning
umumiy stavkasi o'quvchi boshiga 200 000. Aslida bu guruh uchun
345 000 bo'lishi kerak edi. 24–29.09 da 24 ta dars haqi yozilgan: har biri
9 524 (200 000 / 21), jami 228 576. To'g'risi 16 429 (345 000 / 21), jami
394 296. Stavkani 24.09 dan to'g'rilash tizimda mumkin edi, lekin bu 24 ta
darsga tegmasdi — farq (165 720 so'm) faqat qo'lda, kod bilan tuzatilardi.

## Qaror

1. **Stavka saqlanganda, shu tranzaksiyaning o'zida** `effectiveFrom`
   kunidan beri yozilgan va hali oyligi hisoblanmagan (`salaryPaymentId`
   bo'sh) har bir dars haqi qayta narxlanadi: dars sanasida kuchda bo'lgan
   versiya — avval guruhning o'z stavkasi, keyin ustozning umumiy stavkasi,
   `findActiveVersion` bilan aynan bir xil tanlov. Shunday qilib yangi guruh
   stavkasi, yangi umumiy stavka va o'chirilgan guruh stavkasi (darslar umumiy
   stavkaga qaytadi) bitta yo'ldan o'tadi. Summasi o'zgarmaydigan darsga
   tegilmaydi.
2. **Bo'luvchi yagona manbadan.** Foiz — dars haqi yozilganda muzlatilgan
   `perLessonCost` dan. O'quvchi boshiga summa — `resolveLessonPricing`
   bo'luvchisidan (12 talik kursda `lessonPaymentCount`, oylik kursda o'sha
   oyning muzlatilgan `plannedLessons`i), jonli davomat va oylik cron
   ishlatadigan qoida.
3. **Narxlab bo'lmaydigan dars o'zgarmaydi va sanaladi**: stavka yo'q, oylik
   qattiq stavka, narxi yo'q foiz yoki oylik kursda muzlatilgan hisob yo'q.
   Pul yozadigan yo'lda narx taxmin qilinmaydi.
4. **Hisoblangan oyga tegilmaydi.** Oyligi hisoblangan (CALCULATED va undan
   keyin) dars sanaladi, lekin o'zgarmaydi. APPROVED/PAID oy ichidagi sana
   bilan stavka qo'yish avvalgidek rad etiladi.
5. **Ustoz hisobidagi ko'zgu ham to'g'rilanadi.** Har bir o'zgargan darsning
   jonli `SALARY_ACCRUAL` krediti bekor qilinadi va yangi summa bilan qayta
   yoziladi (append-only, bitta dars uchun bitta jonli kredit). Kredit yozuvi
   hech qachon bo'lmagan darsga yangisi ixtiro qilinmaydi.
6. **Saqlashdan oldin ta'sir ko'rsatiladi.** `POST /salary/config/preview`
   saqlashning o'zini ishga tushiradi va tranzaksiyani orqaga qaytaradi —
   "taxmin" uchun ikkinchi kod yo'li yo'q. Rol va chaqiruvchi tekshiruvi
   saqlash bilan bir xil (ADR-0034). Stavka oynasi qayta hisoblanadigan dars
   bo'lsa tasdiq so'raydi: nechta dars, oldin/keyin summa, farq, va
   o'zgarmaydigan darslar nima uchun o'zgarmasligi.

### Birga tuzatilgan nuqson

`applyAccrualToBalance` va `reverseAccrualBalance` jonli kreditni
`reversedAt: null` bilan qidirardi. Bekor qilish yozuvi ham `reversedAt: null`
bilan yoziladi, shuning uchun dars bekor qilinib qayta belgilanganda qidiruv
bekor qilish yozuvini "allaqachon kreditlangan" deb o'qib, qayta kreditni
tashlab ketardi; keyingi bekor qilish esa bekor qilish yozuvining o'zini bekor
qilishi mumkin edi. Endi ikkalasi `reversedTransactionId: null` ni ham talab
qiladi. Prodda (29.09.2026) shu sabab ko'zgusi yo'q 3 054 ta jonli dars haqi
bor (53 945 714 so'm, 15 ustoz). Hammasi sentabr darslari va hammasini bitta
yo'l yaratgan: oylik to'lovga o'tish migratsiyasi (26.09.2026, 03:31–04:03
Toshkent, `scripts/lib/monthly-migration-apply.ts`) har bir darsni avval bekor
qilib, keyin muzlatilgan narxda qayta yozgan. Dars haqi qatorlari to'g'ri
(eski 53 514 147, yangi 53 945 714), faqat kredit qayta yozilmagan. Sentabr
oyligi hali hisoblanmagan va u dars haqi qatorlaridan hisoblanadi, shuning
uchun ustozlarning puliga ta'siri yo'q. `User.balance` saytda ko'rsatilmaydi
va oylik unga qaramaydi (ADR-0006: oylik `getMonthly` dan); farq bu ADR
doirasida tiklanmaydi, alohida bir martalik tuzatish talab qiladi.

## Oqibatlar

- Oylik hisoboti (`getMonthly`), oylik cron va markaz qo'shimchasi prognozi
  darhol yangi summani ko'radi — ular dars haqlari va versiyalardan o'qiydi.
- Stavka o'zgarishi endi bitta tranzaksiyada ko'p dars haqini yozishi mumkin;
  tranzaksiya muddati 30 s ga oshirildi, yozuvlar partiyalab (bir xil summa
  bitta `updateMany`, ledger `createMany`) yoziladi.
- `SALARY_ACCRUAL` qatorini yozadigan yangi joy — `rate-reapply.ts`; filial
  asl kreditdan (guruh filiali, D3) olinadi.
- Kelajakdagi sana bilan qo'yilgan stavka yozilgan darslarga ta'sir qilmaydi
  (hali bunday dars yo'q).

## Ko'rib chiqilgan va rad etilgan

- **Faqat keyingi darslar (avvalgi holat)** — o'tgan sana bilan qo'yilgan
  stavka yarim ishlaydi va tuzatish kod bilan qilinadi.
- **Farqni bitta ADJUSTMENT bilan to'lash** — dars haqlari eski summada qolib,
  oylik tafsiloti (qaysi dars qancha) noto'g'ri ko'rsatilardi.
- **Hisoblangan (CALCULATED) oyni ham qayta narxlash** — to'lov summasini
  qayta hisoblash va ushlangan avanslarni qayta taqsimlash kerak bo'ladi; bu
  alohida qaror.
