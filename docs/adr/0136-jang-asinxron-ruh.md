# 0136. Jang: asinxron «ruh» raqib va ochiq Dafi bot, liga ballisiz

- Holati: Qabul qilindi
- Sana: 2026-10-27
- Bog'liq: spec `docs/superpowers/specs/2026-10-27-jang-asinxron-ruh-design.md`, [0116](0116-daf-liga-faqat-kotarilish-haftalik-xona.md) (liga), [0115](0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md) (nishon), `server/src/daf/jang/`

## Kontekst

O'quvchilar o'rtasida qisqa bellashuv («jang») kerak. Muammo: prodda 516 faol o'quvchi, kuniga mashq qiladigani 30–50 kishi, shuning uchun bir vaqtda onlayn juft topish ehtimoli past — jonli duelda o'quvchi ko'pincha kutib qolardi.

## Qaror

1. **Raqib bir paytda onlayn emas.** Raqib — boshqa o'quvchining avvalgi TUGAGAN jangida berilgan javoblari («ruh»). Mos ruh topilmasa raqib **Dafi bot**: u ochiq «Dafi bot» deb ko'rsatiladi, yasama odam ismi bilan chiqmaydi. Har o'quvchi doim ruh bo'la oladi, o'chirish tugmasi yo'q (CEO). **Dafi bot raqamlari** (`dafi-bot.ts`): har savolda to'g'ri javob ehtimoli o'quvchining kuchiga teng, lekin 0,6–0,75 oralig'iga qisiladi; javob vaqti 3–9 soniya orasida tasodifiy; natija jang boshida bir marta hisoblanib `botAnswers` da saqlanadi va jang davomida o'zgarmaydi.
2. **Ruh qoidalari.** Ruh bitta tugagan jang: o'quvchi uning 6 savolini aynan o'sha tartibda oladi. Shartlar: savollar o'quvchi o'tgan unitlarning `APPROVED` savollari va oxirgi 3 kunda ko'rilmagan; ruh egasi bilan 7 kundan beri uchrashmagan; oxirgi 10 jangdagi kuch ±15 % ichida (3 tadan kam jangda kuch 60 %). Filial cheklovi yo'q (markaz reytingi kabi). **Nomzodlar oynasi:** oxirgi `TARIX_KUN` = 30 kundagi tugagan janglardan eng yangi `RUH_NOMZOD_LIMIT` = 300 tasi ko'riladi (masshtab chegarasi: markaz o'ssa tanlash SQL filtrga o'tkazilishi kerak).
3. **Har 3-jang yangi to'plam + bot.** O'quvchining 3, 6, 9… jangi (tugagan va tashlab ketilganlar sanaladi) mos ruh bo'lsa ham yangi savol to'plami va Dafi bot bilan o'tadi. Aks holda ruh ko'paygan sari eski to'plamlar aylanib qolardi.
4. **Liga balli yo'q.** `DafAttempt` va `DafStudentDay` jangda yozilmaydi. Alohida hisob: g'alaba soni, seriya va nishonlar `JANG_10`, `JANG_50`, `JANG_100` (ADR-0115 `grantBadges`, g'alabada).
5. **Kuniga 5 jang** (Toshkent kuni, serverda). 6 savol, har biriga 10 soniya. Ko'p to'g'ri javob yutadi, teng bo'lsa umumiy vaqti kami, yana teng bo'lsa durang.
6. **Alohida unitga bog'liq savol bazasi** (`DafBattleQuestion`, mashq bazasidan filtr emas): `CHOOSE`, `TYPE`, `LISTEN`; `DRAFT` yoziladi, CEO tasdiqlagach (`tasdiqlangan: true`, qayta seed) `APPROVED` bo'ladi, faqat shu jangga tushadi. `LISTEN` faqat uzunligi ≤ 3000 ms bo'lgan audioni ishlatadi (`eshitish-uzunligi.json`; bir nechta so'zga umumiy bo'lim fayli oraliqsiz o'ynatilmaydi, savolga aniq oraliq nusxalanadi). Yozishda `ä/ö/ü/ß` uchun `ae/oe/ue/ss` qabul qilinadi.
7. **Vaqtni server o'lchaydi.** Mijoz vaqtiga ishonilmaydi. Server vaqtlari (`jang-qoidalari.ts`): `KIRISH_MS` = 3000 (`boshla` birinchi savolning soatini raqib kartasi tugaguncha suradi: `lastActivityAt = hozir + KIRISH_MS`), `SAVOL_MS` = 10 000, `KECHIKISH_MS` = 2000 (tarmoq kechikishi uchun, undan keyin javob xato), `TASHLANGAN_MS` = 60 000 (shundan so'ng jang `ABANDONED`, mag'lubiyat emas va ruh bo'lmaydi). **Mijoz bilan shartnoma:** javob qabul qilingach mijoz natija kartasini `JAVOB_KORISH_MS` = 1500 ms ko'rsatadi, so'ng keyingi savolni ochadi; server keyingi savol soatini shundan boshlaydi (`lastActivityAt = hozir + JAVOB_KORISH_MS`). Mijozdagi `JAVOB_KORISH_MS` (`client/.../lernen/jang/jang-holati.ts`) va serverdagi bir xil bo'lishi SHART, aks holda server mijozdan ~1,5 s oldinda yurib `KECHIKISH_MS` ni yeydi va o'yinchining `ms` i oshadi. Savol soatidan oldin kelgan javob (`otdi < 0`) rad etiladi: haqiqiy mijoz savol ochilmasdan javob yubora olmaydi.
8. **Bosqichli yoqish: `DAF_JANG`.** `on` — hammaga; `7,12` — faqat shu o'quvchi id larga (CEO yoqishdan oldin o'zi sinaydi); o'rnatilmagan yoki boshqa qiymat — o'chiq. Tartib: migratsiya va kod (o'chiq) → seed → CEO savollarni tasdiqlaydi → test o'quvchi id → CEO o'ynaydi → `on`.

## Rad etilgan muqobillar

- **Jonli 1-1 duel hozir.** Onlayn juft kam; alohida spec (2-bosqich).
- **Jangga liga balli berish.** Bot bilan oson ball yig'ish, ya'ni liga suiiste'moli (ADR-0116 ning «faqat ko'tariladi» qoidasi ham shu ballga tayanadi).
- **Claude (haqiqiy AI) raqib.** Har jang uchun xarajat, javoblar baribir oldindan ma'lum bo'lardi.
- **Mashq bazasidan filtr.** CEO qarori (spec §2): jang savollari alohida, unitga bog'liq baza.

## Oqibatlari

- Boshida deyarli barcha raqib Dafi bot bo'ladi; ruhlar ko'paygan sari botni siqib chiqaradi. Har 3-jang bot bilan bo'lgani uchun bot hech qachon yo'qolmaydi (ataylab).
- Savol bazasi kichik: faqat u01 ni o'tgan o'quvchida ~35 savol, kuniga 5 jangda 30 tasini ko'radi; yetmasa eng eski ko'rilganlar qaytadi. Hajm unit qo'shilishi bilan o'sadi.
- Ruh egasi bilmasdan boshqalarga raqib bo'ladi (CEO qarori: muammo emas); raqib kartasida ism va familiya bosh harfi, rasm va g'alaba soni ko'rinadi.
- `JANG_10/50/100` nishonlari berilgach qaytib olinmaydi (ADR-0115).
- **`LISTEN` ijrosi brauzerda tekshirilmagan** (dev bazada audio yo'q, `audio: null` bilan faqat tugma chizilishi ko'rildi). iOS Safari avtomatik ijro (autoplay) qoidalari ham tekshirilmagan; zaxira — savoldagi «Qayta eshitish» tugmasi. CEO sinovida telefonda tekshirilishi kerak.
- **Ma'lum xavf: yuklama.** O'lchov sintetik: `JangService.boshla` to'g'ridan-to'g'ri chaqirilgan (HTTP va guard yo'q), lokal throwaway baza (12 000 o'quvchi, 300 ruh jangi, 35 savol), 500 chaqiruv 50 talik parallel to'lqinlarda, hammasi ruh yo'liga tushgan (500/500 `GHOST`). 50 ta parallel chaqiruv: p50 127–147 ms, p95 146–203 ms (5 yurish; maqsad 200 ms — chegarada, ikki yurishda 203 va 200,7 ms bilan biroz oshdi). Ketma-ket: p50 7–10 ms, p95 8–20 ms. Havza `max: 30` bilan (3 yurish) p50 115–123 ms, p95 137–182 ms: p50 ~15 % past, p95 farqi shovqin ichida; URL dagi `connection_limit` `pg` havzasiga ta'sir qilmaydi (11 ulanish kuzatildi), faqat `PrismaPg({ max })` ta'sir qiladi. Ya'ni 3 baravar katta havza kechikishni ozgina kamaytirdi, shuning uchun sababi isbotlanmagan (ehtimol Node CPU `ruhQidir` da yoki lokal Postgres; ulanishlar navbati to'liq tushuntirmaydi). Real yuk kuniga 30–50 o'quvchi, 50 ta bir vaqtdagi `boshla` kutilmaydi. Keyingi qadam: prod hajmida o'lchash; p95 yomonlashsa `PrismaPg` `max` ni oshirish yoki nomzod ballashni SQL ga ko'chirish.
- **Indeks prod hajmida tekshirilmagan.** `EXPLAIN (ANALYZE)` ~900 qatorli `DafBattle` da bajarildi: nomzod so'rovi `DafBattle_companyId_status_finishedAt_idx` dan foydalandi (1,3 ms), tarix so'rovi (`studentId IN`) jadval kichikligidan Seq Scan bo'ldi (0,4 ms), shuning uchun `DafBattle_studentId_status_finishedAt_idx` prod hajmida ishlatilishi isbotlanmagan.
- ADR raqami merge oldidan `docs/adr/README.md` bo'yicha qayta tekshiriladi.
