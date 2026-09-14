# A1 yakuniy sinovi («Kurz und klar») — dizayn

Sana: 2026-09-14. Holat: CEO tasdiqlagan (suhbatda, oddiy tilda).
Bog'liq: kurs dizayni `2026-09-03-a1-kurs-design.md` (3 va 5-bo'lim),
eshitish dizayni `2026-09-11-a1-hoeren-design.md` (§6 moyillik).

---

## 1. Muammo

- `UNIT_TEST` darsi bo'limsiz seed qilinadi (`server/src/daf/kurs/kurs-lessons.ts`:
  `push('UNIT_TEST', null, …)`). `UebungService.baueKandidaten` bo'limsiz darsga
  `null` qaytaradi → `seans()` bo'sh massiv → mijoz eski `LernenLessonPage` ga
  tushadi, u A1 uchun **bo'sh sahifa** (faqat sarlavha).
- O'quv yo'lining qulf zanjiri (`client/.../lernen/yol/yol-tuzilishi.ts`) unitning
  `finalTest` ini bo'limlardan KEYIN qo'shadi va birinchi `completedAt == null`
  seansdan keyingi hammasini yopadi. Bo'sh sahifa `abschluss` chaqirmaydi →
  **1-unitni tugatgan o'quvchi 2-unitga hech qachon o'ta olmaydi.**
- Prod (2026-09-14, faqat o'qib tekshirildi): A1 da 2 o'quvchi mashq qilgan, eng
  ko'pi 14 darsdan 2 tasini tugatgan — hali hech kim tiqilmagan. Kursni o'quvchilarga
  ochishdan oldin shart.

## 2. CEO qarorlari

1. Sinovda **15 savol**, butun unitdan aralash (kurs dizayni 3-bo'limi).
2. **O'tish sharti — 90 %**: birinchi urinishda to'g'ri javoblar
   ≥ `ceil(0.9 × 15)` = **14**. Qaytgan savolga keyingi to'g'ri javob hisobga
   kirmaydi (aks holda sinovdan hamma o'tardi).
3. **Cheklovsiz qayta topshirish**, har safar savollar yangidan tanlanadi.
4. O'tgandan keyin sinovni mashq sifatida qayta ishlash mumkin; natija pasaysa
   ham **ochilgan unit yopilmaydi**.
5. O'tish-o'tmaslikni **server** hisoblaydi — mijoz yuborgan songa ishonilmaydi.

## 3. O'quvchi tajribasi

1. Unitning hamma bo'limlari tugagach yo'lda «Yakuniy sinov» faol bo'ladi.
2. 15 savol: so'zlar, gaplar, iboralar, suhbatdan olingan satr, 1 ta eshitish
   savoli (seansda eshitish savoli ko'pi bilan 1 ta — mavjud qoida).
3. Xato javob boshqa darslardagidek seans oxirida boshqa formatda qaytadi —
   o'rganish uchun; hisobga faqat birinchi javob kiradi.
4. Natija ekrani server javobidan keyin chiziladi:
   - **o'tdi** (≥ 14): «Yakuniy sinovdan o'tdingiz!», «14 / 15», tugma «Davom etish»
     (yo'lga; keyingi unit ochiq).
   - **o'tmadi** (≤ 13): «12 / 15 — o'tish uchun kamida 14 ta to'g'ri javob kerak»,
     xato qilingan savollar ro'yxati (mavjud blok), asosiy tugma «Qayta urinish»
     (yangi savollar bilan yangi seans), ikkinchi tugma «Yo'lga qaytish».
   - **avval o'tgan, bu safar ≤ 13** (mashq sifatida qayta ishlagan): «Bu safar
     12 / 15. Sinovdan avval o'tgansiz — keyingi unit ochiq.», tugmalar «Davom
     etish» va «Qayta urinish».
   - server javobi kutilayotganda neytral «Natija tekshirilmoqda» holati — mijoz
     o'tdi/o'tmadini TAXMIN QILMAYDI; so'rov yiqilsa «Qayta yuborish».

## 4. Dvigatel (server)

### 4.1 Material
`baueKandidaten`: dars `kind === 'UNIT_TEST'` va bo'limi yo'q bo'lsa, material
**shu unitning hamma bo'limidan** olinadi (`dafSection.findMany({ unitId: lesson.unitId })`)
— ya'ni oxirgi bo'limning kumulyativ puli bilan bir xil. Qaytariladigan
`kind` — `'UNIT_TEST'`. Bo'limsiz boshqa dars (eski DiB) — o'zgarishsiz `null`.
`section` dan «joriy bo'lim» ma'nosida foydalanadigan har joy (masalan asosiy
so'zlar yoki bo'lim kodi bo'yicha tanlov) reja bosqichida aniqlanadi va unit
sinovi uchun «unitning hamma bo'limi» deb talqin qilinadi.

### 4.2 Uzunlik
`SEANS_UZUNLIGI = 12` sobit → seans turiga qarab: `UNIT_TEST` **15**, qolganlari 12.
Muddati kelgan so'zlar ulushi (oltidan bir) → 15 da **2 ta** (kurs dizayni 5-bo'limi).

### 4.3 Formatlar
`bevorzugteFormate('UNIT_TEST')` (`REAKTION`, `ZUORDNEN`, `DIALOG_LUECKE`,
`SATZ_UEBERSETZEN`, `HOEREN_WAHL`) endi haqiqatda ishlaydi — `kind-formate.ts`
dagi «bugun o'lik» izohi olib tashlanadi, eshitish dizaynining §6 eslatmasi
yangilanadi. `HOEREN_WAHL` chegarasi (seansda 1 ta) o'zgarmaydi.

### 4.4 O'zgarmaydigan qoidalar
Ball faqat muddati kelgan so'zga; Leitner faqat so'zni kuzatadi; `ersatz`
xuddi shu material yo'li bilan ishlaydi; javoblar mijozga savol bilan birga
yuborilmaydi (D6/D7).

## 5. Yakun va o'tish sharti

`abschluss(lessonId, { richtig, gesamt, sessionId })` — dars `UNIT_TEST` bo'lsa:

- `sessionId` **majburiy**; natija `seansniYakunla` dan olinadi
  (`DafAttempt` → `seansYigindisi`: birinchi urinish, `GRADED`, juftlash qoidasi) —
  `questionCount`, `firstTryCorrect`. Mijozning `richtig` soni o'tish qaroriga
  ta'sir qilmaydi.
- Seans shu darsga tegishli bo'lishi shart (`DafSession.lessonId === lessonId`),
  aks holda — o'tilmagan.
- Konstantalar: `UNIT_TEST_SAVOLLAR = 15`, `UNIT_TEST_OTISH_ULUSHI = 0.9`,
  `kerak = Math.ceil(0.9 × 15) = 14`.
- `bestanden = questionCount >= 15 && firstTryCorrect >= kerak`.
- `DafLessonProgress`: `runs` + 1; `bestScore = max(eski, firstTryCorrect)`;
  **`completedAt` faqat o'tganda yoziladi**; avval o'tilgan bo'lsa (`completedAt`
  bor) keyingi muvaffaqiyatsiz urinish uni o'zgartirmaydi.
- Javob: mavjud `{ bestScore, runs }` + `sinov: { bestanden, avvalOtilgan, togri, jami, kerak }`
  (faqat `UNIT_TEST` da; boshqa darslarda maydon yo'q). `avvalOtilgan` — bu
  yakundan OLDIN `completedAt` bor edi; mijoz shu bilan «ochiq, lekin bu safar
  past» holatini ajratadi.

Boshqa dars turlari — hozirgidek (klientning `richtig` i, har yakun `completedAt`).

## 6. Mijoz

- `seans-ekrani.tsx`: savol bor bo'lgani uchun dvigatel ekrani ochiladi (eski
  sahifaga tushish faqat haqiqatan savolsiz darsda qoladi).
- Natija ekrani: `abschluss` javobida `sinov` bo'lsa §3.4 dagi uch holat.
  Matn va tugma tanlovi sof funksiyada (masalan `sinov-natijasi.ts`) + vitest.
- Yo'l va bo'lim ekrani o'zgarmaydi — `completedAt` dan o'qiydi.
- Pastki menyu seans sahifasida allaqachon yashirin (PR #484).

## 7. Qamrovdan tashqari

- Migratsiya yo'q (`DafLessonProgress.completedAt` nullable, `DafSession` bor).
- Unit oxiridagi «eng ko'p adashgan so'zlar» bloki (kurs dizayni 5-bo'limi) — keyin.
- Imtihon rejimi (taymer, savol qaytmasligi) — yo'q.
- Native ilova — keyingi alohida PR (web/native parity qoidasi).
- `pruefen` javob berilgan savol aynan shu seansga tuzilganini tekshirmaydi —
  aldash xavfi past (o'quvchi o'z o'qishini aldaydi), alohida ish.

## 8. Test

- Server: `UNIT_TEST` materiali hamma bo'limdan va `kind` to'g'ri; seans uzunligi 15;
  `abschluss` — 14/15 o'tdi, 13/15 o'tmadi, `questionCount < 15`, `sessionId` yo'q,
  boshqa darsning seansi, avval o'tgan + keyin yiqilgan (`completedAt` saqlanadi,
  `avvalOtilgan: true`),
  `bestScore` max; boshqa dars turlari o'zgarmagan (regressiya testi).
- Mijoz: natija tanlovi funksiyasi vitest bilan (o'tdi / o'tmadi / avval o'tgan +
  bu safar past / javob kutilmoqda).
- Brauzer (real Chrome, 390 px): u01 yakuniy sinovi 15 savol bilan ochiladi; o'tdi
  va o'tmadi ekranlari; «Qayta urinish» yangi seans ochadi.

## 9. Deploy

Backend (Railway) birinchi, keyin Vercel. Migratsiya va seed yo'q. Tekshiruv:
CEO telefonda u01 yakuniy sinovini ochadi.

## 10. Xavflar

- **90 % qat'iy** — bir necha urinish kerak bo'lishi mumkin; cheklovsiz qayta
  topshirish va xatolar ro'yxati bilan yumshatiladi. `DafSession` statistikasi
  bo'yicha kuzatiladi; kerak bo'lsa ulush bitta konstantada o'zgaradi.
- **Material 15 savolga yetmasa** sinovdan hech qachon o'tib bo'lmaydi. u01/u02 da
  bunday emas (har unitda 50 so'z, 37–49 gap, 15–18 ibora, 6 dialog); `baueSeans`
  joylashtirolmagan savollarni allaqachon logga yozadi. Yangi unit qo'shishda
  shu hisobga olinadi.
