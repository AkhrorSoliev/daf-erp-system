# ADR-0116 — DaF haftalik liga: faqat ko'tarilish, doimiy daraja va haftalik xona, takrorlanuvchi hafta hisobi

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** `docs/superpowers/specs/2026-10-18-musobaqa-s3-liga-design.md`, ADR-0114, ADR-0115, `server/src/daf/liga/`

## Kontekst

S1 haftalik markaz va guruh jadvalini berdi, S2 shaxsiy o'sishni (kunlik maqsad, nishonlar). Bugun haftasiga 30–51 faol o'quvchi, reklamadan keyin 1 000–2 000 kutiladi: bitta markaz jadvalida yangi o'quvchi yuzlab o'rinda turadi va bellashuvni sezmaydi. CEO (2026-10-18): liga darajali va **faqat ko'tarilish** (hech kim tushmaydi); guruhlar bellashuvi — haftalik guruhlar jadvali; ko'tarilish faqat xona yetarlicha to'lgan bo'lsa, xonalar teng bo'linadi. Musobaqa tizimi jazosiz (06.09 dizayni).

## Qaror

1. **Besh daraja, doimiy:** Bronza → Kumush → Oltin → Yoqut → Olmos. `DafStudentLeague` — o'quvchiga bitta qator, faqat o'sadi (`GREATEST`), qator yo'q = Bronza; migratsiyada hech narsa to'ldirilmaydi. Tushish yo'q; mashq qilinmagan hafta darajani saqlaydi.
2. **Xona haftalik:** `DafLeagueRoom` + `DafLeagueEntry`, o'quvchi haftada bitta xonada (`@@unique([weekStart, studentId])`). Sig'im 30, maqsad 25. Dushanba: o'tgan hafta ≥ 1 ball topganlar o'z darajasida `ceil(n / 25)` xonaga teng, `hash(studentId, weekStart)` tartibida. Hafta ichida (birinchi seans oxirida): a'zosi eng kam xona, hammasi 30 bo'lsa yangi. Liga filialga cheklanmaydi (06.09 §6.1).
3. **Ko'tarilish:** xonaning birinchi 5 tasi, kamida 50 ball, xonada kamida 15 a'zo; Olmosda yo'q. Saralash ball ↓, teng bo'lsa `studentId` ↑. Ball — `DafStudentDay` haftalik yig'indisi (hamma `groupKey`); a'zolikda hafta davomida ball saqlanmaydi, hisobda `place`/`points`/`promoted` bir marta yoziladi.
4. **Hafta hisobi (`settleWeek`) takrorlanuvchi va o'zini tuzatadi:** xona `UPDATE … WHERE "settledAt" IS NULL RETURNING` bilan olinadi (ikkinchi chaqiruv hech narsa olmaydi); har kompaniya bitta tranzaksiya. Cron dushanba 00:05 Toshkent; cron o'tkazib yuborgan hafta birinchi seans oxirida `settleDue` bilan eng eskisidan boshlab hisoblanadi (faqat eski hisoblanmagan hafta bor bo'lganda chaqiriladi).
5. **Qulf tartibi.** `settleWeek` kompaniya advisory qulfini (`LIGA_HISOB_KALIT`) **ajratib (exclusive)** oladi: cron kutadi (`kutish: true`), seans oxiridagi yo'l `pg_try_advisory_xact_lock` bilan (band bo'lsa o'tkazib yuboradi). `joinRoom` shu qulfni **umumiy (shared)** oladi, keyin daraja bo'yicha xona qulfini ajratib. Shuning uchun hisob paytida hech kim xonaga qo'shilmaydi, hisobdan keyin qo'shilgan o'quvchi yangi darajasidan tushadi. `joinRoom` tranzaksiyasining **birinchi so'rovi** `set_config('lock_timeout', '2s', true)` (`SET LOCAL`, qoldiq qoldirmaydi): vaqt tugasa tranzaksiya qaytariladi (yarim holat yo'q), xatoni seans oxirining xavfsiz o'rami ushlaydi, `natija` saqlanadi va o'quvchi **keyingi seans oxirida** qo'shiladi. Sababi o'lchov: sun'iy sekin hisob (qulf 22 s ushlab turildi) `lock_timeout` dan oldin 40 qo'shilishni 20 s gacha ushladi va pool'ning 10 ulanishini band qildi; undan keyin qo'shilishlar 2 s da to'xtadi, eng sekini pool to'lqinida 6,1 s (oldin 20,3 s).
6. **Guruhlar jadvali:** guruhning hozirgi **faol** a'zolari shu hafta shu guruh uchun (`groupKey`) topgan ball ÷ a'zolar soni (guruhlar reytingi bilan bir xil ball hisobi); faol guruh, kamida 3 a'zo; baho ↓, teng bo'lsa guruh id ↑. TOP 10 + o'z guruhi. Jonli jadval o'qishda hisoblanadi, hafta natijasi `DafGroupWeek` ga `settleWeek` tomonidan bir marta yoziladi.
7. **Yagona yozuvchi:** to'rt jadvalni faqat `daf/liga/liga-xona.ts` (`joinRoom`) va `liga-hisob.ts` (`settleWeek`) yozadi; `liga.single-source.spec.ts` `src/` va `scripts/` ni tekshiradi (sinov bazasi seedi — nomi bilan, faqat `DafStudentLeague`). `GET liga`, `GET guruhlar` hech narsa yozmaydi. Marshrutlar SELF (`branch-route-policy.ts`).
8. **Nishonlar** `LIGA_KUMUSH/OLTIN/YOQUT/OLMOS`, `XONA_GOLIB`, `GURUH_BIRINCHI` — S2 katalogiga, holatdan (hodisadan emas), S2 `grantBadges` orqali, seans oxirida (ADR-0115 qoidasi); liga holati seans oxirining birinchi bosqichida bitta so'rov.

## Ko'rib chiqilgan muqobillar

- **Tushish (Duolingo kabi)** — jazo; CEO rad etdi.
- **Bitta markaz jadvali yoki filial ligalari** — yangi o'quvchi bellashuvni sezmaydi / filialda kam odam. Rad.
- **Xona balini a'zolikda hafta davomida yuritish** — har javobda qo'shimcha yozuv va ikkinchi manba (`DafStudentDay` bilan farqlanishi mumkin). Rad: 30 kishilik xona har o'qishda yig'iladi.
- **Har xonada ko'tarilish (hajmidan qat'i nazar)** — kam faolda 3 kishilik xonadan avtomatik ko'tarilish; liga sun'iy bo'ladi. Rad: ≥ 15.
- **Xonalarni `SELECT … FOR UPDATE` bilan qulflash** — xona hali yo'q bo'lganda qulflanadigan qator yo'q. Advisory qulf tanlandi.
- **Guruh bahosi = yig'indi** — katta guruh har doim yutadi. O'rtacha tanlandi; 1–2 kishilik guruh chiqmaydi.
- **`joinRoom` da 60 s lik kutish chegarasi (dastlabki reja)** — o'lchovda hisob ushlanganda seans oxirini va pool'dagi hamma o'qishni shuncha ushlab turardi. Rad: 2 s `lock_timeout`, kutilgan o'quvchi keyingi seans oxirida qo'shiladi.
- **Guruhlar jadvalini har o'qishda `DafGroupWeek` dan olish** — joriy hafta hali yozilmagan. Rad: jonli hisob + hafta oxirida bir marta saqlash.

## Oqibatlar

- **Deploy:** migratsiya `20261018240000_daf_league_and_group_week` → kod. Deploy haftasida oldingi xonalar yo'q — hamma birinchi seansda hafta ichidagi qoida bilan qo'shiladi (teng bo'linish kafolatlanmaydi). Ko'tarilishlar birinchi marta deploydan keyingi dushanba; o'sha kuni loglarda cron qatori («Liga hisobi: kompaniya …, … guruh yozildi»), `DafLeagueRoom.settledAt` va `DafGroupWeek` satrlari tekshiriladi. Bootstrap skripti yo'q.
- Daraja faqat o'sadi: yuqori ligalar to'lishi mumkin — daraja qo'shish yangi ADR bilan.
- **Yuklama natijalari** (spec §11; 12 000 o'quvchi, 5 000 tasida daraja, 150 xona / 4 500 a'zo, 520 faol guruh, 50 parallel o'quvchi, Prisma pool 10 ulanish; ikki o'lchov):
  - `settleWeek`, bir kompaniya, 5 000 o'quvchi: **381–451 ms, 27 ta SQL** bitta tranzaksiyada (har xona yoki o'quvchi uchun alohida so'rov yo'q, 1 000 qatorli bo'laklar); 600 ko'tarildi, daraja tushgan 0; brute force bilan farq 0; ikkinchi hisob hech narsa o'zgartirmadi; 50 parallel `settleDue` dan bittasi hisobladi.
  - p95 (chegara 200 ms, `seansNatijasi` 300): `GET liga` 15 / 15 (xonada 14 / 17), `GET guruhlar` 163 / 165 (DUE kohorti 165 / 169), `seansNatijasi` aralash 110 / 109, xonaga birinchi qo'shilish 149 / 149. S1/S2 yo'llariga ta'siri bilinmaydi (`uebersicht` 137–138, S2 da 171–186).
  - `guruhlar` birinchi o'lchovda 338–343 ms edi: hafta qatorlari avval a'zolarga qo'shilib keyin yig'ilardi. Qatorlar avval (o'quvchi, guruh) bo'yicha yig'ilib, keyin a'zolarga qo'shildi: **338 → 163–169 ms p95**, natija qator-qatorga bir xil (3 hafta, 520 guruh). Chegaragacha zaxira shu yo'lda eng tor; kamaysa `(companyId, day)` + `(studentId, groupKey, points)` qamrab oluvchi indeks yoki kunlik kesh.
- **Ma'lum cheklovlar (qabul qilingan):**
  1. Cron ≥ 2 dushanbani o'tkazib yuborsa, parallel `joinRoom` ko'tarilgan o'quvchini eski daraja xonasiga qo'yishi mumkin (kam uchraydi). Keyingi qadam: eski hisoblanmagan hafta bor bo'lsa `joinRoom` o'tkazib yuboradi.
  2. Dushanba 00:00–00:05 orasidagi birinchi seans oxiri hisob tugashini kutadi (≈ 0,5 s; hisob uzoq cho'zilsa 2 s dan keyin qo'shilish keyingi seansga qoladi).
  3. Hisob doimiy yiqilsa, har seans oxirida qayta uriniladi (sovitish yo'q).
  4. A'zolar so'rovi o'chirilgan yozilishlarni (soft-delete) chiqarmaydi — mavjud guruhlar reytingi bilan bir xil (ledger izohi); guruhdan ketgan o'quvchining shu haftadagi bali guruh bahosiga kirmaydi.
  5. `fortschritt.service.ts` 704 qator — alohida bo'lish keyingi qadam.
  6. Yo'l tepasidagi kubok belgisi **markaz** o'rnini ko'rsatadi, lekin Liga tabini ochadi; liga o'rnini belgi va `natija` ga chiqarish S4 da hal qilinadi.
  7. Deploy haftasida teng bo'linish va ko'tarilish yo'q (yuqorida).
