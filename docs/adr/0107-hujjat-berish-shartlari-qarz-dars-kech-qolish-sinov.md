# ADR-0107 — Hujjat berish shartlari: qarz, eng kam dars, kech qolish, yakuniy sinov

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0100 (qatnashganlik hujjati: shu ADR uning qoidasini kengaytiradi, o'zgartirmaydi), ADR-0104 (bekor qilish), ADR-0028 (huquq bazadan o'qiladi), `server/src/participation-certificates/participation-rules.ts`

## Kontekst

Ishlab chiqarishda berilgan yagona hujjatda `davomat: { attended: 1, counted: 1, percent: 100 }` va `ilova: { open: 0, applies: false }` bor edi: bitta dars qatnashgan o'quvchi 100% oldi, ilova sharti esa A1 da ochiq dars yo'qligi uchun o'tkazib yuborildi. CEO (2026-10-17): hujjat berishdagi shartlar haqiqiy bo'lsin. Shartlardan birortasi bajarilmasa, hujjat to'xtaydi: ko'rinishda sabab chiqadi, administrator bera olmaydi, faqat CEO yozma sabab bilan istisno beradi (ADR-0100 yo'li o'zgarmaydi).

## Qaror

ADR-0100 ning 1-bandidagi davomat va ilova shartlari o'z holicha qoladi. Ularga to'rt shart qo'shiladi; hammasi o'sha bitta joyda, `participation-rules.ts` dagi `evaluate` da hal qilinadi (ko'rinish, berish yo'li va PDF shu natijani o'qiydi; mijoz hech narsani qayta hisoblamaydi).

1. **Qarz yo'q.** `Student.balance < 0` bo'lsa, hujjat berilmaydi. Hech qanday chegara yo'q (CEO: har qanday qarz to'xtatadi). Sabab matni: «Qarzi bor: N so'm».
2. **Eng kam dars.** Sanalgan darslar (`counted` = kelgan + kelmagan, ADR-0100 dagi hisob o'zgarmaydi) `participation.minLessons` dan kam bo'lmasin. Standart 20, butun son, 1–200.
3. **Kech qolish chegarasi.** `late × 100 > maxLatePercent × attended` bo'lsa, to'xtaydi: kech qolgan darslar o'quvchi kelgan darslarning `participation.maxLatePercent` foizidan oshmasin. Standart 20, butun son, 0–100. Hamma taqqoslash butun sonlarda (davomat foizi kabi, yaxlitlangan qiymat bilan emas); `attended = 0` bo'lsa nolga bo'lish yo'q va shart o'tadi (davomat sharti o'zi bajarilmaydi). Ekranda chiqadigan foiz yuqoriga yaxlitlanadi, shunda to'xtagan o'quvchi uchun «20%, ruxsat 20%» deb yozilmaydi.
4. **Yakuniy sinovlar.** Darajada ochiq yakuniy sinovlar bo'lsa (`unitTests.total > 0`), hammasi topshirilgan bo'lishi kerak (`passed === total`). Darajada sinov bo'lmasa, shart o'tkazib yuboriladi (ilova sharti bilan bir falsafa: yo'q narsani talab qilib bo'lmaydi). Mock imtihon hamon faqat ma'lumot.
5. **Ilova sharti o'zgarmaydi**: ochiq dars yo'q darajada o'tkazib yuboriladi.
6. **Istisno yo'li o'zgarmaydi**: har qanday bajarilmagan shart uchun faqat CEO sabab yozib bera oladi; `exempt` hukm «berish mumkin emas» bo'lganda yoziladi.

**Sozlamalar.** Ikki yangi kompaniya darajasidagi, faqat CEO yozadigan kalit `Setting` jadvalida (yangi migratsiya yo'q): `participation.minLessons`, `participation.maxLatePercent`. Ular mavjud chegaralar bilan bitta `setMany` tranzaksiyasida yoziladi; `PATCH /participation-certificates/settings` qisman yangilashga yo'l qo'yadi.

**Muhrlangan hujjat.** `snapshot.thresholds` ga yangi ikki chegara qo'shiladi (berilgan paytdagi kuchda bo'lgani). Ular turda ixtiyoriy: bu qarordan oldin berilgan hujjatlarda yo'q va ular o'zgarishsiz chiziladi hamda tekshiriladi. Qarz va balans snapshotga YOZILMAYDI (jonli pul, hujjat ma'lumoti emas). PDF maketi o'zgarmaydi: hujjatda qarz qatori yo'q, kech qolish, mock va yakuniy sinovlar avvalgidek ma'lumot qatori.

**Ma'lumot manbalari.** Balans `ParticipationFactsService` da o'quvchi o'qilgan o'sha so'rovda olinadi (`companyId` bo'yicha, arxivlanmagan). Yakuniy sinovlar sanog'i avvaldan yuklanardi (`unitTests`), qo'shimcha so'rov yo'q. Ko'rinish javobiga `balance` va hukmga `debtOk`, `lessonsOk`, `lateOk`, `latePercent`, `testsOk` qo'shiladi.

## Ko'rib chiqilgan muqobillar

- Qarz uchun kechiriladigan chegara (masalan, 100 000 so'mgacha): CEO rad etdi, har qanday qarz to'xtatadi.
- Kech qolishni umumiy darslar soniga nisbatan olish: kelmagan o'quvchi kech qolgan bo'lolmaydi, shuning uchun maxraj kelgan darslar.
- Balansni snapshotga yozish: hujjat «shu kuni qarz yo'q edi» deb o'zgarmas tasdiq bo'lib qolardi, vaholanki bu pul holati, qatnashish dalili emas.
- Yangi shartlarni mijozda hisoblash: ADR-0100 ning «bitta hisob joyi» qoidasini buzardi.

## Oqibatlari

Yutuq: bitta dars bilan hujjat olib bo'lmaydi; qarz, kech qolish va sinov holati ko'rinishda sabab bilan chiqadi; CEO chegaralarni deploysiz o'zgartiradi. Narx: ilgari berish mumkin bo'lgan o'quvchilar (kam dars, qarz) endi CEO istisnosini kutadi; yakuniy sinov sharti ilova faqat A1 uchun ochiq bo'lgani sababli hozir faqat shu darajada ishlaydi; qarz jonli balansdan o'qiladi, shuning uchun to'lov qilingandan keyin ko'rinish darhol o'zgaradi.
