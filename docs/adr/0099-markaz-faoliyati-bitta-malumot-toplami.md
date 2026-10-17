# ADR-0099: Markaz faoliyati — hamma blok bitta ma'lumot to'plamidan, o'tgan oy o'sha oyning holatida

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** spec `docs/superpowers/specs/2026-10-17-b7b-markaz-faoliyati-design.md`, ADR-0097 (7a, bitta ma'lumot to'plami), ADR-0035 (ketganlar), ADR-0002 (filial qamrovi), ADR-0067 (hisobotlar bazasi 2026-05)

## Kontekst

Eski `/reports/activity` (`reports-center-activity.service.ts`, 1147 qator) to'rtta joyda noto'g'ri yoki tushunarsiz javob berardi:

- O'tgan oylarda guruhlar faqat hozirgi holati bo'yicha olinardi (`ACTIVE`/`FORMING`, o'chirilmagan), shuning uchun keyin yopilgan yoki o'chirilgan guruhlar o'tgan oyda yo'qolardi. 15 maydagi 248 faol o'quvchining 225 tasi hozir o'chirilgan guruhlarda turibdi.
- Hafta 7 kun deb hisoblanardi, markaz esa yakshanba ishlamaydi, bandlik past chiqardi.
- «Bo'sh o'rin» xona bo'yicha eng katta guruhdan olinardi (`sig'im − max(o'quvchi)`), bir xonada ikki guruh bo'lsa kartadagi «to'lganlik» bilan mos kelmasdi; ikkita karta bir narsani takrorlardi, «FIK» va «o'rinsoat» tushunarsiz edi.
- «Qachon xona bo'sh» degan savolga (yangi guruh uchun asosiy savol) sahifada javob yo'q edi.

## Qaror

1. **Bitta ma'lumot to'plami.** `reports/center-activity/` modulida `CenterFactsLoader` tanlangan oyning oxirigacha bo'lgan faktlarni bir marta o'qiydi (`CenterFacts`), sof `evaluateCenter` har oy uchun xotirada `asOf` holatini hisoblaydi, `buildOverview` hamma blokni (kartalar, issiqlik jadvali, xonalar, guruhlar, oylar) bitta natijadan yig'adi. Kartadagi raqam jadvallar yig'indisiga teng bo'lishi parite testi bilan kafolatlanadi.
2. **`asOf`.** O'tgan oy uchun oyning oxiri (`tashkentMonthRangeUtc(oy).lt − 1 ms`), joriy oy uchun hozir. Guruh `asOf` da ochiq: `max(createdAt, startDate) ≤ asOf`, `endDate` yo'q yoki `asOf ≤ endDate`, `deletedAt` yo'q yoki `asOf < deletedAt`, va `StatusHistory` bo'yicha holat `ACTIVE` yoki `FORMING` (yozuv yo'q bo'lsa `createdAt` dan `ACTIVE`). Shuning uchun keyin yopilgan yoki o'chirilgan guruh o'tgan oyda hisobga kiradi; yuklovchi `deletedAt` bo'yicha filtrlamaydi. Sig'im, jadval va kurs narxi shu kundagi snapshotdan olinadi (snapshot bo'lmasa hozirgi qiymat).
3. **Hafta du–sha (6 kun)**, ish vaqti filial sozlamasidan (`startOfWorkingDay`/`endOfWorkingDay`); berilmagan yoki noto'g'ri bo'lsa 09:00–21:00. Bayram kunlari odatiy haftani o'zgartirmaydi, shuning uchun hisobga kirmaydi.
4. **Dars soati.** Xonadagi ochiq guruhlarning dars oraliqlari 30 daqiqalik bo'laklar to'plami sifatida olinadi (bir xonada ikki guruh bir vaqtda bo'lsa bir marta sanaladi) va ish vaqti oynasiga qirqiladi, shuning uchun bandlik 100% dan oshmaydi. Bandlik = dars soati / ish soati (kunlik ish vaqti × 6).
5. **O'rin guruh bo'yicha.** To'lganlik = `Σ min(o'quvchi, sig'im) / Σ sig'im`, bo'sh o'rin = `Σ max(0, sig'im − o'quvchi)`; xonasi va sig'imi bor ochiq guruhlar. Sig'imdan oshgan guruh to'la hisoblanadi.
6. **Tushum taxmini.** «To'lsa, oyiga taxminan X» = `Σ bo'sh o'rin × kurs oylik narxi`, faqat oylik to'lovli kurslar (`paymentModel = MONTHLY`), shu kundagi narx.
7. **Server.** Eski `GET /reports/center-activity` olib tashlandi (shuningdek `ReportsCenterActivityService`, `getCenterActivity` fasadi). Yangi: `GET /reports/center-activity/overview` va `/excel`, ikkalasi `@Can('reports.students')` (CEO va filial direktori), `@BranchScope()` ro'yxat sifatida o'qiladi, bo'sh qamrov 403. `oy` — 2026-05 dan joriy Toshkent oyigacha. Kesh yo'q (`// ponytail:` izohi: kalit kompaniya + filial + oy, Redis; kuchli yuklanishda).
8. **Sig'im tahriri** bu sahifadan olib tashlandi; u Sozlamalar → Xonalar'da qoladi (`settings.reference`).

## Ko'rib chiqilgan muqobillar

- **Eski mantiqni tuzatib qoldirish** — 1147 qatorli xizmatda har blok o'z hisobini yuritardi, kartalar jadvalga mos kelmasdi; rad etildi.
- **O'chirilgan guruhlarni o'tgan oylardan chiqarib tashlash** — o'sha oyda dars o'tgan, xonalar band bo'lgan; CEO qarori 17.10.2026: hisobga olinadi.
- **Bayram kunlarini haftadan ayirish** — bitta xonaning odatiy jadvalini o'zgartirmaydi va bandlikni sun'iy pasaytiradi; rad etildi.

## Oqibatlari

- Hisobotning raqamlari bitta `evaluateCenter` natijasidan; yangi blok qo'shish shu natijani o'qiydi, o'z hisobini yozmaydi.
- Moliyaviy Excel'ning «Xonalar bandligi» va «Guruhlar to'ldirilishi» varaqlari (`getRoomUtilization`, `reports-excel.operational-sheets.ts`) o'z ta'rifida qoladi va bu hisobotdagi raqamlardan farq qilishi mumkin.
- `rooms.service.ts` kesh o'chirishdan `reports:center-activity:*` andozasi olib tashlandi; `reports:room-util:*` qoladi.

## Ma'lum cheklovlar

- **Guruhning xona tarixi yozilmaydi** (`GroupScheduleSnapshot`da xona yo'q): har kunda `Group.roomId` ning hozirgi qiymati olinadi, xona almashtirgan guruh o'tgan oylarda hozirgi xonasida chiqadi. Xonasi yo'q guruh soatga ham, o'ringa ham kirmaydi.
- **Xona holati tarixi yo'q.** O'tgan oy uchun faqat mavjudlik (`createdAt`/`deletedAt`) tekshiriladi; joriy oyda qo'shimcha `status = ACTIVE`. Shu sababli oylar ustunlarida o'tgan oylar hozirgi xonalar ro'yxatining mavjudlik qoidasi bilan hisoblanadi.
- **Snapshot bo'lmasa hozirgi qiymat** olinadi (sig'im, jadval, kurs narxi: eski, to'ldirilmagan ma'lumot uchun).
- **`endDate` kuni** guruh oy oxiri soniyasida yopiq hisoblanadi; `Group.startDate` lahza sifatida solishtiriladi, bu faqat joriy oy ko'rinishida guruhning birinchi kunida Toshkent 00:00–05:00 oralig'iga ta'sir qiladi.
- **Filial kaskadi `StatusHistory` yozmaydi.** Filial YOPILGAN/ARXIVLANGAN yoki kurs ARXIVLANGANda (va filialni pauza qilish kaskadida) `StatusCascadeService` `Group.statusEnum` ni o'zgartiradi, lekin faqat `EntityHistory` qatorini yozadi, `StatusHistory` qatorini emas. Yuklovchining guruh holati tarixi bu o'zgarishni ko'rmaydi: bunday guruh o'tgan va joriy ko'rinishlarda hamon ochiq ko'rinadi, vaholanki yozilishlari yopilgan (shuning uchun u 0 to'lgan o'rin bilan chiqadi).
- **Arxivdan tiklash `deletedAt` ni tozalaydi**, shu bilan guruhning yopiq oynasi ham yo'qoladi.
- **`filial` tanlagich faqat issiqlik jadvalini o'zgartiradi**; kartalar va jadvallar doim butun qamrovni qamraydi. Tanlangan oyda xonasi yo'q filial birinchi filialning issiqlik jadvaliga qaytadi.
- **Excel (`/excel`)** kartalar blokiga ega emas va `?filial` ni hisobga olmaydi.
- **Xonasi bor, sig'imi yo'q guruh** «xonasiz/sig'imsiz» izohida sanaladi va o'rinlarga kirmaydi; xonalar jadvalidagi `RoomResult.groupCount` uni o'z ichiga oladi.
