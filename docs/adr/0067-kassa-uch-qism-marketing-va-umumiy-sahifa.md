# ADR-0067 — Kassaga tushgan pul uch qismda; marketing ko'rsatkichlari birinchi to'lov bo'yicha; o'qimayotganlar qarzi uch turga bo'linadi; «financial-overview» faqat CEO va filial direktoriga

**Holati:** Qabul qilindi
**Sana:** 2026-10-02
**Bog'liq:** `docs/superpowers/specs/2026-10-02-b1-umumiy-va-marketing-design.md`, `docs/superpowers/plans/2026-10-02-b1-umumiy-va-marketing.md`, `server/src/reports/reports-financial.service.ts` (`getIncomeMonthAttribution`), `server/src/reports/marketing/`, `server/src/reports/debt-split.ts`, `server/src/reports/month-charges.ts`, `server/src/telegram-groups/utils/income-split.util.ts`, ADR-0015, ADR-0021, ADR-0055, ADR-0058, ADR-0059

## Kontekst

CEO 27.09.2026 da Moliya va Hisobotlar sahifalarini o'qish qiyin deb topdi va B
to'plamini (yetti qism) tasdiqladi. Birinchi qism — «Umumiy ma'lumotlar» va
«Marketing» sahifalari. Ularni qurishdan oldin to'rt narsa kodda qaror talab
qildi:

- **Kassaga tushgan pul ikki qismda edi.** `getIncomeMonthAttribution` pulni
  «shu oy uchun» va «eski qarzlar uchun»ga bo'lardi. Qarzdan ortgan to'lov —
  keyingi oy uchun oldindan to'langan pul ham — «shu oy»ga qo'shilardi:
  oktabr oxirida noyabr uchun to'lagan o'quvchining puli oktabrniki bo'lib
  ko'rinardi. CEO buni alohida qism sifatida ko'rishni so'radi (27.09), 21:00
  hisobotida ham (02.10).
- **Marketing ko'rsatkichlari noto'g'ri formulada edi.** «O'quvchi qiymati»
  davr tushumini to'lovchilar soniga bo'lardi; «Jalb qilish narxi» marketing
  sarfini davrda yaratilgan kartalar soniga bo'lardi — to'lamagan karta ham
  «yangi o'quvchi» edi; «Marketing samarasi» butun kassani marketing sarfi
  bilan solishtirardi. CEO ularni to'g'ri formulalar bilan alohida «Marketing»
  sahifasida qoldirishni so'radi.
- **«O'qimayotganlar qarzi» bitta raqam edi.** Maket uni guruhsiz, muzlatilgan
  va ketganlarga bo'lib ko'rsatadi; uchinchi qismning ta'rifi yo'q edi.
- **`GET /reports/financial-overview` Administrator va Kassirga ham ochiq
  edi** va ularga faqat ikki kartani («To'lov qilganlar», «O'rtacha to'lov»)
  kesib berardi. CEO ikkala kartani olib tashladi.

## Qaror (CEO, 27.09.2026 va 02.10.2026)

1. **Kassaga tushgan pul — uch qism.** `getIncomeMonthAttribution` endi
   `currentMonth` (shu oy uchun), `advance` (keyingi oy uchun oldindan) va
   `lateTotal` (eski qarzlar uchun) qaytaradi; `total = currentMonth + advance
   + lateTotal` — davrdagi hisobga olingan to'lovlar yig'indisi, avvalgidek.
   ADR-0021 ning qoidasi (bosma raqam va uning bo'linishi bitta chaqiruvdan)
   o'zgarmaydi; uning 1-bandi hali `total = currentMonth + lateTotal` deydi.
   - O'quvchining musbat balansi endi bitta son emas, bo'laklar navbati (FIFO).
     Bo'lak «qamrovda» yoki yo'q: qamrovdagi bo'lak — davr va filialdagi
     COMPLETED to'lovning qarzdan ortgan qismi.
   - Debet balansni eng eski bo'lakdan yeydi — pul hamma joyda shu tartibda
     yuradi. Shuning uchun undan oldingi qamrovdan tashqari kredit (eskiroq
     to'lov, tuzatish, boshlang'ich balans) bu davrning oldindan to'lovidan
     oldin sarflanadi.
   - **Debet davr ichida** bo'lsa, u yegan qamrovdagi summa `advance`dan
     `currentMonth`ga o'tadi: u davrning hisobini to'ladi (masalan, oy o'rtasida
     guruhga qo'shilish).
   - **Debet davr tugagandan keyin** bo'lsa (masalan, yopilgan oy keyin
     ko'rilganda keyingi oyning 1-sanadagi hisobi), summa `advance`da qoladi: u
     keyingi oyni to'ladi.
   - Yangi maydonlar: `advanceStudents` (davr oxirida qamrovdagi oldindan
     to'lovi turgan o'quvchilar), `paymentCount`, `latePaymentCount` (eski
     qarzni ham yopgan to'lovlar), `lateStudentCount`.
   - `collectionPct` ma'nosini saqlaydi: surati `currentMonth + advance` —
     avvalgi `currentMonth`.
   - **O'qiydiganlar.** Uch qismni ko'rsatadi: «Qayerdan keldi» oynasi, 21:00
     hisobotining tushum qatorlari va «💰 Moliyaviy xulosa» (`income-split.util.ts`:
     «Shu oy uchun», «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun», keyin
     har oy; 0 bo'lgan qism chiqmaydi; foizlar yig'indisi doim 100). Eski
     ma'noni (`currentMonth + advance`) saqlaydi: `getOwnMonthProfit` (Excel
     «Xulosa», «Oylar» va «Filiallar»), Excel «Xulosa»ning 3-bloki va dars puli
     bloki, kunlik suratning `collectedForMonth`i (surat qayta qurilmaydi,
     ma'nosi o'zgarmasligi shart), 21:00 hisobotining 2026-09 dan oldingi oylar
     uchun «Shundan yig'ildi» va «Oy rejasidan yig'ildi» qatorlari, ikki
     diagnostika skripti (`verify-collection-ratio.ts`, `june-income-bases.ts`).
2. **Marketing ta'riflari** (`server/src/reports/marketing/`;
   `GET /reports/marketing`, faqat CEO va filial direktori):
   - **Sarf (M oyi)** — `MARKETING` toifali, o'chirilmagan `Expense.amount`
     yig'indisi, `Expense.date` M oyida (`@db.Date`: chegaralar
     `utcMidnightFromDateStr`, yuqorisi kirmaydi), filial `branchIdWhere`.
   - **M oyining yangi o'quvchisi** — birinchi COMPLETED `Payment`i (`createdAt`ning
     Toshkent oyi) M oyiga tushgan karta: `deletedAt` bo'sh, filial qamrovida
     (`studentBranchWhere`), kamida bitta o'chirilmagan yozilishi bor (faqat mock
     to'lagan odam kirmaydi). Bekor qilingan to'lov (REVERSED) sanalmaydi.
   - **Kogorta hozirgacha to'lagan** — shu yangi o'quvchilarning birinchi
     to'lovidan bugungacha barcha COMPLETED to'lovlari.
   - **Jalb qilish narxi** = round(sarf ÷ yangi o'quvchilar); yangi o'quvchi
     bo'lmasa — bo'sh.
   - **O'quvchi qiymati** ≈ o'rtacha o'qish oylari × oylik hisob. O'rtacha
     oylar — M uchun `getDepartedStudentsSummary(...).avgDurationMonths`
     (Ketgan o'quvchilar sahifasidagi raqam; 0 — ketgan yo'q, bo'sh deb
     o'qiladi); oylik hisob — M uchun round(`MonthCharges.charged ÷ students`),
     2026-09 dan oldin va hisob yozilmagan oyda bo'sh. Biri bo'sh bo'lsa,
     qiymat ham bo'sh.
   - **Marketing samarasi** = kogorta hozirgacha to'lagani ÷ sarf; sarf 0 bo'lsa
     — bo'sh.
   - **O'tish oylari** — 2026-07 dan oldingi oylar. May va iyunda allaqachon
     o'qiyotganlar tizimdagi birinchi to'lovini qilgan va yangidek ko'rinadi:
     yangi o'quvchilar soni «*» bilan, jalb qilish narxi, hozirgacha to'lagan
     va samara hisoblanmaydi.
   - **Manba bo'yicha** jadval lid voronkasining o'z kogortasini o'qiydi
     (`ReportsLeadFunnelService.getSourceBreakdown`): o'quvchiga aylangan lid
     har o'quvchi kartasiga bir marta sanaladi, qolgan lidlar esa birma-bir
     (telefon bo'yicha birlashtirilmaydi) — «Lidlar hisoboti» sahifasidagidek
     (`toPersons`); filial `leadAttributionWhere`, boshlanishi
     `FUNNEL_START_DATE` = 2026-09-10. «O'quvchi bo'ldi» — voronkaning «to'lov»
     bosqichiga yetganlar.
   - Eski formulalar `financial-overview` va 6 oylik `financial-trend`dan olib
     tashlandi (`ltv`, `ltvPayerCount`, `cac`, `marketingRoi`, `avgPayment` va
     ularni boqqan `newStudentCount`, `marketingExpenses`). Ekranda inglizcha
     qisqartma yo'q.
3. **O'qimayotganlar qarzi uch turga bo'linadi** (`debt-split.ts`; ADR-0059ga
   qo'shimcha, uni almashtirmaydi). O'qimayotganlar to'plami (`NOT
   activeStudentWhere()`) bitta `groupBy(['status'])` bilan o'qiladi:
   - statusi ACTIVE — **guruhsiz**: o'qimayotganlar ichida ACTIVE aynan
     `ungroupedStudentWhere()` (ACTIVE statusda inkor `enrollments.none`ga
     aylanadi — o'sha `ACTIVE_ENROLLMENT_WHERE`);
   - FROZEN — **muzlatilgan**;
   - qolgan har qanday status (EXPELLED, GRADUATED, INACTIVE, `deletedAt` bo'sh
     ARCHIVED, PROSPECT) — **ketgan**.

   Uch qism qurilishiga ko'ra `notStudying.total` va `count`ni beradi. Ikki
   raqam (o'qiyotganlar va o'qimayotganlar) avvalgidek hech qayerda
   qo'shilmaydi. Qo'shimcha: `studying.olderCount` (eski qarzi bor o'qiyotgan
   qarzdorlar soni) va `MonthCharges.unpaidStudents` (qamrovdagi to'lanmagan
   ulushi 0 dan katta o'quvchilar — `unpaid` hisoblangan joyda sanaladi).
4. **`GET /reports/financial-overview` — faqat CEO va filial direktori.**
   Administrator va Kassir uchun kesib berish shoxi o'chirildi. «Umumiy
   ma'lumotlar» sahifasida ular faqat sarlavha, «To'lov qayd qilish» va oxirgi
   to'lovlarni (`GET /payments`) ko'radi; sahifa ular uchun bu so'rovni
   yubormaydi. «Oyning o'z foydasi» (`ownMonthProfit`) ham javobdan olib
   tashlandi (CEO, 27.09); u faqat Excel'da qoladi (1-banddagi
   `getOwnMonthProfit`).

**Ataylab o'zgarmadi:**
- Excel kitobi va yillik trend — eski ma'noda qoladi (1-banddagi o'qiydiganlar);
- `GET /reports/expectation-history` va 23:40 surati (surat qayta qurilmaydi);
- `GET /reports/debt-write-offs-summary` (uni Qarzdorlik qismi joylaydi);
- Telegram qarz qatorlari — o'qimayotganlarning uch turini chop etmaydi;
- `/payments/debt` ro'yxatlari va plitkalari.

**Taqiqlanadi:**
- uch qismni, marketing raqamlarini yoki o'qimayotganlar turlarini
  `getIncomeMonthAttribution`, `reports/marketing/` va `debt-split.ts`dan
  boshqa joyda hisoblash — mijozda ham;
- o'qimayotganlar turlarini o'qiyotganlar qarziga qo'shish;
- ekranda LTV, CAC, ROI qisqartmalari.

## Ko'rib chiqilgan muqobillar

- **Qarzdan ortgan hamma pul — oldindan.** Rad etildi: oy o'rtasida qo'shilgan
  o'quvchining shu to'lovdan yechilgan hisobi keyingi oyning puli bo'lib
  ko'rinardi.
- **Yangi o'quvchi — davrda yaratilgan karta.** Rad etildi: to'lamagan karta
  ham sanalardi (eski formula shu edi).
- **«Ketgan» — faqat EXPELLED.** Rad etildi: INACTIVE, GRADUATED, ARCHIVED va
  PROSPECT hech qayerga tushmasdi va uch qism jamini bermasdi.
- **Administrator va Kassirga ikki kartani qoldirish.** Rad etildi: CEO
  ikkalasini olib tashladi (27.09).

## Oqibatlari

**Yutuq:** sahifa, 21:00 hisoboti va «💰 Moliyaviy xulosa» kassani bir xil uch
qismda ko'rsatadi; marketing raqamlari to'lagan o'quvchilarga tayanadi;
o'qimayotganlar qarzi kimlardan iboratligi ko'rinadi.

**Narx:**
- «Shu oy uchun» oldindan to'lov hajmicha kamayadi — pul yo'qolmagan, alohida
  qatorga o'tdi. Deploydan keyingi birinchi 21:00 hisobotida yangi «Oldindan»
  qatori chiqadi (CEO biladi, 02.10).
- Davr ichidagi har qanday debet oldindan to'lovni «Shu oy uchun»ga
  o'tkazadi, hisob bo'lmasa ham: balansdan yechib olish (ADR-0055 bo'yicha u
  shu oyning daromadi) va pul qaytarish ham. Bo'linishdan oldin bu pul
  baribir «shu oy»da edi; pul qaytarish kam uchraydi.
- `advanceStudents` — davr oxiridagi holat: yopilgan oy keyinroq ko'rilsa,
  keyingi oyning hisobi o'sha pulni allaqachon yegan bo'lishi mumkin.
- Marketing — «yuqori chegara»: hamma yangi o'quvchi reklamadan kelmagan.
  Manba bo'yicha aniq hisob faqat 10.09.2026 dan beri: 2026-09 da manba
  jadvali 10–30.09 ni, kartalar esa butun oyni sanaydi.
- INACTIVE va `deletedAt` bo'sh ARCHIVED karta «ketgan»da (lid voronkasi
  hisoboti INACTIVE ni muzlatilganlar bilan sanaydi — boshqa yuza, boshqa
  savol).
- **Deploy: avval mijoz, keyin server** — ADR-0058 dagi kabi. Yangi mijoz eski
  serverning yo'q maydonlari o'rnida «—» chizadi yoki qatorni tashlaydi. Server
  oldin chiqsa, eski mijoz olib tashlangan maydonlarni topmaydi, Administrator
  va Kassirga `financial-overview` 403 qaytaradi, eski «Tushum tarkibi» paneli
  esa oldindan to'lovsiz `currentMonth` bilan jamiga qo'shilmaydigan ulushlar
  chizadi.
