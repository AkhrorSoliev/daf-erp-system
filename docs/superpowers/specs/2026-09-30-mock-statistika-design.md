# Mock imtihon statistikasi

Sana: 30.09.2026. Holat: dizayn tasdiqlandi. CEO maketni ko'rib «ha, natija
yetib borishini ham qo'shib qil» dedi. Tarmoq: `feat/mock-statistika`.

## Muammo

CEO so'radi: mockdan qancha pul tushdi, nechta odam ro'yxatdan o'tdi, ulardan
nechtasi botdan va nechtasini adminlar qo'shdi, nechtasi DaF o'quvchisi,
nechtasi naqd va nechtasi Click/Payme orqali to'ladi, qaysi darajaga nechta
odam yozildi.

Hozir tizimda faqat `/mock-exams` sahifasining tepasidagi 4 ta umumiy raqam
bor: daromad, to'laganlar, jami ishtirokchilar va imtihonlar soni. Ular
barcha imtihonlarni qo'shib hisoblaydi. Imtihon ichida faqat ishtirokchilar
soni ko'rinadi. Har bir imtihonning tushumi, ro'yxat manbasi, DaF bo'linishi,
to'lov turi va darajalar jadvali hech qayerda yo'q.

Prod'dagi raqamlar (30.09, faqat o'qib olindi):

| | Mock 2.0 Sentabr | DaF Mock Imtihoni (01.08) |
|---|---|---|
| Ro'yxatdan o'tgan | 69 | 72 |
| Bot / admin | 58 / 11 | 18 / 54 |
| DaF / DaF emas | 49 / 20 | 58 / 14 (1 tasi keyin o'quvchi bo'lgan) |
| To'lagan | 48 — 2 270 000 | 61 — 1 860 000 |
| To'lamagan | 21 — 1 055 000 | 11 — 440 000 |
| Naqd / Click / Payme / yozilmagan | 38 / 4 / 1 / 5 | 0 / 1 / 1 / 59 |
| Natija Telegramda yetib borgan | — (hali e'lon qilinmagan) | 72 dan 18 tasiga |

## Qaror

### 1. Imtihon sahifasi → «Umumiy» bo'limi tepasida statistika bloki

Birinchi qatorda to'rtta karta turadi:

- **Tushgan pul**: to'laganlarning summasi. Pastida «N kishi to'lagan»
  yozuvi turadi. Bepul ro'yxatlar bo'lsa, «· M bepul» qo'shiladi.
- **To'lanmagan**: to'lamaganlar qarzining summasi. Pastida «N kishi»
  yozuvi turadi. Naqd to'lashini aytganlar bo'lsa, «· K tasi naqd deydi»
  qo'shiladi.
- **Ro'yxatdan o'tgan**: jami ishtirokchilar. Pastida «Botdan X · Admin Y»
  yozuvi turadi.
- **DaF o'quvchisi**: DaF o'quvchilari soni. Pastida «DaF emas Z» yozuvi
  turadi. Kimdir keyin o'quvchiga aylangan bo'lsa, «(W tasi keyin o'quvchi
  bo'ldi)» qo'shiladi.

Ikkinchi qatordagi kartalar:

- **To'lov usuli**: Naqd, Click, Payme (va bazada uchrasa Uzum, O'tkazma),
  «Balansdan (eski)» va «To'lov turi yozilmagan». Har biri uchun odamlar soni
  va summa ko'rsatiladi. Faqat 0 dan katta qatorlar chiqadi.
- **Darajalar**: har bir daraja uchun «yozilgan / to'lagan» va ingichka
  chiziq. Imtihonda taklif qilingan darajalar 0 bo'lsa ham shu tartibda
  ko'rinadi. Keyin taklifda yo'q, lekin bazada uchragan darajalar keladi.
  Oxirida «Darajasiz» turadi (faqat 0 dan katta bo'lsa). Imtihonda daraja
  umuman bo'lmasa, karta ko'rinmaydi.
- **Imtihon vaqti**: har bir vaqt uchun odamlar soni, oxirida «Tanlanmagan».
  Faqat 2 va undan ko'p qator bo'lsa ko'rinadi.
- **Natija yetib borishi**: faqat natija e'lon qilingandan keyin
  (`announcedAt` bor) ko'rinadi. Unda uchta qator bor: «Natija olishi kerak»
  (`RESULTS_AUDIENCE`), «Telegramda yetib bordi», «Telegram bog'lanmagan».
  Xato bilan qaytgan yuborishlar bo'lsa, «Yuborib bo'lmadi» qatori ham
  qo'shiladi.

Blok yuklanmasa, uning o'rnida kichik xabar chiqadi. Imtihon ma'lumotlari
(sana, narx, darajalar) blok ostida avvalgidek qoladi.

### 2. Imtihonlar ro'yxatiga ikkita ustun

`/mock-exams` jadvaliga «To'lagan» (kishi) va «Tushum» (so'm) ustunlari
qo'shiladi. Bu ustunlar oylarni solishtirish uchun. Ko'rinadigan barcha
imtihonlar tushumining yig'indisi tepadagi «Mock daromad» kartasiga teng.
Ikkalasi bir xil qoida va bir xil filial qamrovi bilan hisoblanadi.

### 3. Ro'yxat manbasi qatorning o'zida yoziladi (ADR-0054)

`MockExamParticipant.registeredVia` — yangi `MockRegistrationChannel` enum
(`BOT`, `ADMIN`). Ustun NOT NULL va standart qiymatsiz. Uni ikkala yozuvchi
o'zi qo'yadi: bot sahnasi `BOT` yozadi, `addManual` esa `ADMIN` yozadi.
Kelajakda qo'shiladigan uchinchi yo'l qiymatni aytmasa, u kompilyatsiyadan
o'tmaydi.

Eski qatorlar migratsiyada to'ldiriladi. `EntityHistory` da muallifi bor
(`changedById`) CREATE yozuvi bo'lsa, qator `ADMIN` bo'ladi. Aks holda
`telegramFirstName` bor bo'lsa `BOT` bo'ladi, qolganlari `ADMIN`. Prod'dagi
213 ta qatorda uchala belgi bir-biriga to'liq mos keldi: 102 tasi admin,
111 tasi bot. Bu mos kelish tasodif emas: bot `ctx.from.first_name` ni doim
yozadi, admin shaklida esa bunday maydon yo'q.

Nega taxminiy qoida (`telegramFirstName`) bilan cheklanmadik: bu ustun
Telegram nomini ko'rsatish uchun mo'ljallangan. Admin shakliga Telegram
maydoni qo'shilsa yoki uchinchi ro'yxat yo'li paydo bo'lsa, statistika jim
buziladi. `EntityHistory` ham yetarli emas: eski 50 ta bot qatorining tarix
yozuvi yo'q.

## Ta'riflar (bitta joyda)

Hisob faqat o'chirilmagan ishtirokchilar (`deletedAt: null`) ustida
yuritiladi.

- **Summa** — `feeAmount ?? exam.price`. Bu `revenueSummary` va to'lov
  yo'llaridagi qoidaning o'zi. Yagona helper'ga chiqariladi.
- **To'lagan** = `paid`. **To'lanmagan** = `!paid` va summa 0 dan katta.
  **Bepul** = `!paid` va summa 0 ga teng.
- **Naqd deydi** = to'lanmagan va `formData.__payIntent === 'CASH'`.
- **DaF o'quvchisi** = `studentId` bor va `convertedAt` yo'q, ya'ni
  ro'yxatdan o'tganda o'quvchi kartasiga mos kelgan. **DaF emas** — qolgan
  hamma. **Keyin o'quvchi bo'ldi** = `convertedAt` bor.
- **To'lov usuli** (faqat to'laganlar uchun): `paymentMethod` bor bo'lsa
  o'sha qiymat olinadi. Yo'q bo'lsa va to'lov balansdan yechilgan bo'lsa
  (`MockExamBillingService.paidFromBalanceIds`), usul `BALANCE` bo'ladi.
  Qolgan hollarda `UNKNOWN`. `UNKNOWN` — 28.09 dan oldin qo'lda qabul
  qilingan to'lov (ADR-0046 dan oldin). Admin uni «To'lovni tahrirlash»
  orqali tuzatadi. Hech narsa taxmin qilinmaydi.
- **Natija olishi kerak** — `RESULTS_AUDIENCE`. U SQL filtri bilan bir
  qatorda xotirada ishlaydigan egizagi `inResultsAudience` bilan yuritiladi,
  spec ularning mosligini tekshiradi.
  **Yetib bordi** = `resultSentAt` bor. **Telegram bog'lanmagan** = natija
  olishi kerak va `telegramChatId` yo'q. **Yuborib bo'lmadi** = natija
  olishi kerak, `resultSentAt` yo'q va `resultSendError` bor.

## Server

- `mock-exams/mock-exam-stats.ts` — sof funksiya
  `summarizeMockExam(exam, rows)`. Barcha ta'riflar shu yerda, spec bilan.
  Bir imtihonning ishtirokchilari (yuzlab) xotirada hisoblanadi.
- `mock-exams/mock-exam-stats.service.ts` — imtihonni filial qamrovi bilan
  topadi (`findOne` bilan bir xil `branchIdWhere`, qamrovdan tashqarisi 404).
  Ishtirokchilarni va balans to'lovlarini o'qib, sof funksiyaga beradi.
- `GET /mock-exams/:id/stats` — `MockExamsController` da joylashadi. Rollar
  kontrollerdagidek: CEO, filial direktori, administrator. Administratorlar
  hozir ham umumiy mock daromadini ko'radi. Route `@BranchScope()` oladi,
  shuning uchun manifestga yozuv kerak emas.
- `list()` har bir imtihonga `paidCount` va `revenue` qo'shadi. Buning uchun
  tanlangan imtihonlarning to'lagan ishtirokchilari bitta so'rov bilan
  o'qiladi. `revenueSummary` ham o'sha summa helper'ini ishlatadi.

## Client

- `components/mock-exams/exam-stats-panel.tsx` — yangi. U
  `/mock-exams/:id/stats` ni o'qiydi va kartalarni chizadi.
  `exam-overview-tab.tsx` uni sozlamalar ro'yxatining tepasiga qo'yadi.
- `components/mock-exams/mock-kpi-card.tsx` — `mock-exams-client.tsx` dagi
  `KpiCard` shu faylga ko'chiriladi. Ro'yxat sahifasi ham, panel ham uni
  ishlatadi.
- `mock-exams-client.tsx` — «To'lagan» va «Tushum» ustunlari qo'shiladi.
- To'lov usuli nomlari `mock-payment.ts` dagi `MOCK_PAYMENT_METHOD_LABELS`
  dan olinadi. Qo'shimcha nomlar (Uzum, O'tkazma, Balansdan (eski), To'lov
  turi yozilmagan) panel yonidagi kichik helper'da turadi.
- Ekranda inglizcha so'z bo'lmaydi.

## Saytga chiqarish

Migratsiya qo'shimcha: yangi enum, ustun to'ldiriladi va keyin NOT NULL
qilinadi. Railway ishga tushishda `prisma migrate deploy` ni o'zi bajaradi.
Almashuv oynasida (≈1 daqiqa) eski kod `registeredVia` siz yozishga urinadi
va rad etiladi: odam «Xatolik» xabarini ko'radi va qayta urinadi. Shuning
uchun ro'yxat ochiq imtihon yo'q paytda chiqariladi. 30.09 holati: yagona
jonli imtihon `REGISTRATION_CLOSED`, imtihon bugun tugadi.

## Tekshiruv

- `mock-exam-stats.spec.ts`: har bir ta'rif uchun holatlar (bepul, naqd
  niyati, konvertatsiya, usul yozilmagan, balans, daraja va vaqt tartibi,
  natija e'lon qilinmagan va qilingan).
- `mock-results-audience.spec.ts`: SQL filtri va xotiradagi egizak har bir
  holatda bir xil javob beradi.
- `addManual` va bot sahnasi spec'lari `registeredVia` ni tekshiradi.
- Kontroller spec'i: yangi route rollari.
- `list()` spec'i: `paidCount` va `revenue`, eski qatorda narxga qaytish.
- Client: helper'lar uchun vitest. Brauzerda lokal serverda ko'rib chiqiladi
  va skrinshot CEO ga ko'rsatiladi.
- Server: jest, typecheck, eslint, build. Client: vitest, tsc, eslint,
  build.

## Doiradan tashqarida

- Admin ismlari bo'yicha bo'linish. Kerak bo'lsa, `EntityHistory` da
  mavjud.
- Statistikani bosganda ishtirokchilar ro'yxatini filtrlash.
- Excel'ga chiqarish, kunlar bo'yicha ro'yxat grafigi, o'rtacha ball.
- 64 ta eski «To'lov turi yozilmagan» to'lovni ommaviy «naqd» deb
  belgilash. Bu CEO qarori bo'ladi. Hozircha admin ularni bittalab
  tuzatadi.
