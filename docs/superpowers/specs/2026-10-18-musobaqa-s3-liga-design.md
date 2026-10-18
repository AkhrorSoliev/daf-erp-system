# Musobaqa tizimi — S3: haftalik liga va guruhlar jadvali — dizayn

**Sana:** 2026-10-18
**Bog'liq:** [S1 poydevor](2026-10-18-musobaqa-s1-poydevor-design.md) (`DafStudentDay`),
[S2 shaxsiy o'sish](2026-10-18-musobaqa-s2-shaxsiy-osish-design.md) (nishonlar, `grantBadges`),
[Ball, daraja va o'quv yo'li](2026-09-06-ball-va-yol-design.md) (§6 haftalik jadval: hafta = Toshkent dushanbasi,
teng ballda `studentId` kichigi yuqorida, nol ballilar ko'rinadi, markaz filialga cheklanmaydi)

CEO qarorlari (2026-10-18): liga **darajali, faqat ko'tarilish** (hech kim
tushmaydi); guruhlar bellashuvi — **haftalik guruhlar jadvali**; ikki
tuzatish: ko'tarilish faqat xona yetarlicha to'lgan bo'lsa, xonalar teng
bo'linadi. Musobaqa nishonlari (S2 da qoldirilgan) shu bosqichda.

Bugungi hajm: haftasiga 30–51 faol o'quvchi. Reklamadan keyin 1 000–2 000.
Tizim kam faolda «bitta xona + g'olib nishoni» bo'lib ishlaydi va o'sganda
o'zi liga zinapoyasiga aylanadi — sozlash yoki deploy kerak emas.

---

## 1. Liga

### 1.1 Qoidalar (hammasi kodda, `daf/liga/liga-qoidalari.ts`)

| Qoida | Qiymat |
| --- | --- |
| Darajalar | 5: Bronza (0) → Kumush (1) → Oltin (2) → Yoqut (3) → Olmos (4) |
| Xona sig'imi | 30 kishi |
| Ko'tarilish | xonaning birinchi **5** tasi, kamida **50** ball bilan |
| Ko'tarilish shartiga xona hajmi | xonada kamida **15** a'zo bo'lsa; kam bo'lsa ko'tarilish yo'q |
| Tushish | **YO'Q**. Daraja faqat o'sadi |
| Eng yuqori daraja | Olmosda ko'tarilish yo'q (g'olib nishoni bor) |
| Saralash | ball ↓, teng bo'lsa `studentId` ↑ (06.09 §6.2); nol ballilar ko'rinadi |
| Hafta | Toshkent dushanba 00:00 dan yakshanba 24:00 gacha (`wochenStartTag`) |
| Ballar manbai | `DafStudentDay` haftalik yig'indisi, hamma `groupKey` bo'yicha (S2 «bugungi ball» bilan bir xil fikr) |

Ball haftalik yig'indi, kunlik emas, shuning uchun saralash va tenglik
qoidalari mavjud markaz/guruh jadvali bilan bir xil. Xonaga tushish markaz
bo'yicha, **filialga cheklanmaydi** (CEO qarori, 06.09 §6.1).

### 1.2 Doimiy daraja va haftalik xona

Daraja o'quvchining doimiy xususiyati: u mashq qilmagan haftalarda ham
saqlanadi va qaytganda o'sha ligadan boshlanadi (jazo yo'q). Xona esa
haftalik: har hafta yangi xonalar.

```
DafStudentLeague                      (o'quvchiga bitta qator, daraja faqat o'sadi)
  studentId PK, companyId, tier Int (0..4), updatedAt

DafLeagueRoom                         (haftalik xona)
  id, companyId, weekStart @db.Date, tier Int, number Int, settledAt DateTime?
  @@unique([companyId, weekStart, tier, number])

DafLeagueEntry                        (xonadagi a'zolik)
  id, roomId, studentId, companyId, weekStart @db.Date, tier Int,
  place Int?, points Int?, promoted Boolean @default(false)     -- hafta oxirida to'ldiriladi
  @@unique([weekStart, studentId])                              -- hafta ichida bitta xona
```

- `place`, `points`, `promoted` — xona hisoblangandan (§1.4) keyin yoziladi;
  tarix va nishonlar shu qatorlardan o'qiydi.
- Ball `DafLeagueEntry` da hafta davomida saqlanmaydi: xona jadvali
  `DafStudentDay` dan a'zolar ro'yxati bo'yicha yig'iladi (30 kishi — arzon).

### 1.3 Xonaga tushish

- **Dushanba:** o'tgan hafta kamida 1 ball topgan o'quvchilar (hafta
  hisoblanganda, §1.4) o'z darajasi bo'yicha guruhlanadi va `ceil(n / 25)`
  ta xonaga **teng** bo'linadi (25 — sig'imdan past maqsad: yangi
  kelganlar uchun joy qoladi). Taqsimot tartibsiz, lekin takrorlanuvchi:
  `hash(studentId, weekStart)` bo'yicha saralanib navbat bilan.
- **Hafta ichida:** o'tgan hafta faol bo'lmagan yoki yangi o'quvchi birinchi
  seansini tugatganda (§1.5) o'z darajasining **a'zosi eng kam** xonasiga
  qo'shiladi; hamma xona 30 ga to'lgan bo'lsa yangi xona ochiladi.
  Daraja qatori yo'q o'quvchi Bronzadan boshlanadi.
- Mashq qilmagan a'zo xonada 0 ball bilan ko'rinadi (06.09: nol ballilar
  ko'rinadi).
- 40 faol Bronzada 20 + 20 ikki xonaga bo'linadi (30 + 10 emas).

### 1.4 Hafta oxiri hisobi (`settleWeek`)

Dushanba 00:05 Toshkent (cron). Har kompaniya, o'tgan hafta uchun:

1. Hali hisoblanmagan (`settledAt IS NULL`) xonalarni oladi.
2. Har xona: a'zolar ballari `DafStudentDay` dan; saralash §1.1; har
   a'zoga `place` va `points`.
3. Xonada **≥ 15 a'zo** va daraja < 4 bo'lsa: birinchi 5 ta, ball ≥ 50 bo'lsa
   `promoted = true` va `DafStudentLeague.tier + 1`.
4. Xonaga `settledAt = now()`.
5. Yangi hafta xonalarini tuzadi (§1.3 «Dushanba»).
6. Guruhlar jadvalini yozadi (§2.3).

Qoidalar: **takrorlanuvchi** (har xona `UPDATE … WHERE settledAt IS NULL
RETURNING` bilan olinadi, ikki marta ishga tushsa ikkinchi marta hech
narsa qilmaydi); har kompaniya alohida tranzaksiyada, birining xatosi
boshqasini to'xtatmaydi; birinchi seans tugaganda (§1.5) o'tgan hafta hali
hisoblanmagan bo'lsa shu yerdan ham chaqiriladi (cron o'tkazib yuborgan
bo'lsa o'zi tuzatadi). `CRONS_ENABLED=false` bilan cron o'chadi (mavjud
qoida).

### 1.5 Xonaga qo'shilish va nishonlar — seans oxirida

`seansNatijasi` o'ramida (xavfsiz o'ram, xato seansni yiqitmaydi — S2
bilan bir xil) o'quvchi shu hafta xonada bo'lmasa, qo'shiladi
(`joinRoom`), so'ng nishon berish (§3) chaqiriladi. `GET` hech narsa yozmaydi:
xonada bo'lmagan o'quvchi ekranda «Liga: birinchi seansdan keyin» ko'radi.

---

## 2. Guruhlar jadvali

### 2.1 Qoida

Markaz bo'yicha haftalik jadval, **filialga cheklanmaydi** (06.09 §6.1).

- Guruhning bahosi = shu hafta guruhning `DafStudentDay` yig'indisi
  (`groupKey = guruh id`, ya'ni ball topilgan paytdagi guruhga tegishli —
  06.09 qoidasi, mavjud guruh jadvali bilan bir xil) **÷ guruhning hozirgi
  faol a'zolari soni**. Mashq qilmagan a'zo 0 hisoblanadi.
- Faqat **faol guruhlar** (`statusEnum = ACTIVE`) va **kamida 3 faol a'zo**
  bilan. Kam a'zoli guruh jadvalga kirmaydi (1–2 kishilik guruhda bitta
  odam jadvalni boshqarib qo'yadi).
- Saralash: baho ↓, teng bo'lsa guruh id ↑ (takrorlanuvchi).
- Baho 1 o'nlik xonagacha yaxlitlanadi (ko'rsatish uchun); saralash
  yaxlitlanmagan son bo'yicha.

### 2.2 Ko'rinish

TOP 10 + o'quvchining o'z guruhi (haqiqiy o'rni bilan, 10 dan pastda
bo'lsa ham) — markaz jadvalidagi TOP 50 + o'z qatori qoidasi kabi. Guruhsiz
yoki 3 kishidan kam guruhdagi o'quvchi uchun: «Guruhingiz jadvalga hali
kirmaydi (kamida 3 kishi kerak)».

### 2.3 Saqlash

```
DafGroupWeek                          (hafta oxirida yoziladi — tarix va nishon uchun)
  id, companyId, weekStart @db.Date, groupId String, place Int,
  average Float, members Int, points Int
  @@unique([weekStart, groupId])
```

Jonli jadval o'qishda hisoblanadi (bitta SQL: haftalik yig'indilar
`groupKey` bo'yicha + faol a'zolar soni); `settleWeek` o'tgan hafta
natijasini bir marta yozadi.

---

## 3. Musobaqa nishonlari

S2 katalogiga qo'shiladi (`daf/nishon/nishon-katalogi.ts`); migratsiya
kerak emas (kalit — satr). Hammasi **holatdan** hisoblanadi (S2 qoidasi:
berish seans oxirida, takror berilmaydi, olinmaydi).

| Kalit | Shart |
| --- | --- |
| `LIGA_KUMUSH`, `LIGA_OLTIN`, `LIGA_YOQUT`, `LIGA_OLMOS` | `DafStudentLeague.tier ≥ 1 / 2 / 3 / 4` |
| `XONA_GOLIB` | kamida bitta `DafLeagueEntry` (`place = 1`, `points ≥ 50`, xonada kamida 5 a'zo) |
| `GURUH_BIRINCHI` | kamida bitta `DafGroupWeek` (`place = 1`) bo'yicha o'quvchi o'sha hafta shu guruh uchun ≥ 1 ball topgan |

- Ko'tarilish natijasi dushanba hisoblanadi, nishon esa o'quvchining
  **birinchi seansi tugagach** ko'rinadi («Yangi nishon: Kumush ligasi»)
  — S2 modeli bilan bir xil; alohida bildirishnoma S4 da.
- `grantBadges` ning `sharoit` kirishiga `liga` va g'olib belgilari
  qo'shiladi; yuklash seans oxirining birinchi `Promise.all` bosqichida,
  **bitta** yengil so'rov bilan (qo'shimcha ketma-ket aylanma yo'q).

---

## 4. Server

| Yo'l | Nima |
| --- | --- |
| `GET /student-portal/lernen/liga` | `{ haftaBoshi, haftaOxiri, azo: boolean, daraja: {tier, nomi}, xona: {raqam, hajmi, qatorlar[], kotarilishZonasi: {soni, faol}} \| null, otganHafta: {daraja, o'rin, kotarildi, hajmi} \| null }` |
| `GET /student-portal/lernen/guruhlar` | `{ haftaBoshi, qatorlar[] (TOP 10 + o'z guruhi), oz: {o'rin, baho, azolar, nomi} \| null, minAzolar: 3 }` |

- Ikkalasi `DafPortalController` da (sinfiy `@StudentOnly` +
  `StudentCardGuard`), marshrut manifestda SELF (`fortschritt`/`reyting`
  bilan bir sabab), snapshot qatorlari.
- `qatorlar[]` — mavjud `ReytingZeile` shakli (`name`, `punkte`, `platz`,
  `selbst`). Ism ko'rinishi mavjud jadvallar bilan bir xil renderdan.
- `kotarilishZonasi.faol` — xona hajmi ≥ 15 bo'lsa `true` (ekran
  «birinchi 5 tasi ko'tariladi» yoki «xona hali kichik» deydi).
- `GET` hech narsa yozmaydi.
- Yangi jonli mantiq `daf/liga/` ichida (`fortschritt.service.ts` 678 qator,
  unga qo'shilmaydi): `liga-qoidalari.ts`, `liga-xona.ts` (`joinRoom`,
  xonani o'qish), `liga-hisob.ts` (`settleWeek`), `liga.cron.ts`,
  `guruhlar-jadvali.ts`.
- Yagona yozuvchi: `DafLeagueRoom`/`DafLeagueEntry`/`DafStudentLeague`/
  `DafGroupWeek` ni faqat `daf/liga/` ichidagi `liga-xona.ts` va
  `liga-hisob.ts` yozadi; qorovul spec (`liga.single-source.spec.ts`)
  S2 `nishon-berish.single-source.spec.ts` shaklida.

---

## 5. Ekranlar

Reyting ekrani hozir 3 tab (Guruhim / Markaz / Darajam). 390 px da besh tab
sig'maydi, shuning uchun to'rtta:

**Liga · Guruhim · Guruhlar · Darajam**

- **Liga:** daraja nomi va belgisi, «Hafta tugashiga N kun · M kishi»,
  xona jadvali (o'z qatori ajratilgan), ko'tarilish zonasi (birinchi 5 tasi
  yashil, faol bo'lsa; aks holda «xona hali kichik — ko'tarilish ≥ 15
  kishi bo'lganda»), tepada «O'tgan hafta»: «Siz 3-o'rin · Kumush ligasiga
  ko'tarildingiz» yoki «… 8-o'rin». Ostida ikkinchi darajali tugma
  «Butun markaz»: mavjud **Markaz** ro'yxatini ochadi (eski tab shu
  bo'limga ko'chadi, yo'qolmaydi).
- **Guruhim:** o'zgarmaydi.
- **Guruhlar:** §2.2.
- **Darajam:** o'zgarmaydi (S2 «Nishonlarim» shu yerda).

Yo'l tepasidagi to'rt belgi (daraja, ball, seriya, o'rin) va seans oxiri
`natija` o'zgarmaydi: «o'rin» belgisi hamon **markaz** o'rni (S1 testlari
shunga bog'liq). Liga o'rnini belgi/natijaga chiqarish — S4 bilan birga
qaror qilinadi.

Matnlar: faqat lotin o'zbekcha, inglizcha so'zsiz. Liga nomlari: Bronza,
Kumush, Oltin, Yoqut, Olmos.

---

## 6. Mavjud ma'lumot va ishga tushirish

- Daraja qatori yo'q = Bronza (migratsiyada hech narsa to'ldirilmaydi).
- Birinchi hafta (deploy haftasi): oldingi hafta xonalari yo'q, shuning
  uchun hamma birinchi seansda §1.3 «hafta ichida» qoidasi bilan qo'shiladi
  (teng bo'linish birinchi haftada kafolatlanmaydi — qabul qilingan).
  Birinchi `settleWeek` dushanba ishga tushadi, o'sha haftadagi xonalar
  bo'yicha.
- Ko'tarilishlar prodda birinchi marta deploydan keyingi dushanba.
- Bootstrap skripti kerak emas.

---

## 7. Sinash

- **Birlik:** qoidalar (birinchi 5, kamida 50 ball, xona 14 va 15 a'zo
  chegarasi, 5 va 6-o'rinda teng ball, Olmosda ko'tarilish yo'q);
  taqsimot (40 → 20 + 20, 25 → 1 xona, 26 → 2 xona, 61 → 3 xona,
  takrorlanuvchi); `hash` taqsimoti; guruh bahosi (nol ballilar, 2 kishilik
  guruh chiqmaydi); nishon shartlari (chegara, takror berilmaydi).
- **Server:** `settleWeek` takrorlanuvchi (ikki marta = bir marta), bir
  kompaniya xatosi boshqasini to'xtatmaydi, daraja pastga tushmaydi,
  parallel `joinRoom` bitta o'quvchini ikki xonaga solmaydi
  (`@@unique([weekStart, studentId])`); `GET` hech narsa yozmaydi; yangi
  marshrutlar e2e (`studentId`siz token = 404), manifest, snapshot.
- **Haqiqiy baza (sinov bazasida):** `settleWeek` ni 5 000 o'quvchida
  yurgizish (vaqt + natijalar yig'indisi tekshiruvi: Σ place satrlari = a'zolar
  soni; ko'tarilganlar ≤ 5 × xonalar).
- **Yuklama:** `GET liga` va `GET guruhlar` p95 < 200 ms (5 000 o'quvchi,
  50 parallel); `seansNatijasi` p95 < 300 ms (qo'shimcha so'rov bilan);
  hisobot spec §8 ga.
- **Mijoz:** to'rt tab, xona jadvali holatlari (a'zo emas / kichik xona /
  ko'tarilish zonasi / o'tgan hafta), guruhlar jadvali (o'z guruhi 10 dan
  pastda, guruhsiz), «Butun markaz».
- **Brauzer:** 390 px va desktop, yorug'/qorong'i; haftani qo'lda
  oldinga surib `settleWeek` ni yurgizish (sinov bazasida), ko'tarilish va
  nishon ko'rinishi.

---

## 8. Hujjat va deploy

ADR-0116 (raqam deploy oldidan tekshiriladi): «faqat ko'tarilish» qoidasi,
xona sig'imi va ≥ 15 sharti, doimiy daraja va haftalik xona ajratilgani,
`settleWeek` takrorlanuvchi va o'z-o'zini tuzatuvchi. `server/CLAUDE.md`
DaF bo'limiga 2–3 band. Foydalanuvchi qo'llanmasi: o'quvchi qo'llanmasi yo'q,
xodimlar uchun bitta yangilik yozuvi.

**Deploy tartibi:** migratsiya (4 jadval) → kod. Birinchi dushanbadan
keyin: `settleWeek` natijasi (xonalar `settledAt`, `DafGroupWeek` satrlari)
loglardan tekshiriladi.

---

## 9. Bu bosqichda QILINMAYDI

Tushish · juft bellashuv · filial ligalari · xonalar orasida hafta ichida
o'tish · Telegram eslatma va dushanba natijasi (S4) · liga o'rnini `natija`
ekraniga va yo'l tepasi belgisiga chiqarish (S4) · o'qituvchi ko'rinishi
(S5) · native ilova (S6) · pulga sotish.

## 10. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Kam faolda ligalar bo'sh va sun'iy | Ko'tarilish faqat xona ≥ 15 a'zo; kichik xonada faqat g'olib nishoni |
| Dushanba hisobi o'tkazib yuborildi (cron, deploy) | `settleWeek` takrorlanuvchi, birinchi seans oxirida o'zi chaqiriladi |
| Parallel `settleWeek` ikki marta ko'taradi | Xona `UPDATE … WHERE settledAt IS NULL RETURNING` bilan olinadi |
| O'quvchi ikki xonaga tushadi | `@@unique([weekStart, studentId])`; `joinRoom` `ON CONFLICT` bilan |
| Guruhlar jadvali bitta faol odam bilan buziladi | Kamida 3 faol a'zo, nol ballilar hisobga olinadi |
| Seans oxiri sekinlashadi | Liga holati bitta so'rov, birinchi `Promise.all` da; yuklama sinovi |
| 5 000 o'quvchida `settleWeek` uzoq | Xonalar bo'yicha paket, har kompaniya alohida tranzaksiya; vaqt sinovda o'lchanadi |
| Reyting ekrani to'rt tab bilan tor | To'rtta (beshta emas); «Markaz» Liga ichiga ko'chadi |
| Daraja tushmaydi, yuqori ligalar to'lib ketadi | Olmos ligasida ko'tarilish yo'q, xonalar 30 da bo'linadi; kerak bo'lsa keyin daraja qo'shish mumkin |
