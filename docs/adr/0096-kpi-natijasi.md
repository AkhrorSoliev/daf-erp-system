# ADR-0096: KPI natijasi — administratorga, bir marta, summa muhrlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** spec `docs/superpowers/specs/2026-10-16-admin-kpi-design.md` §7, ADR-0093, ADR-0072, ADR-0088, ADR-0079, ADR-0087

## Kontekst

1-bosqich (ADR-0093) har lidga bitta egani berdi. 2-bosqich natijalarni yozishi va bir oy pulsiz kuzatishi kerak: kim qancha natija qilgani, o'sish va kamayish. 16.09–15.10.2026 da 150 va'dadan 34 tasi bajarilgan, 10 tasida to'lovni boshqa admin kiritgan — va'da KPI'si to'lovni kiritganga emas, va'dani yozganga borishi kerak.

## Qaror

1. Natija `KpiResult` jadvaliga yoziladi, faqat `KpiResultsService` orqali. Ikki tur: `LEAD_PAID` — lid egasiga, aylanishdan keyingi birinchi `COMPLETED` to'lovda; `PROMISE_KEPT` — va'da `createdById` ga, va'dani `KEPT` qilgan to'lovda (`PaymentPromise.resolvedPaymentId`, to'lov tranzaksiyasida yoziladi), va'da to'lovdan kamida bir Toshkent kuni oldin yozilgan bo'lsa (CEO qarori 17.10.2026, `promiseOldEnough`: bugun yozilib bugun to'langan va'da natija bermaydi).
2. Natija paytida Administrator roli bor va CEO hamda Filial direktori rollari yo'q xodimga yoziladi; rollar bazadan o'qiladi.
3. `Lead.conversionKind`: `NEW_STUDENT` va `RETURNING` (bog'lash paytida o'qimayotgan eski o'quvchi) hisoblanadi; `ALREADY_STUDYING` — yo'q.
4. Narx har tur uchun `FIXED` yoki `PERCENT` (Sozlamalar, faqat CEO). Boshlang'ich narx: lid to'lov qildi — 50 000 so'm, va'da bajarildi — 20 000 so'm (qat'iy). Summa yozilganda muhrlanadi (`ruleMode`, `ruleValue`, `baseAmount`, `amount`).
5. Bitta lidga, bitta to'lovga (LEAD_PAID) va bitta va'daga bitta faol natija — qisman unikal indekslar. To'lov bekor qilinsa natija `CANCELLED` va lid keyingi to'lovni oladi; summa tuzatilsa natija yangi to'lovga eski qoidasi bilan o'tadi.
6. Hisob 17.10.2026 00:00 (Toshkent) dan (`KPI_START`); natija oyi — to'lovning Toshkent oyi. Kalit (`kpi.enabled`) o'chiq bo'lsa yangi natija yo'q va o'chiq davr keyin to'ldirilmaydi; bekor qilish ishlaydi.
7. Ko'radi: CEO va filial direktori (`kpi.view`). Administrator kuzatuvda ko'rmaydi.
8. Pul yo'q: oylik, kassa va foyda hisobotlari `KpiResult` ni o'qimaydi — bu 3-bosqich.

## Ko'rib chiqilgan muqobillar

- **Natijani har safar hisobotda hisoblash (saqlamaslik)** — narx o'zgarsa o'tgan oylar o'zgarardi, bekor qilish va tuzatishning izi qolmasdi; rad etildi.
- **Va'da KPI'sini to'lovni kiritganga berish** — 34 dan 10 holatda boshqa admin edi; rad etildi.
- **O'chiq davrni keyin to'ldirish** — CEO o'chirgan davr uchun talab paydo bo'lardi; rad etildi.

## Oqibatlari

- 3-bosqich oylikka faqat `ACTIVE` natijalarni oladi.
- Tungi tuzatish (`KpiSelfHealCron`, 03:30 Toshkent) o'tkazib yuborilgan natijani joriy narxda yozadi.
- Kalit qayta yoqilsa, undan oldingi yoqilgan davrda o'tkazib yuborilgan natija tungi tuzatishda yozilmaydi (kalit oynasi oxirgi yoqilgan paytdan).
- Aylangan lidni o'chirib bo'lmaydi (`LeadsService.remove()`, PR #716 qoidasi) — egasi va natijasi shu bilan saqlanadi. Arxivdan tiklangan aylangan lid `CONVERTED` bo'lib, egasi va aylanish vaqti bilan qaytadi.
- Tuzatishning qayta yozilishi muvaffaqiyatsiz bo'lsa (eski to'lov bekor qilindi, yangisi yozilmadi), natijalar «To'lov tuzatildi» bilan bekor holda qoladi. `LEAD_PAID` o'quvchining keyingi to'lovida yoki tungi tuzatishda qolgan eng birinchi to'lovga qayta tanlanadi; `PROMISE_KEPT` esa yo'qoladi — va'da bekor qilingan to'lovga bog'liq qoladi (ma'lum chegara).
- Backfill (`scripts/kpi-backfill.ts`; sinov rejimi odatiy, yozish uchun `--apply --expect=<N>`) `KPI_START` va deploy orasida `KEPT` bo'lgan va'daning to'lovini `resolvedAt` gacha bo'lgan 60 soniya ichidagi o'quvchining eng so'nggi `COMPLETED` to'lovi deb tiklaydi; topilmasa — natija yo'q.
