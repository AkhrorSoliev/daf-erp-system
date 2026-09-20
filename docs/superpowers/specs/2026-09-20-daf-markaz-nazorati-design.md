# DaF ilovasi — markaz bo'yicha nazorat bo'limi

**Sana:** 20.09.2026
**Holati:** dizayn CEO tomonidan tasdiqlangan (20.09.2026); 2-o'qishdagi tahrirlar (pastda)
CEO tasdig'ini kutmoqda; kod yozilmagan
**Shox:** `feat/daf-markaz-nazorati` (`origin/main` = `47eca860` dan)
**Bog'liq:** ADR-0003 (route siyosati manifesti), ADR-0015 (faol o'quvchi ta'rifi manifest),
ADR-0016 (kun chegarasi Toshkent bo'yicha), ADR-0019 (mashq natijasi umumiy shartnoma),
ADR-0020 (ilova faolligi klientda o'lchanadi),
[O'quvchining ilova faolligi](2026-09-13-oquvchi-ilova-faolligi-design.md)

### 2-o'qishdagi tahrirlar (20.09.2026, kechqurun)

Tasdiqlangan dizayndan farq qiladigan joylar — CEO ko'rib chiqishi kerak:

| Bo'lim | Nima o'zgardi | Nega |
| --- | --- | --- |
| 3.3 | «Yoki bitta darsni tugatgan» → «yoki kamida 12 ta savolga javob bergan» (to'rtinchi sozlama) | Takrorlash seansi darsni tugatmaydi; kuniga 5 daqiqada 15 so'zni takrorlagan o'quvchi qizil chiqardi |
| 3.5 | To'g'ri javob % — tugatilgan seanslardan (`DafSession`), urinishlardan emas | Urinish qoidasi murakkab (ADR-0019); SQL da qaytadan yozish — ta'rif ikkilanishi. Seansda o'sha qoida bilan hisoblangan son bor |
| 6.4 | Nusxalanadigan matn: yalang'och raqamlar emas, «Ism — guruh — telefon — ota-ona telefoni» qatorlari | Administrator qo'ng'iroq qilishi uchun ism kerak; A1 o'quvchilarining ko'pi bola — ota-ona telefoni asosiy |
| 9.3 | Saralash va sahifalash SQL da emas, serverda (TypeScript da) | Holat rangi normadan chiqadi; norma SQL ga kirsa qoida ikki joyda bo'ladi. O'quvchi soni (≤ 3 000) buni bemalol ko'taradi |

### 3-o'qishdagi tahrirlar (20.09.2026, reja tuzishda)

| Bo'lim | Nima o'zgardi | Nega |
| --- | --- | --- |
| 2, 5, 9.2 | Filial cheklovi `@BranchScope()` dekoratori orqali (sarlavhadagi tanlov ∩ ruxsat); sahifada alohida filial filtri **yo'q** — yuqoridagi global filial tanlagichi ishlatiladi; `?branchId` URL da saqlanmaydi | Loyihada bu tayyor va idiomatik: guard `X-Branch-Id` ni har so'rovda o'qiydi, `BranchScopedMain` filial o'zgarsa sahifani qayta yuklaydi, `BranchQuerySync` keshni tozalaydi. Manifest testi `@BranchScope()` li route'ni o'zi taniydi va **qayta e'lon qilishni rad etadi** — shuning uchun `branch-route-policy.ts` ga yozuv qo'shilmaydi |
| 5.3 | Trend grafigida dam olish kunlari foni **yo'q** (birinchi versiya) | Kategorik o'qda bir kunlik fon chizish qiyin; ikki chiziq (kirgan / faol) asosiy ma'noni beradi |
| 9.3 (7-so'rov) | «Kurs» ustuni `tugatilganDarslar` + `kursJamisi` + `oxirgiDarsDarajalari` dan (guruh tabi kabi), `birlikProgressi` dan emas | `birlikProgressi` bitta o'quvchining unit tafsiloti; jadval ustuniga daraja va dars soni yetadi |
| 6.4 | Telefonlar `formatPhone()` bilan (`+998 90 123 45 67`) | Bazada 9 xonali saqlanadi; nusxada odam o'qiydigan ko'rinish kerak |

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
o'zgartiriladigan to'rtta raqam.

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

Filial cheklovi frontendda emas, **serverda** amalga oshiriladi: `@BranchScope()` dekoratori
(3-o'qish) sarlavhadagi tanlovni ruxsat bilan kesishtirib `ReportBranchIds` beradi; `[]` qaytsa
natija bo'sh bo'ladi (fail-closed). Sahifada alohida filial filtri yo'q — global tanlagich.

---

## 3. Ta'riflar — yagona manba

Bu bo'lim dizaynning o'zagi. Har bir ta'rif **bitta joyda** hisoblanadi. ADR-0015 aynan shu narsa
buzilgani uchun yozilgan edi — bir xil nomli uchta son uchta ekranda uch xil chiqqan edi.

Asosiy tamoyil: **SQL faqat mexanik yig'indi qaytaradi, biznes qoidasi TypeScript da, bitta
faylda.** «Bu kun faolmi», «bu o'quvchi qizilmi» degan qarorlar SQL ga kirmaydi (9.3-bo'lim).

### 3.1 Maxraj — faol o'quvchi

Yangi ta'rif **yaratilmaydi**. `activeStudentWhere()`
(`server/src/students/shared/active-student-where.ts`, ADR-0015) ishlatiladi: statusi `ACTIVE`
**va** faol guruhda faol yozuvi bor. Barcha foizlarning maxraji shu.

Oqibatlari, ochiq yozilgan:

- Muzlatilgan (`FROZEN`) o'quvchi ro'yxatda **chiqmaydi** — u dam olmoqda, undan ish kutilmaydi.
- Guruhsiz o'quvchi chiqmaydi — u hali joylashtirilmagan.
- O'quvchilar ro'yxati **faqat** Prisma orqali, `activeStudentWhere()` bilan olinadi; `"Student"`
  jadvaliga xom SQL yozilmaydi. `active-student-policy.spec.ts` Prisma chaqiruvlarini skanerlaydi,
  xom SQL ni ko'rmaydi — shuning uchun bu qoida shu yerda yozib qo'yilgan.

### 3.2 Akkaunt va kirish

Ikki xil «kirgan» bor va ular **aralashtirilmaydi**:

| Ta'rif | Qoida | Manba |
| --- | --- | --- |
| Akkaunti bor | O'quvchining `User` yozuvi mavjud | mavjud kod: `student.user !== null` |
| **Hech qachon kirmagan** | Butun tarix bo'yicha birorta seansda ham `activeSeconds >= 10 s` bo'lmagan — davrga bog'liq emas | `KIRDI_CHEGARASI_S`, `stats/kunlik-faollik.ts` |
| **Davr ichida kirgan** | Tanlangan davr ichida kamida bitta seansda `activeSeconds >= 10 s` | shu yerda |

Farqi muhim: 40 kun oldin kirib, keyin tashlab ketgan o'quvchi «hech qachon kirmagan» emas —
u 🔴 qizil, ya'ni yo'qotilgan o'quvchi. «Hech qachon kirmagan» esa umuman boshlamagan o'quvchi;
u bilan boshqacha ishlanadi (ilovani ko'rsatish kerak, eslatish emas).

### 3.3 Faol kun — yangi ta'rif

> **Faol kun** — Toshkent kuni bo'yicha o'quvchi o'sha kuni `LERNEN` bo'limida normadagi daqiqadan
> kam bo'lmagan vaqt o'tkazgan **yoki** o'sha kuni tugatilgan seanslarda normadagi sondan kam
> bo'lmagan savolga javob bergan kun.

To'rt qaror va ularning sababi:

**(a) Faqat `LERNEN` vaqti sanaladi.** `StudentAppSession.sections` ichida vaqt `LERNEN` va
`OTHER` ga bo'lingan, radio esa alohida `radioSeconds` da. Agar umumiy vaqt sanalsa, radio
tinglab yotgan yoki reytingni varaqlab o'tirgan o'quvchi normani bajarib qo'yadi.

**(b) «Yoki N ta savol» sharti bor — «dars tugatgan» emas.** Vaqt o'rganish emas: tez o'quvchi
6 daqiqada ishini qiladi, u qizil chiqmasligi kerak. Birinchi o'qishda bu shart «bitta darsni
tugatgan» edi. Lekin ilovadagi eng muhim kunlik ish — **takrorlash** (Wiederholung, `REVIEW`
seansi) — darsni tugatmaydi. Har kuni 15 ta so'zini 5 daqiqada takrorlab yurgan intizomli
o'quvchi o'sha shart bilan qizil chiqardi. Savol soni ikkala seans turini ham qamraydi.
Boshlang'ich qiymat 12 — bitta dars hajmi.

Savol soni **tugatilgan** seanslardan olinadi (`DafSession.finishedAt IS NOT NULL`,
`questionCount`). Tashlab ketilgan seansdagi javoblar sanalmaydi — bu ataylab: seansni oxirigacha
yetkazish rag'batlantiriladi, vaqt sharti esa baribir bor.

**(c) Kunlik vaqt kun bo'yicha qirqiladi.** Parallel seanslar kun yig'indisini ko'paytirmasin
degan qoida allaqachon bor (`kunlikYigindi()`, ADR-0020): kunlik faol vaqt o'sha kun
seanslarining `[firstSeenAt, lastSeenAt + 120 s]` oraliqlari birlashmasidan oshmaydi, `LERNEN`
ham shu nisbatda qisqaradi. Markaz so'rovi ham **aynan shu qoidani** qo'llaydi (9.3-bo'lim).

**(d) Dam olish kunlari chegirilmaydi.** Norma «haftada 4 kun» — 3 kun bo'sh qoladi; yakshanba va
bayramlar shu 3 kun ichida. Alohida hisob yo'q.

### 3.4 Norma va holat

To'rtta sozlanadigan raqam:

| Sozlama | Kalit | Boshlang'ich | Chegara |
| --- | --- | --- | --- |
| Kunlik eng kam `LERNEN` vaqti | `dafKunlikDaqiqa` | 10 daqiqa | 1..1440 |
| Kunlik eng kam savol (tugatilgan seanslarda) | `dafKunlikSavol` | 12 | 1..500 |
| Haftada eng kam faol kun (yashil) | `dafHaftalikKun` | 4 kun | 1..7 |
| Sariq chegarasi | `dafSariqKun` | 2 kun | 1..7, `< dafHaftalikKun` |

Boshlang'ich qiymatlar — taxminiy. Ular real ma'lumotga qarab sozlanishi uchun **kodga emas,
sozlamalarga** qo'yilyapti. Norma o'zgartirilsa **o'tmish ham yangi norma bilan** hisoblanadi —
bu ataylab: norma tarixiy fakt emas, bugungi nazorat mezoni.

Davr 7 kundan uzun bo'lsa norma mutanosib o'sadi va **o'suvchi maxraj** hisobga olinadi (yangi
qo'shilgan o'quvchi to'liq 30 kun uchun javobgar bo'lmasligi kerak):

```
kerakliKun = max(1, round(dafHaftalikKun × maxraj / 7))
sariqKerak = max(1, round(dafSariqKun   × maxraj / 7))
```

`maxraj` — `davrOynasi()` qaytaradigan mavjud o'suvchi maxraj: `max(davr boshi, akkaunt
yaratilgan kun, kuzatuv boshi)` dan bugungacha bo'lgan kunlar soni. Maxraj juda kichik bo'lsa
(1–2 kun) `sariqKerak` va `kerakliKun` teng chiqib, sariq oraliq yo'qoladi — bu normal: ikki
kunlik o'quvchi haqida hali hukm yo'q.

Holat:

| Belgi | Shart |
| --- | --- |
| ⚪ Akkaunt yo'q | `User` yozuvi yo'q |
| ⚫ Hech qachon kirmagan | Akkaunti bor, lekin butun tarixda hech qachon 10 s dan ko'p faol bo'lmagan |
| 🔴 Qizil | `faolKun < sariqKerak` |
| 🟡 Sariq | `sariqKerak <= faolKun < kerakliKun` |
| 🟢 Yashil | `faolKun >= kerakliKun` |

Hisob **bitta toza modulda**: `server/src/app-activity/norma/norma.ts` — ikkita funksiya:
`faolKunmi(lernenSoniya, savollar, norma)` va `holat(faolKun, maxraj, akkaunt, hechKirmagan,
norma)`. Bazaga tegmaydi, birlik testlari bilan qoplanadi. Hozir guruh tabi holat ko'rsatmaydi;
ko'rsatadigan bo'lsa **shu fayldan** oladi.

### 3.5 Boshqa ko'rsatkichlar

| Ko'rsatkich | Qoida | Manba |
| --- | --- | --- |
| To'g'ri javob % | Tugatilgan seanslar bo'yicha: `Σ firstTryCorrect / Σ questionCount` | `DafSession`; seans yakunida `seansYigindisi()` bilan yoziladi (ADR-0019) |
| O'rtacha kunlik vaqt | `LERNEN` soniyalari / `maxraj`, davr ichida kirganlar orasida | 3.3 ga tayanadi |
| Tugatilgan dars | `DafLessonProgress.completedAt` davr ichida | mavjud; qayta tugatish `completedAt` ni yangilaydi, shuning uchun bu «davrda tugatilgan yoki qayta tugatilgan darslar» |
| Kurs progressi | A1/A2/B1 daraja mantiqi | `stats/daraja.ts`, `birlikProgressi` |
| Oxirgi kirish | Oxirgi seansning `lastSeenAt` i, chegarasiz | mavjud `oxirgiFaolliklar` bilan bir xil |

**To'g'ri javob % haqida ochiq gap.** Guruh tabi bu foizni urinishlardan (`DafAttempt`),
`savolNatijalari()` orqali hisoblaydi — tugallanmagan seanslardagi savollar ham kiradi. Markaz
sahifasi tugatilgan seanslardan oladi. Ikkalasi **bitta qoida** (`seansYigindisi` =
`savolNatijalari` ustiga qurilgan), lekin qamrovi farq qiladi: tashlab ketilgan seans markaz
foiziga kirmaydi. Farq odatda 1–2 foiz; ekranda «tugatilgan seanslar bo'yicha» deb yoziladi.
Nega urinishlardan olinmaydi: 1000 o'quvchining 30 kunlik urinishlarini serverga tortib
`savolNatijalari()` dan o'tkazish — yuz minglab qator; qoidani SQL da qaytadan yozish esa —
juftlash formatlari va o'rinbosar urinishlar bilan — ADR-0019 shartnomasining ikkinchi nusxasi.

### 3.6 Bir o'quvchi — bir qator

O'quvchi bir vaqtda ikki faol guruhda bo'lishi mumkin. Ro'yxatda u **bir qator**:

- «Guruh» ustuni: guruh filtri qo'yilgan bo'lsa — o'sha guruh; bo'lmasa — eng erta boshlangan
  faol yozuvning guruhi.
- «O'qituvchi» — shu guruhning **joriy** o'qituvchisi. O'qituvchi o'zgargan bo'lsa, davrdagi
  faollik joriy o'qituvchiga tegishli deb ko'rinadi (tarix yuritilmaydi).
- Guruh, o'qituvchi va daraja filtrlari o'quvchining **istalgan** faol guruhi mos kelsa o'tkazadi.
- Daraja — `guruhDarajasi(Group.level)` (mavjud: erkin matn boshidagi A1/A2/B1).

---

## 4. Sozlamalar — norma qayerda saqlanadi

`Company` jadvaliga to'rtta yangi maydon qo'shiladi:

```prisma
model Company {
  // ...
  /// DaF normasi: kunlik eng kam LERNEN vaqti, daqiqada.
  dafKunlikDaqiqa Int @default(10)
  /// DaF normasi: kunlik eng kam savol (tugatilgan seanslarda).
  dafKunlikSavol  Int @default(12)
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
(`visibleForRoles: [1]`). To'rtta raqam maydoni, saqlash tugmasi, tagida jonli tushuntirish:

> «Hozirgi norma: o'quvchi kuniga kamida **10 daqiqa** o'quv bo'limida ishlashi yoki **12 ta**
> savolga javob berishi kerak. Haftada shunday **4 kun** bo'lsa — yashil, **2–3 kun** bo'lsa —
> sariq, kamroq bo'lsa — qizil.»

**Server uchun yangi manzil kerak emas.** `company.controller.ts` da allaqachon
`GET /api/company/:id` va `PATCH /api/company/:id` (CEO) bor — to'rtta maydon shularning DTO siga
qo'shiladi. Yangi `daf-norma` yo'li ochilsa, u `@Get(':id')` bilan to'qnashadi.

Markaz sahifalari normani alohida so'ramaydi: har bir `center/*` javobi ichida
`norma: { kunlikDaqiqa, kunlikSavol, haftalikKun, sariqKun }` qaytadi — shunda ekrandagi
belgilar va ular hisoblangan norma har doim bitta javobdan keladi, zid chiqishi mumkin emas.

Tekshiruv DTO da: 3.4-jadvaldagi chegaralar; `dafSariqKun >= dafHaftalikKun` → 400.

---

## 5. 1-sahifa — «Umumiy holat» (`/daf`)

Filtr: **davr** (7 / 30 kun), URL da saqlanadi (`?period=30`). Filial — yuqoridagi global
filial tanlagichi (3-o'qish); CEO «Barcha filiallar» yoki bittasini tanlaydi.

### 5.1 Oltita karta

Maxrajlar ochiq: **foizlar** — barcha faol o'quvchiga nisbatan (akkauntsizlar ham maxrajda);
**o'rtachalar** — davr ichida kirganlar orasida (aks holda nollar o'rtachani yutib yuboradi;
guruh tabi ham shunday qiladi).

| Karta | Asosiy son | Tagidagi izoh | Maxraj |
| --- | --- | --- | --- |
| Qamrov | `620 / 840` | «120 tasida akkaunt yo'q, 100 tasi hech qachon kirmagan» | faol o'quvchi |
| **Normani bajarmoqda** | `38%` | «320 o'quvchi» — bu sahifaning asosiy raqami | faol o'quvchi |
| O'rtacha faol kun | `2,7` | «haftasiga, normadan 1,3 kun kam» — har o'quvchida `faolKun / maxraj × 7` | davrda kirganlar |
| O'rtacha vaqt | `14 daq` | «kuniga, o'quv bo'limida» | davrda kirganlar |
| To'g'ri javob | `76%` | «tugatilgan seanslar bo'yicha · 42 300 savol» | — |
| Tugatilgan darslar | `1 840` | «davr ichida» | — |

### 5.2 Voronka

Eng katta yo'qotish qayerda ekanini bitta qarashda ko'rsatadi:

```
Faol o'quvchi                     840  ████████████████████
Akkaunti bor                      720  █████████████████     −120
Bir marta bo'lsa ham kirgan       620  ██████████████        −100   (butun tarix)
Davr ichida kirgan                410  █████████             −210   (tanlangan davr)
Normani bajargan (yashil)         320  ███████               −90
```

3-pog'ona butun tarix bo'yicha, 4-pog'ona tanlangan davr bo'yicha (3.2-bo'lim). Har bir
pog'onadagi **yo'qotish** bosiladi va `/daf/oquvchilar` ga o'sha filtr bilan o'tadi:

| Yo'qotish | Filtr |
| --- | --- |
| 1 → 2 | `status=akkaunt-yoq` |
| 2 → 3 | `status=hech-qachon-kirmagan` |
| 3 → 4 | `kirgan=yoq` (kirgan edi, bu davrda yo'q) |
| 4 → 5 | `status=qizil,sariq&kirgan=ha` |

Voronka raqamlari kartalar bilan bir xil so'rovdan keladi — zid chiqishi mumkin emas.

### 5.3 Trend

30 kunlik grafik, ikki chiziq: kunlik **kirgan** o'quvchilar (och) va kunlik **faol kun**
bo'lganlar (to'q). Ikkisi orasidagi bo'shliq — «ochdi, lekin ishlamadi». Davr 7 kun tanlansa ham
grafik 30 kun ko'rsatadi (tendensiya 7 kunda ko'rinmaydi); shuning uchun `summary` so'rovi har
doim 30 kunlik kunlik qatorlarni oladi va 7 kunlik kartalarni shu qatorlardan chiqaradi.
`dataviz` ko'nikmasi bo'yicha: o'qlar belgilangan, dam olish kunlari fon bilan ajratilgan.

### 5.4 Filiallar jadvali

Faqat CEO da va faqat tanlagichda «Barcha filiallar» turganda (raqamlar — misol):

| Filial | O'quvchi | Qamrov | Norma | O'rt. faol kun | To'g'ri javob | Tugatilgan dars |
| --- | --- | --- | --- | --- | --- | --- |
| Filial A | 420 | 82% | 44% | 3,1 | 78% | 1 040 |
| Filial B | 310 | 71% | 31% | 2,2 | 74% | 620 |

Foizlar mavjud `foizRangi()` yordamchisi bilan ranglanadi. Qatorga bosilsa — global
tanlagichda o'sha filial tanlanadi (`useBranchSwitcher().selectBranch`), sahifa o'zi qayta yuklanadi. O'quvchining filiali — `StudentBranch` bog'lanishi
(`studentBranchWhere`), seans qatoridagi muhrlangan `branchId` emas (o'quvchi filial o'zgartirgan
bo'lsa, u hozirgi filialida ko'rinadi).

---

## 6. 2-sahifa — «O'quvchilar» (`/daf/oquvchilar`)

Bu bo'limning asosiy ish sahifasi.

### 6.1 Filtrlar

Davr (7/30) · holat (🔴 / 🟡 / 🟢 / akkaunt yo'q / hech qachon kirmagan; bir nechtasi birga) ·
davr ichida kirgan (ha / yo'q) · filial · guruh · o'qituvchi · daraja (A1/A2/B1) · ism yoki
telefon bo'yicha qidiruv. Hammasi URL da saqlanadi.

### 6.2 Jadval

| Ustun | Mazmuni | Saralanadi |
| --- | --- | --- |
| # | Tartib raqami, sahifalar bo'ylab davom etadi | — |
| O'quvchi | Avatar + ism; akkaunt yo'q bo'lsa belgisi bilan | ism |
| Guruh | Guruh nomi, ostida kichik shriftda o'qituvchi (3.6) | guruh nomi |
| Filial | Faqat «hamma filial» tanlanganda | — |
| Holat | Rangli belgi + matn | ha (standart) |
| Faol kun | `3/7` (30 kunda `12/30`) — `faolKun / maxraj` + kunlik chiziqchalar (mavjud `DayBars`) | ha |
| Vaqt | Kuniga o'rtacha `LERNEN` daqiqasi | ha |
| To'g'ri javob | Foiz, ranglangan; savol soni izohda | ha |
| Kurs | Daraja + progress chizig'i (mavjud `ProgressLine`) | — |
| Oxirgi kirish | «kecha», «6 kun oldin», «hech qachon» | ha |

«Kurs» saralanmaydi — u faqat sahifadagi 50 o'quvchi uchun hisoblanadi (9.3).

**Standart saralash — eng muammolisi yuqorida:** holat (⚫ hech qachon kirmagan → 🔴 → 🟡 → 🟢 →
⚪ akkaunt yo'q), teng bo'lsa oxirgi kirish eng uzoq bo'lgani (hech qachon — eng yuqorida), teng
bo'lsa ism. Sahifalash: 50 tadan.

### 6.3 Qatorga bosish

Mavjud `StudentActivityPanel` yon oynasi ochiladi — vaqt, kunlik xarita, mashqlar, kurs, so'zlar,
seanslar tarixi. Yangi komponent yozilmaydi, mavjud `GET /api/students/:id/app-activity`
chaqiriladi. Yon oynadagi «to'g'ri javob» urinishlardan (3.5 dagi farq) — yon oyna sarlavhasida
bu allaqachon «seanslar bo'yicha» deb turadi, qo'shimcha izoh kerak emas.

### 6.4 Tepadagi qator

«**412 ta o'quvchi topildi**» va yonida «**Ro'yxatni nusxalash**» tugmasi. Joriy filtr bo'yicha
topilgan **hamma** o'quvchi (joriy sahifa emas) buferga matn bo'lib ko'chiriladi, har o'quvchi bir
qator:

```
Aziza Karimova — A1-07 — +998 90 123 45 67 — ota-onasi: +998 90 765 43 21
Bekzod Rasulov — A1-03 — +998 91 234 56 78
```

Ism va guruh — administrator kimga qo'ng'iroq qilayotganini bilishi uchun; ota-ona telefoni
(`parentPhone`) bo'lsa qo'shiladi, chunki A1 o'quvchilarining ko'pi bola. `extraPhone`
kiritilmaydi. Eng ko'pi 2000 qator; ko'proq bo'lsa birinchi 2000 tasi va «ro'yxat qisqartirildi»
ogohlantirishi. Alohida yengil manzil (`/phones`) — o'sha filtr, faqat ism/guruh/telefonlar.

---

## 7. 3-sahifa — «Guruh va o'qituvchi» (`/daf/guruhlar`) — 2-bosqich

**Guruhlar jadvali:** guruh · o'qituvchi · filial · o'quvchi soni · qamrov % · norma % ·
o'rt. faol kun · to'g'ri javob % · o'rt. kurs progressi. Qatorga bosilsa — guruhning mavjud
«Ilova faolligi» tabiga o'tadi (`/groups/:id?tab=ilova`). O'quvchi ikki guruhda bo'lsa, ikkala
guruh qatorida sanaladi (bu yerda birlik — guruh, o'quvchi emas).

**O'qituvchilar yig'masi:** o'qituvchi · guruhlar soni · o'quvchilar soni · qamrov % · norma % ·
o'rt. faol kun. Faqat `guruhDarajasi(level)` bo'sh bo'lmagan guruhlarga ega o'qituvchilar
chiqadi. O'qituvchi — guruhning joriy o'qituvchisi (3.6).

Ogohlantirish izohi ekranda: bu raqamlar o'qituvchi ishini emas, **guruhning ilovadan
foydalanishini** o'lchaydi. Guruhlar tarkibi har xil (yangi guruh vs bitiruvchi guruh), shuning
uchun o'qituvchilarni faqat shu jadval bilan solishtirib bo'lmaydi.

---

## 8. 4-sahifa — «Kontent» (`/daf/kontent`) — 3-bosqich

| Blok | Mazmuni |
| --- | --- |
| Qiyin elementlar | Markaz bo'yicha, kamida 3 o'quvchi urinib ko'rgan elementlar; eng past to'g'ri javob foizi bo'yicha, 50 tagacha. Filtr: daraja, unit, format. Mavjud `qiyin-elementlar.ts` qoidasi va `elementAgregatlari` so'rovi, faqat kengroq qamrovda |
| Unit va dars jadvali | Unit · dars · boshlagan (kamida bitta `LESSON` seansi bor) · tugatgan (`DafLessonProgress.completedAt` bor) · o'rtacha `bestScore` · o'rtacha `runs` · o'rtacha seans davomiyligi (`finishedAt − startedAt`, tugatilganlar) |
| Ko'nikma kesimi | `WORTSCHATZ`, `GRAMMATIK`, `HOEREN`, `LESEN`, `SCHREIBEN`, `SPRECHEN` bo'yicha to'g'ri javob % — bu blok urinishlardan (`format` → `skillFuer`), chunki seansda ko'nikma yo'q; mavjud `elementAgregatlari` uslubida SQL |
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
| `GET /api/app-activity/center/summary` | 1 | CEO, Branch Director, Administrator |
| `GET /api/app-activity/center/students` | 1 | CEO, Branch Director, Administrator |
| `GET /api/app-activity/center/students/phones` | 1 | CEO, Branch Director, Administrator |
| `GET /api/app-activity/center/groups` | 2 | CEO, Branch Director, Administrator |
| `GET /api/app-activity/center/content` | 3 | CEO, Branch Director, Administrator |

Norma o'qish va yozish uchun yangi manzil yo'q — mavjud `company` manzillari ishlatiladi
(4-bo'lim).

Fayllar:

| Fayl | Vazifasi |
| --- | --- |
| `center-app-activity.controller.ts` | HTTP chegarasi, `@Roles`, filial hal qilish |
| `center-app-activity.service.ts` | So'rovlarni chaqiradi; norma, holat, saralash, sahifalash |
| `center-app-activity.queries.ts` | Xom SQL agregatlar — faqat mexanik yig'indi |
| `center-app-activity.types.ts` | Javob shartnomasi (klient `types.ts` bilan 1:1) |
| `../norma/norma.ts` | `faolKunmi()`, `holat()` — toza funksiyalar |
| `../norma/norma.spec.ts` | Birlik testlari |

### 9.2 Filial cheklovi

Kontroller `@BranchScope() scope: ReportBranchIds` parametrini oladi (3-o'qish) — guard
sarlavhadagi tanlovni ruxsat bilan kesishtirib bergan javob:

- `null` → hamma filial (faqat CEO)
- `[1, 4]` → shu filiallar
- `[]` → **bo'sh natija** (fail-closed), xato emas

Cheklov **o'quvchilar ro'yxatida** qo'llanadi (`studentBranchWhere`, Prisma). Keyingi xom
so'rovlar shu ro'yxatning `id` lari bilan ishlaydi (`"studentId" = ANY($1)`) va qo'shimcha
`"companyId" = $2` shartini oladi — seans qatoridagi muhrlangan `branchId` bo'yicha filtrlanmaydi
(o'quvchi filial o'zgartirgan bo'lsa, uning butun tarixi hozirgi filialida ko'rinadi; buni
o'quvchi profilidagi tab ham shunday qiladi).

Manifestga (`branch-route-policy.ts`) yozuv **qo'shilmaydi**: `@BranchScope()` li route
`BRANCH_SCOPED_BY_HEADER` deb manbadan o'zi aniqlanadi, manifest testi qayta e'lon qilishni rad
etadi («does not re-declare a route the source already evidences»). ADR-0003 talabi shu yo'l
bilan bajariladi.

### 9.3 So'rov dizayni — eng muhim texnik qaror

**Talab:** o'quvchilar sahifasi 1000+ o'quvchida ham ochilishi kerak; so'rovlar soni o'quvchilar
sonidan qat'i nazar doimiy (mavjud guruh so'rovidagi qoidaning davomi,
`app-activity-stats.service.ts:52-56`); biznes qoidasi SQL ga kirmaydi.

**Birinchi o'qishdagi xato:** saralash va sahifalash SQL da bo'lsin deyilgan edi. Lekin standart
saralash — holat bo'yicha, holat esa normadan chiqadi. Holatni SQL da hisoblash normani SQL ga
olib kiradi — qoida ikki joyda. Yechim: **yig'indi SQL da, qaror va tartib TypeScript da.**

**Yetti so'rov, har doim yetti:**

| # | So'rov | Qaytaradi | Hajmi |
| --- | --- | --- | --- |
| 1 | Prisma: `student.findMany({ where: { ...activeStudentWhere(), ...studentBranchWhere(ids), <guruh/o'qituvchi/daraja/qidiruv> } })` | id, ism, telefonlar, `user.createdAt`, faol yozuvlar (guruh id/nom/level/joriy o'qituvchi) | 1 qator / o'quvchi |
| 2 | SQL: `StudentAppSession`, 30 kun, `(studentId, day)` bo'yicha | `faolSoniya` (qirqilgan), `lernenSoniya` (nisbat bilan), `kirdi` | ≤ o'quvchi × 30 |
| 3 | SQL: `DafSession`, tugatilgan, 30 kun, `(studentId, kun)` bo'yicha; kun = `startedAt` Toshkent kuni | `savollar`, `togri` | ≤ o'quvchi × 30 |
| 4 | SQL: `StudentAppSession`, butun tarix, `studentId` bo'yicha | `hechKirmagan = NOT BOOL_OR(activeSeconds >= 10)`, `oxirgi = MAX(lastSeenAt)` | 1 qator / o'quvchi |
| 5 | SQL: `DafLessonProgress`, `completedAt` davr ichida, `studentId` bo'yicha | `tugatilganDars` | 1 qator / o'quvchi |
| 6 | mavjud `kuzatuvBoshi(companyId)` | sana | 1 |
| 7 | mavjud `kursJamisi` + `tugatilganDarslar` + `oxirgiDarsDarajalari` — **faqat sahifadagi 50 o'quvchi** uchun | kurs (daraja, tugatilgan/jami) | 50 |

TypeScript da (`center-app-activity.service.ts`): har o'quvchi uchun `davrOynasi()` → `maxraj`;
har kun uchun `faolKunmi()`; `holat()`; saralash; 50 taga qirqish; keyin 7-so'rov. `summary` ham
xuddi shu 1–6 so'rovlardan yig'iladi — kartalar, voronka, trend va filiallar jadvali bitta
o'tishda chiqadi.

**Hajm chegarasi, ochiq:** 2- va 3-so'rovlar eng ko'pi `o'quvchi × 30` qator qaytaradi — 1000
o'quvchida 30 000 kichik qator, ~1 MB. Bu CEO sahifasi (kuniga bir necha marta ochiladi, klientda
60 s kesh) uchun yetarli. Faol o'quvchi 3 000 dan oshsa yoki so'rov 2 s dan uzoq bo'lsa —
kunlik qoidani parametrli SQL ga tushirish (`lernen >= $1 OR savollar >= $2`) va `faolKun` ni
bazada sanash ko'rib chiqiladi; o'sha paytda ham chegaralar `norma.ts` dan parametr bo'lib
boradi, qoida esa yagona `faolKunmi()` da qoladi va SQL ifodasi unga test bilan bog'lanadi.

**Kunlik birlashma (3.3-c) SQL da:**

```sql
range_agg(tstzrange("firstSeenAt", "lastSeenAt" + interval '120 seconds'))
```

`kunlikYigindi()` ni aynan takrorlaydi: `faolSoniya = LEAST(Σ activeSeconds, birlashma)`,
`lernenSoniya = ROUND(Σ LERNEN × faolSoniya / Σ activeSeconds)`. Toshkent kuni — `"startedAt" +
interval '5 hours'` (`tashkent.ts`: UTC+5, DST yo'q — IANA kerak emas).

**Bosqich 0 — tekshiriladi:** `range_agg` PostgreSQL 14+ da bor. Neon versiyasi shundan past
bo'lsa, o'rniga oyna funksiyalari bilan klassik «gaps and islands» yoziladi. Bu kod yozishdan
oldin bir marta `SELECT version()` bilan aniqlanadi.

### 9.4 Bir xil qoida ikki joyda — qanday ushlab turiladi

Faqat **bitta** mexanik qoida ikki joyda bo'ladi: kunlik qirqish — guruh tabi uchun TypeScript da
(`kunlikYigindi()`), markaz sahifasi uchun SQL da (2-so'rov). Bu biznes qoidasi emas, o'lchov
tuzatishi; lekin farqlanib ketsa ikki ekran ikki xil daqiqa ko'rsatadi.

Ikki qarshi chora:

1. **Biznes qoidasi SQL ga kirmaydi** — `faolKunmi`, `holat`, saralash tartibi faqat `norma.ts`
   va servisda. To'g'ri javob % ham SQL da qayta yozilmaydi — seans yakunida tayyor son olinadi.
2. **`server/scripts/check-daf-markaz.ts`** — mavjud `check-*` skriptlari uslubida solishtiruvchi
   skript: tasodifiy 30 o'quvchi uchun markaz so'rovlarining har kunlik `faolSoniya`, `lernenSoniya`,
   `kirdi` qiymatlarini `oquvchiFaolligi()` natijasi bilan solishtiradi. Farq → xato. `savollar`
   uchun farqni faqat **ko'rsatadi** (3.5 da tushuntirilgan qamrov farqi), xato demaydi.
   Relizdan oldin prod nusxasida bir marta yuritiladi, keyin shubha tug'ilganda qayta. Skript
   servislarni import qiladi, uni hech narsa import qilmaydi (`server/scripts` import qilinsa
   `main()` yurib ketadi).

---

## 10. Klient

| Fayl | O'zgarish |
| --- | --- |
| `client/src/lib/nav-items.ts` | Yangi «DaF ilovasi» ota-element, `children` bilan, `visibleForRoles: [1, 2, 3]` (mavjud «Hisobotlar» kabi) |
| `client/src/lib/daf-nav.ts` | Yangi — sahifalar ro'yxati va rol qorovuli (`reports-nav.ts` naqshi: ro'yxatda yo'q `/daf/*` yo'l → faqat CEO) |
| `client/src/lib/breadcrumb-routes.ts` | To'rt sahifa uchun nom |
| `client/src/lib/settings-nav.ts` | «DaF normasi» → `/settings/daf`, `visibleForRoles: [1]` |
| `client/src/app/(dashboard)/daf/layout.tsx` | Rol qorovuli + mobil menyu (`reports-layout-shell.tsx` naqshi) |
| `client/src/app/(dashboard)/daf/page.tsx` va boshqalar | 10 qatorli server komponentlari, `<Suspense>` bilan (`useSearchParams` uchun shart) |
| `client/src/app/(dashboard)/settings/daf/page.tsx` | Norma sozlamasi |
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
| **0** | `SELECT version()` — `range_agg` bormi; 2-so'rov prototipi `EXPLAIN ANALYZE` bilan prod nusxasida | Bir buyruq |
| **1** | Norma: Prisma maydonlari + migratsiya + `norma.ts` + testlar + `/settings/daf` + mavjud `company` DTO siga to'rt maydon | Norma sozlanadi, hali hech qaysi sahifa ishlatmaydi |
| **2** | Menyu, `daf-nav.ts`, layout, rol qorovuli, bo'sh sahifalar, manifest yozuvlari | Bo'lim ochiladi |
| **3** | 1–6 so'rovlar + servis + `GET /center/summary` + «Umumiy holat» sahifasi | Kartalar, voronka, trend, filiallar |
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
- `faolKunmi`: vaqt yetadi/savol yetmaydi → ha; savol yetadi/vaqt yetmaydi → ha; ikkalasi
  yetmaydi → yo'q; chegaraning o'zi (`= daqiqa`, `= savol`) → ha
- `holat` chegaralari: `faolKun` 0, `sariqKerak − 1`, `sariqKerak`, `kerakliKun − 1`, `kerakliKun`
- Mutanosib norma: 7 kunlik davrda 4 → 4; 30 kunlik to'liq maxrajda 4 → 17; maxraj 3 kun → 2
- Eng kami 1: maxraj 1 kun bo'lsa `kerakliKun = 1` (0 bo'lib qolmaydi)
- Akkauntsiz va hech qachon kirmagan holatlar normadan oldin tekshiriladi

**Servis testlari (Prisma mock):**
- Saralash tartibi: ⚫ → 🔴 → 🟡 → 🟢 → ⚪; teng holatda oxirgi kirish, keyin ism
- Ikki guruhli o'quvchi bir qator (3.6); guruh filtri istalgan guruhga mos keladi
- Voronka: pog'onalar monoton kamayadi va kartalar bilan bir xil sonlar
- 7-so'rov faqat sahifadagi o'quvchilar `id` lari bilan chaqiriladi

**Kontroller testlari:**
- O'qituvchi (rol 4) → 403
- Administrator boshqa filial `branchId` so'rasa → bo'sh natija, xato emas
- `resolveCallerReportBranchIds` `[]` qaytarsa → bo'sh javob, so'rovlar chaqirilmaydi
- `period` faqat `7` yoki `30`; boshqa qiymat → 400

**Mavjud qorovullar o'zi ushlaydi:** `@BranchScope()` unutilsa yangi manzil manifestda ham
yo'q bo'lib `branch-route-policy` CI testi yiqiladi; o'quvchilar ro'yxati `activeStudentWhere()` siz olinsa —
`active-student-policy.spec.ts`. (Moliya hisobotlaridagi «har so'rovda filial sharti» qorovuli
bu modulga taalluqli emas — u faqat `ReportsFinancialService` ni tekshiradi.)

**Sozlama testlari:** `dafSariqKun >= dafHaftalikKun` → 400; chegaradan tashqari har maydon → 400.

**Qo'lda tekshirish (prod nusxasida, relizdan oldin):**
1. `check-daf-markaz.ts` — 30 o'quvchi bo'yicha vaqt/kirdi farqi yo'q; savol farqi ko'rsatildi
2. Bitta guruhni tanlab, markaz sahifasidagi «kirgan», «o'rtacha vaqt», «tugatilgan dars» o'sha
   guruh tabidagi raqamlar bilan mos
3. Voronka pog'onalari yig'indisi kartalardagi sonlar bilan mos
4. Normani o'zgartirib, ranglar darrov o'zgarishi (kesh 60 s dan keyin)

**Ma'lumot ogohlantirishi:** dev bazada DaF faolligi deyarli yo'q — bo'sh natija «ishladi»
degani emas. Tekshirish prod nusxasida qilinadi.

---

## 13. Bu dizaynda QILINMAYDI

- Excel eksport (ro'yxat nusxalash bor, Excel yo'q)
- Avtomatik eslatma — ishlamayotgan o'quvchiga SMS yoki Telegram xabar
- O'quvchiga normani ilovada ko'rsatish (keyingi ish; hozir norma faqat ichki nazorat uchun)
- Filialga alohida norma
- Bosh sahifa (dashboard) ga DaF kartasi
- Ekran darajasidagi analitika (qaysi ekranda qancha vaqt)
- Reyting / top o'quvchilar ro'yxati — o'quvchi ilovasida allaqachon bor
- Guruh tabini o'zgartirish — u ishlayapti, tegilmaydi; holat rangi u yerga keyin, `norma.ts` dan
- O'qituvchi o'zgarishi tarixi bo'yicha faollikni bo'lish (3.6 — joriy o'qituvchi)
- Norma o'zgarishlari jurnali (kim, qachon)

---

## 14. Xavflar

| Xavf | Ehtimoli | Chora |
| --- | --- | --- |
| Norma noto'g'ri qo'yilib, hamma qizil yoki hamma yashil chiqadi | Yuqori | Norma sozlamada; birinchi hafta CEO real taqsimotni ko'rib o'zgartiradi |
| Markaz SQL va guruh TS daqiqalari zid chiqadi | O'rta | 9.4 — qirqish qoidasi solishtiruvchi skript bilan bog'langan; biznes qoidasi bitta joyda |
| To'g'ri javob % guruh tabidan 1–2 % farq qiladi (tugatilgan seans vs urinish) | Aniq | Ekranda «tugatilgan seanslar bo'yicha»; 3.5 da sabab yozilgan |
| Ma'lumot hajmi (2–3-so'rovlar) sahifani sekinlashtiradi | Past hozir, o'sadi | 9.3 dagi chegara (3 000 o'quvchi / 2 s) va tayyor keyingi qadam; 0-bosqichda `EXPLAIN ANALYZE` |
| `range_agg` mavjud emas | Past | 0-bosqichda tekshiriladi, zaxira yechim bor |
| O'qituvchilar jadvali ishni baholashga ishlatiladi | O'rta | Ekranda ochiq ogohlantirish (7-bo'lim) |
| Bo'lim hisobotlardan ajralib, CEO uni topolmaydi | Past | Yon menyuda ko'rinadigan joyda |

---

## 15. Ochiq savollar

2-o'qishdagi to'rt tahrir (boshda) CEO tasdig'ini kutmoqda. Qolgani hal qilingan.
