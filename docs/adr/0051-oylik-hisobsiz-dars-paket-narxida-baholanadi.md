# ADR-0051 — Oylik kursdagi hisobsiz dars paket narxida baholanadi; ustoz haqi tushib qolmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-29
**Bog'liq:** `server/src/salary/shared/gap-sweep.ts` (`resolveLessonPricing`, `packPriceCandidates`), `server/src/common/finance/monthly-per-lesson.ts` (`loadPackLessonPrices`, `resolveHeldLessonPrice`), `salary-calculation.service.ts`, `salary-monthly.service.ts`, `salary-center-topup.service.ts`, `shared/rate-reapply.ts`, ADR-0006, ADR-0050

## Kontekst

Markaz qo'shimchasi (iyul 2026 dan) — o'quvchi to'lamagan, lekin o'tilgan
darsi uchun ustozga markaz pulidan beriladigan haq. Qaysi dars qo'shimchaga
tushishini bitta funksiya hal qiladi (`sweepGapLessons`), uni uch joy
ishlatadi: oylik hisoboti, oylik hisoblash (cron, pul yozadi) va markaz
qo'shimchasi ro'yxati.

Oylik kursda dars narxi faqat o'sha oyning muzlatilgan hisobidan
(`EnrollmentMonthlyCharge`) olinardi. Hisob yo'q bo'lsa dars "narxlanmadi"
deb sanalib, tashlab ketilardi.

26.09.2026 dagi oylik to'lovga o'tish faqat o'sha kuni guruhda turgan
o'quvchilarga sentabr hisobini yozdi. Undan oldin guruhdan ketgan (chiqarilgan
yoki muzlatilgan) o'quvchilarning sentabr darslari eski usulda — 12 talik
paket bilan (`LESSON_CONSUMPTION` belgisi) — hisobdan chiqarilgan, ular
qarzdor bo'lgani uchun ustozga haq yozilmagan. Kurs endi oylik, hisob esa yo'q,
shuning uchun bu darslar qo'shimchaga ham tushmasdi.

Prod (29.09.2026): 97 o'quvchi, 306 dars, hammasi qarzdor. Shundan 173 tasi
(4 va undan ko'p dars qatnashgan o'quvchilar) qo'shimchaga tushishi kerak edi —
12 ustozga ≈ 3 005 162 so'm. Sentabr oyligi 01.10 da shu darslarsiz
hisoblanardi. Foyda hisobi esa (`resolveHeldLessonPrice`) aynan shu darslarni
paket narxida tushum sifatida hisoblagan edi: tushum bor, ustoz haqi yo'q.

## Qaror

1. Oylik kursdagi darsning narxi tartib bilan olinadi: avval o'sha oyning
   muzlatilgan hisobi (avvalgidek), u yo'q bo'lsa — darsni hisobdan
   chiqargan paket belgisi (`LESSON_CONSUMPTION.metadata.perLessonCost`),
   bo'luvchisi kursning paket sikli (`lessonPaymentCount`, bo'lmasa 12).
   Dars NIMA BILAN hisoblangan bo'lsa, o'sha bilan baholanadi — foyda
   hisobidagi qoida bilan bir xil.
2. Ikkalasi ham yo'q bo'lsa (yoki belgi narxsiz eski qator bo'lsa) — dars
   avvalgidek narxlanmaydi va sanaladi. Narx taxmin qilinmaydi.
3. Qoida `resolveLessonPricing` da, shuning uchun hisobot, cron (asosiy
   supurish va o'tgan oylar qoldig'i), markaz qo'shimchasi ro'yxati va stavka
   qayta hisobi (ADR-0050) bir xil ishlaydi. Paket belgilari faqat hisobi yo'q
   oylik darslar uchun o'qiladi (`packPriceCandidates`) — oylik hisobli oy
   qo'shimcha so'rovsiz o'tadi.
4. Yangi o'quvchi qoidasi (4 darsdan kam — qo'shimcha yo'q) va nofaollik
   chegarasi o'zgarmaydi.

## Oqibatlar

- Sentabr: markaz qo'shimchasi 79 800 → 3 084 962, narxlanmagan dars 0,
  "to'lanishi kerak" jami 70 371 235 → 73 376 397 (prod ma'lumotida
  tekshirildi, 29.09.2026).
- Oy o'rtasida kursi oylikka o'tgan yoki oylik hisobi bekor qilingan har
  qanday o'quvchi uchun ham ishlaydi — faqat sentabr uchun emas.
- Bu darslar uchun ustoz haqi markaz pulidan yoziladi (`isCenterTopUp`),
  o'quvchi keyin to'lasa oddiy qoida bilan "undirildi" bo'ladi.

## Ko'rib chiqilgan va rad etilgan

- **Bir martalik skript bilan 173 darsga haq yozish** — sentabrni tuzatardi,
  lekin keyingi shunday holatda xato qaytardi, hisobot esa bu darslarni
  baribir ko'rsatmasdi.
- **Kalendardan oylik narxni qayta hisoblash** — muzlatish invariantini
  buzadi (oy o'rtasidagi jadval o'zgarishi ustoz haqini orqaga surardi).
