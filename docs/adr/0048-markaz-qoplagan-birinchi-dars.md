# ADR-0048 — Markaz qoplagan 1-dars markazning puli bo'lib ko'rinadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-28
**Bog'liq:** ADR-0046 (darsga qo'yish, shartnoma 3.2), ADR-0047 (qarzdorning 1-darsga kelmagani); spec `docs/superpowers/specs/2026-09-28-markaz-birinchi-dars-design.md`; `server/src/billing/first-lesson-funder.ts`, `server/src/billing/lesson-billing.service.ts`, `server/src/billing/monthly-charge.service.ts`, `server/src/billing/lesson-admission.ts` (`firstLessonCoverage`), `server/scripts/audit-center-topup-flags.ts`

## Kontekst

CEO qarori (27.09): markaz oyiga bitta darsni ustozga qoplaydi — birinchisini,
va faqat o'quvchi kelgan bo'lsa. ADR-0046 dan keyin to'lamagan o'quvchi
2-darsdan darsga qo'yilmaydi, ya'ni 2-darsdan boshlab har bir ustoz haqi
o'quvchining o'z pulidan. Bitta haq bundan mustasno: oyning **1-darsiga
kelgan**, lekin puli u darsga yetmagan o'quvchining darsi.

Bu haq boshqa oylik darslar kabi yozilardi: qoplamasi oyning hisob
tranzaksiyasi, shuning uchun u **o'quvchi to'lagan** (`wasCenterTopUp = false`)
bo'lib saqlanardi. Oylik hisobotida u «O'quvchilar to'lagan» ustunida
turardi, «Markaz qo'shdi» ustuni va X/Y/Z undirish kartasi uni ko'rmasdi,
«Markaz qoplagani» qarz ro'yxatida o'quvchi chiqmasdi. Ustozning puli to'g'ri,
faqat kim to'lagani noto'g'ri.

## Qaror

1. **Dars paytida (R1).** 01.10.2026 dan, oylik kursda, o'quvchi
   guruhdagi oyning 1-darsiga «Keldi» yoki «Kechikdi» bo'lsa va to'lovlari
   u darsga yetmasa (`firstLessonCoverage → firstLesson && !covered` — ADR-0047
   «Kelmadi» uchun ishlatgan qoidaning o'zi), haq odatdagidek yoziladi
   (summa va ustoz o'sha), keyin `setFirstLessonFunder(..., true)`
   `isCenterTopUp` va `wasCenterTopUp` ni yoqadi.
2. **To'lov kelganda (R2).** `processRetroactiveBillingForStudent` ning
   ADR-0047 qo'shgan bosqichi (`accrueDeferredFirstLessons`) o'quvchining
   markaz qoplab turgan 1-darslarini ham o'qiydi va to'lov yetganlarida
   `isCenterTopUp` ni o'chiradi. `wasCenterTopUp` qoladi (yopishqoq): o'sha
   oy markaz oldindan bergan, qaytgani X/Y/Z hayot yo'lida ko'rinadi.
3. **Tuzatishlar (R3).** «Kelmadi» yoki «Uzrli» → «Keldi»/«Kechikdi»
   to'lanmagan 1-darsda markaz qoplagan haqni yozadi. «Keldi» → «Kelmadi»
   ADR-0047 dagidek: haq to'lovgacha bekor qilinadi.
4. **Keyin yozilgan hisob uni undirmaydi (R4).** `setCenterTopUpForPeriod`
   oyning hisobi yozilganda (muzlatishdan qaytish, qayta hisob) davrning
   hamma markaz qoplagan haqlarini «undirildi» deydi. Qarzdorning hisobi esa
   balansni yana pastga tushiradi, xolos. Shuning uchun o'sha zahoti
   (`refrontUnpaidFirstLessons`) shu o'quvchi-guruh-oyning kelgan 1-darslari
   qayta baholanadi va to'lov yetmaganlari yana markazniki bo'ladi.
5. **Pul qimirlamaydi.** Faqat ikki bayroq: summa, ledger, balans, ustozga
   qachon to'lanishi o'zgarmaydi.
6. **Eski oylar (iyul–sentabr).** `isCenterTopUp` ning ma'lum nuqsoni tuzatish
   skriptisiz qoladi. Avval faqat o'qiydigan
   `scripts/audit-center-topup-flags.ts` har oy uchun markaz qoplab turgan
   haqlarni o'quvchining bugungi balansi bo'yicha ajratib ko'rsatadi; CEO
   raqamlarni ko'rib qaror qiladi. Raqamlar repoga yozilmaydi.

## Ko'rib chiqilgan muqobillar

- **`createAccrual({ centerFunded: true })` bilan yozish.** Rad etildi:
  `centerFunded` yo'li hisob tranzaksiyasiz yozadi va davr yopiq bo'lsa
  keyingi davrga o'tkazmaydi — bu darsning esa hisobi bor. Bayroqni alohida
  qo'yish haqning qanday yozilishini o'zgartirmaydi.
- **Bayroqni faqat hisobotda hisoblash** (har o'qishda 1-dars va qoplamani
  qayta hisoblash). Rad etildi: X/Y/Z, «Markaz qoplagani» ro'yxati va Excel
  bayroqni o'qiydi; to'rtta joyda ikkinchi qoida paydo bo'lardi.
- **Eski oylarni darhol tuzatish.** Rad etildi: raqamlarni CEO ko'rmagan;
  avval audit, keyin (kerak bo'lsa) quruq ishga tushiriladigan skript.

## Oqibatlari

- Oktyabrdan oylik hisobotida to'lamagan o'quvchining 1-darsi «Markaz
  qo'shdi» ustunida, to'laganda X/Y/Z kartasida «undirildi» bo'lib ko'rinadi.
  `fullDeserved` o'zgarmaydi.
- Har bir «Keldi»/«Kechikdi» saqlanishida o'quvchi uchun ikkita qo'shimcha
  o'qish (balans va oylik hisoblar) bo'ladi — 01.10.2026 dan oldingi darslar
  uchun hech narsa o'qilmaydi.
- Hisob yozish (`createChargeForEnrollment`) endi `LessonAdmissionService` ga
  bog'liq; qo'lda yasaydigan skriptlar va spec'lar beshinchi argument beradi.
