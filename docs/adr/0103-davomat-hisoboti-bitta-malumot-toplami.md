# ADR-0103: Davomat hisoboti — hamma blok bitta yozuvlar to'plamidan, foiz bitta funksiyadan

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** spec `docs/superpowers/specs/2026-10-17-b7c-davomat-design.md`, ADR-0098 (7a, bitta ma'lumot to'plami), ADR-0099 (7b), ADR-0054 («Dars bo'ldimi?»), ADR-0053 (bekor qilingan dars puli), ADR-0067 (hisobotlar bazasi 2026-05), ADR-0002 (filial qamrovi)

## Kontekst

Eski `/reports/attendance` (`reports-attendance-analytics.service.ts`, 1078 qator) ishonchsiz edi:

- Umumiy foiz jadvallar yig'indisiga mos kelmasdi: umumiy hisob hamma guruhni, guruhlar jadvali faol/shakllanayotgan/tugagan guruhlarni, kurslar jadvali hamma guruhni, ustozlar jadvali faqat faol va shakllanayotganlarni olardi.
- Markaz bekor qilgan darslar (`EXCUSED` + `cancellationId`) «Sababli» ichiga aralashardi.
- Bosh sahifadagi davomat boshqa kodda hisoblanardi (`getKpis`) va hisobotdan farq qilishi mumkin edi.
- Bo'sh davr 0% bo'lib chizilardi; 1–2 o'quvchili guruhning bitta kelmasligi 50% berib, ro'yxat boshiga chiqardi.

## Qaror

1. **Manba — `Attendance` yozuvlari**, bir yozuv = bir o'quvchi, bir guruh, bir kun. `AttendanceFactsLoader` davr, oldingi davr va oylar ustunining eng erta kunidan oxirigacha yozuvlarni BIR marta o'qiydi (`groupBranchWhere` qamrovi bilan); o'chirilgan va yopilgan guruhlar ATAYLAB o'qiladi.
2. **Holatlar:** Keldi = `PRESENT`, Kechikdi = `LATE`, Kelmadi = `ABSENT`, Sababli = `EXCUSED` va `cancellationId` yo'q, Markaz bekor qildi = `cancellationId` bor. Oxirgi ikkitasi hech bir foizga kirmaydi.
3. **Foiz** = (Keldi + Kechikdi) ÷ (Keldi + Kechikdi + Kelmadi), bir kasr (`round1`); maxraj 0 bo'lsa `null` («—»). Yagona ta'rif — `reports/attendance-stats/attendance-counts.ts` (`countRows`, `rateOf`); karta, oylar, hafta kunlari, uch kesim, Excel va bosh sahifa shu funksiyadan.
4. **Davr:** 7a'ning tugmalari (`startDate`/`endDate`), eng erta kun 2026-05-01 (oldingisi 400). Oldingi davr: to'liq oy → oldingi oy, aks holda shu uzunlikdagi oldingi davr; 2026-05-01 dan oldin boshlansa `null`. Oylar ustuni: maydan davr oxirgi oyigacha, ko'pi bilan 6 ta, har biri to'liq kalendar oyi. Hafta kuni — yozuv sanasining kalendar kuni; yakshanba faqat yozuvi bo'lsa.
5. **Kesimlar:** guruh («A1-04 · Ustoz», o'chirilgan belgisi bilan), ustoz (guruhning hozirgi ustozi; bir nechta bo'lsa ism bo'yicha birinchisi; ustozsiz guruhlar «Ustozsiz»), kurs (guruhning hozirgi kursi). Qator ro'yxatda chiqishi uchun `ceil(60 × kun / 30)` yozuv kerak (kun bugungacha sanaladi); yashirin qatorlar umumiy sonlarga baribir kiradi — kesimlar yig'indisi umumiyga teng (parite testi). Kesim server tomonda sahifalanadi (10–50).
6. **Ko'p qoldiruvchi:** davrda bir guruhda 3+ `ABSENT` yozuvi bo'lgan (o'quvchi, guruh) juftliklari; qatordagi son — alohida o'quvchilar; ro'yxat `GET /reports/attendance-stats/missers` dan (o'quvchi, guruh, kelmadi, jami = Keldi + Kechikdi + Kelmadi).
7. **Sababli darslar puli (taxmin):** oylik kurs guruhlaridagi Sababli yozuvlar; har (o'quvchi, guruh, oy) uchun o'sha oyning `CHARGED` hisobidan `min(soni, payment.excusedCreditMonthlyCap) × applyDiscount(perLessonCost, discountPercent)`; sozlama guruh filialiniki; `payment.excusedCreditEnabled` o'chiq filial summaga kirmaydi; hisobi yo'q oy faqat sonni beradi.
8. **Ketma-ket kelmayotganlar:** `AbsenceStreakService.computeStreaks` (chegara 3, qamrov) — bugungi holat, alohida o'quvchilar soni.
9. **Bosh sahifa:** `getKpis().averageAttendance` = `rateOf(countRows(…))` joriy Toshkent oyi 1-kunidan bugungacha, tanlangan filial; bir kasr yoki `null`; sahifa butun songa yaxlitlaydi.
10. **Yo'llar:** `GET /reports/attendance-stats/overview|missers|excel`, `reports.students`, `@BranchScope()` ro'yxat sifatida, bo'sh qamrov 403. Eski `attendance-analytics`, `attendance-by-group`, `attendance-by-course`, `teacher-performance` olib tashlandi; `getAttendanceAnalytics` (bosh sahifa haftalik grafigi, moliyaviy Excel) va `getTeacherPerformance` (moliyaviy Excel) qoldi. Kesh yo'q.

## Ko'rib chiqilgan muqobillar

- **Eski servisni tuzatish** — to'rt xil guruh to'plami bitta faylda; har tuzatish boshqa jadvalni buzardi. Rad.
- **Kesim va sahifalashni mijozda** — mijoz hech narsa hisoblamasin (spec §7); kesim har bosishda serverdan keladi.
- **Ustozni dars kunidagi o'rinbosar bo'yicha** — CEO qarori: guruhning ustozi; hozir ikki ustozli guruh yo'q.

## Oqibatlari

- Kartadagi raqam har qanday davrda hafta kunlari va har kesim yig'indisiga teng; davr aynan bitta to'liq oy bo'lsa, oylar ustunidagi shu oy ham unga teng (ustunlar har doim to'liq kalendar oyi).
- Bosh sahifadagi davomat endi «0%» emas, yozuv bo'lmasa «—»; qiymat hisobotdagi «Bu oy» raqami bilan bir xil.
- Har kesim yoki sahifa bosilganda davr yozuvlari qayta o'qiladi (6 oy ≈ 35 ming qator); sekinlashsa Redis keshi (`// ponytail:`).

## Ma'lum cheklovlar

- Hech kim belgilamagan dars yozuv bermaydi, shuning uchun foizga kirmaydi; u «Dars bo'ldimi?» orqali hal qilinguncha ko'rinmaydi (ADR-0054).
- Oldindan aytilgan «sababsiz» yo'qlik `EXCUSED` bo'lib saqlanadi va maxrajdan chiqadi, ketma-ket kelmaslik hisobi esa uni kelmagan deb oladi.- Ustoz va kurs kesimi guruhning **hozirgi** ustozi va kursi bo'yicha; o'rinbosar o'tgan dars guruhning o'z ustoziga yoziladi; kurs almashgan guruhning o'tgan oylari hozirgi kursida chiqadi.
- Bosh sahifaning haftalik grafigi, moliyaviy Excel «Davomat» varag'i va Telegram 21:00 hisoboti o'z ta'rifida qoladi va bu hisobotdan farq qilishi mumkin.
- «Pulga ta'siri» summasi taxminiy. Sahifa har sababli dars uchun sababli dars bo'lgan oyning O'ZIDAGI hisobning chegirmali bir dars narxini oladi (oyiga `payment.excusedCreditMonthlyCap` dan ko'p emas). Haqiqiy kredit esa keyingi oy hisoblanganda (`monthly-charge.service.ts`, `applyLessonCredit`) KEYINGI hisob oyining bir dars narxi bilan, butun darslarda beriladi va o'sha oy yalpi summasidan oshmaydi (`floor(yalpi ÷ bir dars narxi)`); sig'magan darslar keyingi oyga suriladi. Narx oyma-oy farq qilsa yoki yalpi summa yetmasa, real chegirma sahifadagi summadan farq qiladi. Bir nechta filial ko'rinib, sozlama ba'zisida o'chiq bo'lsa, summa faqat yoqilgan filiallardan.
- Eng kam yozuv qoidasi kalendar kunlariga tayanadi: 31 kunlik to'liq oyda chegara 62, 30 kunlikda 60.
