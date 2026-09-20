# DaF ilovasi — markaz bo'yicha nazorat bo'limi

**Sana:** 20.09.2026
**Holati:** dizayn CEO tomonidan tasdiqlangan (20.09.2026); kod yozilmagan
**Shox:** `feat/daf-markaz-nazorati` (`origin/main` = `47eca860` dan)
**Bog'liq:** ADR-0003 (route siyosati manifesti), ADR-0015 (faol o'quvchi ta'rifi manifest),
ADR-0016 (kun chegarasi Toshkent bo'yicha), ADR-0019 (mashq natijasi umumiy shartnoma),
ADR-0020 (ilova faolligi klientda o'lchanadi),
[O'quvchining ilova faolligi](2026-09-13-oquvchi-ilova-faolligi-design.md)

---

## 1. Muammo

«Ilova faolligi» statistikasi bor, lekin u faqat **bitta guruh** yoki **bitta o'quvchi** kesimida
ko'rinadi:

| Mavjud sirt | Manzil | Kim ko'radi |
| --- | --- | --- |
| Guruh sahifasi → «Ilova faolligi» tabi | `GET /api/groups/:id/app-activity` | CEO, FD, Administrator, O'qituvchi |
| O'quvchi profili → «Ilova» tabi | `GET /api/students/:id/app-activity` | CEO, FD, Administrator |

Markaz darajasidagi hech qanday ko'rinish yo'q. 20.09.2026 holatiga ko'ra
`server/src/reports/` va `server/src/dashboard/` ichida `DafAttempt`, `StudentAppSession`,
`DafSession`, `DafLessonProgress` jadvallariga tegadigan **birorta ham** so'rov yo'q. Oldingi
dizayn buni ataylab qamrovdan chiqargan edi
([13.09 spec, 11-bo'lim](2026-09-13-oquvchi-ilova-faolligi-design.md)).

Natijada CEO quyidagi savollarga javob ololmaydi:

1. **Kim ishlamayapti?** — ilovaga kirmayotgan o'quvchilar ro'yxati hech qayerda yo'q. Ularni
   topish uchun har guruhni birma-bir ochib chiqish kerak.
2. **Umumiy qamrov qanday?** — necha foiz o'quvchi ilovadan foydalanyapti, qaysi filial orqada.
3. **Kontent qanday ishlayapti?** — qaysi mashq butun markaz bo'yicha qiyin kelmoqda. Hozirgi
   «qiyin elementlar» ro'yxati faqat bitta guruh ichida, kamida 3 o'quvchi bo'lganda ishlaydi.
4. **O'qituvchilar kesimi qanday?** — qaysi o'qituvchi guruhi ilovadan yaxshi foydalanyapti.

Ikkinchi, chuqurroq muammo: **«yaxshi ishlayapti» degani nima ekani hech qayerda yozilmagan.**
Hozirgi ekranlar xom raqam ko'rsatadi (14 daqiqa, 76%), lekin bu ko'p yoki ozligini aytmaydi.
Norma bo'lmasa, ro'yxatni saralab bo'lmaydi va «kim bilan ishlash kerak» degan savolga javob
chiqmaydi.

---

## 2. Nima quriladi

Yon menyuda yangi **«DaF ilovasi»** bo'limi — «Hisobotlar» kabi ochiladigan, ichida to'rt sahifa:

| Sahifa | Manzil | Bosqich | Nimaga javob beradi |
| --- | --- | --- | --- |
| Umumiy holat | `/daf` | 1 | Markazda ilova qanday ishlayapti, qayerda yo'qotyapmiz |
| O'quvchilar | `/daf/oquvchilar` | 1 | Kim ishlamayapti — ustiga borish uchun ro'yxat |
| Guruh va o'qituvchi | `/daf/guruhlar` | 2 | Qaysi guruh va o'qituvchi orqada |
| Kontent | `/daf/kontent` | 3 | Qaysi mashq va dars qiyin kelmoqda |

Va ularning hammasi tayanadigan **norma** — `/settings/daf` sahifasida CEO tomonidan
o'zgartiriladigan uchta raqam.

**Nega hisobotlar ichiga emas?** Uch sabab: (a) `/reports/activity` allaqachon boshqa narsa —
xona bandligi va potensial daromad; nom to'qnashadi; (b) hisobotlar naqshi bitta jadval +
filtrlarga mo'ljallangan, bu yerda esa to'rt xil ekran; (c) bu bo'lim kelajakda kontent
boshqaruvi va ovozlar bilan kengayadi — o'sha paytda hisobotlar ichida turishi noto'g'ri bo'ladi.

### Kim ko'radi

| Rol | Ko'rinishi |
| --- | --- |
| CEO (1) | Hamma filial; filial tanlagichi bor |
| Filial direktori (2) | Faqat o'z filial(lar)i |
| Administrator (3) | Faqat o'z filial(lar)i |
| O'qituvchi (4) | **Bo'limni umuman ko'rmaydi** — u guruh sahifasidagi «Ilova faolligi» tabini ko'rishda davom etadi |

`/settings/daf` — faqat CEO (1).

Filial cheklovi frontendda emas, **serverda** amalga oshiriladi: `resolveCallerReportBranchIds()`
HTTP chegarasida bir marta chaqiriladi, `[]` qaytsa natija bo'sh bo'ladi (fail-closed).

---

## 3. Ta'riflar — yagona manba

Bu bo'lim dizaynning o'zagi. Har bir ta'rif **bitta joyda** hisoblanadi; markaz sahifasi, guruh
tabi va o'quvchi paneli o'sha bitta manbadan oladi. ADR-0015 aynan shu narsa buzilgani uchun
yozilgan edi — bir xil nomli uchta son uchta ekranda uch xil chiqqan edi.

### 3.1 Maxraj — faol o'quvchi

Yangi ta'rif **yaratilmaydi**. `activeStudentWhere()`
(`server/src/students/shared/active-student-where.ts`, ADR-0015) ishlatiladi: statusi `ACTIVE`
**va** faol guruhda faol yozuvi bor. Barcha foizlarning maxraji shu.

### 3.2 Akkaunt va kirish

Ikki xil «kirgan» bor va ular **aralashtirilmaydi**:

| Ta'rif | Qoida | Manba |
| --- | --- | --- |
| Akkaunti bor | O'quvchining `User` yozuvi mavjud | mavjud kod: `student.user !== null` |
| **Hech qachon kirmagan** | Butun tarix bo'yicha birorta kunda ham `activeSeconds >= 10 s` bo'lmagan — davrga bog'liq emas | `KIRDI_CHEGARASI_S`, `stats/kunlik-faollik.ts` |
| **Davr ichida ishlagan** | Tanlangan davr ichida kamida bitta kunda `activeSeconds >= 10 s` | shu yerda |

Farqi muhim: 40 kun oldin kirib, keyin tashlab ketgan o'quvchi «hech qachon kirmagan» emas —
u 🔴 qizil, ya'ni yo'qotilgan o'quvchi. «Hech qachon kirmagan» esa umuman boshlamagan o'quvchi;
u bilan boshqacha ishlanadi (ilovani ko'rsatish kerak, eslatish emas).

### 3.3 Faol kun — yangi ta'rif

> **Faol kun** — Toshkent kuni bo'yicha o'quvchi o'sha kuni `LERNEN` bo'limida normadagi
> daqiqadan kam bo'lmagan vaqt o'tkazgan **yoki** kamida bitta darsni tugatgan kun.

Uch qaror va ularning sababi:

**(a) Faqat `LERNEN` vaqti sanaladi.** `StudentAppSession.sections` ichida vaqt `LERNEN` va
`OTHER` ga bo'lingan, radio esa alohida `radioSeconds` da. Agar umumiy vaqt sanalsa, radio
tinglab yotgan yoki reytingni varaqlab o'tirgan o'quvchi normani bajarib qo'yadi.

**(b) «Yoki dars tugatgan» sharti bor.** Vaqt o'rganish emas. Tez o'quvchi 6 daqiqada darsni
tugatadi — u normani bajarmagan bo'lib chiqmasligi kerak. Bu shart tezlikni jazolamaydi.

**(c) Kunlik vaqt kun bo'yicha qirqiladi.** Parallel seanslar kun yig'indisini ko'paytirmasin
degan qoida allaqachon bor (`kunlikYigindi()`, ADR-0020): kunlik faol vaqt o'sha kun
seanslarining `[firstSeenAt, lastSeenAt + 120 s]` oraliqlari birlashmasidan oshmaydi, `LERNEN`
ham shu nisbatda qisqaradi. Markaz so'rovi ham **aynan shu qoidani** qo'llaydi (9.3-bo'lim).

### 3.4 Norma va holat

Uchta sozlanadigan raqam:

| Sozlama | Kalit | Boshlang'ich |
| --- | --- | --- |
| Kunlik eng kam `LERNEN` vaqti | `dafKunlikDaqiqa` | 10 daqiqa |
| Haftada eng kam faol kun (yashil) | `dafHaftalikKun` | 4 kun |
| Sariq chegarasi | `dafSariqKun` | 2 kun |

Boshlang'ich 10/4/2 — taxminiy. Ular real ma'lumotga qarab sozlanishi uchun **kodga emas,
sozlamalarga** qo'yilyapti.

Davr 7 kundan uzun bo'lsa norma mutanosib o'sadi va **o'suvchi maxraj** hisobga olinadi (yangi
qo'shilgan o'quvchi to'liq 30 kun uchun javobgar bo'lmasligi kerak):

```
kerakliKun = max(1, round(dafHaftalikKun × maxraj / 7))
sariqKerak = max(1, round(dafSariqKun   × maxraj / 7))
```

`maxraj` — `davrOynasi()` qaytaradigan mavjud o'suvchi maxraj: `max(davr boshi, akkaunt
yaratilgan kun, kuzatuv boshi)` dan bugungacha bo'lgan kunlar soni.

Holat:

| Belgi | Shart |
| --- | --- |
| ⚪ Akkaunt yo'q | `User` yozuvi yo'q |
| ⚫ Hech qachon kirmagan | Akkaunti bor, lekin butun tarixda hech qachon 10 s dan ko'p faol bo'lmagan |
| 🔴 Qizil | `faolKun < sariqKerak` |
| 🟡 Sariq | `sariqKerak <= faolKun < kerakliKun` |
| 🟢 Yashil | `faolKun >= kerakliKun` |

Hisob **bitta toza modulda**: `server/src/app-activity/norma/norma.ts` — kirishi son va
sozlama, chiqishi holat. Bazaga tegmaydi, birlik testlari bilan qoplanadi.

### 3.5 Boshqa ko'rsatkichlar — mavjud qoidalar

| Ko'rsatkich | Qoida | Manba |
| --- | --- | --- |
| To'g'ri javob % | Birinchi urinish, `gradingStatus = 'GRADED'` | `stats/mashq-natijasi.ts`, ADR-0019 |
| O'rtacha kunlik vaqt | `LERNEN` soniyalari / `maxraj` | yangi, 3.3 ga tayanadi |
| Tugatilgan dars | `DafLessonProgress.completedAt` davr ichida | mavjud |
| Kurs progressi | A1/A2/B1 daraja mantiqi | `stats/daraja.ts` |

---

## 4. Sozlamalar — norma qayerda saqlanadi

`Company` jadvaliga uchta yangi maydon qo'shiladi:

```prisma
model Company {
  // ...
  /// DaF normasi: kunlik eng kam LERNEN vaqti, daqiqada.
  dafKunlikDaqiqa Int @default(10)
  /// DaF normasi: haftada eng kam faol kun (yashil chegarasi).
  dafHaftalikKun  Int @default(4)
  /// DaF normasi: sariq chegarasi, haftada faol kun.
  dafSariqKun     Int @default(2)
}
```

**Nega alohida jadval emas:** `Company` da allaqachon shunga o'xshash global sozlama bor
(`systemStartDate` — hisobotlar pastki chegarasi). Bitta kompaniya uchun bitta qiymat — alohida
jadval hech narsa qo'shmaydi. Filialga alohida norma kerak bo'lsa, o'sha paytda `Branch` ga
`null` bo'lishi mumkin bo'lgan ustunlar qo'shiladi va `?? company` qoidasi bilan o'qiladi;
hozir bu qilinmaydi (YAGNI).

Migratsiya mavjud tartib bilan: `prisma migrate diff` → `db execute` → `migrate resolve`
(`prisma migrate dev` bu loyihada ishlamaydi).

**Ekran:** `/settings/daf`, `settings-nav.ts` da «Administratsiya» bo'limiga yangi element
(`visibleForRoles: [1]`). Uchta raqam maydoni, saqlash tugmasi, tagida jonli tushuntirish:

> «Hozirgi norma: o'quvchi kuniga kamida **10 daqiqa** o'quv bo'limida ishlashi yoki bitta darsni
> tugatishi kerak. Haftada shunday **4 kun** bo'lsa — yashil, **2–3 kun** bo'lsa — sariq, kamroq
> bo'lsa — qizil.»

**Server uchun yangi manzil kerak emas.** `company.controller.ts` da allaqachon
`GET /api/company/:id` va `PATCH /api/company/:id` (CEO) bor — uchta maydon shularning DTO siga
qo'shiladi. Yangi `daf-norma` yo'li ochilsa, u `@Get(':id')` bilan to'qnashadi.

Markaz sahifalari normani alohida so'ramaydi: har bir `center/*` javobi ichida
`norma: { kunlikDaqiqa, haftalikKun, sariqKun }` qaytadi — shunda ekrandagi belgilar va
ular hisoblangan norma har doim bitta javobdan keladi, zid chiqishi mumkin emas.

Tekshiruv: har uchala son 1..1440 oralig'ida, `dafSariqKun < dafHaftalikKun`.

---

## 5. 1-sahifa — «Umumiy holat» (`/daf`)

Filtr: **davr** (7 / 30 kun) va **filial** (CEO uchun; FD/Administratorda ko'rinmaydi yoki
qulflangan). Ikkalasi ham URL da saqlanadi (`?period=30&branchId=2`), sahifa havolasi bilan
ulashiladi.

### 5.1 Oltita karta

| Karta | Asosiy son | Tagidagi izoh |
| --- | --- | --- |
| Qamrov | `620 / 840` | «120 tasida akkaunt yo'q, 100 tasi hech qachon kirmagan» |
| **Normani bajarmoqda** | `38%` | «320 o'quvchi» — bu sahifaning asosiy raqami |
| O'rtacha faol kun | `2,7` | «haftasiga, normadan 1,3 kun kam» — `faolKun / maxraj × 7`, o'suvchi maxraj bilan |
| O'rtacha vaqt | `14 daq` | «kuniga, o'quv bo'limida» |
| To'g'ri javob | `76%` | «birinchi urinishda · 42 300 savol» |
| Tugatilgan darslar | `1 840` | «davr ichida» |

### 5.2 Voronka

Eng katta yo'qotish qayerda ekanini bitta qarashda ko'rsatadi:

```
Faol o'quvchi                     840  ████████████████████
Akkaunti bor                      720  █████████████████     −120
Bir marta bo'lsa ham kirgan       620  ██████████████        −100   (butun tarix)
Davr ichida ishlagan              410  █████████             −210   (tanlangan davr)
Normani bajargan                  320  ███████               −90
```

3-pog'ona butun tarix bo'yicha, 4-pog'ona tanlangan davr bo'yicha (3.2-bo'lim). Har bir pog'ona
bosiladi va `/daf/oquvchilar` ga o'sha filtr bilan o'tadi (masalan 2 va 3-pog'ona orasidagi
farq → `status=hech-qachon-kirmagan`). Voronka
raqamlari kartalar bilan bir xil so'rovdan keladi — zid chiqishi mumkin emas.

### 5.3 Trend

30 kunlik kunlik faol o'quvchilar soni — chiziqli grafik. Davr 7 kun tanlansa ham grafik 30 kun
ko'rsatadi (tendensiya 7 kunda ko'rinmaydi). `dataviz` ko'nikmasi bo'yicha: bitta chiziq, o'qlar
belgilangan, dam olish kunlari fon bilan ajratilgan.

### 5.4 Filiallar jadvali

Faqat CEO da va faqat «hamma filial» tanlanganda:

| Filial | O'quvchi | Qamrov | Norma | O'rt. faol kun | To'g'ri javob | Tugatilgan dars |
| --- | --- | --- | --- | --- | --- | --- |
| Toshkent | 420 | 82% | 44% | 3,1 | 78% | 1 040 |
| Farg'ona | 310 | 71% | 31% | 2,2 | 74% | 620 |
| Namangan | 110 | 55% | 18% | 1,4 | 69% | 180 |

Foizlar mavjud `foizRangi()` yordamchisi bilan ranglanadi. Qatorga bosilsa — o'sha filial
tanlangan holda sahifa qayta yuklanadi.

---

## 6. 2-sahifa — «O'quvchilar» (`/daf/oquvchilar`)

Bu bo'limning asosiy ish sahifasi.

### 6.1 Filtrlar

Davr (7/30) · holat (🔴 / 🟡 / 🟢 / akkaunt yo'q / hech qachon kirmagan) · filial · guruh · o'qituvchi ·
daraja (A1/A2/B1) · ism yoki telefon bo'yicha qidiruv. Hammasi URL da saqlanadi.

### 6.2 Jadval

| Ustun | Mazmuni |
| --- | --- |
| # | Tartib raqami (sahifa bo'yicha) |
| O'quvchi | Avatar + ism; akkaunt yo'q bo'lsa belgisi bilan |
| Guruh | Guruh nomi, ostida kichik shriftda o'qituvchi |
| Filial | Faqat «hamma filial» tanlanganda |
| Holat | Rangli belgi + matn |
| Faol kun | `3/7` + kunlik chiziqchalar (mavjud `DayBars`) |
| Vaqt | Kuniga o'rtacha `LERNEN` daqiqasi |
| To'g'ri javob | Foiz, ranglangan |
| Kurs | Daraja + progress chizig'i (mavjud `ProgressLine`) |
| Oxirgi kirish | «kecha», «6 kun oldin», «hech qachon» |

**Standart saralash — eng muammolisi yuqorida:** holat (⚫ hech qachon kirmagan → 🔴 → 🟡 → 🟢 → ⚪ akkaunt
yo'q), teng bo'lsa oxirgi kirish eng uzoq bo'lgani, teng bo'lsa ism. Har ustundan qo'lda saralash
mumkin. Sahifalash: 50 tadan, saralash va sahifalash **bazada** bajariladi.

### 6.3 Qatorga bosish

Mavjud `StudentActivityPanel` yon oynasi ochiladi — vaqt, kunlik xarita, mashqlar, kurs, so'zlar,
seanslar tarixi. Yangi komponent yozilmaydi, mavjud `GET /api/students/:id/app-activity`
chaqiriladi.

### 6.4 Tepadagi qator

«**412 ta o'quvchi topildi**» va yonida «**Telefon raqamlarni nusxalash**» tugmasi — joriy filtr
bo'yicha topilgan o'quvchilarning telefon raqamlari vergul bilan buferga ko'chiriladi, administrator
qo'ng'iroq qilishi uchun. Nusxalash **joriy sahifa emas, butun filtr natijasi** bo'yicha (shuning
uchun alohida yengil so'rov: faqat `id` va `phone`, eng ko'pi 2000 qator).

---

## 7. 3-sahifa — «Guruh va o'qituvchi» (`/daf/guruhlar`) — 2-bosqich

**Guruhlar jadvali:** guruh · o'qituvchi · filial · o'quvchi soni · qamrov % · norma % ·
o'rt. faol kun · to'g'ri javob % · o'rt. kurs progressi. Saralash va sahifalash bazada.
Qatorga bosilsa — guruhning mavjud «Ilova faolligi» tabiga o'tadi (`/groups/:id?tab=ilova`).

**O'qituvchilar yig'masi:** o'qituvchi · guruhlar soni · o'quvchilar soni · qamrov % · norma % ·
o'rt. faol kun. Faqat DaF darajasi bor guruhlarga ega o'qituvchilar chiqadi.

Ogohlantirish izohi ekranda: bu raqamlar o'qituvchi ishini emas, **guruhning ilovadan
foydalanishini** o'lchaydi. Guruhlar tarkibi har xil (yangi guruh vs bitiruvchi guruh), shuning
uchun o'qituvchilarni faqat shu jadval bilan solishtirib bo'lmaydi.

---

## 8. 4-sahifa — «Kontent» (`/daf/kontent`) — 3-bosqich

| Blok | Mazmuni |
| --- | --- |
| Qiyin elementlar | Markaz bo'yicha, kamida 3 o'quvchi urinib ko'rgan elementlar; eng past to'g'ri javob foizi bo'yicha. Filtr: daraja, unit, format. Mavjud `qiyin-elementlar.ts` qoidasi, faqat kengroq qamrovda |
| Unit va dars jadvali | Unit · dars · nechta o'quvchi boshlagan · nechta tugatgan · o'rtacha ball · o'rtacha urinish soni (`runs`) · o'rtacha vaqt |
| Ko'nikma kesimi | `WORTSCHATZ`, `GRAMMATIK`, `HOEREN`, `LESEN`, `SCHREIBEN`, `SPRECHEN` bo'yicha to'g'ri javob % |
| Tashlab ketilgan seanslar | `DafSession.finishedAt IS NULL` — qaysi darsda o'quvchilar eng ko'p tashlab ketadi |

Bu sahifa o'quvchi emas, **kontent** haqida — filial cheklovi baribir qo'llanadi (administrator
faqat o'z filiali o'quvchilarining urinishlarini ko'radi), lekin CEO uchun asosiy foydasi butun
markaz bo'yicha.

---

## 9. Server

### 9.1 Modul va manzillar

Yangi papka: `server/src/app-activity/center/`

| Manzil | Bosqich | Rollar |
| --- | --- | --- |
| `GET /api/app-activity/center/summary` | 1 | CEO, FD, Administrator |
| `GET /api/app-activity/center/students` | 1 | CEO, FD, Administrator |
| `GET /api/app-activity/center/students/phones` | 1 | CEO, FD, Administrator |
| `GET /api/app-activity/center/groups` | 2 | CEO, FD, Administrator |
| `GET /api/app-activity/center/content` | 3 | CEO, FD, Administrator |

Norma o'qish va yozish uchun yangi manzil yo'q — mavjud `company` manzillari ishlatiladi
(4-bo'lim).

Fayllar:

| Fayl | Vazifasi |
| --- | --- |
| `center-app-activity.controller.ts` | HTTP chegarasi, rollar, filial hal qilish |
| `center-app-activity.service.ts` | So'rovlarni chaqiradi, javobni yig'adi |
| `center-app-activity.queries.ts` | Xom SQL agregatlar |
| `center-app-activity.types.ts` | Javob shartnomasi (klient `types.ts` bilan 1:1) |
| `../norma/norma.ts` | Norma va holat hisobi — toza funksiya |
| `../norma/norma.spec.ts` | Birlik testlari |

### 9.2 Filial cheklovi

`resolveCallerReportBranchIds(prisma, userId, requestedBranchId)` kontrollerda bir marta
chaqiriladi:

- `null` → hamma filial (faqat CEO)
- `[1, 4]` → shu filiallar
- `[]` → **bo'sh natija** (fail-closed), xato emas

Barcha yangi manzillar `server/src/common/auth/branch-route-policy.ts` manifestiga yoziladi
(ADR-0003 majburiy qiladi — manifestda yo'q route CI da yiqiladi).

### 9.3 So'rov dizayni — eng muhim texnik qaror

**Talab:** o'quvchilar sahifasi 1000+ o'quvchida ham ochilishi kerak, saralash va sahifalash
bazada bo'lishi kerak (ko'rsatkich bo'yicha saralash uchun barcha o'quvchining ko'rsatkichi
kerak — ularni klientda hisoblab bo'lmaydi).

**Yechim:** bitta xom SQL so'rovi, CTE lar bilan. So'rovlar soni o'quvchilar sonidan
qat'i nazar doimiy — mavjud guruh so'rovidagi qoidaning davomi
(`app-activity-stats.service.ts:52-56`).

```
WITH qamrov AS (            -- activeStudentWhere() + filial/guruh/o'qituvchi/qidiruv filtri
     kunlik AS (            -- (studentId, day) bo'yicha: birlashma uzunligi + LERNEN soniyasi
     darslar AS (           -- (studentId, day) bo'yicha tugatilgan darslar
     faolKun AS (           -- kunlik ∪ darslar → normadan o'tgan kunlar soni
     mashq AS (             -- birinchi urinish, GRADED → savol/to'g'ri
SELECT ... FROM qamrov LEFT JOIN ... ORDER BY ... LIMIT 50 OFFSET ?
```

Kunlik birlashma (3.3-c) SQL da `range_agg` bilan hisoblanadi:

```sql
range_agg(tstzrange("firstSeenAt", "lastSeenAt" + interval '120 seconds'))
```

**Bosqich 0 — tekshiriladi:** `range_agg` PostgreSQL 14+ da bor. Neon versiyasi shundan past
bo'lsa, o'rniga oyna funksiyalari bilan klassik «gaps and islands» yoziladi. Bu kod yozishdan
oldin bir marta `SELECT version()` bilan aniqlanadi.

### 9.4 Bir xil qoida ikki joyda — qanday ushlab turiladi

Kunlik qirqish qoidasi endi ikki joyda bo'ladi: guruh tabi uchun TypeScript da
(`kunlikYigindi()`), markaz sahifasi uchun SQL da. ADR-0015 aynan shunday holatdan chiqqan.

Ikki qarshi chora:

1. **Biznes qoidasi (norma va holat) SQL ga kirmaydi.** SQL faqat mexanik yig'indini qaytaradi
   (`studentId`, `faolKun`, `lernenSoniya`, `savol`, `togri`, …). «Yashilmi yoki qizilmi» degan
   qaror faqat `norma.ts` da. Ya'ni o'zgaruvchan qoida bitta joyda.
2. **`server/scripts/check-daf-markaz.ts`** — mavjud `check-*` skriptlari uslubida solishtiruvchi
   skript: tasodifiy 30 o'quvchi uchun markaz SQL natijasini `oquvchiFaolligi()` natijasi bilan
   solishtiradi va farqni chiqaradi. Relizdan oldin prod nusxasida bir marta yuritiladi, keyin
   shubha tug'ilganda qayta yuritiladi.

---

## 10. Klient

| Fayl | O'zgarish |
| --- | --- |
| `client/src/lib/nav-items.ts` | Yangi «DaF ilovasi» ota-element, `children` bilan, `visibleForRoles: [1, 2, 3]` |
| `client/src/lib/daf-nav.ts` | Yangi — sahifalar ro'yxati va rol qorovuli (`reports-nav.ts` naqshi) |
| `client/src/lib/breadcrumb-routes.ts` | To'rt sahifa uchun nom |
| `client/src/lib/settings-nav.ts` | «DaF normasi» → `/settings/daf`, `visibleForRoles: [1]` |
| `client/src/app/(dashboard)/daf/layout.tsx` | Rol qorovuli + mobil menyu (`reports-layout-shell.tsx` naqshi) |
| `client/src/app/(dashboard)/daf/page.tsx` va boshqalar | 10 qatorli server komponentlari, `<Suspense>` bilan |
| `client/src/components/daf-center/*` | Ekran komponentlari |

**Qayta ishlatiladigan mavjud komponentlar:** `PeriodToggle`, `KpiCard`, `ProgressLine`,
`DayBars`, `foizRangi`, `formatDavomiylik`, `StudentActivityPanel`, `DifficultItems`.
Yangi yozilmaydi.

**Dizayn:** `impeccable` ko'nikmasi bo'yicha; grafiklar `dataviz` bo'yicha. Amber ranglar
admin mavzusida ishlamaydi (ma'lum nuqson) — holat ranglari uchun amber o'rniga
mavjud `foizRangi()` palitrasi ishlatiladi.

---

## 11. Bosqichlar

| Bosqich | Mazmuni | Natija |
| --- | --- | --- |
| **0** | `SELECT version()` — `range_agg` bormi | Bir buyruq |
| **1** | Norma: Prisma maydonlari + migratsiya + `norma.ts` + testlar + `/settings/daf` + mavjud `company` DTO siga uchta maydon | Norma sozlanadi, hech qayerda ko'rinmaydi |
| **2** | Menyu, `daf-nav.ts`, layout, rol qorovuli, bo'sh sahifalar | Bo'lim ochiladi |
| **3** | `GET /center/summary` + «Umumiy holat» sahifasi | Kartalar, voronka, trend, filiallar |
| **4** | `GET /center/students` + `/phones` + «O'quvchilar» sahifasi | Asosiy ish sahifasi tayyor |
| **5** | `check-daf-markaz.ts` + prod nusxasida solishtirish | Raqamlar guruh tabi bilan mos |
| **6** | ADR-0024 + PR | 1-bosqich tugadi |
| **7** | «Guruh va o'qituvchi» sahifasi | 2-bosqich, alohida PR |
| **8** | «Kontent» sahifasi | 3-bosqich, alohida PR |

1-bosqich (0–6) bitta PR. 2 va 3-bosqichlar alohida PR — birinchisi ishlatilib ko'rilgandan
keyin, chunki real foydalanish keyingi ikkitasining shaklini o'zgartirishi mumkin.

---

## 12. Sinash

**Birlik testlari (`norma.spec.ts`):**
- Chegaralar: `faolKun` 0, `sariqKerak - 1`, `sariqKerak`, `kerakliKun - 1`, `kerakliKun`
- Mutanosib norma: 7 kunlik davrda 4 → 4; 30 kunlik to'liq maxrajda 4 → 17; maxraj 3 kun bo'lsa → 2
- Eng kami 1: maxraj 1 kun bo'lsa `kerakliKun = 1` (0 bo'lib qolmaydi)
- Akkauntsiz va hech qachon kirmagan holatlar normadan oldin tekshiriladi

**Kontroller testlari:**
- O'qituvchi (rol 4) → 403
- Administrator boshqa filial `branchId` so'rasa → bo'sh natija, xato emas
- `resolveCallerReportBranchIds` `[]` qaytarsa → bo'sh javob
- `period` faqat `7` yoki `30`; boshqa qiymat → 400

**Manifest testi:** yangi manzillar `branch-route-policy.ts` da — mavjud CI qorovuli o'zi
tekshiradi.

**Sozlama testlari:** `dafSariqKun >= dafHaftalikKun` → 400; 0 yoki 1441 → 400.

**Qo'lda tekshirish (prod nusxasida, relizdan oldin):**
1. `check-daf-markaz.ts` — 30 o'quvchi bo'yicha farq yo'q
2. Bitta guruhni tanlab, markaz sahifasidagi raqamlar o'sha guruh tabidagi raqamlar bilan mos
3. Voronka pog'onalari yig'indisi kartalardagi sonlar bilan mos

**Ma'lumot ogohlantirishi:** dev bazada DaF faolligi deyarli yo'q — bo'sh natija «ishladi»
degani emas. Tekshirish prod nusxasida qilinadi.

---

## 13. Bu dizaynda QILINMAYDI

- Excel eksport (telefon nusxalash bor, Excel yo'q)
- Avtomatik eslatma — ishlamayotgan o'quvchiga SMS yoki Telegram xabar
- O'quvchiga normani ilovada ko'rsatish (keyingi ish; hozir norma faqat ichki nazorat uchun)
- Filialga alohida norma
- Ekran darajasidagi analitika (qaysi ekranda qancha vaqt)
- Reyting / top o'quvchilar ro'yxati — o'quvchi ilovasida allaqachon bor
- Guruh tabini yangi SQL ga o'tkazish — u ishlayapti, tegilmaydi

---

## 14. Xavflar

| Xavf | Ehtimoli | Chora |
| --- | --- | --- |
| Norma noto'g'ri qo'yilib, hamma qizil yoki hamma yashil chiqadi | Yuqori | Norma sozlamada; birinchi hafta CEO real taqsimotni ko'rib o'zgartiradi |
| Markaz SQL va guruh TS raqamlari zid chiqadi | O'rta | 9.4 — biznes qoidasi bitta joyda + solishtiruvchi skript |
| `range_agg` mavjud emas | Past | 0-bosqichda tekshiriladi, zaxira yechim bor |
| So'rov sekin ishlaydi | O'rta | Kerakli indekslar bor (`[companyId, day]`, `[branchId, day]`, `[companyId, createdAt]`); 0-bosqichda `EXPLAIN` bilan tekshiriladi |
| O'qituvchilar jadvali ishni baholashga ishlatiladi | O'rta | Ekranda ochiq ogohlantirish (7-bo'lim) |
| Bo'lim hisobotlardan ajralib, CEO uni topolmaydi | Past | Yon menyuda ko'rinadigan joyda; hisobotlar ro'yxatidan havola qo'yilmaydi |

---

## 15. Ochiq savollar

Yo'q — hammasi hal qilingan (20.09.2026 dizayn muhokamasi).
