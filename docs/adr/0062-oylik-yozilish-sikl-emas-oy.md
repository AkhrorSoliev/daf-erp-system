# ADR-0062 — Oylik yozilish «sikl»ga bo'linmaydi: «Darslar» va «Qarzdorlar» oy bo'yicha, qarz kechirish oylikda taklif qilinmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-02
**Bog'liq:** ADR-0044, ADR-0047, ADR-0048, ADR-0051, ADR-0053, ADR-0059; CEO javobi 9 (`docs/tolov-savollari/javoblar.md`); dizayn `docs/superpowers/specs/2026-10-02-sikl-oylik-moslash-design.md`; `server/src/students/students-read.service.ts` (`getLessonsOverview`, `getClosedEnrollments`), `server/src/billing/lesson-admission.ts` (`monthReach`), `server/src/attendance/attendance.service.ts`, `server/src/billing/debt-write-off.service.ts`

## Kontekst

26.09.2026 dan hamma kurs oylik to'lovda. Uchta yuza esa yozilishni hamon
`lessonPaymentCount` talik «sikl»ga bo'lardi: profilning «Darslar» tabi
(davomat qatorlari indeks bo'yicha 12 talik bloklar — sentabr va oktabr bitta
blokda), guruh davomatidagi «Qarzdorlar» paneli (oylik hisob qatori sikl
ochmaydi, shuning uchun eski paket yoki «Sikl boshlanmagan») va «yo'qolgan
o'quvchi» qarzini kechirish (oxirgi 12 qatordagi «Kelmadi» × dars narxi).
01.10 dan puli yetmagan o'quvchiga 2-darsdan «Kelmadi» qo'yib bo'lmaydi
(ADR-0047), shuning uchun kechirish hisobi oylikda bir-ikki dars narxini
chiqarardi. CEO 21.09.2026 da qarz kechirilmasligini aytgan (9-javob),
`payment.debtWriteOffEnabled` standart holatda o'chiq.

## Qaror

1. **Oylik davr.** Yozilish birinchi `EnrollmentMonthlyCharge` qatori
   (holatidan qat'i nazar) yozilgan oydan boshlab oylik davrda; undan oldingi
   darslar paket davrida va eski mantiqda qoladi. Kursning bugungi
   `paymentModel`i bu savolga javob emas: paket davrida yopilgan yozilishlar
   ham hozir MONTHLY kursda. Dars qaysi hisob bilan to'langan bo'lsa, o'sha
   bo'yicha ko'rsatiladi (ADR-0051 qoidasining o'zi).
2. **«Darslar».** Oylik davr darslari Toshkent oyi bo'yicha bloklanadi; blok
   sig'imi — o'sha oyning CHARGED hisobidagi `coveredLessons`. Oylik davrda
   bekor qilingan dars ko'rsatilmaydi va sanalmaydi (ADR-0053: u oyning darsi
   emas). Paket davri bloklari o'zgarmaydi.
3. **«Qarzdorlar».** MONTHLY guruhda «Joriy sikl» o'rniga «Shu oy»: oyning
   nechta darsiga pul yetishi. Hisob `lesson-admission.ts` dagi `monthReach` —
   `lessonAdmission`ning `paidThrough` hisobining o'zi (1-dars imtiyozisiz,
   chunki bu pul, darsga qo'yish emas), `payment.admissionRuleEnabled` ga
   bog'liq emas. «Tavsiya» — qarz summasi.
4. **Qarz kechirish.** Oylik davrdagi yozilishga taklif qilinmaydi:
   eligibility `MONTHLY` sababi bilan yopiq, yozish 400 bilan rad etiladi.
   Oylikda ketgan o'quvchining puli guruhdan chiqarishdagi tartib bilan hal
   bo'ladi (6.2-band, ADR-0044; sinov darsi, ADR-0048). Kechirish o'chiq
   bo'lsa profildagi «Yopilgan guruhlar (qarzdorlik bilan)» bo'limi chiqmaydi.
   Paket davri yozilishlari avvalgidek.

**Taqiqlanadi:**
- oylik davr darslarini `lessonPaymentCount` talik bloklarga bo'lish;
- oyning pul qamrovini `lesson-admission.ts` dan boshqa joyda hisoblash;
- oylik davrdagi yozilishga «joriy sikl» qarzi bilan kechirish taklif qilish.

## Ko'rib chiqilgan muqobillar

- **Oylik uchun «Oy qarzi» bilan kechirishni qayta qurish** (min-qoida,
  ADR-0058/0059). Rad etildi: 9-javob — qarz kechirilmaydi. Kechirish qayta
  yoqilsa, A2 (`month-charges.ts`, `debt-split.ts`) birlashtirilgandan keyin
  alohida qaror bilan.
- **Kursning `paymentModel`i bo'yicha ajratish.** Paket davrida yopilgan
  yozilishlarning tarixi ham oy bloklariga aylanib, kechirish ulardan ham
  yopilardi — paket davri o'zgarmasligi kerak.
- **«Qarzdorlar»da darsga qo'yish natijasini (`admission`) qayta
  ko'rsatish.** 1-darsda va 01.10 dan oldingi kunlarda oy haqida hech narsa
  aytmasdi; ro'yxat qatori buni allaqachon ko'rsatadi.

## Oqibatlari

**Yutuq:** oylik o'quvchining darslari va qarzdorlik paneli oylik hisob bilan
bir xil tilda; kechirish noto'g'ri summani taklif qila olmaydi.

**Narx:**
- Oy oxirida boshqa oyga ko'chirilgan qo'shimcha dars kalendar oyi blokiga
  tushadi, sig'im esa hisobniki: bunday oyda `12/13` qolishi mumkin.
- Kechirish yoqilgan bo'lsa ham oylik qarzni kechirib bo'lmaydi; zarurat
  bo'lsa CEO qo'lda tuzatish (`POST /transactions/adjustment`) ishlatadi.
- Saytga chiqarish: avval mijoz, keyin server — eski mijoz oy blokini
  «-sikl» deb yozardi.
