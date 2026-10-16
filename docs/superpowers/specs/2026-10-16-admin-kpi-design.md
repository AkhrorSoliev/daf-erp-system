# Adminlar KPI tizimi

**Sana:** 2026-10-16
**Holati:** CEO bilan kelishildi (16.10, «Ma'qul, hujjatni yozib 1-bosqichdan boshla»).
1-bosqich PRODDA (16.10, PR #714, ADR-0093). 2-bosqich kelishildi (16.10,
«Ha, ma'qul, hujjatni yozib boshla») — §7.
**Bog'liq:** ADR-0007 (lavozim ≠ rol), ADR-0054 («Dars bo'ldimi?»),
ADR-0079 / ADR-0087 (ruxsatlar), spec `2026-10-07-topshiriqlar-design.md`.

Bu hujjat butun KPI tizimining rejasi. Ish 4 bosqichda, har bosqich alohida
PR bilan chiqadi. Hozir faqat **1-bosqich** (§6) batafsil yozilgan; qolganlari
o'z navbati kelganda shu hujjatga qo'shiladi.

## 1. Muammo

- Adminlar faqat qat'iy oylik oladi (`FIXED_MONTHLY`). Tizimda xodim oyligiga
  natija uchun summa qo'shadigan hech narsa yo'q, admin bo'yicha hisobot ham
  yo'q.
- Lid bilan bir vaqtda bir necha admin ishlaydi. Har biriga KPI yozilsa, bitta
  natija uchun 2–3 marta pul chiqadi.
- Lidning «egasi» yo'q: `Lead.calledById` faqat birinchi qo'ng'iroq qilganni,
  `Lead.statusChangedById` aylantirganni saqlaydi, bot orqali aylanishda esa
  hech kimni.

## 2. Prod raqamlari (16.09–15.10.2026, faqat o'qildi)

| Ko'rsatkich | Qiymat |
| --- | --- |
| Kelgan lid | 535 |
| 2–3 admin ishlagan lid | 174 (33%) |
| O'quvchiga aylangan lid | 265, shundan 183 tasida (69%) admin yozilmagan |
| Bir o'quvchiga bir kunda 2 admin qo'ng'iroq qilgan holat | 831 dan 4 ta |
| Kelmagan, qo'ng'iroqqa javob bermagan, 7 kunda qaytgan | 66% |
| Kelmagan, «keladi» degan, 7 kunda qaytgan | 78% |
| To'lov va'dasi / bajarilgan / buzilgan | 150 / 34 / 68 |
| Bajarilgan va'dada to'lovni boshqa admin kiritgan | 34 dan 10 |

Xulosalar:

- Ikki marta to'lash xavfi **lidda** bor, qo'ng'iroqlarda deyarli yo'q.
- Kelmagan o'quvchining qaytishi asosan qo'ng'iroqqa bog'liq emas. «Qaytdi —
  pul» qoidasi o'zi bo'ladigan narsaga pul to'laydi.
- Va'da KPI'si to'lovni kiritganga emas, va'dani olganga borishi kerak.

## 3. Qarorlar (CEO, 16.10 — qayta so'ralmaydi)

1. **Natijaga to'lanadi, harakatga emas.** Qo'ng'iroq yoki izoh soni KPI
   emas — ularni tekshirib bo'lmaydi.
2. **Har natijaning bitta egasi.** Bitta natija uchun bir marta to'lanadi.
3. **Lidni xodim o'zi band qiladi.** Band qilingan lidni boshqa xodim
   ololmaydi.
4. **CEO va filial direktori** bo'sh yoki band lidni boshqa xodimga bera
   oladi. Direktor — faqat o'z filiali ichida.
5. **Bosib olishga qarshi chegara + muddat:** harakat qilinmagan band lidlar
   bir vaqtda 10 tadan oshmaydi; birinchi harakat 2 ish soati ichida, keyin
   kamida har 3 ish kunida; muddat o'tsa lid umumiy ro'yxatga qaytadi.
   Raqamlar Sozlamalarda o'zgaradi.
6. **Lid KPI'si faqat to'lovda:** lid egasiga, o'quvchining birinchi
   to'lovida, bir marta. To'lov bekor qilinsa — KPI ham bekor.
7. **Qat'iy oylik chegarasi yo'q.** Yaxshi ishlagan xodim qancha natija qilsa,
   shuncha oladi. Himoya — natija haqiqiy pul ekani va har oy CEO tasdig'i.
8. **Har bir harakat tarixga yoziladi:** band qilish, berish, qaytish,
   bo'shatish.
9. Ish bosqichma-bosqich qilinadi, hammasi birdan emas.

## 4. KPI ro'yxati

**Pul beriladigan natijalar**

| # | Natija | Kimga | Qachon |
| --- | --- | --- | --- |
| 1 | Lid to'lov qildi | Lid egasiga | Birinchi to'lovda, bir marta |
| 2 | To'lov va'dasi bajarildi | Va'dani yozganga (`createdById`) | Qarz va'da sanasigacha yopilganda (`KEPT`), har va'daga bir marta |

**Shartlar** (pul emas — KPI to'liq olinishini belgilaydi, ta'siri
4-bosqichda hal qilinadi)

3. Kunning kelmaganlariga o'sha kuni qo'ng'iroq — 90% va undan ko'p.
4. «Dars bo'ldimi?» savoliga muddatida javob.
5. Topshiriqlar muddatida bajarilgan.
6. Muddati o'tib qaytgan lidlar soni.

**KPI emas:** to'lov kiritish (kassa ishi; onlayn to'lov adminni jazolaydi),
davomat belgilash, qo'ng'iroq va izoh soni.

## 5. Bosqichlar

| Bosqich | Nima | Pul |
| --- | --- | --- |
| 1 | Lid egasi: band qilish, berish, chegara, muddat, qaytish, tarix | Yo'q |
| 2 | KPI narxlari (Sozlamalar), natija yozuvlari, «Xodimlar KPI» sahifasi; 1 oy kuzatiladi | Yo'q |
| 3 | Oylikda «KPI mukofoti» qatori, CEO tasdig'i, foyda hisobotida xarajat; ADR | Ha |
| 4 | Shartlar (3–6) va ularning KPI'ga ta'siri | Ha |

Har bosqich oldidan hal qilinadigan savollar:

- **2-bosqich:** KPI kimga beriladi (administrator, kassir?); narxlar;
  qaytib kelgan eski o'quvchining lidi hisoblanadimi. — Hal qilindi, §7.1.
- **3-bosqich:** qaysi oydan boshlanadi.
- **4-bosqich:** bajarilmagan shart KPI'ni qanchaga kamaytiradi.

## 6. 1-bosqich — lid egasi

Pul yo'q. Natija: har lidning bitta egasi bor, egasiz lid umumiy ro'yxatda,
kim nechta lid ushlab turgani va nechtasi qaytgani ko'rinadi.

### 6.1 Ruxsatlar

Ikki yangi ruxsat («Ruxsatlar» sahifasida boshqariladi, ADR-0079):

| Kalit | Nima | Boshlang'ich | Berilishi mumkin |
| --- | --- | --- | --- |
| `leads.claim` | Lidni band qilish va o'z lidini bo'shatish | Administrator | Direktor, Administrator, Kassir |
| `leads.assign` | Bo'sh yoki band lidni boshqa xodimga berish, egasini olib tashlash | Direktor | Direktor |

CEO har doim ikkalasiga ega. Direktor faqat o'z filiali lidini va o'z
filiali xodimiga beradi. Filialsiz lid (`branchId = null`) hamma filialga
ko'rinadi — uni direktor ham bera oladi.

### 6.2 Holatlar

Har lidda egalik maydonlari (`Lead`):

- `ownerId` — hozirgi egasi (bo'sh = umumiy ro'yxatda);
- `ownedAt` — joriy egalik qachon boshlangan;
- `ownerActedAt` — joriy egalikdagi oxirgi harakat (bo'sh = hali harakat yo'q).

Egalik tarixi `LeadOwnershipLog` jadvalida (faqat qo'shiladi, o'zgarmaydi):
`leadId, kind (CLAIM | ASSIGN | RELEASE | EXPIRE), fromUserId, toUserId,
actorId (tizim uchun bo'sh), reason, branchId, companyId, createdAt`.
Hisobot va keyingi bosqichlar shu jadvaldan o'qiydi. Har yozuv lidning
«Tarix» bo'limiga ham `EntityHistory` qatori bo'lib tushadi (qaror 8).

### 6.3 Qoidalar

1. **Band qilish** (`leads.claim`): lid faol (o'chirilmagan, aylanmagan),
   egasiz va xodimning filialida yoki filialsiz bo'lishi kerak. Xodimning
   harakatsiz band lidlari (`ownerActedAt` bo'sh) chegaradan (10) kam bo'lishi
   kerak. Ikki xodim bir vaqtda bossa — birinchisi oladi, ikkinchisiga
   «Bu lidni … band qilgan» (409).
2. **Berish** (`leads.assign`): chegaraga qaramaydi. Yangi egaga soat
   noldan boshlanadi (`ownedAt = hozir`, `ownerActedAt = bo'sh`). Oluvchi
   `leads.claim` ruxsati bor faol xodim va lid filialida bo'lishi kerak.
   «Hech kimga» tanlansa — egalik olib tashlanadi (`RELEASE`).
3. **Bo'shatish:** egasi o'z lidini umumiy ro'yxatga qaytara oladi.
4. **Harakat** — faqat **egasi** qilgani hisoblanadi:
   - qo'ng'iroq belgisi (`PATCH /leads/:id/called`, `called: true`);
   - lidga izoh (`POST /comments`, `entityType = Lead`);
   - lidga topshiriq yaratish yoki uni bajarish (keyingi qo'ng'iroq sanasi).

   Kartochkani boshqa ustunga surish, ma'lumotni tahrirlash — harakat emas.
5. **Muddat** (ish vaqti: dushanba–shanba 08:00–18:00; kompaniya va lid
   filiali bayram kunlari ish vaqtiga kirmaydi):
   - harakat hali yo'q bo'lsa: `ownedAt` + 2 ish soati;
   - harakat bo'lsa: `ownerActedAt` kunidan keyingi 3-ish kunining 18:00 i.
   Muddat saqlanmaydi — har safar shu ikki maydondan hisoblanadi. Shuning
   uchun Sozlamalarda raqam o'zgarsa, hamma lidga darhol ta'sir qiladi.
6. **Qaytish:** ish vaqtida har 15 daqiqada tekshiruv. Muddati o'tgan lid
   egasiz bo'ladi, `EXPIRE` yoziladi, sobiq egasiga ilova ichida xabar boradi.
7. **Qo'lda yaratilgan lid:** yaratuvchida `leads.claim` bo'lsa, u egasi
   bo'ladi va yaratish birinchi harakat sanaladi (u odam bilan allaqachon
   gaplashgan). Anketa va bot lidlari egasiz keladi.
8. **Aylangan lid** (o'quvchi bo'ldi): egasi qotadi, muddat to'xtaydi.
   Aylangan lidni band qilib bo'lmaydi — to'lov oldidan lidni egallab olish
   shu bilan yopiladi. 2-bosqich KPI'ni aynan shu egaga yozadi.
9. **O'chirilgan (LOST) lid:** egasi qotadi, muddat to'xtaydi. Arxivdan
   tiklansa — egasiz qaytadi (`RELEASE`, sabab «Arxivdan tiklandi»).

### 6.4 Ko'rinish

- **Kartochka:** egasining bosh harflari (tooltipda ism) va muddat
  («14:30 gacha»; 1 soatdan kam qolsa to'q sariq). Egasiz kartochkada
  `leads.claim` bor xodimga «Band qilish» tugmasi.
- **Lid oynasi:** «Mas'ul» bloki — egasi, muddat, «Band qilish» /
  «Bo'shatish», `leads.assign` bor odamga «Boshqaga berish» tanlovi.
- **Filtr «Mas'ul»:** «Meniki», «Egasiz» va xodimlar ro'yxati.
- **Xodimlar qatori** (statistika ostida): har xodim — band lidlar
  (shundan harakatsiz), tanlangan davrda qaytganlari.
- **Sozlamalar → «Lidlar egaligi»** (faqat CEO): uch raqam — harakatsiz
  lidlar chegarasi (10), birinchi harakat soati (2), keyingi harakat ish
  kuni (3).

### 6.5 Bu bosqichga kirmaydi

- 24 soat qo'ng'iroq qilinmagan lid uchun avtomatik topshiriq
  (`task-auto-leads`) o'zgarmaydi — u hamma adminga boradi. Egasi bor lidda
  uni egasiga yo'naltirish keyinroq ko'riladi.
- Muddat tugashidan oldin ogohlantirish yo'q — kartochkadagi vaqt yetarli.
- Pul, KPI narxi, natija yozuvlari — 2-bosqich.

### 6.6 ADR

ADR-0093 «Lidning bitta egasi bor: xodim band qiladi, muddatda harakat
qilmasa lid qaytadi» — shu PR bilan.

## 7. 2-bosqich — KPI hisobi (pulsiz kuzatuv)

Pul yo'q. Natija bo'lganda yozuv qilinadi, summa o'sha paytdagi narxda
muhrlanadi; CEO va filial direktori «Xodimlar KPI» sahifasida va xodim
sahifasida kim qancha natija qilganini, o'sish va kamayishni ko'radi. Bir oy
kuzatiladi, keyin 3-bosqichda shu yozuvlar oylikka o'tadi.

### 7.1 Qarorlar (CEO, 16.10 — qayta so'ralmaydi)

1. **KPI faqat administratorlarga.** Natija paytida egasi (lid) yoki
   yozuvchisi (va'da) Administrator roliga ega va CEO hamda Filial direktori
   rollari yo'q bo'lsa — yoziladi. CEO, direktor, kassir natijasi yozilmaydi
   (CEO qo'lda qo'shgan lid ham).
2. **Narx:** har natija turi uchun qat'iy summa yoki foiz, Sozlamalarda
   o'zgaradi. Boshlang'ich: «Lid to'lov qildi» — 50 000 so'm, «Va'da
   bajarildi» — 20 000 so'm (ikkalasi qat'iy). Foiz bazasi: lid — birinchi
   to'lov summasi; va'da — va'da paytidagi qarz.
3. **Eski o'quvchiga bog'langan lid:** bog'lash paytida o'qimayotgan bo'lsa —
   hisoblanadi (ketganni qaytardi); o'qiyotgan bo'lsa — yo'q.
4. **Ko'radi:** CEO (hamma filial) va filial direktori (o'z filiali).
   Administratorning o'zi kuzatuv paytida ko'rmaydi.
5. **Natija darhol yoziladi, summa muhrlanadi.** Narx o'zgarsa — faqat
   keyingi natijalarga ta'sir qiladi.
6. **Xodim sahifasida «KPI» yorlig'i** — oylikdan alohida, har natija qanday
   hisoblangani bilan.
7. **Yoqish/o'chirish kaliti** (faqat CEO).
8. **Taqqoslash va diagrammalar, «Diqqat» bloki** — qoidaga asoslangan,
   har ogohlantirish raqam bilan.
9. **Hisob 17.10.2026 00:00 (Toshkent) dan** — 1-bosqich shu kuni 00:55 da
   chiqdi, lid egalari o'shandan beri bor.

### 7.2 Natija turlari

**`LEAD_PAID` — lid to'lov qildi**

- Lid `CONVERTED`, aylanish paytida `ownerId` bor (aylangan lidning egasi
  qotgan — ADR-0093). Natija shu egaga.
- Aylanish turi lidga yoziladi — yangi `Lead.conversionKind`:
  `NEW_STUDENT` (lid'dan yangi o'quvchi ochildi), `RETURNING` (mavjud
  o'quvchiga bog'landi, o'sha payt `activeStudentWhere()` bo'yicha
  o'qimayotgan edi), `ALREADY_STUDYING` (o'qiyotgan o'quvchiga bog'landi —
  natija yo'q).
- Natija — o'quvchining aylanishdan (`Lead.statusChangedAt`) keyingi **eng
  birinchi `COMPLETED` to'lovi**. Bitta lidga bitta faol natija; bitta to'lov
  faqat bitta `LEAD_PAID` natijaga asos bo'ladi.
- Egasi yo'q yoki aylanish `KPI_START` dan oldin bo'lgan lid — natija yo'q.

**`PROMISE_KEPT` — to'lov va'dasi bajarildi**

- Mavjud qoida: to'lovdan keyin balans ≥ 0 bo'lsa `OPEN` va'da `KEPT`
  bo'ladi (`settleKeptPromises`). Va'da `createdById` ga natija.
- Va'dani `KEPT` qilgan to'lov yangi `PaymentPromise.resolvedPaymentId`
  maydoniga yoziladi (o'sha tranzaksiyada) — natija shu to'lovga bog'lanadi.
- Har va'daga bitta faol natija. Baza (foiz uchun) = `−balanceAtPromise`
  (manfiy bo'lmasa — 0).

**Ikkalasi uchun**

- Natija oyi — to'lov `createdAt` ning Toshkent oyi.
- 7.1/1-qoida natija yoziladigan paytda bazadan o'qiladi (rollar
  `whereUserMayAct()` bilan). Keyin lavozim o'zgarsa — yozuv qoladi.
- Kalit o'chiq bo'lsa yangi natija yozilmaydi; o'chiq davr keyin
  to'ldirilmaydi.

### 7.3 Bekor qilish va ko'chirish

- To'lov bekor qilinsa (`payment.reversed`): shu to'lovga bog'langan faol
  natijalar `CANCELLED` (sabab «To'lov bekor qilindi», vaqt). `LEAD_PAID`
  uchun so'ng lid qayta ko'riladi: aylanishdan keyin boshqa `COMPLETED`
  to'lov bo'lsa, eng birinchisi yangi natija bo'ladi.
- To'lov summasi tuzatilsa (yangi to'lovda `correctsPaymentId`): eski
  to'lovdagi natija `CANCELLED` (sabab «To'lov tuzatildi»), yangi to'lovga
  yangi natija yoziladi — eski natijaning muhrlangan qoidasi bilan (foiz
  bo'lsa — yangi summadan). `PROMISE_KEPT` shu yo'l bilan yo'qolmaydi.
- Bekor qilish kalit o'chiq bo'lsa ham ishlaydi.

### 7.4 Narx va kalit — Sozlamalar → «KPI sozlamalari» (faqat CEO)

Kompaniya darajasidagi sozlamalar (`SETTING_DEFINITIONS`):

| Kalit | Qiymat | Boshlang'ich |
| --- | --- | --- |
| `kpi.enabled` | ha/yo'q | ha |
| `kpi.leadPaid.mode` | `FIXED` / `PERCENT` | `FIXED` |
| `kpi.leadPaid.value` | so'm 0–10 000 000 yoki foiz 0–100 | 50 000 |
| `kpi.promiseKept.mode` | `FIXED` / `PERCENT` | `FIXED` |
| `kpi.promiseKept.value` | so'm 0–10 000 000 yoki foiz 0–100 | 20 000 |

Foiz summasi = `round(baza × foiz / 100)`, so'mga yaxlitlanadi. Kalit
o'zgarganda vaqti ham saqlanadi — sahifa «KPI hisoblash o'chiq (dd.mm dan)»
deb yozadi. Yozish `@CeoOnly()`.

### 7.5 Ma'lumot modeli

`KpiResult` (faqat `KpiResultsService` yozadi — bitta eshik, spec testi
bilan):

`id, companyId, branchId, userId (natija egasi), type (LEAD_PAID |
PROMISE_KEPT), leadId?, promiseId?, studentId, paymentId, paymentAmount,
baseAmount, ruleMode, ruleValue, amount, month ('YYYY-MM'), occurredAt (to'lov
vaqti), status (ACTIVE | CANCELLED), cancelledAt?, cancelReason?,
replacesResultId?, createdAt`.

- `branchId` — lidning filiali (`LEAD_PAID`) yoki va'daning filiali
  (`PROMISE_KEPT`; bo'sh bo'lsa — o'quvchining filiali).
- Qisman unikal indekslar (`status = 'ACTIVE'`): `(leadId)` LEAD_PAID uchun,
  `(paymentId)` LEAD_PAID uchun, `(promiseId)` PROMISE_KEPT uchun.
- `Lead.conversionKind` (yangi enum), `PaymentPromise.resolvedPaymentId`.

### 7.6 Qachon yoziladi

- `payment.received` (commit'dan keyin) → `KpiRecorder`: shu o'quvchining
  `LEAD_PAID` va shu to'lov `KEPT` qilgan `PROMISE_KEPT` natijalarini
  tekshirib yozadi. `payment.reversed` → bekor qilish (7.3).
- Xato to'lovni to'xtatmaydi (log). **Har kecha 03:30 (Toshkent)** shu
  funksiya oxirgi 2 kun to'lovlarini qayta ko'radi — o'tkazib yuborilgan
  hodisani o'zi tuzatadi. Hammasi idempotent (unikal indekslar).
- Deploydan keyin bir marta `scripts/kpi-backfill.ts` (`--apply` siz — faqat
  ko'rsatadi) `KPI_START` dan beri hammasini shu funksiya bilan yozadi.
  `KPI_START` dan keyin aylangan lidlarning `conversionKind` i aylanish
  paytidagi holatdan (`enrollmentStatusOn`) tiklanadi.

### 7.7 «Xodimlar KPI» sahifasi — Hisobotlar → `/reports/xodimlar-kpi`

- **Oy** (`?oy=YYYY-MM`, joriy oy sukut, eng kichigi 2026-10) va
  **taqqoslash** (`?bilan=` — sukut o'tgan oy).
- **Kalit holati** qatori va «Kuzatuv: pul hali berilmaydi».
- **Kartalar** (har biri ▲/▼ taqqoslash bilan): Natijalar (soni);
  Berilganda bo'lardi (summa); Lid → to'lov (%); Oy oxiriga taxmin (faqat
  joriy oy, «≈», oyning 3-ish kunidan keyin).
- **«Diqqat»** — 7.9.
- **«Oy davomida»** — kunlar bo'yicha yig'ma natijalar soni: tanlangan oy va
  taqqoslanayotgan oy (oy kuni bo'yicha tekislangan) — ikki chiziq.
- **«Oylar bo'yicha»** — oxirgi 6 oy (2026-10 dan oldin yo'q), ustunda
  lid va va'da qismlari.
- **Jadval** — har administrator (oyda natijasi yoki band lidi bor):
  Lid to'lov qildi (soni · summa · ▲▼), Va'da bajarildi (soni · summa · ▲▼),
  Lid → to'lov %, Va'da bajarilishi %, Qaytgan lidlar (▲▼), Jami summa.
  Sahifalanmaydi (jamoa bir qarashda — oylik jadvali kabi). Qator bosilsa —
  o'sha xodim natijalari oynasi (`?xodim=`).
- Bekor qilingan natija summaga kirmaydi, oynada ustidan chizilgan holda,
  sababi bilan.

Ko'rsatkichlar ta'rifi (oy M, xodim U):

- **Lid → to'lov:** M oyida U ga kelgan lidlar (`LeadOwnershipLog` CLAIM yoki
  ASSIGN, `toUserId = U`, alohida `leadId`) dan nechtasida U ning faol
  `LEAD_PAID` natijasi bor. Joriy oyda hali to'lamaganlar ham maxrajda —
  sahifada izoh.
- **Va'da bajarilishi:** U yozgan, va'da kuni M ga tushgan va'dalar:
  `KEPT / (KEPT + BROKEN)`; `OPEN` kirmaydi.
- **Qaytgan lidlar:** `LeadOwnershipLog` EXPIRE, `fromUserId = U`, M ichida.

### 7.8 Xodim sahifasi — «KPI» yorlig'i (`/settings/employees/[id]?tab=kpi`)

- Administrator roli bor yoki KPI natijasi bor xodimda ko'rinadi;
  ruxsat va filial — 7.10.
- Oy tanlash; «{Oy} KPI: X so'm» + «Oylikka qo'shilmaydi — kuzatuv»; ▲▼
  o'tgan oy bilan; oxirgi 6 oy chizig'i.
- Natijalar jadvali: sana, natija, «Qanday hisoblandi» (serverdan:
  «birinchi to'lov 600 000 × 5%», «qarz 400 000 × 5%» yoki «qat'iy summa»),
  summa. Bekor qilingan — ustidan chizilgan + sabab.

### 7.9 «Diqqat» — qoidalar

Server hisoblaydi (sof funksiya `kpiSignals`, testlar bilan), mijoz faqat
chizadi. Har signal raqamlari bilan keladi; eng ko'pi 5 ta, og'irligi
bo'yicha tartiblangan.

1. **Keskin oshdi / tushdi:** xodim natijalari soni taqqoslanayotgan oyga
   nisbatan ±30% va undan ko'p, ikki oydan kamida birida ≥ 3 natija. Joriy
   oy — oyning shu kunigacha bo'lgan qismi bilan solishtiriladi. Taqqoslanayotgan
   oy to'liq hisoblanmagan bo'lsa (17.10.2026 dan oldin boshlangan), bu qoida
   jim turadi — u oyda natija yozilmagan kunlar bor edi.
2. **Jim:** xodimda ≥ 3 band lid bor, oxirgi 7 kunda natija yo'q (faqat
   joriy oy).
3. **Ko'p qaytish:** oyda qaytgan lidlar ≥ 3 va taqqoslanayotgan oydagidan
   ko'p.
4. **Va'da past:** va'da bajarilishi < 30%, kamida 5 ta yopilgan va'da.
5. **Eng yaxshi ulush:** eng yuqori «Lid → to'lov» (kamida 5 ta kelgan lid
   bilan) — ijobiy signal.

**Oy oxiri taxmini** (karta, signal emas): joriy oy natijalari ÷ o'tgan ish
kunlari × oyning ish kunlari (du–sha, kompaniya bayramlarisiz), butun songa
yaxlitlanadi. Ikkala ish kunlari soni ham natija yozila boshlagan kundan
(`recordingSince`: 17.10.2026 yoki kalit qayta yoqilgan kun) sanaladi —
undan oldingi kunlarda natija bo'lishi mumkin emas edi.

### 7.10 Ruxsatlar va yo'llar

- Yangi ruxsat `kpi.view` («Xodimlar KPI'sini ko'rish»): boshlang'ich CEO,
  Filial direktori; berilishi mumkin — faqat Direktor (Administrator, Kassir
  — qulf: kuzatuv bosqichida faqat rahbarlar ko'radi).
- Direktor faqat o'z filiali natijalari va xodimlarini ko'radi
  (`@BranchScope()`).
- `GET /kpi/overview?month&compare`, `GET /kpi/users/:id?month`,
  `GET /kpi/settings` (`kpi.view`), `PATCH /kpi/settings` (`@CeoOnly()`).

### 7.11 Oldindan tuzatish

Umumiy `/archive` tiklash (`ArchiveRestoreService`) `CONVERTED` lidni `NEW`
qilib yozadi va egasini bo'shatadi. `convertedStudentId` bor lid `CONVERTED`
holicha, egasi bilan tiklanadi (`restore-release.ts` qoidasi bilan bir xil).

### 7.12 Bu bosqichga kirmaydi

- Pul: oylik qatori, kassa, foyda hisoboti — 3-bosqich.
- Administrator o'z KPI'sini ko'rishi.
- Shartlar (§4, 3–6) — 4-bosqich; «Qaytgan lidlar» faqat ma'lumot.
- Sun'iy intellekt yozadigan xulosa; Telegram xabarlari.

### 7.13 ADR

ADR-0095 «KPI natijasi: administratorga, bir marta, summa muhrlanadi» — shu
PR bilan.
