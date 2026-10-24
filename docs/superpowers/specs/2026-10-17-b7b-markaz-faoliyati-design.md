# B to'plami, 7b-qism: «Markaz faoliyati» hisoboti

**Sana:** 2026-10-17
**Maket:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL (`v-act`; CEO 27.09 tasdiqlagan, 17.10 qarorlari bilan to'ldirildi)
**ADR:** 0098 (shu PR'da; 7a o'zining 0097'ini oldin chiqarsa raqam o'zgarmaydi, aks holda `git mv` bilan qayta raqamlanadi)
**Bog'liq:** ADR-0097 (7a, bitta ma'lumot to'plami), ADR-0002 (filial qamrovi), ADR-0067 (hisobotlar bazasi 2026-05), `docs/superpowers/specs/2026-10-17-b7a-ketgan-oquvchilar-design.md`

7-qism to'rt hisobotdan iborat. Bu hujjat ikkinchisi. 7a (Ketgan o'quvchilar) PR #726'da.

## 1. Maqsad

Sahifa bitta savolga javob beradi: **markaz o'z xonalari va o'rinlaridan qanchasini ishlatyapti va yangi guruhni qayerga qo'yish mumkin.** Hozirgi sahifa (`/reports/activity`, `reports-center-activity.service.ts`, 1147 qator) bu savolga noto'g'ri yoki tushunarsiz javob beradi:

- **O'tgan oylar kam ko'rinadi.** Guruhlar faqat hozirgi holati bo'yicha olinadi (`ACTIVE`/`FORMING`, o'chirilmagan). Keyin yopilgan yoki o'chirilgan guruhlar o'tgan oyda yo'qoladi. 15 maydagi 248 faol o'quvchining 225 tasi hozir o'chirilgan guruhlarda turibdi.
- **Hafta 7 kun deb olinadi** (`workingHoursPerDay × 7`). Markaz yakshanba ishlamaydi, shuning uchun bandlik past chiqadi.
- **«Bo'sh o'rinlar»** xona bo'yicha eng katta guruhni oladi (`sig'im − max(o'quvchi)`), shuning uchun bir xonada ikkita guruh bo'lsa raqam kartadagi «to'lganlik» bilan mos kelmaydi.
- Sahifada bir-birini takrorlagan kartalar («Bo'sh o'rinlar» va «Yana o'qishi mumkin»), «FIK», «o'rinsoat» kabi tushunarsiz atamalar, kunlik/haftalik/oylik kesim tugmalari va to'rtta oyna bor (CEO 27.09: tushunarsiz).
- «Qachon xona bo'sh» degan savolga (yangi guruh uchun asosiy savol) sahifada javob yo'q.

Yangi sahifa **bitta ma'lumot to'plamidan** hamma blokni hisoblaydi, shunda kartadagi raqam jadvallar yig'indisiga teng chiqadi.

## 2. CEO qarorlari

Avvaldan (27.09, maket): bir-birini takrorlagan kartalar, «FIK», «o'rinsoat» va texnik ustunlar olib tashlanadi; «Oylar bo'yicha bandlik» ustunlari qo'shiladi; «Bo'sh o'rni bor guruhlar» va «Guruhsiz o'quvchilarni joylashtirish» havolasi qo'shiladi.

17.10.2026:
- **O'chirilgan guruhlar o'tgan oylarda hisobga olinadi** (ular o'sha oyda dars o'tgan). Sahifada «shundan N ta guruh keyin o'chirilgan» izohi chiqadi. Yopilgan (tugagan, bekor qilingan) guruhlar ham hisobga olinadi.
- **Hafta — du–sha (6 kun)**, ish vaqti filial sozlamasidan (`startOfWorkingDay`/`endOfWorkingDay`; berilmagan bo'lsa 09:00–21:00, hozirgi qiymat). Bayram kunlari hisobga kirmaydi, sababi §3'da.
- **Xona sig'imini tahrirlash shu sahifadan olib tashlanadi.** U Sozlamalar → Xonalar sahifasida qoladi (`settings.reference`).
- **«To'lsa, oyiga taxminan N mln qo'shimcha»** — taxminiy raqam. Yozuvi «taxminan» bilan, hisobda faqat oylik to'lovli kurslar ishtirok etadi.

## 3. Bitta ma'lumot to'plami: `CenterFacts`

Yangi modul `server/src/reports/center-activity/`. U bir marta yuklaydi (tanlangan oyning oxirigacha va maydagi eng birinchi oydan boshlab) va keyin har bir oy uchun xotirada `asOf` holatini hisoblaydi (§5). Ma'lumot manbalari mavjud (yangi jadval kerak emas):

| Fakt | Manba |
| --- | --- |
| xona, sig'im shu kunda | `Room` + `RoomCapacitySnapshot` (SCD2) |
| guruh jadvali, kursi shu kunda | `Group` + `GroupScheduleSnapshot` (SCD2) |
| kurs narxi shu kunda | `CoursePriceSnapshot` (SCD2) |
| guruh holati shu kunda | `StatusHistory` (`entityType 'Group'`), yo'q bo'lsa `createdAt` dan ACTIVE |
| o'quvchi guruhda faolmi shu kunda | `EnrollmentStateLog` + `enrollmentStatusOn` / `supplyOpeningRow` (ADR-0035 o'qiydigan o'sha yordamchilar) |

**«Shu kunda» = `asOf`:**
- o'tgan oy uchun oyning oxiri (`tashkentMonthRangeUtc(oy).lt − 1 ms`),
- joriy oy uchun hozir.

**Guruh `asOf` da ochiqmi:** `max(createdAt, startDate) ≤ asOf`, `endDate` yo'q yoki `asOf ≤ endDate`, `deletedAt` yo'q yoki `asOf < deletedAt`, va `StatusHistory` bo'yicha shu kundagi holat `ACTIVE` yoki `FORMING`. `PAUSED`, `COMPLETED`, `CANCELLED`, `ARCHIVED` bo'lgan guruh shu kunda yopiq hisoblanadi. Eski qoidadagi «hozirgi holat» o'rniga tarix o'qiladi, shuning uchun keyin yopilgan guruh o'tgan oyda ochiq bo'lib qoladi.

**O'quvchi sanaladi** agar uning yozilishi `asOf` da `ACTIVE` bo'lsa. O'chirilgan guruhning yozilishlari ham o'qiladi: yuklovchi `Enrollment.deletedAt` bo'yicha filtrlamaydi, guruh darajasidagi qoida yagona eshik. Reja birinchi vazifasida `GroupsWriteService.delete`'ning guruh o'chirilganda yozilishni arxivlashini yoki faqat yopishini haqiqiy bazada tekshiradi (dry-run) va filtr shunga mos qo'yiladi.

**Xona `asOf` da mavjudmi:** `createdAt ≤ asOf` va `deletedAt` yo'q yoki `asOf < deletedAt`; joriy oyda qo'shimcha ravishda `status = ACTIVE` (ta'mirdagi xona yangi guruh uchun bo'sh ko'rinmasin); o'tgan oyda holat tarixi yo'q, shuning uchun faqat mavjudlik.

**Cheklov (hujjatlanadi):** guruhning xonasi tarixi yozilmaydi (`GroupScheduleSnapshot`da xona yo'q), shuning uchun har kunda `Group.roomId`ning hozirgi qiymati olinadi. Bitta guruh xona almashtirgan bo'lsa o'tgan oylar uning hozirgi xonasida chiqadi. Xonasi yo'q guruh soatga ham, o'ringa ham kirmaydi.

## 4. Raqamlar qanday hisoblanadi

Hamma raqam `asOf` holatidagi **odatiy hafta** uchun. Bayram bitta xonaning haftalik jadvalini o'zgartirmaydi, shuning uchun bayram kunlari bu hisobga kirmaydi (CEO'ga aytilgan «bayramlar chiqariladi» o'rniga: ular odatiy haftani o'zgartirmaydi).

- **Dars soatlari (xona, hafta kuni):** xonadagi ochiq guruhlarning `exactDays` × (`lessonStartTime`–`lessonEndTime`) oralig'i, 30 daqiqalik bo'laklar to'plami (ikkita guruh bir vaqtda bo'lsa bir marta sanaladi). Ish vaqti oynasidan tashqari qism qirqiladi, shuning uchun bandlik 100% dan oshmaydi.
- **Xonalar bandligi %:** `Σ xonalar dars soatlari / Σ xonalar ish soatlari`, ish soati = kunlik ish vaqti × 6. Sub-satr: «haftasiga N soat dars · ish vaqti HH:mm–HH:mm, du–sha».
- **Guruhlar to'lganligi %:** `Σ min(o'quvchi, sig'im) / Σ sig'im`, guruhlar bo'yicha (xonasi va sig'imi bor ochiq guruhlar). Sub-satr: «N o'quvchi · M o'rin». Sig'imdan oshgan guruh to'la hisoblanadi va jadvalda «sig'imdan oshgan» belgisi bilan chiqadi.
- **Bo'sh o'rinlar:** `Σ max(0, sig'im − o'quvchi)` guruhlar bo'yicha. Sub-satr: «to'lsa, oyiga taxminan X mln qo'shimcha» = `Σ bo'sh o'rin × kurs oylik narxi` (shu kundagi narx; faqat `paymentModel = MONTHLY` kurslar).
- **«Qachon xona bo'sh»:** bitta filial uchun matritsa kun (du–sha) × soat (filial ish vaqti, butun soatlar). Katak = filialning shu soatda hech qanday dars bilan band bo'lmagan xonalari soni (dars soat oralig'ining bir qismiga to'g'ri kelsa ham xona band). Rang: ≥ 75% xona bo'sh yashil, 40–74% och yashil, 15–39% sariq, < 15% qizil (xona soniga nisbatan, maketdagi 9 xona uchun 7–9 / 4–6 / 2–3 / 0–1).
- **Ko'rsatma (insight):** eng bo'sh va eng tig'iz vaqtlar. Qoida sof funksiyada (`heat-insight.ts`): har kun uchun ketma-ket yashil (yoki qizil) soatlar oralig'i, bir xil oraliqli kunlar birlashtiriladi, eng ko'p bo'sh xonali bitta «qulay» va eng kam xonali bitta «tig'iz» oraliq tanlanadi. Matnni mijoz yig'adi, server tuzilma beradi.
- **«Xonalar» jadvali:** xona nomi, o'rin, guruh soni, bandligi (% va soat, shu xona uchun yuqoridagi formula). Filial bo'yicha guruhlangan (bitta filial tanlansa bitta guruh).
- **«Bo'sh o'rni bor guruhlar»:** ochiq guruhlar, bo'sh o'rin kamayish tartibida; ustunlar: guruh (+ kurs), jadval («Du-Chor-Ju 10:00»), o'quvchi / o'rin, bo'sh. Pastida «Guruhsiz o'quvchilarni joylashtirish →» (`/students?status=ungrouped`, `students.list` huquqi bo'lmasa havolasiz matn).
- **«Oylar bo'yicha bandlik»:** maydan (hisobot bazasi, `DEBT_FLOOR_MONTH` = 2026-05) tanlangan oygacha, ko'pi bilan 6 ustun; har ustun o'sha oyning `asOf` holatidagi bandlik %. Tanlangan oy ajratib ko'rsatiladi. «O'tgan oylarda keyin yopilgan guruhlar ham hisobga olinadi» izohi sahifada.
- **Izoh satrlari** (faqat raqam bo'lganda): «shundan N ta guruh keyin o'chirilgan» (tanlangan `asOf` da ochiq, hozir o'chirilgan guruhlar soni), «N ta guruhga xona yoki o'rin soni belgilanmagan».

## 5. Server

- `GET /reports/center-activity/overview?oy=YYYY-MM&filial=<id>` → kartalar, issiqlik matritsasi (bitta filial), `branches[]` (ko'rsatilayotgan filiallar va ularning xona soni, matritsa tanlagichi uchun), xonalar, bo'sh o'rni bor guruhlar, oylar, izoh sonlari.
- `GET /reports/center-activity/excel?oy=&filial=` — varaqlar: «Xonalar» (xona, filial, o'rin, guruhlar, dars soati, bandlik), «Guruhlar» (ochiq guruhlarning hammasi: o'quvchi, o'rin, bo'sh, jadval), «Soatlar» (har filial uchun matritsa), «Oylar».
- Ikkalasi `@Can('reports.students')` (CEO, filial direktori; Administrator yo'q — hozirgi `GET /reports/center-activity` bilan bir xil), `@BranchScope()` ro'yxat sifatida o'qiladi (bo'sh qamrov → 403, hech narsa o'qilmaydi). `oy` 2026-05 … joriy Toshkent oyi (aks holda 400 «Bu hisobot may 2026 dan boshlanadi» / «Kelajak oyni tanlab bo'lmaydi»). `filial` qamrovdagi filiallardan biri bo'lishi shart (aks holda 400), berilmasa nomi bo'yicha birinchisi; «Barcha filiallar»da kartalar yig'iladi, matritsa tanlangan filial uchun.
- **Eski yo'l olib tashlanadi:** `GET /reports/center-activity`, `ReportsCenterActivityService`, `CenterActivityQueryDto`, `reports.service.ts`dagi `getCenterActivity` fasadi va spec'lari; `intentional-access-changes.ts` yozuvi yangi yo'llar uchun almashtiriladi; `rooms.service.ts` kesh o'chirishdan `reports:center-activity:*` andozasini oladi (`reports:room-util:*` qoladi — moliyaviy Excel'ning «Xonalar bandligi» varag'i uni o'qiydi).
- **Kesh yo'q.** Hisob oyiga bir marta, xotirada, uch-to'rt so'rov bilan; Redis keyingi qadam. `// ponytail:` izohi shuni aytadi (kalit: kompaniya + filial + oy, Redis; kuchli yuklanishda).
- Fayllar (har biri 500 qatordan kam): `center-activity-period.ts` (oy → `asOf`, chegaralar), `center-facts.loader.ts`, `center-metrics.ts` (sof: soat, to'lganlik, bo'sh o'rin, oylar), `center-heat.ts` va `heat-insight.ts` (sof), `center-activity.service.ts`, `center-activity.controller.ts`, `center-activity.excel.ts`, `dto/center-activity-query.dto.ts`.

## 6. Mijoz

`/reports/activity` o'z joyida qoladi (ssilkalar buzilmasin), menyu nomi «Markaz faoliyati» (`reports-nav.ts`, `reports.students`). `client/src/components/reports/center-activity/` ichidagi eskilar (filtr paneli, KPI, diagnostika, trend, xona jadvali, 4 ta oyna va sig'im tahrirlash oynalari) o'chiriladi. Yangilari:

- `center-activity-page.tsx` — sarlavha, oy tanlash (`MonthStepper`, `?oy=`), filial yozuvi, Excel; bitta so'rov.
- `center-activity-cards.tsx` — 3 karta.
- `center-activity-heat.tsx` — matritsa, rang izohi, ko'rsatma, filial tanlagich (bir nechta filial bo'lsa, `?filial=`).
- `center-activity-rooms.tsx`, `center-activity-groups.tsx` — ikkita jadval: `#` ustuni, sahifalash 10 (10–50 tanlanadi, `useState`, ma'lumot serverdan to'liq keladi).
- `center-activity-months.tsx` — ustunlar.
- `center-activity-format.ts` (sof, vitest): foiz matni, kun nomlari («Du-Chor-Ju»), ko'rsatma jumlasi, oy yorlig'i.

URL: `oy`, `filial`. Mijoz hech qanday raqamni o'zi hisoblamaydi. Yuklanayotganda skelet, xatoda «Qayta urinish» (so'rovsiz javob bo'sh holatni ko'rsatmaydi). Bo'sh holat: «Bu oyda xonasi bor ochiq guruh yo'q — oyni o'zgartirib ko'ring». Qo'llanma: `kontent/hisobotlar/markaz-faoliyati.mdx`, `sahifalar/hisobotlar.ts`, `yangiliklar.ts`, `uzbek-only-texts.test.ts`dagi eski import yangisiga almashtiriladi.

## 7. Chekka holatlar

- Xonasi yo'q yoki sig'imi `null` guruh o'rinda ishtirok etmaydi; jadvalda ko'rinmaydi, izohda sanaladi.
- Dars vaqti (`lessonStartTime`/`lessonEndTime`) yo'q yoki oxiri boshidan oldin bo'lgan guruh soatga kirmaydi, o'rinda kiradi.
- Bir guruh bir nechta kun, bir xona bir nechta guruh: 30 daqiqalik to'plam bir marta sanaydi.
- Filialning ish vaqti noto'g'ri (boshi ≥ oxiri) bo'lsa o'sha filial standart 09:00–21:00 oladi va hisobot ogohlantirish yozadi (log).
- Oy mayda: kurs narxi/sig'im snapshotlari bo'lmasa hozirgi qiymat (eski rejimdagi «degraded mode», hujjatlangan).
- `StatusHistory` guruh uchun yozilmagan bo'lsa (eski guruh), guruh `createdAt` dan ACTIVE hisoblanadi.
- Faqat bitta filial qamrovida bo'lgan direktor filial tanlagichini ko'rmaydi.

## 8. Sinov

- Sof funksiyalar: oy → `asOf`; guruh `asOf` da ochiqmi (yopilgan, o'chirilgan, pauzadagi, boshlanmagan); 30 daqiqalik to'plam va ish vaqti oynasiga qirqish; to'lganlik/bo'sh o'rin (sig'imdan oshgan guruh); narx; matritsa katagi va rang; ko'rsatma.
- Yuklovchi: o'chirilgan guruhning o'quvchisi o'tgan oyda sanaladi; o'tgan oydagi sig'im va jadval snapshotdan olinadi.
- **Parite sinovi (asosiy kafolat):** bitta yuklovchi chiqishida kartadagi soatlar xonalar jadvalining yig'indisiga, kartadagi o'quvchi/o'rin guruhlar jadvalining yig'indisiga (`min(o'quvchi, sig'im)` bilan) teng; oylar ustunining oxirgisi (tanlangan oy) kartadagi foizga teng.
- Kontroller: marker va standart rollar (`routeAccess`, `defaultRolesOf`), bo'sh qamrov 403, noto'g'ri `oy`/`filial` 400; route manifesti va `intentional-access-changes.ts`.
- Mijoz: `center-activity-format.ts` va sahifa modeli (vitest), yuklanish/xato/bo'sh holatlar.
- Soxta API bilan brauzer tekshiruvi (7a'dagi kabi): joriy oy, o'tgan oy, bir nechta filial, telefon, qorong'u, xato.

## 9. Chiqarish

Server va sayt birga (eski sayt olib tashlangan yo'lni chaqiradi). Migratsiya yo'q, skript yo'q. 02:00 / 03:10 / 04:00 / 23:00 vaqtlaridan qochiladi. Excel'dagi moliyaviy ish kitobining «Xonalar bandligi» va «Guruhlar to'ldirilishi» varaqlari (`reports-excel.operational-sheets.ts`, `getRoomUtilization`) o'zgarmaydi: ular o'z ta'rifida qoladi, bu hisobotdagi raqamlar bilan mos tushmasligi mumkin (ADR'da yoziladi).

## 10. Bu qismda yo'q (keyinga)

- Guruhning xona tarixi (xona almashtirish) yozilishi.
- Redis keshi.
- Xonalarni bir-biriga solishtirish, «shu soatga yangi guruh qo'shsa» simulyatsiyasi.
- Moliyaviy Excel varaqlarini yangi ta'rifga o'tkazish.
