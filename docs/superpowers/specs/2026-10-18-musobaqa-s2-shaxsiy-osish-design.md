# Musobaqa tizimi — S2: shaxsiy o'sish (kunlik maqsad, nishonlar) — dizayn

**Sana:** 2026-10-18
**Bog'liq:** [S1 poydevor](2026-10-18-musobaqa-s1-poydevor-design.md) (kunlik
yig'indi jadvali `DafStudentDay`, `natija`), [Ball, daraja va o'quv yo'li](2026-09-06-ball-va-yol-design.md)
(ball qoidasi, seriya, «jazo yo'q»)

S1 kunlik yig'indi jadvalini va seans oxiri `natija`sini berdi. S2 shu
poydevorda o'quvchi uchun ikki narsa qo'shadi: **kunlik maqsad** (bugun
qancha ball topdim) va **nishonlar** (uzoq muddatli yutuqlar). Ikkalasi
ham jazosiz: maqsad bajarilmasa faqat halqa to'lmaydi, nishon bir marta
olinadi va hech qachon olib qo'yilmaydi.

CEO qarorlari (2026-10-18): maqsadni o'quvchi **o'zi tanlaydi** (3
daraja); nishonlar **seriya** va **so'zlar** bo'yicha. Maqsad va musobaqa
nishonlari bu bosqichda yo'q.

---

## 1. Kunlik maqsad

### 1.1 Qoida

| Daraja | Kalit | Kunlik ball |
| --- | --- | --- |
| Yengil | `YENGIL` | 40 |
| O'rta | `ORTA` | 80 |
| Jiddiy | `JIDDIY` | 160 |

Bir seans ≈ 70–90 ball, shuning uchun Yengil ≈ yarim seans, O'rta ≈ bir
seans, Jiddiy ≈ ikki seans. Qiymatlar kodda (`uebung/punkte.ts`, `MAQSAD_BALL`),
bazada emas: o'zgartirish deploy bilan, o'quvchining tanlovi esa kalit
bilan saqlanadi.

- Tanlov yo'q bo'lsa — `ORTA`. Birinchi marta hech narsa so'ralmaydi.
- **Bugungi ball** = `DafStudentDay` da bugungi Toshkent kuni qatorlarining
  (hamma `groupKey`) `points` yig'indisi. Yangi hisob yo'q, asl yozuv
  `DafAttempt` o'zgarmaydi.
- **Bajarildi** = bugungi ball ≥ maqsad.
- **Bugun qiladigan mashq qolmagan** (`bosh`): muddati kelgan so'z yo'q
  (`faelligeWoerter == 0`) **va** ochiq, tugatilmagan dars yo'q. Bunda maqsad
  «bajarildi» deb sanaladi va halqada «Bugun mashq qolmadi» turadi — ball
  topish mumkin bo'lmagan o'quvchi ayb bo'lmagan narsa uchun yutqazmaydi.
  Dars hali bor bo'lsa (yangi so'z ball beradi) bu holat yo'q: yangi
  o'quvchi mashq qilmasdan «bajarildi» ko'rmaydi.
- Kun Toshkent kuni (UTC+5), `kunlikKalit` bilan — S1 bilan bir xil.
- Tanlovni almashtirish **darrov** kuchga kiradi, tarix saqlanmaydi:
  kechagi maqsad nima bo'lganini yozmaymiz (maqsad kunlari ketma-ketligi
  bu bosqichda yo'q, §4).

### 1.2 Saqlash

Bu hisoblab bo'lmaydigan tanlov, shuning uchun yangi kichik jadval:

```
DafStudentSetting
  studentId  Int  @id          (bir o'quvchi — bir qator)
  companyId  Int
  dailyGoal  DafDailyGoal  @default(ORTA)     enum YENGIL | ORTA | JIDDIY
  updatedAt  DateTime @updatedAt
```

Qator bo'lmasa `ORTA`. Yozuv — `PATCH` da `upsert` (unique kalit
`studentId`, parallel ikki bosish ham xavfsiz).

### 1.3 Serverga qo'shimchalar

- `GET fortschritt` javobiga qo'shiladi:
  `maqsad: { daraja, ball, hozir, bajarildi, bosh }` (`ball` — maqsad,
  `hozir` — bugungi ball).
  Qo'shimcha so'rov yo'q: bugungi ball `oquvchiRaqamlari` bitta so'rovidagi
  `SUM(points) FILTER (WHERE day = $bugun)`, sozlama `Promise.all` ichida
  bitta yengil `findUnique`, «ochiq dars bor» esa `faelligeWoerter == 0`
  bo'lgandagina o'qiladi (kam yo'l). S1 yuklama sinovi qayta yuritiladi:
  p95 chegaralari o'zgarmaydi (200 ms, `seansNatijasi` 300 ms).
- `PATCH daf/maqsad` `{ daraja }` (`DafPortalController`, sinfiy
  `@StudentOnly` + `StudentCardGuard`). DTO: `@IsEnum(DafDailyGoal)`.
  Javob: yangilangan `maqsad`. Marshrut manifestga SELF (`fortschritt`
  bilan bir sabab: o'quvchi faqat o'zini o'zgartiradi, filial savoli yo'q).
- `seansNatijasi` (`natija`) ga qo'shiladi:
  `maqsad: { ball, hozir, bajarildi, yangiBajarildi }`. `yangiBajarildi` =
  seansdan oldin bajarilmagan, endi bajarilgan (`hozir − seans balli <
  ball ≤ hozir`). `bosh` holatda `yangiBajarildi` yolg'on: yutuq ko'rsatilmaydi.

---

## 2. Nishonlar

### 2.1 Katalog

Kodda, bitta joyda (`daf/nishon/nishon-katalogi.ts`); jadvalda faqat
olingan nishon kaliti saqlanadi, shuning uchun S3 yangi turlarni
migratsiyasiz qo'shadi.

| Tur | Kalitlar | Shart |
| --- | --- | --- |
| Seriya | `SERIE_3`, `SERIE_7`, `SERIE_14`, `SERIE_30`, `SERIE_60`, `SERIE_100` | joriy seriya ≥ N kun |
| So'zlar | `WOERTER_50`, `WOERTER_150`, `WOERTER_300`, `WOERTER_592` | o'rganilgan so'z ≥ N |

- **Seriya** — S1/06.09 dagi o'sha `serieAus` (o'zgarmaydi).
- **O'rganilgan so'z** = `DafLexemeState` da shu o'quvchining
  `correctCount ≥ 1` qatorlari soni: kamida bir marta to'g'ri
  javob berilgan so'z. `correctCount` hech qachon kamaymaydi, shuning uchun
  son faqat o'sadi. A1 jami 592 so'z (`WOERTER_592` — «A1 so'zlarining
  hammasi»).
- Nishon **bir marta** olinadi va **hech qachon olib qo'yilmaydi**: seriya
  uzilsa ham, so'z kuchsizlashsa ham qoladi.

### 2.2 Saqlash va berish

```
DafStudentBadge
  id         Int @id @default(autoincrement())
  studentId  Int
  companyId  Int
  key        String                 (katalog kaliti)
  earnedAt   DateTime @default(now())
  @@unique([studentId, key])
  @@index([studentId])
```

**Bitta yozuvchi:** `grantBadges(prisma, studentId, companyId, sharoit)`
(`daf/nishon/nishon-berish.ts`). Shartlari bajarilgan, hali olinmagan
kalitlar uchun `INSERT … ON CONFLICT ("studentId","key") DO NOTHING
RETURNING key` — qaytgan kalitlar aynan **shu chaqiruv** bergan yangi
nishonlar (parallel ikki seans bir nishonni ikki marta «yangi» demaydi).
`nishon-berish.single-source.spec.ts` qorovuli (attempt-writer bilan bir
shaklda): `dafStudentBadge` ni boshqa joyda yozish build'da yiqiladi.

**Qachon beriladi:** faqat seans tugaganda, `seansNatijasi` ichida
(seriya va so'z soni shu yerda yangilangan holda). Natija xavfsiz o'ram
(`seansNatijasiXavfsiz`) ichida: nishon berishda xato bo'lsa javob
`null`ga tushmaydi, seans saqlanadi; o'tkazib yuborilgan nishon keyingi
seansda **shart bo'yicha** qaytadan beriladi (holatdan hisoblanadi,
hodisadan emas). `GET` hech narsa yozmaydi.

### 2.3 Serverga qo'shimchalar

- `natija` ga: `yangiNishonlar: string[]` (shu seans bergan kalitlar).
- `GET daf/nishonlar` (alohida marshrut — «tab ma'lumoti faqat tab
  ochilganda» qoidasi; SELF): hamma katalog, har biri uchun
  `{ key, tur, chegara, olingan: ISO | null, qoldi: number | null }`;
  `qoldi` — olinmagan nishon uchun «yana N kun / N so'z». Joriy
  seriya va so'z soni shu yerda hisoblanadi.
- Tilga/matnga bog'liq nom serverda yo'q: kalitdan mijoz nomni quradi
  («14 kun ketma-ket», «150 ta so'z»).

### 2.4 Mavjud o'quvchilarga bir martalik berish

Prodda 516 faol o'quvchidan 102 tasi mashq qilgan, 8+ kun — 4 ta. Hozirgi
holat bo'yicha nishonlar deploydan keyin bir marta beriladi:
`scripts/daf-badges-backfill.ts` (quruq yurish — standart; `--apply
--expect=<N>` yozadi; keyingi yurish hech narsa qo'shmaydi — `ON CONFLICT`).
Seriya nishonlari uchun **eng uzun tarixiy ketma-ket kunlar**
`DafStudentDay` dan hisoblanadi (hozirgi seriya emas: uzilgan seriya ham
nishon bergan), `earnedAt` = o'sha ketma-ketlikda N-kun yetgan kun; so'z
nishonlari uchun `earnedAt` = skript vaqti (aniq sana noma'lum).
Skriptlar import qilinganda ishga tushmaydi (xotira: `main()` faqat to'g'ridan-to'g'ri).

---

## 3. Ekranlar

(Namuna suratlari CEO bilan kelishilgan, 2026-10-18.)

### 3.1 Yo'l tepasi

Hozirgi to'rt belgi (daraja, ball, seriya, o'rin) o'zgarmaydi. Ostiga
**maqsad kartasi**: halqa (bugungi/maqsad), «Bugungi maqsad», «40 / 80 ball»
va daraja nomi («O'rta · o'zgartirish»). Bosilsa pastdan oynacha:
uch daraja, har birida ball va «≈ yarim seans / bir seans / ikki seans»;
tanlov darrov saqlanadi (`PATCH`), oynacha yopiladi.

- Bajarilgan: halqa to'liq, rang «muvaffaqiyat» tokeniga o'tadi, yozuv
  «Maqsad bajarildi».
- `bosh`: halqa to'liq, yozuv «Bugun mashq qolmadi» (§1.1).
- Telefon (390px): karta to'liq kenglikda, to'rt belgidan keyingi qator;
  yangi doimiy tugma qo'shilmaydi.

### 3.2 Seans oxiri

`natija-ekrani.tsx` ga ikki qator **faqat o'zgargan bo'lsa**:
- `maqsad.yangiBajarildi` → «Kunlik maqsad bajarildi — 130 / 80».
  Bajarilmagan bo'lsa maqsad qatori **ko'rsatilmaydi** (shovqin; halqa
  yo'lda turibdi).
- `yangiNishonlar` → har bir nishon uchun «Yangi nishon: 14 kun ketma-ket».
Mavjud tartib: topilgan ball → seriya (kunning birinchi seansi) → o'rin
o'zgarishi → maqsad → nishonlar → xato so'zlar ro'yxati (hozirgidek).

### 3.3 «Nishonlarim»

Alohida to'rtinchi tab emas (390px da uch tab ham tor): reyting
ekranining **«Darajam» tabi** ichiga yangi bo'lim. Olingan nishonlar
to'la rangda, olinmaganlari chiziqli ramkada «yana N kun / N so'z» bilan.
`GET daf/nishonlar` shu bo'lim ko'ringandagina chaqiriladi. (Bu CEO
ko'rgan namunadan farq: «yangi tab» o'rniga mavjud tab ichida — o'zgarish
sababi telefonda joy.)

### 3.4 Matnlar (faqat lotin o'zbekcha, inglizcha so'z yo'q)

«Bugungi maqsad», «Maqsad bajarildi», «Bugun mashq qolmadi», «Yengil»,
«O'rta», «Jiddiy», «yarim seans / bir seans / ikki seans», «Yangi nishon»,
«Nishonlarim», «yana N kun», «yana N ta so'z». «Serie/Streak» kabi chet
so'zlar yo'q (06.09 dizayni: nemischa faqat daraja nomlarida).

---

## 4. Bu bosqichda QILINMAYDI

Maqsad ketma-ket bajarilgan kunlar va ular uchun nishon · musobaqa
nishonlari (S3) · eslatmalar va Telegram (S4) · o'qituvchi ko'rinishi (S5) ·
native ilova (S6) · yurak/tosh/pulga sotish · nishonni olib qo'yish ·
maqsad tarixi.

---

## 5. Sinash

- **Birlik:** `MAQSAD_BALL`, `bajarildi/bosh/yangiBajarildi` sof funksiyalari
  (chegara: aynan maqsadga teng ball, `bosh` + ball 0, bir seansda ikki
  chegarani kesish, yarim tunda kun almashishi); nishon sharti (aynan N,
  N−1), `grantBadges` (ikki marta berilmaydi, parallel ikki chaqiruv — bitta
  «yangi»), katalog bilan kalit mosligi.
- **Server:** `fortschritt` — sozlama yo'q = `ORTA`; `PATCH` darajani
  almashtiradi va noto'g'ri qiymatni 400 bilan rad etadi; `natija`ga
  `maqsad`/`yangiNishonlar` qo'shiladi; nishon berishdagi xato seansni
  yiqitmaydi; `daf-portal.student-card.e2e.spec.ts` yangi ikki marshrutni
  `studentId`siz tokenga 404 bilan tekshiradi.
- **Mijoz:** halqa holatlari (jarayon / bajarildi / `bosh`), oynacha,
  natija ekrani qatorlari, «Darajam» bo'limi.
- **Yuklama:** S1 sinovi qayta (`daf-yuklama-olchov`), yangi so'rovlar bilan
  p95 chegaralari saqlanadi; hisobot spec §10 ga qo'shiladi.
- **Brauzer:** 390px va desktop, yorug'/qorong'i, oynacha, birinchi
  bajarilish, nishon berish (seriya/so'z chegarasiga yaqin o'quvchi), iOS
  klaviatura (S1 dan qolgan).

## 6. Hujjat va deploy

ADR-0115 (raqam deploy oldidan tekshiriladi): `DafStudentBadge` qaytarib
bo'lmaydigan berish qoidasi («bir marta, olib qo'yilmaydi») va
`DafStudentSetting` — hosila emas, asl tanlov. `server/CLAUDE.md` DaF
bo'limiga 2–3 band. Foydalanuvchi qo'llanmasi (`client/src/qollanma/…`):
o'quvchi ko'radigan yangi narsa (maqsad, nishonlar) bor — o'quvchi
qo'llanmasi bo'limi bor-yo'qligi reja bosqichida tekshiriladi.

**Deploy tartibi:** migratsiya (ikki jadval) → kod → `daf-badges-backfill`
quruq yurish → `--apply`.

## 7. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Maqsad bajarilmasa o'quvchi tashlab ketadi | Jazo yo'q; bajarilmagan maqsad natija ekranida ko'rsatilmaydi; `bosh` holat «bajarildi» |
| Yangi o'quvchi mashq qilmasdan «bajarildi» ko'radi | `bosh` faqat «muddati kelgan so'z yo'q **va** ochiq dars yo'q» bo'lganda |
| `fortschritt` p95 chegaradan oshadi | Qo'shimcha so'rov yo'q (mavjud so'rovga `FILTER`), `findUnique` parallel; yuklama sinovi qayta |
| Parallel seans bitta nishonni ikki marta «yangi» deydi | `ON CONFLICT DO NOTHING RETURNING` — yangi faqat haqiqatan yozilgan |
| Nishon berishdagi xato seansni yiqitadi | `seansNatijasiXavfsiz` o'rami; keyingi seansda shart bo'yicha qaytadan beriladi |
| Mavjud o'quvchilar nishonsiz qoladi | Bir martalik skript, eng uzun tarixiy ketma-ketlik bo'yicha |
| Reyting ekrani to'rt tab bilan tor | «Nishonlarim» — «Darajam» tabi ichida |

---

## 8. Yuklama natijalari

O'lchangan 18.10.2026, lokal sinov bazasi `daf_s1_yuklama` (S1 §10 bilan bir
xil ma'lumot, qayta yaratilgan): 12 000 o'quvchi (urinishlar birinchi 5 000
tasida), ≈1,47 mln urinish, `DafStudentDay`da ≈392 ming qator (shu hafta
≈49,9 ming), A1 kontenti u01–u05 (457 so'z, 192 dars). S2 ma'lumoti: 9 000
o'quvchida maqsad qatori (yarmida `JIDDIY`, chorakda `YENGIL`, chorakda qator
yo'q), 608 500 `DafLexemeState`, 16 808 `DafStudentBadge`. 50 parallel
o'quvchi × 10 raund, servis darajasida, Prisma pool prod'dagidek (10
ulanish), kod `bbefe4a7`. Skriptlar: `server/scripts/load/` (S2 uchun yangi:
`daf-yuklama-s2-seed.ts`, `daf-yuklama-kohort.ts`).

**Kohortlar.** S1 sinovida `DafLexemeState` bo'sh edi, ya'ni hamma o'quvchida
muddati kelgan so'z yo'q. S2 da eng yomon yo'llar alohida o'lchanadi (5 000
o'quvchi tartib raqami bo'yicha o'nta guruhga bo'lingan):

| Kohort | O'quvchi | Nima |
| --- | --- | --- |
| DUE | 1 500 | 20 ta so'z muddati kelgan — dars so'rovi o'qilmaydi |
| OCHIQ | 1 000 | so'z qatori yo'q, ochiq dars bor — dars so'rovi birinchi topilganda to'xtaydi |
| TUGAGAN | 500 | so'z qatori yo'q, hamma dars tugatilgan — dars so'rovi oxirigacha yuradi |
| TOLIQ | 500 | 105 kunlik seriya, 457 so'z, 9 ta nishon allaqachon berilgan — har seans oxirida `INSERT` ning hamma qatori konfliktga tushadi |
| QISMAN | 500 | 8 kunlik seriya, 60 so'z, 3 nishon berilgan — 3 qator konflikt |
| YANGI | 1 000 | 105 kunlik seriya, 320 so'z, nishon yo'q — birinchi seans oxirida qatorlar haqiqatan yoziladi |

Katalogdagi `WOERTER_592` bu bazada berilmaydi (u01–u05 da 457 so'z bor), shuning
uchun TOLIQ da 10 tadan 9 tasi konfliktga tushadi.

**Natija (p50 / p95, ms).** Ikki o'lchov, bir xil kod va ma'lumot. Birinchisi
nisbatan bo'sh mashinada (load average 2,5 → 4,9), ikkinchisi band mashinada
(6,4 → 7,9; 10 yadro).

| Amal | Yengil yuk | Og'ir yuk | Chegara (p95) | Holat |
| --- | --- | --- | --- | --- |
| `uebersicht` (fortschritt), tasodifiy aralash | 91 / 171 | 121 / 186 | 200 | o'tdi |
| `reyting zentrum` | 63 / 69 | 93 / 103 | 200 | o'tdi |
| `reyting gruppe` | 24 / 29 | 22 / 27 | 200 | o'tdi |
| `recordAttempt` | 16 / 51 | 13 / 52 | 200 | o'tdi |
| `seansNatijasi`, tasodifiy aralash | 96 / 109 | 126 / 174 | 300 | o'tdi |
| `nishonlar` | 10 / 16 | 10 / 16 | 200 | o'tdi |
| `uebersicht`, muddati kelgan so'z bor (DUE) | 84 / 89 | 116 / 119 | 200 | o'tdi |
| `uebersicht`, 0 so'z, ochiq dars bor (OCHIQ) | 91 / 102 | 128 / 166 | 200 | o'tdi |
| `uebersicht`, 0 so'z, dars qolmagan (TUGAGAN) | 93 / 102 | 123 / 134 | 200 | o'tdi |
| `seansNatijasi`, berish uchun nishon yo'q (OCHIQ) | 103 / 111 | 123 / 131 | 300 | o'tdi |
| `seansNatijasi`, `INSERT`, hamma qator konflikt (TOLIQ) | 111 / 116 | 131 / 138 | 300 | o'tdi |
| `seansNatijasi`, `INSERT`, 3 qator konflikt (QISMAN) | 113 / 123 | 134 / 174 | 300 | o'tdi |
| `seansNatijasi`, `INSERT`, hamma qator yangi (YANGI) | 122 / 153 | 149 / 164 | 300 | o'tdi |
| `nishonlar`, 105 kunlik seriya, 10 nishon (TOLIQ) | 12 / 19 | 12 / 19 | 200 | o'tdi |

Aralash `uebersicht` kohortlardan yuqori (171–186 va 89–166): u har raundda
birinchi turadi va aralashda 105 kunlik seriyali o'quvchilar ham bor. S1
natijasi bilan (168, qamrab oluvchi indeks bilan) bir xil darajada; chegaragacha
zaxira band mashinada 14 ms. S2 qo'shgan ikki yo'l (bugungi ball va maqsad CTE
lari, 0 so'zda `dafLesson.findFirst`) `uebersicht` ni sezilarli sekinlashtirmadi:
DUE (so'rovsiz yo'l) va TUGAGAN (eng uzun dars so'rovi) orasidagi farq p95 da
13–15 ms. Nishon `INSERT` i `seansNatijasi` p95 ga qo'shadi: hamma qator konfliktga
tushsa ≈5–7 ms (TOLIQ), qatorlar haqiqatan yozilsa ≈33–42 ms (YANGI) — har
nishon o'quvchida bir marta yoziladi, keyingi seanslar konflikt yo'lida
ketadi. YANGI ning ikkinchi o'lchovdagi 462 ta namunasi: kohortning 38 tasi
o'lchovgacha nishon olib bo'lgan (moslik skripti ham seans oxirini chaqiradi).

**EXPLAIN (ANALYZE, BUFFERS).** O'z raqamlari so'rovi (`oquvchi-raqamlari`,
ikki yangi CTE bilan) 20,8 ms: haftalik yig'indi `Index Only Scan on
DafStudentDay_companyId_day_cover_idx` (49 949 qator), maqsad qatori
`DafStudentSetting_pkey` dan 0,03 ms, bugungi ball `mine` CTE sidan (qo'shimcha
o'tish yo'q). `DafLexemeState` da so'z soni 0,6 ms (457 qator, `studentId`
indeksi), nishonlar ro'yxati 0,02 ms, hamma qator konfliktga tushadigan nishon
`INSERT` i 0,08 ms. «Ochiq dars» so'rovi eng yomon holatda (hamma dars
tugatilgan, 192 dars) 0,55 ms. `DafAttempt` bo'ylab `Seq Scan` yo'q.

**Bir o'quvchiga 50 parallel `grantBadges`:** 0 → 10 qator, «yangi» deb
qaytgan kalitlar 10 — takror 0 (ikkala o'lchovda). Bir qatorga 50 parallel
`recordAttempt`: farq 0 (ball 1 465 = 1 465, urinishlar 82 = 82; ikkinchi
o'lchovda 1 485 = 1 485, 83 = 83).

**Moslik** (`daf-yuklama-paritet.ts`, 244 o'quvchi; 72 tasi bugun ikki
guruhda javob bergan; maqsad qatori: 119 `JIDDIY`, 69 `YENGIL`, 56 qatorsiz →
`ORTA`): S1 tekshiruvlariga (jadval, o'rin, haftalik/umumiy ball, seriya,
`serieYangi`, oldin/hozir) qo'shildi — `uebersicht().maqsad` va
`seansNatijasi().maqsad` (daraja, maqsad balli, bugungi ball, `bosh`,
`bajarildi`, `yangiBajarildi`) `DafAttempt` ni bevosita yig'ib hisoblangan
qiymat bilan solishtirildi (bugungi ball — Toshkent kuni, HAMMA guruh bo'yicha
yig'indi; `bosh` alohida SQL bilan). Tekshiruv farqni ajrata oladi: 148
o'quvchida bugungi ball faqat joriy guruh bo'yicha o'qilsa boshqacha chiqardi.
**0 farq.**
