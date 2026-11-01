# 0144. Dars ustozi dars paytidagi ro'yxatdan olinadi

- Holati: Qabul qilindi
- Sana: 2026-11-01
- Bog'liq: [0069](0069-orinbosar-ustoz-guruh-ustozi-qoidalarida.md) (o'rinbosar ustoz), [0098](0098-ketgan-oquvchilar-hisoboti-bitta-malumot-toplami.md) (to'xtash paytidagi ustoz — xuddi shu qoida), [0137](0137-guruh-almashganda-kun-bir-marta-hisoblanadi.md), [0054](0054-davomat-olinmagan-dars-ustoz-haqisiz.md), `server/src/groups/shared/teachers-on-date.ts`

## Kontekst

Dars puli kimga yozilishini ikki narsa hal qiladi: shu kunga o'rinbosar ustoz (`LessonTeacherOverride`) bo'lsa — u, bo'lmasa guruh ustozi. Guruh ustozi `GroupTeacher` dan o'qilardi, bu esa **bugungi** ro'yxat. Ustoz almashganda eski darslar ham yangi ustozniki bo'lib qolardi.

22.10.2026 da 2-filialning #010 va #011 guruhlarida ustoz 10933 dan 10932 ga almashtirildi. 31.10 dagi oylik hisob-kitob (`computeGapAccruals`) 2–20.10 darslarini 10932 niki deb oldi. 10933 ga ular dars kuni yozilgan edi, lekin "dars qoplanganmi" tekshiruvi ustoz bo'yicha (`attendanceId::userId`), shuning uchun 10932 ga markaz qoplashi yana yozildi: 60 o'quvchi-dars, 794 167 so'm ikki marta. Kech to'lovdagi yozuv (`resolveTeachersForLesson`) ham shu yo'l bilan bitta darsni (13 846) dars bermagan ustozga yozdi.

Prod'dagi 24 710 yozuv bo'yicha: bugungi ro'yxat 356 yozuvda dars paytidagi ustozga mos kelmaydi, yangi qoida — 70 da (61 tasi shu xato, 9 tasi quyida).

## Qaror

1. **Dars paytidagi ro'yxat.** `GroupTeacherHistory` har o'zgarishda butun ro'yxatni oldin/keyin saqlaydi. Dars paytidagi ro'yxat = dars **boshlanganidan keyin** qilingan birinchi o'zgarishning `previousTeacherIds` i; undan keyin o'zgarish bo'lmasa — bugungi `GroupTeacher`. Dars boshlanishi — Toshkent kuni + guruhning `lessonStartTime` i; vaqti yo'q guruhda kunning 00:00 i.
2. **Nega kun emas, boshlanish vaqti.** Jonli yozuv davomat saqlanganda, markaz qoplashi oy oxirida yoziladi; ikkalasi bir ustozni topishi shart. Kun chegarasida o'sha kuni darsdan **keyin** qilingan almashuv oy oxirida darsni yangi ustozga berardi, eski ustozga esa u allaqachon yozilgan — yana ikki marta to'lov.
3. **Bitta joy.** `groups/shared/teachers-on-date.ts`: `teachersAtLesson` (sof qoida), `lessonStartInstant`, `buildTeachersOnDate` + `loadRosterChanges` (hisob-kitoblar uchun), `loadTeachersOnLesson` (bitta dars uchun). Ustoz puli va «Berilmadi» ni hal qiluvchi hamma joy shundan o'qiydi: oylik hisob-kitob (`salary-calculation`), oylik sahifa (`salary-monthly`), markaz qoplashi (`salary-center-topup`), jonli va kech to'lov yozuvi (`lesson-billing`), o'rinbosar qo'yilganda/olinganda qayta yozish (`lesson-teacher-overrides`), «Berilmadi» (`salary-missed-lessons`: endi ustozning avvalgi guruhlari ham, faqat u ustoz bo'lgan darslar), "Dars haqi yozilmadi" xabari.
4. **O'rinbosar ustoz ustun** (ADR-0069 o'zgarmaydi).
5. **Ikkinchi qulf.** `sweepGapLessons` ga majburiy `payeesOf`: davomat ro'yxatda yo'q ustozga allaqachon to'langan bo'lsa, markaz uni qayta qoplamaydi. Ro'yxat va to'lov bir-biriga zid — dars bir marta to'lanadi. Ro'yxatdagi sherik ustoz odatdagidek qoplanadi.
6. **Tarix to'liq yoziladi.**
   - Guruh tahririda tarix qatori ro'yxat bilan **bir tranzaksiyada** va **id lar** bo'yicha yoziladi (avval ismlar solishtirilardi: bir xil ismli ikki ustoz almashsa yozilmasdi; tranzaksiyadan keyingi yozuv yo'qolishi mumkin edi).
   - Ustoz arxivlanganda (`TeachersService.delete`) har guruhga `REMOVED` qatori yoziladi (oldingi va keyingi to'liq ro'yxat, `triggeredByDismissal`). Aks holda keyingi o'zgarishning `previousTeacherIds` i bo'sh bo'lib, undan oldingi darslar "ustozsiz" o'qilardi.

## Oqibatlar

- Ustoz oy o'rtasida almashsa, oy oxiridagi hisob-kitob eski darslarni yangi ustozga yozmaydi; kech to'lov darsni o'sha dars paytidagi ustozga yozadi.
- **Ish tartibi o'zgaradi.** Yangi ustoz darsga avvalroq kirib, ro'yxat kechroq almashtirilsa, oraliqdagi darslar avtomatik yangi ustozga yozilmaydi — ular uchun o'rinbosar (`LessonTeacherOverride`) qo'yiladi. Oy o'rtasida qo'shilgan sherik ustoz ham qo'shilgan paytdan oldingi darslar uchun qoplanmaydi.
- **Hisobotlar.** Ustoz arxivlanganda yozilgan `REMOVED` qatorlar «Ustoz almashuvi» hisobotida va ustoz taymlaynida ko'rinadi (bu haqiqiy o'zgarish; `triggeredByDismissal` bilan). «Ustoz almashgandan keyin ketganlar» kartasi bir ketishni bir marta sanaydi (`counted`), o'zgarishlar soni esa ko'payadi.
- **Eski ma'lumot o'zi tuzalmaydi.** #010/#011 dagi 60 ta ortiqcha yozuv va 13 846 so'mlik yozuv alohida tuzatiladi (qaysi ustoz dars bergani CEO tomonidan tasdiqlangach). Bu qaror yopilgan davrlarga tegmaydi.
- **Ma'lum chegaralar.**
  - Bu qarordan oldin arxivlash tarix yozmagan: o'shanda ro'yxatdan chiqarilgan ustozning darslari uchun qoida bo'sh ro'yxat qaytarishi mumkin (prod: #007 1-filial, may, 6 yozuv; yopilgan davr).
  - Ko'chirilgan (`LessonReschedule`) darsning o'z vaqti emas, guruh vaqti olinadi; guruh vaqti keyin o'zgarsa chegara siljiydi. Faqat ustoz aynan o'sha kuni almashsa ahamiyatli.
  - Bir odamning ikki akkaunti (#068, 11134 → 11184) qoida bo'yicha ikki ustoz.
- **Narx.** Hisob-kitob butun `GroupTeacherHistory` ni o'qiydi (har o'zgarishga bitta qator). Bitta dars uchun ikki qo'shimcha kichik so'rov (guruh vaqti, tarix).
