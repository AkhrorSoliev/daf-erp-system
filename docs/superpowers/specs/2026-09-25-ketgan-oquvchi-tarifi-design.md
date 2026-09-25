# Ketgan o'quvchi — yagona ta'rif (1-bosqich)

**Sana:** 2026-09-25
**Holat:** Dizayn ma'qullangan (2026-09-25, bo'limma-bo'lim)
**Qamrov:** `/reports/departed-students` qayta ko'rib chiqishining 1-bosqichi (4 tadan) · server + client'da faqat yozuvlar · ADR-0035 · migratsiya yo'q

## Nima uchun

`/reports/departed-students` auditida sahifaning raqamlariga tayanib bo'lmasligi
chiqdi. Ildizi bitta: **«ketgan» so'zi tizimda to'rt xil ma'noda ishlatiladi**,
va bir oy uchun to'rt xil son chiqadi.

| Joy | Hozirgi ta'rif | Manba |
|---|---|---|
| `/reports/departed-students` | Hozir `ACTIVE` yozuvi yo'q, statusi `GRADUATED` emas (holat surati) | [departed-students-dataset.ts:59](../../../server/src/reports/shared/departed-students-dataset.ts) |
| Bosh sahifa «O'quvchilar» kartasi `−N`, Excel «KPI paneli» | `EXPELLED` soni + `DROPPED` yozuv qatorlari. Chetlatish ikkala tomonga tushadi (audit H30: iyul `33 + 125 = 158`, haqiqatda 117) | [reports-overview.service.ts:159](../../../server/src/reports/reports-overview.service.ts) |
| Bosh sahifa «O'quvchilar oqimi», Excel «O'quvchilar» varag'i | `FROZEN`/`EXPELLED`/`GRADUATED`/`ARCHIVED` status o'tishlari | [reports-student-flow.service.ts](../../../server/src/reports/reports-student-flow.service.ts) |
| Telegram 21:00 «Ketgan» | Bugun `DROPPED` bo'lgan unikal o'quvchilar | [telegram-group-daily-report.service.ts:190](../../../server/src/telegram-groups/telegram-group-daily-report.service.ts) |

Sahifaning o'z ta'rifi eng keng:

1. **Ketmaganlar ham «ketgan».** Guruhga hech qachon qo'shilmagan yangi
   o'quvchi, vaqtincha muzlatilgan (avtomatik pauza ham), `PROSPECT` va
   `systemStartDate` dan oldin ketganlar — hammasi bitta songa tushadi.
2. **«Ketish koeffitsienti» davr churn'i emas.** Formula: butun tarixdagi
   ketganlar ÷ (ketganlar + hozir o'qiyotganlar)
   ([reports-departed-students.service.ts:36](../../../server/src/reports/reports-departed-students.service.ts)).
   Vaqt o'tgan sari faqat o'sadi, shuning uchun 5%/10% rang chegaralari doim qizil.
3. **Dinamika chalg'itadi.** Bugungi ro'yxatni ketgan oyiga bo'ladi: keyin
   qaytganlar o'tmishdan yo'qoladi, so'nggi oylar doim baland ko'rinadi.
4. **Sana filtri KPI va diagrammalarga ta'sir qilmaydi** — ular holat surati.

Mavjud qurilmalar: `EnrollmentStateLog` (har bir yozuv o'tishi, majburiy
yozish joylari bilan — `server/CLAUDE.md`, «Activity Report Snapshots») va
`StatusHistory` (o'quvchi statusining har o'zgarishi, avtomatik pauza ham).
O'quvchi status o'tishlari:
[status-transitions.ts:10](../../../server/src/common/status/status-transitions.ts) —
`FROZEN` dan faqat `ACTIVE` yoki `ARCHIVED` ga o'tish mumkin, `INACTIVE` eski
holat (yangi o'tish yo'q). Guruh tugaganda boshqa guruhi yo'q o'quvchi avtomatik
`GRADUATED` bo'ladi
([status-cascade.service.ts:501](../../../server/src/common/status/status-cascade.service.ts)).

**Prod o'lchovi kutilmoqda.** `server/.env` dagi baza seed ma'lumotli dev baza
bo'lib chiqdi (12 011 faol o'quvchi, status va guruh tarixi yo'q). N ni tanlash
uchun `server/scripts/_probe-departure-gaps.ts` (READ-ONLY, faqat sonlar)
prod'da ishga tushiriladi — «N ni yakunlash» bo'limiga qarang.

## Boshqaruvchi qarorlar

| Qaror | Tanlov | Sabab |
|---|---|---|
| Qachon «ketdi» | Chetlatish va faol o'quvchini arxivlash — **o'sha kuni**. Guruhdan chiqish va muzlatish — **N kun ichida qaytmasa, to'xtagan kuni** | Admin statusni o'zgartirishni unutsa ham ketish ko'rinadi; guruh almashtirish sanalmaydi |
| Muzlatish | Guruhsizlik bilan **bir xil qoida** | Muzlatilganni chetlatib bo'lmaydi. «Pauza ketish emas» desak, qaytmagan pauzadagilar hech qachon churn'ga tushmasdi |
| N | **14 kun, vaqtincha**; prod o'lchovidan keyin yakunlanadi. Nomlangan konstanta, sozlama emas | Sozlama sahifasi va migratsiya shu bosqichda kerak emas (YAGNI); qiymat bir marta asoslab qo'yiladi |
| Qamrov | Hisobot sahifasi + bosh sahifa kartasi + Excel «KPI paneli» | Tanlov. H30 shu bilan yopiladi |
| Oqim diagrammasi, Telegram 21:00 | **Ataylab o'zgartirilmaydi** | Tanlov. Ular boshqa savolga javob beradi (status o'tishlari; bugungi xom hodisalar). Nomuvofiqlik ADR-0035 da yoziladi |
| Hisoblash usuli | **Mavjud jurnallardan**, bitta sof funksiya | Migratsiya ham, yangi yozish joyi ham kerak emas; tarix darhol bor |

> **Tuzatish (2026-09-25, yakuniy ko'rik).** Excel «KPI paneli» (`kpiSheet`)
> 2026-08-07 dan beri hisobot faylida yo'q — `reports-excel.service.ts` uni
> chaqirmaydi. `loadDepartures` ni o'qiydigan sirt shuning uchun ikkita:
> hisobot sahifasi va bosh sahifa kartasi. Fayldagi «ketgan» soni —
> «Xulosa» va «O'quvchilar» varaqlaridagi «Yangi X ta − ketgan Y ta» —
> «O'quvchilar oqimi» ma'nosida (bitiruvchilar ham) qoladi. `kpiSheet` dagi
> o'zgarish kodda qoldi, lekin faylga chiqmaydi; ketganlar hisobotini
> Excel'ga chiqarish — 3-bosqich ishi. Hujjatdagi boshqa «KPI paneli»
> eslatmalari shu tuzatish bilan o'qilsin. Yakuniy ko'rikning ta'rifga oid
> boshqa qarorlari (arxivlash ketish emas; o'chirilgan guruh yozuvlari
> o'chirilgan paytda yopiladi) ADR-0035 da.

**Rad etilgan muqobillar:**

- **Faqat status o'zgarishi** (chetlatish va arxivlash). Guruhdan chiqarilib
  faol qolganlar hech qachon sanalmaydi — admin statusni o'zgartirmasa ketish
  ko'rinmaydi.
- **Har qanday guruhdan chiqish.** Guruh almashtirish (chiqarib, keyin boshqa
  guruhga qo'shish) ham ketish bo'lib qoladi.
- **Muzlatilgan kuni darhol ketgan.** Qisqa pauzalar churn'ni sun'iy oshiradi.
- **`StudentDeparture` hodisalar jadvali + tasdiqlovchi cron.** O'qish tez,
  lekin migratsiya, eski ma'lumotni to'ldirish va 5 dan ortiq yozish joyi
  kerak; bittasi unutilsa son jimgina kamayadi — ADR'lar aynan shu xavfdan
  ogohlantiradi.
- **Holat suratidan taxmin** (hozirgi usulni tozalash). Davr churn'i bo'lmaydi,
  qaytganlar o'tmishdan yo'qoladi. Faqat ish ro'yxatiga yaraydi.

## Ta'rif

### To'xtash va qaytish

«Guruhda» — o'quvchining barcha yozuvlari faol davrlarining **birlashmasi**.
**To'xtash** — birorta ham faol yozuv qolmagan payt yoki quyidagi status
o'tishi. **Qaytish** — faol yozuv yana paydo bo'lgan payt (yangi guruh yoki
muzlatishdan chiqish).

| To'xtash turi | Manba | Qachon «ketgan» |
|---|---|---|
| `EXPELLED` — chetlatildi | `StatusHistory`: `ACTIVE → EXPELLED` | Darhol, o'sha kuni |
| `ARCHIVED` — arxivlandi | `StatusHistory`: `ACTIVE → ARCHIVED` yoki `FROZEN → ARCHIVED` | Darhol, o'sha kuni |
| `FROZEN` — muzlatildi (avtomatik pauza ham) | `StatusHistory`: `ACTIVE → FROZEN` | N kun ichida qaytmasa, muzlatilgan kuni |
| `LEFT_GROUP` — guruhsiz qoldi (guruhdan chiqarish, guruh bekor qilinishi, filial yopilishi) | `EnrollmentStateLog`: oxirgi faol yozuv yopildi | N kun ichida qaytmasa, guruhsiz qolgan kuni |

To'xtash **emas**:

- `TRANSFERRED` — yangi yozuv o'sha zahoti ochiladi, birlashma uzilmaydi;
- boshqa guruhda hali o'qiyotgan o'quvchining bir guruhdan chiqishi;
- `COMPLETED` — guruh tugadi, bitiruvga olib boradi;
- `GRADUATED → ARCHIVED`, `EXPELLED → ARCHIVED` — bitiruvchi churn emas;
  chetlatilganning epizodi allaqachon tasdiqlangan.

`FROZEN → ARCHIVED` yangi epizod ochmaydi: ochiq muzlatish epizodiga qo'shilib,
uni darhol tasdiqlaydi.

### Epizod

Faol bo'lgandan keyingi **birinchi** to'xtash epizodni boshlaydi. Qaytishgacha
bo'lgan keyingi to'xtashlar o'sha epizodga qo'shiladi.

- `startedAt` — birinchi to'xtash vaqti. **Ketgan sana shu.**
- `stopKind` — epizoddagi eng hal qiluvchi tur:
  `ARCHIVED` > `EXPELLED` > `FROZEN` > `LEFT_GROUP`. Chetlatish kaskadi yozuvni
  bir soniya oldin `DROPPED` qilsa ham, ro'yxatda «Chetlatildi» ko'rinadi.
- `state`:
  - `confirmed` — epizodda `EXPELLED`/`ARCHIVED` bor, yoki `startedAt + N`
    o'tdi va qaytish bo'lmadi. `confirmedAt` — shu payt;
  - `pending` — N hali tugamagan va qaytish yo'q. **Xavf ostidagilar** shular.
- Qaytish `startedAt + N` gacha bo'lsa — epizod **bekor**, ketish bo'lmagan.
  Keyinroq bo'lsa — ketish o'z joyida qoladi, `returnedAt` yoziladi
  («qaytib kelgan»).
- Misol: 1-sentyabr guruhdan chiqarildi, 5-sentyabr chetlatildi → bitta
  ketish, sanasi 1-sentyabr, 5-sentyabrdan `confirmed`, `stopKind = EXPELLED`.
- Chetlatilib keyin `ACTIVE` qilingan, lekin guruhga qo'shilmagan o'quvchining
  epizodi guruhga qo'shilguncha ochiq.

### Hisobga kirmaydi

- `GRADUATED` — bitiruv churn emas (darajadan darajaga o'tish — alohida ko'rsatkich).
- `PROSPECT`, o'chirilgan (`deletedAt`) kartalar va yozuvlar.
- Hech qachon guruhga qo'shilmaganlar — ularda to'xtash bo'lmaydi; ular
  `/students` «Guruhlashtirilmagan» ro'yxatining ishi.
- `systemStartDate` dan oldin boshlangan epizodlar davr ko'rsatkichlariga
  kirmaydi (ADR-0005). Ochiq ro'yxatda qoladi.
- `INACTIVE` (eski holat) — alohida qoida yo'q, guruh jurnali bo'yicha sanaladi.

### Filial, vaqt, davr

- Filial — `StudentBranch` (D5: o'quvchi bitta filialda; yozuv filiali unga teng).
- N — to'xtash paytidan **14 × 24 soat**. Oy chegaralari — Toshkent
  (`common/date/tashkent`).
- **Davrda ketganlar** — `startedAt` davr ichida bo'lgan `confirmed`
  epizodli **unikal** o'quvchilar (bir o'quvchi davrda bir marta).
- **Churn** = davrda ketganlar ÷ davr boshida faol bo'lgan o'quvchilar.
  «Faol» — davr boshida `ACTIVE` yozuvi bor (jurnaldan tiklanadi). Guruh
  statusining tarixi tiklanmaydi: guruh tugashi va bekor bo'lishi yozuvlarga
  kaskad qilgani uchun farq amalda yo'q. Davr ichida kelib, davr ichida
  ketganlar suratda bor, maxrajda yo'q — standart formula, qisqa davrda farq kichik.
- `startedAt` so'nggi N kunga tushgan oy — **dastlabki**, keyin o'zgarishi mumkin.

## Qanday ishlaydi

Jurnallar → yuklovchi → sof funksiya → iste'molchilar.

### `server/src/students/shared/departure-episodes.ts` — sof, Prisma'siz

Ta'rif bo'limidagi qoidalar **faqat shu yerda** yashaydi
(`active-student-where.ts` va `norma.ts` kabi).

```ts
export const DEPARTURE_GRACE_DAYS = 14;

export type StopKind = 'EXPELLED' | 'ARCHIVED' | 'FROZEN' | 'LEFT_GROUP';

export type StudentEvent =
  | { studentId: number; at: Date; type: 'STOP'; kind: StopKind }
  | { studentId: number; at: Date; type: 'RETURN' };

export interface DepartureEpisode {
  studentId: number;
  startedAt: Date;
  stopKind: StopKind;
  state: 'pending' | 'confirmed';
  confirmedAt: Date | null;
  returnedAt: Date | null;
}

export function buildDepartureEpisodes(
  events: StudentEvent[],
  opts: { graceDays: number; now: Date },
): DepartureEpisode[];
```

Bekor bo'lgan epizodlar (N ichida qaytgan) natijaga kirmaydi.

### `server/src/students/shared/enrollment-status-on.ts`

`reports-center-activity.service.ts` dagi yopiq `statusOn`
([:942](../../../server/src/reports/reports-center-activity.service.ts)) shu
yerga ko'chiriladi — jurnalsiz eski yozuvlar uchun fallback'i
(`createdAt`/`statusChangedAt`) bilan. `center-activity` va yuklovchi ikkalasi
uni chaqiradi; ikkinchi nusxa bo'lmaydi.

### `server/src/reports/shared/departures.loader.ts`

`loadDepartures(prisma, companyId, scope: ReportBranchIds, range)` →
`{ episodes, activeAtStart }`.

1. Qamrovdagi o'quvchilar (`studentBranchWhere(scope)`, `deletedAt: null`,
   `PROSPECT` emas).
2. Ularning **barcha** `StatusHistory` va `EnrollmentStateLog` qatorlari
   (hajm kichik; ochiq ro'yxat eski epizodlarni ham ko'rsatadi). Davr
   ko'rsatkichlari chegaradan oldingi epizodlarni keyin, epizodlar ustida
   tashlaydi.
3. Har o'quvchi uchun faol yozuvlar birlashmasi bo'yicha `LEFT_GROUP`/`RETURN`,
   `StatusHistory` dan `EXPELLED`/`ARCHIVED`/`FROZEN`. `COMPLETED` va
   `TRANSFERRED` sababli uzilish `LEFT_GROUP` emas.
   - Jurnali yo'q yozuv — `enrollment-status-on` fallback'i.
   - Jurnal yozuvning yopilishini qayd etmagan bo'lsa (eski yozuvchilar) — u
     qatorning o'zidan (`status` + `statusChangedAt`) to'ldiriladi.
   - `StatusHistory` si yo'q eski status — faqat `EXPELLED` va `FROZEN`
     `Student.statusChangedAt` dan olinadi. Eski `ARCHIVED` karta arxivlangan
     bitiruvchi bo'lishi mumkin; uning yozuvlari baribir `LEFT_GROUP` yoki
     bitiruvni ko'rsatadi.
4. `buildDepartureEpisodes` → epizodlar. `activeAtStart` —
   `enrollment-status-on` bilan davr boshida `ACTIVE` yozuvli o'quvchilar.

Filial qamrovi — **ro'yxat** (`ReportBranchIds`), `narrowToSingleBranch` emas:
ko'p filialli admin «Barcha filiallar» da 400 olmaydi. Bo'sh qamrov — 403
(ADR-0002). **Kesh yo'q**: prod hajmi bir necha ming qator; o'lchaymiz, sekin
bo'lsa kunlik kesh (`net-profit-cache.ts` shaklida) qo'shiladi.

### Iste'molchilar

Hammasi `loadDepartures` orqali. `loadDepartedStudents` o'chiriladi.

| Endpoint / joy | Nima oladi |
|---|---|
| `GET /reports/departed-students/summary` | Davrda ketganlar, churn, `activeAtStart`, `pendingCount`, o'rtacha davomiylik, qaytmaganlar qarzi |
| `GET /reports/departed-students/dynamics` | Tanlangan davr oylari bo'yicha `confirmed` epizodlar + `provisional` belgisi. DTO `startDate`/`endDate` oladi |
| `GET /reports/departed-students/list`, `by-status`, `group-by` | **Ochiq epizodlar** (qaytmaganlar: `pending` + `confirmed`) |
| `ReportsOverviewService.getKpis` → `churnedThisMonth`, yangi `pendingDepartures` | Joriy Toshkent oyidagi `confirmed` ketishlar → bosh sahifa kartasi, Excel «KPI paneli» |

`churnedThisMonth` Toshkent oyi bo'yicha sanaladi (`tashkentMonthRangeUtc`).
`getKpis` dagi boshqa oylik ko'rsatkichlar (yangi o'quvchilar, davomat) oy
boshini hozirgidek server soat mintaqasida oladi — ular bu bosqichga kirmaydi
(davomat `@db.Date` ustuni; uni Toshkent timestamp chegarasi bilan solishtirish
aynan `server/CLAUDE.md` ogohlantirgan xato).

## Raqamlar va ko'rinish

Sahifa **tuzilishi o'zgarmaydi** (2-bosqich ishi). O'zgaradigani — raqamlar,
yozuvlar, tooltiplar (ular eski formulalarni tushuntiryapti) va bitta
«kutilmoqda» belgisi.

**Ketganlar sahifasi** (`summary` endi tanlangan davrga bo'ysunadi):

| Karta | Yangi ma'no |
|---|---|
| «Ketganlar soni» → **«Davrda ketganlar»** | Davrda `confirmed` unikal o'quvchilar. Tooltip: «Yana K nafari 14 kun ichida qaytmasa qo'shiladi» |
| «Ketish koeffitsienti» | Davrda ketganlar ÷ davr boshida faol. Qizil/sariq ranglar **olib tashlanadi** (5%/10% hech narsaga asoslanmagan) |
| «O'rtacha o'qish davomiyligi» | Davrda ketganlar: o'quvchining eng birinchi yozuvi `startDate` (bo'lmasa `createdAt`) → `startedAt`. Qaytib kelgan o'quvchi uchun ham eng birinchi yozuv |
| «Ketganlar qarzi» | Hozir qaytmaganlar (ochiq epizodlar) — manfiy balanslar yig'indisi |
| «Yo'qotilgan daromad» | O'zgarmaydi; 2-bosqichda olib tashlanadi |

- **Dinamika** — faqat tanlangan davr oylari; so'nggi 14 kunga tushgan oy
  tooltipda «dastlabki».
- **Ro'yxat va ikki diagramma** — ochiq epizodlar. Sarlavha «Qaytmagan
  ketganlar»; «Guruhsiz qoldi» ustuni → «Ketgan sana» (`startedAt`);
  `pending` qatorda «kutilmoqda» belgisi.

**Bosh sahifa kartasi** — `−N`: joriy oyda `confirmed` ketishlar; sichqoncha
ustida «Yana K nafari 14 kun ichida qaytmasa qo'shiladi».

**Excel «KPI paneli»** — «Shu oy ketganlar (churn)» → «Shu oy ketganlar»,
izoh: «Chetlatilgan, arxivlangan yoki 14 kun ichida qaytmagan (guruhdan
chiqarilgan, muzlatilgan).» Yangi qator: «Qaytishi kutilmoqda».

**API:**

- `summary`: `departedCount`, `churnRate`, `activeAtStart` (`totalStudents`
  o'rniga), `pendingCount`, `graceDays`, `avgDurationMonths`, `totalDebt`,
  `debtorCount`; `lostRevenue` va ustoz metrikalari o'zgarmaydi.
- `list` qatori: `departedAt`, `state` (`pending | confirmed`), `stopKind`
  (`leftAt` o'rniga).
- `dynamics`: `{ data: { date, count, provisional }[] }`.
- `getKpis`: `churnedThisMonth` (yangi ma'no) + `pendingDepartures` +
  `departureGraceDays`; bosh sahifa `DashboardPeople`: `leftPending`,
  `leftGraceDays`.
- UI va Excel matnlarida N raqami yozilmaydi — `graceDays` dan olinadi, shunda
  N o'zgarsa faqat konstanta o'zgaradi.

## Chekka holatlar

- Bir o'quvchi — tarixda bir nechta epizod (ketdi → qaytdi → yana ketdi).
  Davr ichida bir marta sanaladi.
- Oy chegarasidagi epizod: 25-avgust guruhsiz, 8-sentyabr tasdiqlandi →
  **avgust** ketishi (sana `startedAt`).
- Bir soniyada chiqarib-qo'shish (qo'lda guruh almashtirish) → N ichida
  qaytish → ketish yo'q.
- Guruh bekor qilindi / filial yopildi, o'quvchi N kun ichida boshqa guruhga
  joylanmadi → `LEFT_GROUP` ketish (sabab ro'yxatda ko'rinadi).
- Jurnali yo'q eski ma'lumot → fallback'lar (yuqorida). Chegaradan oldingi
  epizodlar davr raqamlariga kirmaydi.
- Xato → endpoint 500. Sahifadagi xato holatlari — 2-bosqich.

## Testlar (TDD, avval yiqiladigan test)

1. **`departure-episodes.spec.ts`** — aniq qiymatli jadval holatlari: darhol
   ketish (`EXPELLED`, `ARCHIVED`); `LEFT_GROUP`/`FROZEN` N ichida va N dan
   keyin qaytish; epizodlarni birlashtirish va `stopKind` ustuvorligi;
   `FROZEN → ARCHIVED`; `TRANSFERRED` (to'xtash yo'q); bir o'quvchida bir
   nechta epizod; `now` bo'yicha `pending`/`confirmed`; N chegarasining
   o'zi (aniq 14 × 24 soat).
2. **`enrollment-status-on.spec.ts`** — ko'chirilgan funksiya, fallback bilan;
   mavjud `reports-center-activity` testlari yashil qoladi.
3. **`departures.loader.spec.ts`** — yozib oluvchi Prisma
   (`reports.controller.query-validation.e2e.spec.ts` dagi kabi): filial
   predikati ro'yxat bilan, `COMPLETED` va `TRANSFERRED` `LEFT_GROUP`
   bermaydi, `GRADUATED → ARCHIVED` to'xtash bermaydi, jurnalsiz yozuv
   fallback'i, yopilishi yozilmagan jurnal qatordan to'ldiriladi; davr
   ko'rsatkichlari chegaradan oldingi epizodni tashlaydi.
4. **Moslik testi** — bitta jurnal fixture'i: sahifa `summary.departedCount`
   (joriy oy) = `getKpis().churnedThisMonth` = Excel «Shu oy ketganlar» qatori.
5. Yangilanadigan testlar: `reports-departed-*`, `reports-overview` (KPI),
   Excel KPI varag'i, `dashboard-summary`.
6. Tekshiruv: `npm test`, `npm run typecheck`, `npx eslint src` (0 xato),
   build; prod'da `_probe-departure-gaps.ts` yuklovchini ham chaqirib, oylik
   natijani SQL `n14` ustuni bilan solishtiradi (READ-ONLY).

## N ni yakunlash

1. Prod'da:
   `railway run npx ts-node --transpile-only scripts/_probe-departure-gaps.ts`
   (`server/` ichidan).
2. Qoida: guruhdan chiqib **qaytganlarning** kamida 90% i qaytgan kunlar soni,
   yuqoriga 7 / 14 / 21 / 30 ga yaxlitlanadi. Muzlatish uchun ham shu hisob
   ko'riladi; ikkalasining kattasi olinadi.
3. Natija ADR-0035 ga yoziladi; `DEPARTURE_GRACE_DAYS` o'sha qiymat.

## Hujjatlar (amalga oshirish PR'i ichida)

- **ADR-0035** «Ketgan o'quvchi — to'xtash va N kunlik qaytish muddati»:
  ta'rif, N va uning asosi, «bitiruv churn emas», «oqim diagrammasi va
  Telegram ataylab o'zgartirilmadi» (sababi bilan).
- **CONTEXT.md** — «Ketgan o'quvchi» yozuvi; «Ketish sababi» yozuvidagi
  «hisobotdagi ketganlar enrollment'larni sanaydi» jumlasi tuzatiladi.

## Deploy

Migratsiya yo'q. Deploydan keyin raqamlar **o'zgaradi** — bu kutilgan:
bosh sahifa kartasidagi `−N` va Excel KPI kamayadi (H30 ikki marta sanashi
ketadi, `pending` hali qo'shilmaydi), sahifadagi ketganlar soni tanlangan
davrga bog'lanadi. PR tavsifida oldin/keyin sonlari (prod probe'dan) beriladi.

## Bu ish hal qilmaydi (keyingi bosqichlar)

- **2-bosqich — sahifa tuzilishi va filtrlar:** davr tahlili va «hozirgi holat»
  ro'yxati alohida bo'limlarda; har filtr ishlaydi yoki olib tashlanadi
  (kurs/o'qituvchi hozir deyarli hech narsani filtrlamaydi; sahifadagi filial
  tanlovi global tanlov bilan to'qnashadi); xato holatlari; «Yo'qotilgan
  daromad», holat donut'i, «Filial bo'yicha» tabi, ustun dialogining
  takrori.
- **3-bosqich — ish ro'yxati va Excel:** qidiruv, filtrlar, sabab ustuni,
  qo'ng'iroq qayd etish (`CallLog`), ro'yxat bilan bir `where` dagi Excel.
- **4-bosqich — chuqur tahlil:** ketish sabablari bloki; ustoz almashishi
  formulasi (hozir birliklar aralash, 100% dan oshadi); qaytganlar; o'qish
  muddati taqsimoti; ketgan paytdagi ustozga bog'lash.
- **Bitiruvchilar sahifasi** hozir bo'sh (faqat sarlavha) — darajadan darajaga
  o'tish o'lchanmaydi.
- «Jami o'zgarishlar» kartasi filtrsiz, dialogi filtrli — #552 dan keyin
  qolgan nomuvofiqlik (2- yoki 4-bosqich).

## Parallel ishlar bilan to'qnashuv

- **#552** (`fix/departed-teacher-changes-filters`) `reports.controller.ts` ga
  tegadi; bu ish ham (qamrov `ReportBranchIds` ga o'tadi). #552 avval
  birlashtiriladi, bu branch undan keyin yangilanadi.
