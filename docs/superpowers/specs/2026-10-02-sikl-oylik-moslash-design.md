# Oylik yozilishda «sikl» o'rniga oy: «Darslar», «Qarzdorlar», qarz kechirish

**Sana:** 2026-10-02 · **Holat:** CEO tasdiqladi (3-bandda A varianti) · **Qaror:** ADR-0062

## Muammo

26.09.2026 dan barcha kurslar oylik to'lovda: har yozilishga har oyga bitta
`EnrollmentMonthlyCharge`. Uchta joy esa yozilishni hamon `lessonPaymentCount`
talik «sikl»ga bo'ladi:

1. **Profil → «Darslar»** (`getLessonsOverview`): davomat qatorlari indeks
   bo'yicha 12 talik bloklarga bo'linadi — «6-sikl: 18.09 — 02.10 (7/12 dars)»
   sentabr va oktabrni aralashtiradi.
2. **Guruh → Davomat → «Qarzdorlar»** (`getByDate` → `currentCycle`):
   `computeEnrollmentCoverage` oylik hisob qatorini (`LESSON_DEDUCTION`,
   `mode: 'MONTHLY_PERIOD'`) sikl deb sanamaydi, oylik davomat esa
   `LESSON_CONSUMPTION` yozmaydi. Natija: oylikdan oldingi eski paket yoki
   «Sikl boshlanmagan». «Tavsiya» — kursning oylik narxi.
3. **Qarz kechirish** (`DebtWriteOffService`): «joriy sikl» — oxirgi 12 ta
   davomat qatori, «Real qarz» — undagi «Kelmadi» × dars narxi. 01.10 dan puli
   yetmagan o'quvchiga 2-darsdan «Kelmadi» qo'yib bo'lmaydi (ADR-0047), shuning
   uchun summa bir-ikki dars narxiga tushadi. CEO 21.09 dagi 9-javobda qarz
   kechirilmasligini aytgan; `payment.debtWriteOffEnabled` standart holatda
   o'chiq.

## Umumiy qoida — yozilishning oylik davri

Yozilish birinchi `EnrollmentMonthlyCharge` qatori (holatidan qat'i nazar)
yozilgan oydan boshlab oylik davrda. Undan oldingi darslar — paket davri, eski
mantiq o'zgarmaydi. Dars qaysi hisob bilan to'langan bo'lsa, o'sha bo'yicha
ko'rsatiladi (ADR-0051). Kursning bugungi `paymentModel`i bu savolga javob
bermaydi: hamma kurs MONTHLY, paket davrida yopilgan yozilishlar ham.

## 1. «Darslar» tabi

**Server** (`students-read.service.ts`, `getLessonsOverview`):
- yozilishlarning hisob qatorlari bitta so'rov bilan o'qiladi
  (`enrollmentId`, oy, `status`, `coveredLessons`);
- oylik davrdagi har dars o'z Toshkent oyining blokiga tushadi
  (`kind: 'MONTH'`, `month: 'YYYY-MM'`). Blok sig'imi — o'sha oyning CHARGED
  hisobidagi `coveredLessons` (muzlatilgan, bekor qilingan va ketishda
  qaytarilgan kunlarsiz); hisob yo'q yoki bekor qilingan bo'lsa `null`;
- oylik davrda bekor qilingan dars (`cancellationId`) ko'rsatilmaydi va
  sanalmaydi: ADR-0053 bo'yicha u oyning darsi emas;
- paket davri darslari avvalgidek: `floor(index / lessonPaymentCount) + 1`,
  `kind: 'CYCLE'`.

**Mijoz** (`lesson-trail-tab.tsx`): blok sarlavhasi — oy nomi («Oktabr»,
joriy yildan boshqa yil bo'lsa «Dekabr 2026»), paket bloki — «N-sikl». Sanoq —
`x/y dars`, faqat sig'im ma'lum va to'lmagan bo'lsa; aks holda `x dars`.
`kind` kelmasa (eski server) blok paket bloki deb o'qiladi.

## 2. «Qarzdorlar» paneli

**Server:**
- `lesson-admission.ts` ga sof `monthReach`: o'quvchining shu guruhdagi
  oy darslari (`groupLessons`) boshidan qaysigacha pul yetishi —
  `balance + heldLater + heldAfter(kun) ≥ 0`, `lessonAdmission`ning
  `paidThrough` hisobining o'zi, faqat 1-dars imtiyozisiz (bu pul, darsga
  qo'yish emas). Natija `{ lessons, paid, paidThrough }`, guruhda shu oy
  hisobi bo'lmasa `null`;
- `LessonAdmissionService.monthCoverage` — `loadCharges` bilan o'qiydi,
  `payment.admissionRuleEnabled` ga ham, 01.10 sanasiga ham bog'liq emas;
- `AttendanceReadService.getByDate` javobiga `paymentModel`; MONTHLY guruhda
  qarzdorlar uchun `computeEnrollmentCoverage` chaqirilmaydi;
- `AttendanceService.getByDate` MONTHLY guruh qarzdorlariga `monthCoverage`
  qo'shadi.

**Mijoz** (`attendance-debtors-section.tsx`, MONTHLY guruhda):
- ustun «Shu oy»: «Oktabr: 13 darsdan 5 tasi to'langan (12.10 gacha)»,
  «Oktabr: to'lanmagan», «Oktabr: to'langan», «Oktabr: hisob hali
  yozilmagan»; oy — davomat sanasining oyi;
- «Tavsiya» = qarz (`suggestedAmount` 0 → `debtAmount`); «Yetmaydi» ustuni
  «Tavsiya» bilan bir xil bo'lgani uchun ko'rsatilmaydi;
- izoh: «Bu o'quvchilar oylik to'lovni to'liq to'lamagan. «Shu oy» ustuni
  to'lov oyning nechta darsiga yetishini ko'rsatadi.»

Paket guruhida panel o'zgarmaydi. `paymentModel` kelmasa (eski server) —
paket ko'rinishi.

## 3. Qarz kechirish (A varianti)

- `DebtWriteOffService.computeEligibility`: oylik davrdagi yozilish —
  `eligible: false`, `reason: 'MONTHLY'`, sikl hisoblanmaydi;
  `executeWriteOff` uni 400 bilan rad etadi: «Oylik to'lovdagi qarz hisobdan
  chiqarilmaydi — pul guruhdan chiqarishda tanlangan tartib bo'yicha hal
  bo'ladi».
- `getClosedEnrollments` (faqat profildagi «Yopilgan guruhlar (qarzdorlik
  bilan)» bo'limi o'qiydi): kechirish o'chiq bo'lsa `[]`, yoqiq bo'lsa faqat
  paket davri yozilishlari.
- Guruhdan chiqarish oynasi o'zgarmaydi: blok faqat `eligible` bo'lsa chiqadi.
- Paket davri yozilishlari (kechirish yoqilgan bo'lsa) — avvalgidek.

## Saytga chiqarish tartibi

Avval mijoz, keyin server (yoki birga). Yangi mijoz eski server javobini
paket ko'rinishida o'qiydi; eski mijoz yangi serverda oy blokini «-sikl» deb
yozardi.

## Testlar

- Server: `lesson-admission.spec.ts` (`monthReach`), `students-read.service.spec.ts`
  (oy bloklari, aralash tarix, bekor qilingan dars, paket o'zgarmagani),
  `attendance.service.spec.ts` (MONTHLY qarzdorga `monthCoverage`, paketda
  `currentCycle`), `debt-write-off.service.spec.ts` (MONTHLY rad),
  closed-enrollments filtri.
- Mijoz: yorliq yordamchilari va `writeOffNoticeCopy('MONTHLY')` uchun
  vitest.

## Ataylab qilinmaydi

- B varianti (oylik uchun «Oy qarzi» bilan kechirish) — 9-javob sabab;
  kerak bo'lsa A2 (#631, #632) dan keyin.
- Davomat nuqtalari tabi (`getLessonSequence`, oxirgi `lessonPaymentCount`
  dars) va to'lov oynasining paket ko'rinishi — bu ishga kirmaydi.
- Bir guruhdan chiqib qayta qo'shilgan o'quvchining ikki yozilishi bir xil
  davomatni ko'rsatishi — avvaldan bor, tegilmaydi.
