# Musobaqa tizimi — S1: poydevor — dizayn

**Sana:** 2026-10-18
**Bog'liq:** [Ball, daraja va o'quv yo'li](2026-09-06-ball-va-yol-design.md)
(ball qoidasi, seriya, haftalik jadval — o'zgarmaydi)

Ball, daraja, seriya va haftalik reyting 2026-09-07 dan productionda. CEO
2026-10-18 da musobaqa tizimini **reklamadan oldin to'liq** tayyorlashni
so'radi: reklamadan keyin o'quvchi birdan ko'payadi va tizim o'shanda
qayta qurilmasligi kerak.

Bu hujjat butun ishning birinchi bosqichi — poydevor. Keyingi bosqichlar
shu poydevorga tayanadi.

---

## 0. Butun ish (S1–S6)

| Bosqich | Nima | Nega shu tartibda |
| --- | --- | --- |
| **S1 Poydevor** | Kunlik yig'indi jadvali, seans oxiri natijasi serverdan, yuklama sinovi, brauzer tekshiruvi | Qolganlarning hammasi shu jadvalni o'qiydi |
| S2 Shaxsiy o'sish | Kunlik maqsad, nishonlar | Kunlik ball S1 jadvalidan |
| S3 Musobaqa | Haftalik liga (kam faolda bitta, o'sganda bo'linadi), guruhlar bellashuvi | Haftalik ball S1 jadvalidan |
| S4 Telegram | Kechki seriya eslatmasi, dushanba natijasi | S2 va S3 natijasini aytadi |
| S5 O'qituvchi | Guruhdan kim mashq qilyapti, guruh bellashuvidagi o'rni | S3 dan keyin |
| S6 Native ilova | Butun mashq qismi ilovaga | Tayyor tizimni bir marta ko'chiramiz |

Har bosqich alohida: spec → plan → UX ko'rik → bajarish → prod.

**Hech bir bosqichda yo'q:** yurak, tosh, seriyani pulga sotib olish
(06.09 dizayni §7: jazo yo'q).

---

## 1. Nega poydevor kerak

**Prod, 2026-10-18 (o'lchandi):**

| Ko'rsatkich | Qiymat |
| --- | --- |
| Faol o'quvchi | 516 |
| Kamida bir marta mashq qilgan | 102 |
| Faqat bitta kun mashq qilgan | 64 |
| 8+ kun mashq qilgan | 4 |
| Haftalik mashq qilganlar | 30–51 |
| Jami urinish (`DafAttempt`) | ≈ 26 000 |

**Kutilayotgan hajm:** reklamadan keyin ≈ 1 000 faol o'quvchi; tizim
2 000 va undan ko'pda ham muammosiz ishlashi shart (CEO). Sinov chegarasi
— **5 000 o'quvchi**.

**Hozirgi ikki og'ir joy** (`fortschritt.service.ts`):

1. `uebersicht` seriya uchun o'quvchining **butun tarixidagi urinishlarni**
   o'qiydi (`dafAttempt.findMany({ where: { studentId } })`), faqat sanasi
   uchun. Faol o'quvchida minglab qator.
2. Markaz o'rni uchun har so'rovda **butun markazning haftalik urinishlari**
   qayta yig'iladi (`groupBy` + `_sum`). 5 000 o'quvchida haftasiga ≈ 1 mln
   qator.

Ikkalasi ham yo'l ekrani har ochilganda va har seansdan keyin ishlaydi.
S2–S4 da (kunlik maqsad, liga, Telegram) xuddi shu yig'indilar yana
uch joyda kerak bo'ladi.

**Uchinchi muammo — seans oxiri.** `abschluss` faqat `{ bestScore, runs }`
qaytaradi. "+70 ball", seriya va o'rin o'zgarishini mijoz hisoblaydi: seans
boshida `fortschritt` suratini oladi va oxirida ayiradi
(`seans-boshlangich.ts`). Sekin ulanishda bu xato raqam bergan (07.09
ko'rigi, Task 9) va hozir ham tuzilishi bo'yicha mo'rt.

---

## 2. Kunlik yig'indi jadvali — `DafStudentDay`

```prisma
/// HOSILA jadval: asl yozuv `DafAttempt`. Istalgan payt urinishlardan
/// qayta quriladi (`scripts/rebuild-daf-student-day.ts`). Bitta yozuvchi —
/// `recordAttempt` (daf/shared/attempt-writer.ts).
model DafStudentDay {
  id        Int      @id @default(autoincrement())
  studentId Int
  companyId Int
  /// Toshkent kuni.
  day       DateTime @db.Date
  /// Urinishdagi muhrlangan `groupId`; guruhsiz bo'lsa "" (NULL emas).
  groupKey  String   @default("")
  points    Int      @default(0)
  attempts  Int      @default(0)
  updatedAt DateTime @updatedAt

  student Student @relation(fields: [studentId], references: [id])

  @@unique([studentId, day, groupKey])
  @@index([companyId, day])
  @@index([groupKey, day])
}
```

**Kalitda guruh bor.** O'quvchi bir kunda guruh almashtirishi mumkin.
06.09 qoidasi saqlanadi: ball topilgan paytdagi guruhga tegishli
(`DafAttempt.groupId` yozuv paytida muhrlanadi).

**`groupKey` NULL emas.** Postgres'da NULL kalit takrorni to'smaydi:
`@@unique` guruhsiz o'quvchi uchun bir kunda ikkinchi qatorga yo'l
qo'yardi. Bu repoda bir marta bo'lgan (`DailyFinancialSnapshot`,
server/CLAUDE.md). Bo'sh satr — guruhsiz.

**Hosila, asl yozuv emas.** 06.09 dizayni "progress jadvali ataylab yo'q"
deydi: ball formulasi o'zgarsa, tarix qayta hisoblanishi kerak. Bu qoida
buzilmaydi:

- ball urinishga yozilgani kabi qoladi (`DafAttempt.points`);
- jadval faqat yig'indi, uni urinishlardan istalgan payt qayta qurish mumkin;
- formula o'zgarganda tartib: urinishlar → jadval qayta quriladi.

Bu ADR'da yoziladi (§8).

**Boshlang'ich to'ldirish** — migratsiyaning o'zida, bitta SQL:

```sql
INSERT INTO "DafStudentDay" ("studentId","companyId","day","groupKey","points","attempts","updatedAt")
SELECT "studentId", "companyId",
       ("createdAt" + interval '5 hours')::date,
       COALESCE("groupId", ''),
       COALESCE(SUM("points"), 0), COUNT(*), now()
FROM "DafAttempt"
GROUP BY 1, 2, 3, 4;
```

`createdAt` — UTC saqlangan `timestamp without time zone`; `+5 soat`
Toshkent kunini beradi (yozgi vaqt yo'q).

---

## 3. Bitta yozuvchi — `recordAttempt`

Hozir `dafAttempt.create` to'rt joyda:

| Joy | Ball |
| --- | --- |
| `UebungService.pruefen` | bor |
| `UebungService.juft` | bor |
| `DafAttemptService.recordDrill` (eski yo'l) | 0 |
| `DafAttemptService.record` (eski yo'l) | 0 |

Hammasi bitta funksiyaga o'tadi: `recordAttempt(prisma, data)`
(`server/src/daf/shared/attempt-writer.ts`). U bitta tranzaksiyada:

1. `createdAt` ni o'zi qo'yadi (`new Date()`), kunni undan hisoblaydi
   (`tashkentDateStr`) — urinish va kunlik qator bir kunga tushishi
   kafolatlanadi;
2. `DafAttempt` qatorini yozadi;
3. kunlik qatorni oshiradi — tagged `$executeRaw`:
   `INSERT … ON CONFLICT ("studentId","day","groupKey") DO UPDATE SET
   "points" = "DafStudentDay"."points" + EXCLUDED."points",
   "attempts" = "DafStudentDay"."attempts" + 1, "updatedAt" = now()`.

Oshirish Postgres'da bajariladi, shuning uchun bir vaqtda kelgan ikki
javob bir-birining yig'indisini yo'qotmaydi. Prisma `upsert` emas:
parallel ikki birinchi yozuv ikkalasi ham INSERT'ga urinib, biri `P2002`
bilan yiqilishi mumkin.

Eski yo'llar ham ball bermasa-da urinish sonini oshiradi — seriya ular
bilan ham sanaladi (hozirgi qoida: urinish bo'lgan kun).

**Qorovul test** — `daf/shared/attempt-writer.single-source.spec.ts`:
`src/` da `dafAttempt.create`/`createMany`/`update`/`delete` faqat
`attempt-writer.ts` da bo'lishi mumkin; boshqa joyda paydo bo'lsa build
yiqiladi. `scripts/` dan urinish o'chirish (masalan 07.09 dagi toza varaq)
faqat qayta qurish skripti bilan birga bajariladi — bu skript
sarlavhasida yoziladi.

---

## 4. O'quvchilar — `FortschrittService`

Hamma raqam faqat `DafStudentDay` dan o'qiladi:

| Raqam | Manba |
| --- | --- |
| `gesamt` (umumiy ball) | o'quvchining hamma qatorlari `SUM(points)` |
| `serie` | `attempts > 0` bo'lgan kunlar → `serieAus` (qoida o'zgarmaydi) |
| `wochePunkte`, `wochePlatzZentrum` | `companyId`, `day >= dushanba` → `groupBy studentId` |
| `wochePlatzGruppe`, guruh jadvali | `groupKey = groupId`, `day >= dushanba`; roster — hozirgidek `Enrollment` |
| `faelligeWoerter` | o'zgarmaydi (`DafLexemeState`) |

Haftaning boshi — Toshkent dushanbasi **sana** sifatida
(`wochenStartUtc` ning sana ko'rinishi; `@db.Date` bilan
`utcMidnightFromDateStr` orqali solishtiriladi, server/CLAUDE.md "Day
boundaries").

**O'zgarmaydigan qoidalar** (06.09 dizayni §6.2, kodda izohlangan):
saralash — ball kamayishi, teng bo'lsa `studentId` o'sishi; nol ballilar
ko'rinadi; markaz jadvali TOP 50 + o'quvchining o'z qatori haqiqiy o'rni
bilan; markaz filialga cheklanmaydi; chip va jadval bitta funksiyadan
hisoblanadi.

**Moslik testi** — bir xil urinishlar to'plami uchun eski hisob
(`DafAttempt` dan) va yangi hisob (`DafStudentDay` dan) har raqamda teng:
umumiy ball, seriya, haftalik ball, markaz va guruh o'rni, teng ball holati,
guruhsiz o'quvchi, kun ichida guruh almashgan o'quvchi, dushanba yarim tuni.

---

## 5. Seans oxiri — natijani server aytadi

Seans tugashining uchala yo'li javobiga `natija` qo'shiladi:

- `POST lessons/:id/abschluss` (oddiy dars va yakuniy sinov),
- `POST wiederholung/abschluss`.

```ts
interface SeansNatijasi {
  /** Shu seansda topilgan ball — seans urinishlaridan, `sessionId` bo'yicha. */
  punkte: number;
  serie: number;
  /** Bugungi birinchi mashq: bugun shu seansdan boshqa urinish yo'q. */
  serieYangi: boolean;
  orin: {
    gruppe: { oldin: number; hozir: number } | null; // guruhsiz — null
    zentrum: { oldin: number; hozir: number };
  };
}
```

**"Oldin" qanday hisoblanadi.** Boshqalarning bali o'zgarmaydi; o'quvchining
haftalik balidan shu seansning **shu haftaga tushgan** bali ayriladi
(`createdAt >= dushanba`). Dushanba yarim tunidan oldin boshlangan seansda
o'tgan haftaga tushgan ball ayrilmaydi. Keyin `hozir` bilan **bir xil**
saralash funksiyasi ishlatiladi — ikki o'rin bitta qoida bilan chiqadi.

**`sessionId` yo'q bo'lsa** (eski so'rov) — `natija: null`; ekran
qo'shimcha qator chiqarmaydi. Yakuniy sinovning mavjud `sinov` maydoni
o'zgarmaydi.

**Mijoz** (`natija-ekrani.tsx`) faqat ko'rsatadi:

- "+N ball" — `punkte > 0` bo'lsa;
- seriya — `serieYangi` bo'lsa;
- o'rin qatori — `oldin !== hozir` bo'lsa (06.09 dizayni §8.2: har safar
  "3-o'rin" deb turaversa shovqinga aylanadi).

**O'chadi:** `seans-boshlangich.ts` va uning testi, `seans-ekrani.tsx`
dagi `boshlangichFortschritt` ref va qayta o'tishdagi `refetch` kutish,
`natija-ekrani.tsx` dagi `gesamtBoshida` / `serieBoshida`. Seans tugagach
`fortschritt` va `reyting` so'rovlari bekor qilinadi (invalidate), yo'l
ekrani yangi raqamni o'zi oladi.

---

## 6. Yuklama sinovi

**Qayerda:** lokal sinov bazasi (`daf-postgres` konteyneridagi alohida
baza; prod va umumiy dev bazaga tegilmaydi).

**To'ldirish:** 5 000 o'quvchi, 200 guruh, bir hafta ichida ≈ 1 mln
urinish, ularning kunlik qatorlari (`recordAttempt` orqali emas — sinov
skripti to'g'ridan-to'g'ri yozadi, keyin moslik audit skripti bilan
tekshiriladi).

**O'lchanadi** — 50 parallel o'quvchi, 10 raund. Servis darajasida,
haqiqiy Postgres bilan (HTTP qatlami so'rov vaqtiga deyarli qo'shmaydi;
og'irlik bazada):

| Amal (endpoint) | Chegara (p95) |
| --- | --- |
| `uebersicht` (`GET lernen/fortschritt`) | < 200 ms |
| `reyting zentrum` (`GET lernen/reyting?scope=zentrum`) | < 200 ms |
| `reyting gruppe` (`GET lernen/reyting?scope=gruppe`) | < 200 ms |
| `recordAttempt` (`pruefen` / `juft` ning yozuvi) | < 200 ms |
| `seansNatijasi` (`abschluss` ga qo'shiladigan qism) | < 300 ms |

Har so'rovning rejasi `EXPLAIN ANALYZE` bilan ko'riladi: indeks ishlatiladi,
`DafAttempt` bo'ylab to'liq skan yo'q. Natija raqamlari shu hujjatga
qo'shiladi (§10). Chegaradan oshsa — shu bosqichda tuzatiladi, keyingi
bosqichga o'tilmaydi.

---

## 7. Brauzer tekshiruvi

07.09 dan qolgan ro'yxat (A1 kurs xotirasi), bitta-bitta:

1. 390px telefonda yo'l: zigzag, unit sarlavhalari, tepadagi to'rt belgi.
2. Dushanba ertalab: yo'l tepasidagi o'rin chipi va reyting "Markaz" tabi
   bir xil gapiradi.
3. Takrorlash ketma-ket ikki marta: ikkinchisida "bugun takrorlanadigan
   so'z yo'q".
4. Bo'limlari tugagan, yakuniy sinovi tugamagan unit.
5. iOS Safari: pastdagi tugma klaviatura ostida qolmaydi (`Yozish`
   maydoni o'zi fokuslanadi) — **iOS Simulator** Safari'sida; built-in
   brauzer Chromium, iOS klaviaturasini ko'rsatmaydi.
6. Qorong'i rejim: yo'l, seans, natija, reyting.
7. Yangi seans oxiri (§5): "+N ball", seriya, o'rin o'zgarishi.

Har biri skrinshot bilan CEO'ga yuboriladi. Topilgan xato shu bosqichda
tuzatiladi.

---

## 8. Hujjatlar

- **ADR** (`docs/adr/`, keyingi bo'sh raqam; merge paytida
  `docs/adr/README.md` ga qarab tekshiriladi): "DaF kunlik yig'indisi —
  hosila jadval". Mazmuni: asl yozuv `DafAttempt`; jadval qayta quriladi;
  bitta yozuvchi; `groupKey` NULL emas; ball formulasi o'zgarsa tartib.
- `server/CLAUDE.md`: DaF bo'limi — yozuvchi va qorovul test.
- Qo'llanma: o'quvchiga ko'rinadigan o'zgarish yo'q (raqamlar o'sha);
  `yangiliklar.ts` ga yozuv kerak emas.

---

## 9. Sinash

**Server (jest):**

- `recordAttempt`: urinish va kunlik qator birga yoziladi; kunlik yozuv
  yiqilsa urinish ham yozilmaydi; bir kunda ikki guruh — ikki qator;
  guruhsiz — `groupKey ""`; Toshkent yarim tuni chegarasi.
- Moslik testi (§4).
- `natija`: ball, `serieYangi`, oldin/hozir o'rin, hafta chegarasidagi
  seans, teng ball, guruhsiz o'quvchi, `sessionId` siz → `null`.
- Qorovul test (§3).
- Controller testlari: yo'llar va markerlar o'zgarmaydi.

**Mijoz (vitest):** natija ekrani `natija` dan to'g'ri qatorlarni chiqaradi
va keraksizini chiqarmaydi.

**Skriptlar:**

- `scripts/audit-daf-student-day.ts` — faqat o'qiydi; har o'quvchi × kun ×
  guruh uchun urinishlardan yig'indi va jadvalni solishtiradi; farq bo'lsa
  nolsiz chiqadi.
- `scripts/rebuild-daf-student-day.ts` — standart holatda dry run; `--apply`
  jadvalni urinishlardan qayta quradi (bitta tranzaksiya).

**Prod'ga chiqqach:** audit skripti bir marta ishga tushiriladi; farq 0
bo'lishi kerak.

---

## 10. Yuklama natijalari

_(Bajarish paytida to'ldiriladi: har so'rov p50 / p95, `EXPLAIN` xulosasi.)_

---

## 11. Bu bosqichda QILINMAYDI

Kunlik maqsad, nishonlar (S2) · liga, guruhlar bellashuvi (S3) · Telegram
xabarlari (S4) · o'qituvchi ko'rinishi (S5) · native ilova (S6) · ball
qoidasi, daraja chegaralari, seriya qoidasining o'zgarishi.

---

## 12. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Jadval urinishlardan siljiydi (kimdir urinishni to'g'ridan-to'g'ri yozadi yoki o'chiradi) | Bitta yozuvchi + qorovul test; audit skripti; qayta qurish skripti |
| Parallel javoblar yig'indini yo'qotadi | Oshirish Postgres'da (`ON CONFLICT … SET points = points + …`) |
| Guruhsiz o'quvchida takror qator | `groupKey ""`, NULL emas |
| Urinish va kunlik qator turli kunga tushadi | `createdAt` ni yozuvchi qo'yadi, kun undan hisoblanadi |
| Yangi va eski hisob farq qiladi, o'quvchi o'rni sakraydi | Moslik testi + prod audit bir marta |
| Yuklama chegarasi bajarilmaydi | Keyingi bosqichga o'tilmaydi; shu yerda tuzatiladi |
