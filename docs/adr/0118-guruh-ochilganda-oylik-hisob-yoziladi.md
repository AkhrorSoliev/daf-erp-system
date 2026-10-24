# ADR-0118 — Guruh ochilganda (FORMING/PAUSED → ACTIVE) uning o'quvchilariga joriy oy hisobi shu tranzaksiyada yoziladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-21
**Bog'liq:** ADR-0041, ADR-0042, ADR-0058, `server/src/billing/monthly-charge.service.ts`, `server/src/common/status/status-cascade.service.ts`

## Kontekst

21.10.2026 da #084 guruhi FORMING holatida ochildi, admin avval 7 o'quvchini yozdi (13:29–13:31 Toshkent), keyin guruhni «Boshlandi» qildi (13:31:33). Yozilgan 7 o'quvchiga oylik hisob (`EnrollmentMonthlyCharge`) yozilmadi, 13:31:36 dan keyin yozilgan 5 tasiga yozildi. Hisobsiz o'quvchilar bugungi darsda PRESENT belgilandi, lekin balansga hech narsa tushmadi: oylik modelda davomat balansga tegmaydi, retroaktiv billing esa birinchi oylik hisobdan oldingi darslarnigina oladi. Natijada har biri uchun 173 077 so'm (oktyabrning 5 darsi) ko'rinmay qoldi, bir o'quvchi (to'lov qilgan) 175 000 balansda ko'rindi (to'g'risi 1 923).

Sabab ikki joyning birikuvi:
- `createChargeForEnrollment` guruh ACTIVE bo'lmasa jimgina `null` qaytaradi (xato emas).
- Hisobni faqat ikki joy yozadi: yozilish paytida (`chargeMidMonthJoin`, `chargeJoinMonth`) va har kuni 04:00 qorovul (`createChargesForPeriod`). Guruh holati o'zgarishi hisob yozmaydi.

## Qaror

1. `MonthlyChargeService.chargeActivatedGroup(tx, { groupId, performedById })`: guruhning ACTIVE, o'chirilmagan, ACTIVE o'quvchili, oylik kursdagi va joriy Toshkent oyida `CHARGED` hisobi yo'q yozilishlarini topadi (`createChargesForPeriod` bilan bir xil filtr, bitta guruhga toraytirilgan) va har biriga mavjud `createChargeForEnrollment` bilan hisob yozadi. Yangi hisoblash mantig'i yo'q: summa, proratsiya, chegirma — yozilish eshigidagi bilan aynan bir xil.
2. `StatusCascadeService.cascadeGroupStatusChange` ACTIVE holatida shu metodni chaqiradi — guruh holati o'zgarishi bilan **bir tranzaksiyada** (ADR-0041). Guruh qatori kaskaddan KEYIN yoziladi, shuning uchun yozilishlar «ochilayotgan ACTIVE guruh» sifatida hisoblanadi (`statusEnum: ACTIVE` bilan o'tkaziladi).
3. FORMING → ACTIVE ham, PAUSED → ACTIVE ham: pauzadagi guruh oy boshi cron'idan o'tib ketsa, xuddi shu teshik bor edi.
4. **Xato yutilmaydi.** Postgres tranzaksiyasida xatolikdan keyin davom etib bo'lmaydi; shuning uchun hisob yozilmasa guruh ochilishi ham bekor bo'ladi (admin «Guruh holati o'zgarmadi» xabarini ko'radi, ADR-0041). Jimgina hisobsiz ochishdan yaxshi: aynan shu #084 xatosi edi.
5. Joriy oy yoziladi; keyingi oylarni oy boshi cron'i va 04:00 qorovul yozadi. Qorovul zaxira bo'lib qoladi.

## Ko'rib chiqilgan muqobillar

- **Faqat qorovulga tayanish (hozirgi holat)** — guruh ochilgandan keyingi 04:00 gacha davomat belgilangan darslar uchun hisob yo'q, balans noto'g'ri ko'rinadi. Rad.
- **Guruh FORMING bo'lganda ham hisob yozish** — guruh hech qachon ochilmasa ham o'quvchi qarzdor bo'lib qolardi; `createChargeForEnrollment` ning «ACTIVE bo'lmasa yozilmaydi» qoidasi ataylab. Rad.
- **Admin ochishni yozilishdan keyin qilganini ogohlantirish** — insonga tayanish; tizim buni o'zi hal qilishi kerak. Rad.

## Oqibatlari

- Avtomatik FORMING → ACTIVE (`GroupStatusCronService`, 00:05, `startDate` kelganda) bu yo'ldan o'tmaydi: u `groupsStatusService` ni chaqirmaydi. U ochgan guruh o'quvchilariga hisobni o'sha kuni 04:00 qorovul yozadi (4 soatgacha kechikish; shu vaqtda davomat belgilanmaydi). Kerak bo'lsa keyingi qadam: cron'ni ham shu metod orqali yurgizish.
- Bu o'zgarish #084 ning allaqachon hisobsiz qolgan 7 o'quvchisini tuzatmaydi: ularni 22.10 04:00 qorovul yozadi yoki qo'lda yoziladi.
- Teacher accrual: hisob yozilgandan keyin keyingi davomat belgilashlari odatdagidek ishlaydi; 21.10 dagi o'sha dars uchun accrual yozilganmi — alohida tekshiriladi (bu ADR doirasidan tashqari).
