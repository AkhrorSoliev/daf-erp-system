# B to'plami, 7c-qism: «Davomat» hisoboti

**Sana:** 2026-10-17
**Maket:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL (`v-att`; CEO tasdiqlagan, 17.10 qarorlari bilan to'ldirildi)
**ADR:** 0103 (shu PR'da; 0100 boshqa ishga band bo'lishi mumkin, shuning uchun bo'sh keyingi raqam olindi; PR ochishdan oldin `docs/adr/README.md` tekshiriladi)
**Bog'liq:** ADR-0098 (7a, bitta ma'lumot to'plami), ADR-0099 (7b), ADR-0054 («Dars bo'ldimi?»), ADR-0053 (bekor qilingan dars puli), ADR-0067 (hisobotlar bazasi 2026-05), `docs/superpowers/specs/2026-10-17-b7a-ketgan-oquvchilar-design.md`

7-qism to'rt hisobotdan iborat. Bu hujjat uchinchisi. 7a (Ketgan o'quvchilar) va 7b (Markaz faoliyati) saytda.

## 1. Maqsad

Sahifa bitta savolga javob beradi: **o'quvchilar darsga kelyaptimi, qayerda kelmayapti va sababli dars pulga qanday ta'sir qiladi.** Hozirgi sahifa (`/reports/attendance`, `reports-attendance-analytics.service.ts`, 1078 qator) bunda ishonchsiz:

- **Umumiy foiz jadvallar yig'indisiga mos kelmaydi.** Umumiy hisob guruh filtrisiz (o'chirilgan guruhlar ham kiradi), guruhlar jadvali faol, shakllanayotgan va tugagan guruhlarni, kurslar jadvali hamma guruhni, ustozlar jadvali faqat faol va shakllanayotganlarni oladi.
- **Markaz bekor qilgan darslar «Sababli» ichiga aralashib ketadi** (bekor qilingan darsning yozuvi `EXCUSED` bo'ladi, `cancellationId` bilan).
- **Bosh sahifadagi davomat boshqa kodda hisoblanadi** (`ReportsService.getKpis`), shuning uchun hisobotdagi raqamdan ozgina farq qilishi mumkin.
- **Bo'sh davr 0% bo'lib chiziladi** (hamma o'quvchi sababli bo'lgan yoki dars bo'lmagan hafta), guruhlar jadvalida yozuvi yo'q guruh eng pastda turadi.
- **Eng kam yozuvli guruh ham ro'yxatga kiradi**: 1–2 o'quvchili guruhning bitta kelmasligi 50% beradi.
- Sahifada tushunarsiz bloklar bor: ikki o'qli grafik («O'quvchilar o'zgarishi» — bu davomat emas, guruh hajmi), holatlar doirasi, diagnostika, alohida filtr paneli.

Yangi sahifa **bitta ma'lumot to'plamidan** hamma blokni hisoblaydi, shunda kartadagi raqam jadvallar va oylar yig'indisiga teng chiqadi.

## 2. CEO qarorlari

Avvaldan (maket): to'rt blok — davomat kartasi, oylar va hafta kunlari, sababli darslarning pulga ta'siri, davomati past guruhlar; pastda «Ketma-ket kelmayotganlar». Olib tashlanadi: «O'quvchilar o'zgarishi», ikki o'qli grafik, holatlar doirasi, diagnostika, alohida filial tanlovi (sahifa yuqoridagi filial tanlovini kuzatadi).

17.10.2026:
- **«Ko'p qoldiruvchi»** — tanlangan davrda 3 va undan ko'p marta «Kelmadi» belgilangan o'quvchilar soni. Raqamni bossangiz, o'quvchilar ro'yxati ochiladi.
- **Foiz qoidasi o'zgarmaydi:** (Keldi + Kechikdi) ÷ (Keldi + Kechikdi + Kelmadi); «Sababli» foizga kirmaydi.
- **Bosh sahifadagi davomat shu hisobotdagi raqamning o'zi** bo'ladi (bir funksiya).
- **O'chirilgan va yopilgan guruhlar o'tgan oylarda hisobga olinadi** (7b'dagi qaror: ular o'sha oyda dars o'tgan). Jadvalda ular «o'chirilgan» belgisi bilan chiqadi.
- **Ustoz kesimida guruhning ustozi olinadi.** Hozir hech bir guruhda ikkita ustoz yo'q. O'rinbosar o'tgan dars guruhning o'z ustoziga yoziladi; sahifada izoh turadi.
- **Markaz bekor qilgan darslar «Sababli»dan alohida** sanaladi va hech bir foizga kirmaydi.
- **Excel tugmasi** bor (§9). Moliyaviy Excel ichidagi «Davomat» varag'i o'z ta'rifida qoladi.

## 3. Hisob qoidalari (hammasi shu yerda, boshqa joyda qaytarilmaydi)

**Manba — `Attendance` yozuvlari.** Bir yozuv = bir o'quvchining bir guruhdagi bir kunlik belgisi. Shuning uchun sahifadagi «dars» deganda «o'quvchi-dars» tushuniladi (maketdagi «4 814 darsdan 3 897 tasiga kelishgan» ham shunday). Jadval emas, belgilangan yozuv sanaladi: hech kim belgilamagan dars yozuv bermaydi (cheklov, §11).

**Qaysi yozuvlar:** `date` tanlangan davrda (`@db.Date`: `utcMidnightFromDateStr`, yuqori chegara **eksklyuziv**), guruhning filiali qamrovda (`branchIdWhere` guruh orqali). Guruh holatiga, o'chirilganiga qaramasdan hamma guruh.

**Holatlar:**
| Hisobotda | Qoida |
| --- | --- |
| Keldi | `PRESENT` |
| Kechikdi | `LATE` (kelgan hisoblanadi) |
| Kelmadi | `ABSENT` |
| Sababli | `EXCUSED` va `cancellationId` yo'q |
| Markaz bekor qildi | `cancellationId` bor (statusi `EXCUSED`); hech bir foizga kirmaydi |

**Foiz** = `(Keldi + Kechikdi) ÷ (Keldi + Kechikdi + Kelmadi)`. Maxraj 0 bo'lsa foiz `null` («—»), hech qachon 0% emas. Server foizni bir kasrgacha yaxlitlab beradi (`round1`, 7b'dagi bitta funksiya); sahifa butun son bilan chiqaradi, rang chegaralari (75 va 80) bir kasrli qiymat bo'yicha.

**Hafta kuni:** yozuv sanasining kalendar kuni (`@db.Date`ning UTC kuni = Toshkent kuni). Du–Sha qatorlari; Yakshanba qatori faqat o'sha kuni yozuv bo'lsa chiqadi.

**Oylar bo'yicha:** may 2026'dan tanlangan davrning oxirgi oyigacha, ko'pi bilan 6 ustun. Har ustun — o'sha **kalendar oyining to'liq** foizi (Toshkent oyi). Joriy oy «oy tugamagan» belgisi bilan. Oylar ham xuddi shu funksiya va shu guruhlar to'plamidan.

**Taqqoslash (maketdagi «avgustda 79% edi»):** davr to'liq oy bo'lsa oldingi oy, aks holda shu uzunlikdagi oldingi davr (`previousRange`, 7a'dan). Oldingi davr 2026-05-01 dan oldin boshlansa `null` («soxta 0» emas; 7a'dagi tuzatish).

**Davr:** 7a'dagi tugmalar — Bu oy · O'tgan oy · 3 oy · 6 oy · Oraliq (`preset`, `startDate`, `endDate`). Eng erta sana 2026-05-01; undan oldingisi 400.

## 4. Sahifa bloklari

**1. Davomat kartasi.** Foiz, oldingi davr foizi, «o'tilishi kerak bo'lgan N darsdan M tasiga kelishgan» (N = Keldi+Kechikdi+Kelmadi, M = Keldi+Kechikdi). Pastda to'rt belgi: Keldi, Kechikdi, Kelmadi, Sababli («foizga kirmaydi»); Markaz bekor qilgan darslar soni kichik qator bilan (0 bo'lsa chiqmaydi). Yashil «Bosh sahifadagi davomat ham shu raqam» izohi.

**2. Oylar bo'yicha** (ustunlar) va **Hafta kunlari** (gorizontal chiziqlar; 80% dan past — sariq, 75% dan past — qizil).

**3. Sababli darslar — pulga ta'siri.** «N ta sababli dars (M o'quvchi) uchun keyingi oy to'lovidan taxminan X chegiriladi.» N — Sababli yozuvlari (faqat oylik to'lovli kurs guruhlarida), M — ularning o'quvchilari. Markaz bekor qilgan darslar bu yerga kirmaydi.
- **Summa «taxminan»:** har (o'quvchi, guruh, oy) uchun o'sha oyning `CHARGED` hisobi (`EnrollmentMonthlyCharge`): `min(sababli soni, oylik chegara) × applyDiscount(perLessonCost, discountPercent)`. Oylik chegara — `payment.excusedCreditMonthlyCap` (bo'sh bo'lsa chegarasiz). Sozlama `payment.excusedCreditEnabled` o'chiq bo'lsa summa chiqmaydi, o'rniga «Sababli dars chegirmasi o'chirilgan».
- **Hisobi yo'q oy** (to'lov hisoblanmagan) faqat sonni beradi, summaga kirmaydi.
- Aniq summa keyingi oy hisoblanganda ma'lum bo'ladi (`creditAmount`); sahifa buni yozadi.
- Ko'p oylik davrda hamma oylar yig'indisi.

**4. Davomati past guruhlar.** Kesim tugmalari: Guruhlar · Ustozlar · Kurslar. Jadval `#`, nom, davomat (rangli chiziq va foiz), Darslar (Keldi+Kechikdi+Kelmadi), Ko'p qoldiruvchi. Eng pastdan tartiblangan; 10 qatorli sahifa, 10–50 tanlash.
- **Eng kam yozuv:** davrda kamida `ceil(60 × kun / 30)` (to'liq oy uchun 60) belgilangan yozuvi bo'lmagan qator ro'yxatda chiqmaydi (1–2 o'quvchili guruh foizni buzmasin); pastda «N ta qator yozuvi kam, ro'yxatda yo'q». Yashirin qatorlar umumiy foizga baribir kiradi, shuning uchun jadvallar yig'indisi umumiy sonlarga teng.
- **Guruh nomi:** «A1-04 · Ustoz Ismi»; o'chirilgan guruh «o'chirilgan» belgisi bilan.
- **Ustoz:** guruhning (hozirgi) ustozi; ustozi yo'q guruhlar «Ustozsiz» qatoriga. **Kurs:** guruhning hozirgi kursi (kurs almashgan guruhning o'tgan oylari hozirgi kursida chiqadi, cheklov).
- **Ko'p qoldiruvchi:** shu qatordagi guruhlarda davrda 3 va undan ko'p `ABSENT` yozuvi bo'lgan **alohida o'quvchilar** soni; raqam tugma, bossa oyna ochiladi (o'quvchi, guruh, kelmadi, jami) — oyna ro'yxatni birinchi ochilganda yuklaydi (`GET .../missers`).

**Pastda ogohlantirish — Ketma-ket kelmayotganlar.** «N o'quvchi 3 va undan ko'p darsga ketma-ket sababsiz kelmadi.» N — `AbsenceStreakService.computeStreaks` (chegara 3, filial qamrovi) natijasining uzunligi; bu **bugungi holat**, davrga bog'liq emas. Tugma «Aloqa markaziga» → `/outreach` (`CanLink`: unga ruxsati bo'lmagan uchun oddiy matn). Qoidasi hisobotdan farq qiladi (oldindan aytilgan sababsiz yo'qlik kelmagan hisoblanadi, markaz bekor qilgan darslar ko'rinmaydi, faqat faol o'quvchilar) — sahifada shuni yozuvchi qisqa izoh bor.

## 5. Bosh sahifa

`ReportsService.getKpis().averageAttendance` shu hisobotning funksiyasini chaqiradi: joriy Toshkent oyi, oyning 1-kunidan bugungacha, filial qamrovi bilan. Bosh sahifadagi haftalik davomat grafigi (`dashboard-charts.service.ts`) o'z holicha qoladi (hafta kesimi), Telegram 21:00 hisoboti ham o'zining kunlik ta'rifida; ular ADR'da «o'z ta'rifida qoladi» deb yoziladi.

## 6. Server tuzilmasi

Yangi `server/src/reports/attendance-stats/` (mavjud `attendance` moduli bilan adashmasligi uchun shu nom):
- `attendance-stats.types.ts` — javob turlari.
- `attendance-stats-period.ts` — 7a'dagi `departed-period.ts` yordamchilarini (`parseDayRange`, `previousRange`, `monthKeysEndingAt`) qayta ishlatadi; faqat 2026-05-01 pol tekshiruvi yangi.
- `attendance-facts.loader.ts` — **bitta o'qish:** davr + oldingi davr + ko'rsatiladigan oylarning eng ertasidan oxirigacha `Attendance` (`groupId`, `studentId`, `date`, `status`, `cancellationId`; 6 oyda ~35 ming qator), guruhlar (`name`, `branchId`, `deletedAt`, `courseId`, kurs nomi va to'lov modeli, ustoz), keyin sababli yozuvlari bor o'quvchilarning `CHARGED` hisoblari. Hammasi `branchIdWhere` bilan chegaralangan; bo'sh qamrov hech narsa o'qimaydi.
- `attendance-counts.ts` — **sof funksiyalar:** `countRows(rows, window)` → `{came, late, absent, excused, cancelled}`, foiz, hafta kuni, oy, kesim. Foizning yagona ta'rifi shu fayl (bosh sahifa ham shuni chaqiradi); hamma narsa shu funksiyadan.
- `attendance-credit.ts` — sababli darslar summasi (sof, `applyDiscount` ishlatadi).
- `attendance-overview.ts` — `buildOverview(facts, ...)` hamma blokni bitta hisobdan yig'adi.
- `attendance-stats.service.ts`, `attendance-stats.controller.ts`, `attendance-stats.excel.ts`, `dto/`.

**Yo'llar** (`@Can('reports.students')`, `@BranchScope()` ro'yxat sifatida o'qiladi, bo'sh qamrov 403, kesh yo'q — `// ponytail:` izohi 7b'dagidek):
- `GET /reports/attendance-stats/overview?preset|startDate|endDate&cut&page&pageSize`
- `GET /reports/attendance-stats/missers?cut&key&startDate&endDate&page&pageSize`
- `GET /reports/attendance-stats/excel?...`

**Eski yo'llar olib tashlanadi:** `GET /reports/attendance-analytics`, `attendance-by-group`, `attendance-by-course`, `teacher-performance` (sahifadan boshqa chaqiruvchisi yo'q). `getAttendanceByGroup` va `getAttendanceByCourse` metodlari o'chiriladi; `getAttendanceAnalytics` (bosh sahifa grafigi va moliyaviy Excel chaqiradi) va `getTeacherPerformance` (moliyaviy Excel chaqiradi) o'z holicha qoladi. Marshrut snapshot'idagi qatorlar va `intentional-access-changes.ts` mos ravishda yangilanadi (snapshot faqat qo'lda tahrirlanadi, prettier ishlatilmaydi).

## 7. Klient

`client/src/components/reports/attendance/` — eski fayllar (filtr paneli, KPI kartalari, diagnostika, ikki o'qli trend, doira, hafta grafigi, reyting yorliqlari, jadvallar, `metric-helpers.ts`) o'chiriladi; `metric-helpers.ts` va `KPI_TOOLTIPS`ning davomatga oid qismlarini boshqa sahifalar ishlatmasligi grep bilan tekshiriladi. Yangi fayllar: sahifa, kartalar, oylar+hafta, sababli blok, jadval (kesim tugmalari), «ko'p qoldiruvchi» oynasi, ogohlantirish, queries, types, url, format (sof, vitest bilan).

URL kalitlari: `preset`, `startDate`, `endDate`, `cut` (`group|teacher|course`), `page`, `pageSize` (`att_` old qo'shimchasi yo'qoladi). Sahifa bitta so'rov (`overview`) qiladi; mijoz hech narsa hisoblamaydi. Davr tugmalari 7a'dagi bilan bir xil (`cleanPreset`, `isoDay`, `parseDay` qayta ishlatiladi). Matn faqat lotin o'zbekchasida.

## 8. Ruxsat va filial

`reports.students` (Direktor va CEO); marshrut sozlamasi eski yo'llarniki bilan bir xil. Sahifaning o'z filial tanlovi (`att_branchId`) olib tashlanadi — hisobot tepadagi filial tanlovini kuzatadi (qamrov). Boshqa filial direktori faqat o'z filialini ko'radi.

## 9. Excel

To'rt varaq: **Umumiy** (karta raqamlari, oldingi davr bilan), **Oylar** (oy, foiz, to'rt belgi), **Kesim** (guruhlar, ustozlar, kurslar; eng kam yozuv qoidasi qo'llanmaydi, hamma qator), **O'quvchilar** (3 va undan ko'p qoldirganlar: o'quvchi, guruh, kelmadi, jami). Raqamlar raqam sifatida yoziladi, matn lotinda. Excel va sahifa bir xil `buildOverview` natijasini o'qiydi.

## 10. Testlar

- **Parite:** to'liq oy uchun karta belgilari yig'indisi = hafta kunlari yig'indisi = guruhlar kesimi yig'indisi = ustozlar kesimi yig'indisi = kurslar kesimi yig'indisi; oylar ustunidagi shu oy = karta.
- Markaz bekor qilgan dars («Sababli»ga ham, foizga ham kirmaydi), maxraj 0 → `null`, o'chirilgan guruh o'tgan oyda sanaladi, eng kam yozuv chegarasi (yashirin qator umumiyga kiradi), hafta kuni Toshkent kuni bo'yicha, davr chegarasi eksklyuziv, 2026-05-01 dan oldingi oldingi davr `null`.
- Sababli summa: chegara va chegirmaning qo'llanishi, sozlama o'chiq, hisobi yo'q oy.
- Qamrov: bo'sh qamrov 403 va hech narsa o'qilmaydi; yuklovchi so'rovlari qamrovga bog'langan; marshrut belgisi `routeAccess`/`defaultRolesOf` bilan.
- Bosh sahifa: `getKpis().averageAttendance` shu funksiyadan (bir xil kirishda bir xil son).
- Mijoz: sof format/url/jadval-ajratish testlari; o'zbekcha matn tekshiruvi yangi papkani qamraydi.

## 11. Ma'lum cheklovlar (ADR va qo'llanmaga yoziladi)

- Hech kim belgilamagan dars yozuv bermaydi, shuning uchun foizga kirmaydi; u «Dars bo'ldimi?» orqali hal qilinguncha ko'rinmaydi (ADR-0054).
- Oldindan aytilgan «sababsiz» yo'qlik `EXCUSED` bo'lib saqlanadi va maxrajdan chiqadi, ketma-ket kelmaslik hisobi esa uni kelmagan deb oladi. Sentabrda bunday yozuv yo'q.
- Ustoz va kurs kesimi guruhning **hozirgi** ustozi va kursi bo'yicha; o'rinbosar o'tgan dars guruhning o'z ustoziga yoziladi.
- Bosh sahifaning haftalik grafigi, moliyaviy Excel «Davomat» varag'i va Telegram 21:00 hisoboti o'z ta'rifida qoladi va bu hisobotdan farq qilishi mumkin.
- «Pulga ta'siri» summasi taxminiy (keyingi oy hisobi chiqquncha).

## 12. Joylashtirish

Server va sayt birga chiqariladi (eski yo'llar olib tashlangan). Migratsiya yo'q, skript yo'q. Qo'llanma sahifasi (`davomat.mdx` yoki mavjud sahifa yangilanadi), `yangiliklar.ts` yozuvi va `CLAUDE.md` bo'limlari shu PR'da.

## 13. Qamrovdan tashqari

Bosh sahifaning haftalik grafigi, Telegram 21:00 hisobotidagi davomat qatori, o'quvchi profilidagi davomat yorlig'i, sababli dars chegirmasi qoidasining o'zi (faqat ko'rsatiladi).
