# Musobaqa S4 — Telegram'da kechki eslatma va dushanba xulosasi: implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faol o'quvchi bugun hali mashq qilmagan bo'lsa 19:30 da botdan bitta yumshoq eslatma oladi (kuniga ≤ 1, ketma-ket kun yo'q, haftada ≤ 4), o'tgan haftada ball topgan o'quvchi dushanba 09:00 da hafta xulosasini oladi; ikkalasi ham ilovadagi almashtirgich yoki xabar tagidagi tugma bilan o'chiriladi; hammasi `DAF_ESLATMALAR=off` bilan yopiq holda deploy qilinadi.

**Architecture:** Yangi `server/src/daf/eslatma/` papkasi: sof qoidalar (`eslatma-qoidalari.ts`) va matnlar (`eslatma-matn.ts`), har tur uchun BITTA auditoriya SQL'i (`eslatma-auditoriya.ts`), yuborishdan OLDIN egallanadigan jurnal (`DafReminderLog`, `INSERT … ON CONFLICT DO NOTHING RETURNING id`, yagona yozuvchi `eslatma-jurnali.ts`), yuboruvchi (`eslatma-yuborish.ts`: auditoriya → jurnal → mavjud `SmsService.sendToStudent`, ≈ 60 ms pauza, xato faqat shu o'quvchiniki), ikki cron va bot tugmasi — alohida `EslatmaModule` da. `remindersEnabled` ni faqat `eslatmalarniSaqla` yozadi (PATCH ham, bot tugmasi ham); `GET fortschritt` holatni mavjud `oquvchi-raqamlari` SQL'idan oladi (qo'shimcha so'rov yo'q).

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL, tagged `$queryRaw`/`$executeRaw` + `Prisma.sql`), `@nestjs/schedule`, Telegraf (mavjud bot), jest (server), Next.js + React Query + vitest (client), ts-node skriptlar.

**Spec:** [`docs/superpowers/specs/2026-10-19-musobaqa-s4-telegram-design.md`](../specs/2026-10-19-musobaqa-s4-telegram-design.md)

## Global Constraints

- Kechki eslatma: har kuni 19:30 Asia/Tashkent, dushanba–shanba; yakshanba va **umumiy** bayram kunida (`HolidaysService.findActiveHolidayCovering(sana, null)`) yo'q. Kimga — spec §1.1 ning yetti sharti, hammasi birga: `Student.deletedAt IS NULL`, `telegramChatId IS NOT NULL`, `telegramDisconnectedAt IS NULL`; `DafStudentSetting.remindersEnabled` (qator yo'q = `true`); oxirgi 14 kunda (bugungidan tashqari) kamida bitta `DafStudentDay` qatori; **bugun** hech qanday qator yo'q; kecha `SENT` kechki eslatma yo'q; oxirgi 7 kunda 4 tadan kam `SENT` kechki eslatma; bugun `SENT` dushanba xulosasi yo'q. Qoidalar BITTA joyda: `server/src/daf/eslatma/eslatma-qoidalari.ts`.
- Dushanba xulosasi: dushanba 09:00 Asia/Tashkent; o'tgan haftada (dushanba–yakshanba) kamida 1 ball topgan, botga ulangan, chati uzilmagan, eslatmalari yoqilgan o'quvchiga bitta xabar. Umumiy bayram dushanbasida ham yuboriladi. Tayyorlik: kompaniyada joriy haftadan oldingi hisoblanmagan liga xonasi yo'q (`DafLeagueRoom.settledAt IS NULL AND weekStart < dushanba`); tayyor bo'lmasa 10:00 … 18:00 har soatda qayta urinish; 18:00 da ham tayyor bo'lmasa shu hafta yuborilmaydi (jurnalga yozilmaydi, logda ogohlantirish).
- Matnlar — spec §1.2 va §2 dagi aynan matnlar (`eslatma-matn.ts`), lotin o'zbekcha, inglizcha so'z yo'q; ism (`Student.firstName`, trim, ≤ 64 belgi) HTML-escape; havola `https://student.dafzentrum.uz/portal/lernen`; tugma «Eslatmalarni to'xtatish», `callback_data = dr:off:<studentId>` (≤ 64 bayt); xabar < 4 096 belgi.
- Jurnal: `DafReminderLog` (`@@unique([studentId, kind, sentOn])`, `sentOn @db.Date` — Toshkent kuni). Yuborishdan OLDIN `INSERT … ON CONFLICT DO NOTHING RETURNING id`; qatorni yaratgan chaqiruv yuboradi, ikkinchisi hech narsa qilmaydi. Natija `SENT`/`FAILED` ga yangilanadi; `FAILED` qayta urinilmaydi va hech qaysi chegaraga sanalmaydi. Eski qatorlar 90 kundan keyin kechki cron oxirida o'chiriladi. Jadvalni faqat `server/src/daf/eslatma/eslatma-jurnali.ts` yozadi — `eslatma-jurnali.single-source.spec.ts` `src/` va `scripts/` ni tekshiradi.
- Yuborish FAQAT `SmsService.sendToStudent(studentId, matn, 'AUTO', undefined, companyId, { replyMarkup })` orqali (audit `SmsMessage` + «SMS» tabi). Yangi to'g'ridan-to'g'ri `.sendMessage(` chaqiruvchi `src/` da paydo bo'lmaydi; `server/src/telegram-digest/direct-send.guard.spec.ts` o'zgarmaydi. `sendToStudent` ga ixtiyoriy `opts.replyMarkup` qo'shiladi, mavjud chaqiruvlar o'zgarmaydi.
- Tezlik: ketma-ket, har yuborishdan keyin `PAUZA_MS = 60` ms; bitta o'quvchidagi xato logga yoziladi va qolganlarini to'xtatmaydi; bir kompaniyaning xatosi boshqasini to'xtatmaydi.
- O'chirgich `DAF_ESLATMALAR` = `off` (standart, noma'lum qiymat ham) | `log` (auditoriya sanaladi va logga yoziladi, hech narsa yozilmaydi va yuborilmaydi) | `on` (yuboriladi). Har cron yurishida o'qiladi. `CRONS_ENABLED=false` da `ScheduleModule` yuklanmaydi — alohida tekshiruv shart emas.
- `remindersEnabled Boolean @default(true)` ni faqat `eslatmalarniSaqla(prisma, studentId, companyId, yoqilgan)` yozadi (`upsert`; mavjud `dailyGoal` ga tegmaydi). `PATCH /student-portal/lernen/eslatmalar` va bot handleri shuni chaqiradi. Bot tugmasi bosgan chat tugmadagi o'quvchining `telegramChatId` siga teng bo'lishi shart.
- `GET fortschritt` javobiga `eslatmalar: boolean` va `telegramUlangan: boolean` — mavjud `oquvchi-raqamlari` SQL'iga ustunlar (`sozlama` CTE + `ulanish` CTE), **qo'shimcha so'rov yo'q**; `fortschritt` p95 qayta o'lchanadi (< 200 ms, 5 000 o'quvchi, 50 parallel).
- Raw SQL faqat `db.$queryRaw<T>(Prisma.sql\`/* belgi */ …\`)` / `db.$executeRaw(Prisma.sql\`/* belgi */ …\`)` (S3 `liga-xona.ts` shakli); `*Unsafe` taqiqlangan. Sana SQL ga `'YYYY-MM-DD'` matni + `::date` bilan beriladi; «hozir» uchun `tashkentDateStr`, `wochenStartTag`, hech qachon `toISOString()`.
- **Hech bir test, proba yoki yuklama skripti haqiqiy Telegram'ga yubormaydi:** soxta bot yoki bo'sh `TELEGRAM_BOT_TOKEN=`, lokal backend `CRONS_ENABLED=false` bilan. CEO uchun sinov nusxasi (`scripts/daf-eslatma-sinov.ts --send`) — rejadan tashqari, controller qo'lda bajaradigan qadam.
- Ekrandagi matn faqat lotin o'zbekcha, inglizcha so'z yo'q («Telegram» — nom).
- Kommit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Server fayllari: `npx prettier --write` → `npx eslint --quiet` → `npx jest <yo'l>`; spec fayllar faqat `npm run typecheck` da tip tekshiruvidan o'tadi. **Client fayllariga prettier ISHLATILMAYDI.**
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4`. Hamma buyruq shu ildizdan (yoki `server/`, `client/` ichidan). Asosiy katalogda commit qilinmaydi.
- `server/src/daf/fortschritt/fortschritt.service.ts` allaqachon 704 qator: unga faqat ulanishlar (ikki maydon, SQL ustunlari, bitta 3 qatorli metod) qo'shiladi; yangi mantiq `server/src/daf/eslatma/` ichida.
- Yuklama va sinov skriptlari faqat lokal `daf_s1_yuklama` bazasida (`scripts/load/local-db-guard.ts`). Har bir SQL haqiqiy Postgres'da tekshiriladi (vaqtinchalik `_probe-*.ts` — commit qilinmaydi — yoki yuklama skripti).

## Fayl xaritasi

| Fayl | Nima | Vazifa |
| --- | --- | --- |
| `server/prisma/schema.prisma` | `DafReminderLog`, `DafReminderKind`, `DafReminderStatus`, `DafStudentSetting.remindersEnabled`, `Student.dafReminders` | 1 |
| `server/prisma/migrations/20261019100000_daf_reminders/migration.sql` | ikki enum, jadval, ustun, indekslar, FK | 1 |
| `server/src/daf/daf-schema.spec.ts` | sxema qorovuli | 1 |
| `server/src/daf/eslatma/eslatma-qoidalari.ts` (+spec) | konstantalar, rejim, sanalar, `kechkiNomzodmi`, `haftalikNomzodmi`, `haftalikQaror`, soat | 2 |
| `server/src/daf/eslatma/eslatma-matn.ts` (+spec) | ikki kechki matn, hafta xulosasi, `nishonNomi`, tugma, javob matnlari | 2 |
| `server/src/daf/eslatma/eslatma-jurnali.ts` (+spec) | `eslatmaniEgalla`, `natijaniYoz`, `eskilariniTozala` | 3 |
| `server/src/daf/eslatma/eslatma-sozlama.ts` (+spec) | `eslatmalarniSaqla` | 3 |
| `server/src/daf/eslatma/eslatma-jurnali.single-source.spec.ts` | jurnal va `remindersEnabled` qorovuli | 3 |
| `server/src/daf/eslatma/eslatma-auditoriya.ts` (+spec) | `kechkiAuditoriya`, `haftalikAuditoriya`, `haftaTayyormi` | 4 |
| `server/scripts/load/daf-yuklama-kohort.ts` | `s4KechkiKun`, `s4HaftalikKun` | 4 |
| `server/scripts/load/daf-yuklama-s4-seed.ts` | soxta chatlar, o'chirilganlar, jurnal tarixi | 4 |
| `server/scripts/load/daf-yuklama-s4-paritet.ts` | auditoriya SQL'i brute force bilan | 4 |
| `server/src/sms/sms.service.ts` (+spec) | `opts.replyMarkup` | 5 |
| `server/src/daf/eslatma/eslatma-yuborish.ts` (+spec) | `EslatmaYuborish`, `haftalikMalumot` | 5 |
| `server/src/daf/eslatma/eslatma.cron.ts` (+spec) | 19:30 va dushanba 9–18 | 6 |
| `server/src/daf/eslatma/eslatma.module.ts`, `server/src/app.module.ts` | modul | 6, 8 |
| `server/src/daf/fortschritt/fortschritt.service.ts` (+spec), `zentrum-sql.fake-spec.ts` | `eslatmalar`, `telegramUlangan`, `eslatmalarniOzgartir` | 7 |
| `server/src/daf/dto/eslatmalar.dto.ts` (+spec) | `{ yoqilgan: boolean }` | 7 |
| `server/src/daf/daf-portal.controller.ts` (+spec) | `PATCH eslatmalar` | 7 |
| `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json` | SELF va surat | 7 |
| `server/src/daf/eslatma/eslatma-telegram.handler.ts` (+2 spec) | `dr:off:<id>` tugmasi | 8 |
| `server/scripts/lib/daf-eslatma-sinov.ts` (+spec), `server/scripts/daf-eslatma-sinov.ts` | CEO sinov nusxasi | 9 |
| `client/src/components/student-portal/lernen/types.ts` | `Fortschritt.eslatmalar`, `telegramUlangan`, `EslatmalarJavob` | 10 |
| `client/.../lernen/eslatma.ts` (+test) | `eslatmaHolati`, matnlar | 10 |
| `client/.../lernen/queries.ts` (+test) | `eslatmalarMutation`, `useEslatmalarOzgartir` | 10 |
| `client/.../lernen/reyting/eslatmalar-qatori.tsx` (+test) | «Telegram eslatmalari» qatori | 11 |
| `client/.../lernen/reyting/reyting-ekrani.tsx` | qatorni «Nishonlarim» ostiga | 11 |
| `server/scripts/load/daf-yuklama-s4-olchov.ts` | vaqt, to'liq yurish soxta botda | 12 |
| `docs/superpowers/specs/2026-10-19-musobaqa-s4-telegram-design.md` | §12 yuklama natijalari | 12 |
| `docs/adr/0117-daf-telegram-eslatma-darhol-royxat.md`, `docs/adr/README.md` | ADR | 13 |
| `server/CLAUDE.md` | DaF bo'limi, «Instant by design», env jadvali | 13 |
| `client/src/qollanma/yangiliklar.ts` | xodimlar uchun yangilik | 13 |

### Spec bilan kod orasida rejada qabul qilingan qarorlar

1. **`telegramUlangan`** `GET fortschritt` ga qo'shiladi: spec §7 «Telegram'ga ulanmagan o'quvchida faol emas» deydi, lekin mijozda bu ma'lumot yo'q (`profile.telegram` — foydalanuvchi nomi, chat emas). U `oquvchi-raqamlari` so'rovining yangi `ulanish` CTE'sidan keladi — qo'shimcha so'rov yo'q. Ulangan = `telegramChatId IS NOT NULL AND telegramDisconnectedAt IS NULL` (cron ham shunday sanaydi).
2. **`fortschritt.service.ts` ga ikki maydon va 3 qatorli `eslatmalarniOzgartir`** — kontroller faqat `FortschrittService` ni oladi (`maqsadniOzgartir` naqshi). Mantiq `eslatma-sozlama.ts` da.
3. **`FAILED` hech qaysi shartga sanalmaydi** (kecha, 7 kunlik chegara, «bugun xulosa olgan»): yetib bormagan xabar «oldi» emas. Lekin shu kun uchun egallangan qator (har qanday holat) qayta yubormaydi — «`FAILED` qayta urinilmaydi».
4. **Egallangan qator `FAILED` bilan boshlanadi** (enumda «kutilmoqda» yo'q): jarayon egallash va yuborish orasida yiqilsa qator yuborilmagan deb qoladi.
5. **7 kunlik oyna = `[bugun − 6, bugun]`** (bugun bilan 7 kun). Ketma-ket kun taqiqi bilan birga 4 ta chegarasi hech qachon ishlamaydi (oynada ko'pi bilan 3 ta); spec yozganidek himoya sifatida qoldi va testlangan.
6. **Haftalik cron — bitta jadval `0 0 9-18 * * 1`**: 09:00 birinchi urinish, 10:00–18:00 qayta urinishlar. Yuborilgan o'quvchi auditoriyadan chiqadi (shu dushanba qatori bor), shuning uchun keyingi soatlar hech kimga yubormaydi. `log` rejimida tayyor hafta har soatda bir qator log beradi (holat saqlanmaydi).
7. **Tayyorlik** — joriy haftadan oldingi HAR QANDAY hisoblanmagan xona (S3 `kechikkan` bilan bir xil savol), faqat o'tgan hafta emas.
8. **Seriya `N`** SQL'da hisoblanadi (bugundan oldingi `attempts > 0` kunlar, kechadan boshlab uzluksiz) — `serieAus` ning aynan o'zi; paritet skripti tekshiradi.
9. **Xulosa qatorlari:** liga qatori — o'tgan hafta `DafLeagueEntry` bor va `place` yozilgan; guruh qatori — o'tgan hafta `groupKey <> ''` bo'yicha eng ko'p ball (teng bo'lsa `groupKey` kichigi, `COLLATE "C"`) topgan guruh `DafGroupWeek` da bo'lsa; nishonlar — `earnedAt` ning Toshkent kuni `[o'tgan dushanba, shu dushanba)` da, olingan tartibida. Nishon nomi serverda kerak: mijozdagi `nishonNomi` serverga ham yoziladi (`eslatma-matn.ts`), ikkalasi bir xil natija bilan testlanadi.
10. **Alohida `EslatmaModule`** (`app.module.ts` da): `DafModule` ga `SmsModule`/`TelegramModule` import qilinmaydi (`DafModule` `AppActivityModule` ga import qilingan — o'quv bo'limi Telegram zanjiriga bog'lanmaydi).
11. **CEO sinov skripti standart holda quruq yuradi** (matnlarni chiqaradi); faqat `--send` bilan yuboradi. `--user` faqat jonli CEO hisobini qabul qiladi; `--chat` bazaga umuman tegmaydi.
12. **`sendToStudent` ga `companyId` beriladi** — `SmsMessage.companyId` va tarix qatori kompaniyali bo'ladi; o'quvchi shu kompaniyada topilmasa xato shu o'quvchida qoladi.
13. **Bo'sh ism** — «Assalomu alaykum!» (vergulsiz).
14. **Tozalash** faqat `on` rejimida, kompaniya bo'yicha (`@@index([companyId, sentOn])` ishlaydi): `log` hech narsa yozmaydi.
15. **Yuklama sinovida kechki auditoriya ERTANGI kun uchun so'raladi** (`s4KechkiKun`): bazada hech kimning «bugungi» qatori yo'q, 14 kunlik oynada esa seed tarixi bor. Dushanba xulosasi shu haftaning dushanbasi uchun (o'tgan hafta S3 skripti bilan hisoblangan).
16. **Yuklama natijalari spec'ning yangi §12 ga** yoziladi (spec §11 — «Xavflar»).

---

### Task 0: Worktree tayyorlash

**Files:** yo'q (muhit).

- [ ] **Step 1: Paketlarni o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npm install
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/client && npm install
```

- [ ] **Step 2: Prisma klienti va boshlang'ich holat**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prisma generate && npx jest src/daf src/sms src/telegram-digest src/common/permissions src/common/auth
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/client && npx vitest run src/components/student-portal
```

Expected: hammasi PASS. Yiqilsa — ishni boshlamasdan sababini yozib, to'xtash.

- [ ] **Step 3: Docker konteyneri** — `docker ps --format '{{.Names}}' | grep -x daf-postgres` → `daf-postgres`. Yo'q bo'lsa repo ildizidan `docker compose up -d` va qayta tekshirish.

- [ ] **Step 4: Commit** — bu vazifada o'zgarish yo'q. `git status --short` bo'sh bo'lishi kerak.

---

### Task 1: Sxema, migratsiya va sinov bazasi

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Student` ichida `dafLeagueEntries  DafLeagueEntry[]` qatoridan keyin; `model DafStudentSetting { … }` bloki butunlay; `model DafGroupWeek { … }` blokidan keyin yangi model va enumlar)
- Create: `server/prisma/migrations/20261019100000_daf_reminders/migration.sql`
- Modify: `server/src/daf/daf-schema.spec.ts`

**Interfaces:**
- Produces: Prisma modeli `dafReminderLog` (`id`, `companyId`, `studentId`, `kind: DafReminderKind`, `sentOn` @db.Date, `status: DafReminderStatus`, `createdAt`; unique `studentId_kind_sentOn`); enumlar `DafReminderKind { EVENING, WEEKLY }`, `DafReminderStatus { SENT, FAILED }`; `DafStudentSetting.remindersEnabled: boolean` (default `true`); relatsiya nomi `Student.dafReminders` (qorovul spec Task 3 shu nomni qidiradi).
- Produces (muhit): lokal baza `daf_s1_yuklama` — migratsiyalar qo'llangan, `prisma/seed.ts` + S1–S3 yuklama ma'lumoti bilan to'ldirilgan, o'tgan hafta hisoblangan; shell o'zgaruvchisi `$S1_DB` (Task 3, 4, 7, 12, 14 ishlatadi).

- [ ] **Step 1: Yiqiladigan sxema testi** — `daf-schema.spec.ts` dagi `describe('Daf sxemasi'` blokining oxiriga (`liga: doimiy daraja, …` testidan keyin, blokni yopuvchi `});` dan oldin):

```ts
  // S4 (ADR-0117). The log is claimed before the send: one row per (student,
  // kind, Tashkent day), so a second cron instance claims nothing. The
  // opt-out is the student's own choice on their settings row, on by default.
  it('eslatma: jurnal o`quvchi, tur va kun bo`yicha yagona; eslatmalar standart yoqilgan', () => {
    const schema = readFileSync(
      join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const body = (name: string) => {
      const start = schema.indexOf(`model ${name} {`);
      expect(start).toBeGreaterThan(-1);
      const block = schema.slice(start);
      return block.slice(0, block.indexOf('\n}'));
    };
    expect(body('DafReminderLog')).toMatch(
      /@@unique\(\[studentId, kind, sentOn\]\)/,
    );
    expect(body('DafReminderLog')).toMatch(/sentOn\s+DateTime\s+@db\.Date/);
    expect(body('DafReminderLog')).toMatch(/@@index\(\[companyId, sentOn\]\)/);
    expect(body('DafStudentSetting')).toMatch(
      /remindersEnabled\s+Boolean\s+@default\(true\)/,
    );
    expect(schema).toMatch(/enum DafReminderKind \{\s*EVENING\s+WEEKLY\s*\}/);
    expect(schema).toMatch(/enum DafReminderStatus \{\s*SENT\s+FAILED\s*\}/);
  });
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts -t eslatma`
Expected: FAIL (`expect(start).toBeGreaterThan(-1)` — `DafReminderLog` modeli yo'q).

- [ ] **Step 3: Sxemaga qo'shish** — `model Student` ichida:

```prisma
  dafLeagueEntries  DafLeagueEntry[]
```

qatorini quyidagiga almashtirish:

```prisma
  dafLeagueEntries  DafLeagueEntry[]
  dafReminders      DafReminderLog[]
```

`/// The student's own choice — NOT derived …` izohi bilan boshlanadigan `model DafStudentSetting { … }` blokini (izoh bilan birga) quyidagiga almashtirish:

```prisma
/// The student's own choice — NOT derived, cannot be rebuilt (ADR-0115).
/// No row = ORTA, reminders on. Written by `PATCH student-portal/lernen/maqsad`
/// (`dailyGoal`) and `eslatmalarniSaqla` (`remindersEnabled`, ADR-0117), both upsert.
model DafStudentSetting {
  studentId        Int          @id
  companyId        Int
  dailyGoal        DafDailyGoal @default(ORTA)
  /// S4 (ADR-0117): kechki eslatma va dushanba xulosasi; o'chirish ikkalasini to'xtatadi.
  remindersEnabled Boolean      @default(true)
  updatedAt        DateTime     @updatedAt

  student Student @relation(fields: [studentId], references: [id])
}
```

`model DafGroupWeek { … }` blokidan (u `@@unique([weekStart, groupId])` va `}` bilan tugaydi) keyin:

```prisma

/// Kechki eslatma (S4 §1) yoki dushanba xulosasi (§2) turi.
enum DafReminderKind {
  EVENING
  WEEKLY
}

enum DafReminderStatus {
  SENT
  FAILED
}

/// S4 xabarlari jurnali (ADR-0117). Qator yuborishdan OLDIN egallanadi
/// (`INSERT … ON CONFLICT DO NOTHING RETURNING id`): qatorni yaratgan chaqiruv
/// yuboradi, ikkinchisi hech narsa qilmaydi. `FAILED` qayta urinilmaydi va
/// chegaraga sanalmaydi; 90 kundan eski qatorlar o'chiriladi.
/// Yagona yozuvchi: `src/daf/eslatma/eslatma-jurnali.ts`.
model DafReminderLog {
  id        Int               @id @default(autoincrement())
  companyId Int
  studentId Int
  kind      DafReminderKind
  /// Toshkent kuni.
  sentOn    DateTime          @db.Date
  status    DafReminderStatus
  createdAt DateTime          @default(now())

  student Student @relation(fields: [studentId], references: [id])

  @@unique([studentId, kind, sentOn])
  @@index([companyId, sentOn])
}
```

- [ ] **Step 4: Migratsiya** — `server/prisma/migrations/20261019100000_daf_reminders/migration.sql`:

```sql
-- S4: Telegram evening reminder and Monday summary (ADR-0117). Nothing is
-- backfilled: no settings row means reminders on; the log starts empty.
CREATE TYPE "DafReminderKind" AS ENUM ('EVENING', 'WEEKLY');

CREATE TYPE "DafReminderStatus" AS ENUM ('SENT', 'FAILED');

ALTER TABLE "DafStudentSetting" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "DafReminderLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "kind" "DafReminderKind" NOT NULL,
    "sentOn" DATE NOT NULL,
    "status" "DafReminderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafReminderLog_studentId_kind_sentOn_key" ON "DafReminderLog"("studentId", "kind", "sentOn");
CREATE INDEX "DafReminderLog_companyId_sentOn_idx" ON "DafReminderLog"("companyId", "sentOn");

ALTER TABLE "DafReminderLog" ADD CONSTRAINT "DafReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Klientni yaratish**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 6: Sinov bazasini yaratish va migratsiyani qo'llash.** S3 oxirida `daf_s1_yuklama` o'chirilgan (S3 Task 12 Step 5). Nomi o'zgarmaydi — `scripts/load/local-db-guard.ts` faqat shuni qabul qiladi. Parolni ekranga chiqarmay URL yig'ish (Bash chaqiruvlari orasida o'zgaruvchi saqlanmaydi — `$S1_DB` ishlatiladigan har buyruqdan oldin quyidagi `export` qatori qaytariladi yoki u bilan bir qatorda `&&` orqali yuritiladi):

```bash
export S1_DB="postgresql://daf_user:$(docker exec daf-postgres printenv POSTGRES_PASSWORD)@127.0.0.1:5433/daf_s1_yuklama"
docker exec daf-postgres psql -U daf_user -lqt | cut -d '|' -f1 | grep -qw daf_s1_yuklama && echo bor || docker exec daf-postgres createdb -U daf_user daf_s1_yuklama
cd server && DATABASE_URL="$S1_DB" node node_modules/prisma/build/index.js migrate deploy
```

Yangi bazada deploy ikki marta to'xtaydi (xotira `reference_throwaway_local_db`): `20260805120000_branch_tenancy_leads_holidays_mock` oldidan `docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c "INSERT INTO \"Company\"(id, name) VALUES (1001, 'Sinov') ON CONFLICT DO NOTHING"`, `20260806120000_drop_company_defaults_and_branch_sequence` oldidan `… -c "INSERT INTO \"Branch\"(id, \"companyId\", name) VALUES (1, 1001, 'Sinov') ON CONFLICT DO NOTHING"` (jadvalda majburiy ustun yetishmasa — xato xabari aytgan ustunni qo'shish); har biridan keyin `DATABASE_URL="$S1_DB" node node_modules/prisma/build/index.js migrate resolve --rolled-back <nom>` va deploy qayta. Expected oxirida: `20261019100000_daf_reminders` qo'llandi. Keyin:

```bash
cd server && DATABASE_URL="$S1_DB" npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
```

Expected: faqat `DROP INDEX "DafStudentDay_companyId_day_cover_idx";` (ADR-0114 dagi kutilgan farq). `DafReminderLog`, `DafReminderKind`, `DafReminderStatus`, `remindersEnabled` haqida HECH NARSA yo'q — qo'lda yozilgan SQL sxemaga aynan mos.

- [ ] **Step 7: Bazani o'quvchilar va S1–S3 yuklama ma'lumoti bilan to'ldirish** (Task 3, 4, 7, 12, 14 ning haqiqiy Postgres tekshiruvlari uchun). Avval o'quvchilar:

```bash
cd server && test ! -e .env && DATABASE_URL="$S1_DB" npx ts-node --transpile-only prisma/seed.ts
```

**Ogohlantirish:** `prisma/seed.ts` olgan bazasining HAMMA jadvalini o'chiradi — `DATABASE_URL` aniq `$S1_DB` bo'lsin; `test ! -e .env` worktree'da `server/.env` yo'qligini tasdiqlaydi (bo'lsa buyruq bajarilmaydi). Expected: xatosiz tugaydi; `docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -tAc 'SELECT COUNT(*) FROM "Student"'` → kamida 6 000.

So'ng, tartib bilan (S3 Task 10 Step 7 bilan bir xil; uzoq buyruqlarni — `daf-yuklama-seed`, `s3-seed`, `s3-hisob` — `run_in_background: true` bilan, tugashini log faylda `Monitor` bilan kutib):

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-seed.ts
cd server && DATABASE_URL="$S1_DB" npm run daf:a1-seed
cd server && for u in 1 2 3 4 5; do DATABASE_URL="$S1_DB" npm run daf:inhalt-seed -- --unit $u; done
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s2-seed.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s3-seed.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s3-hisob.ts
```

Expected: yuklama seed `week ≈ 1 000 000`, `history ≈ 300 000`, `diff: 0`; S2 seed `diff: 0`, `boshOchiq: false`, `boshTugagan: true`; S3 seed `qoshildi: 4500`, har daraja xonalari `eng ≤ 30`, exit 0; `s3-hisob` `xatolar: 0` (o'tgan hafta hisoblandi — dushanba xulosasi shu holatni o'qiydi). **Task 1–12 bitta haftada bajariladi**; ish dushanbani kesib o'tsa, Task 4 va Task 12 dan oldin `daf-yuklama-s3-hisob.ts` ni qayta yurgizish (yangi «o'tgan hafta» hisoblanadi).

- [ ] **Step 8: Sxema testi**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4 && npx --prefix server prettier --write server/src/daf/daf-schema.spec.ts && git add server/prisma/schema.prisma server/prisma/migrations/20261019100000_daf_reminders server/src/daf/daf-schema.spec.ts && git commit -m "feat(daf): reminder log table and the reminders switch on student settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sof qoidalar va matnlar — `eslatma-qoidalari.ts`, `eslatma-matn.ts`

**Files:**
- Create: `server/src/daf/eslatma/eslatma-qoidalari.ts`, `server/src/daf/eslatma/eslatma-qoidalari.spec.ts`
- Create: `server/src/daf/eslatma/eslatma-matn.ts`, `server/src/daf/eslatma/eslatma-matn.spec.ts`

**Interfaces:**
- Consumes: `addDaysToDateStr`, `TASHKENT_OFFSET_MS` (`server/src/common/date/tashkent.ts`); `escapeHtml` (`server/src/telegram-groups/utils/format.util.ts`); `LIGA_NOMLARI`, `darajaNomi` (`server/src/daf/liga/liga-qoidalari.ts`); `NISHON_KATALOGI` (`server/src/daf/nishon/nishon-katalogi.ts`, faqat testda).
- Produces (`eslatma-qoidalari.ts`):
  - Konstantalar: `ESLATMA_OYNA_KUN = 14`, `HAFTALIK_CHEGARA = 4`, `CHEGARA_OYNA_KUN = 7`, `PAUZA_MS = 60`, `JURNAL_SAQLASH_KUN = 90`, `OXIRGI_URINISH_SOATI = 18`
  - `type EslatmaRejimi = 'off' | 'log' | 'on'`; `type EslatmaTuri = 'EVENING' | 'WEEKLY'`; `type EslatmaHolati = 'SENT' | 'FAILED'`
  - `eslatmaRejimi(raw: string | undefined): EslatmaRejimi`
  - `interface KechkiSanalar { bugun: string; kecha: string; oynaBoshi: string; chegaraBoshi: string }`; `kechkiSanalar(bugun: string): KechkiSanalar`
  - `interface JurnalYozuvi { kind: EslatmaTuri; sentOn: string; status: EslatmaHolati }`
  - `interface OquvchiFakti { ochirilgan: boolean; chatId: string | null; uzilgan: boolean; eslatmalar: boolean; jurnal: readonly JurnalYozuvi[] }`; `interface KechkiFakt extends OquvchiFakti { kunlar: readonly string[] }`; `interface HaftalikFakt extends OquvchiFakti { otganHaftaBall: number }`
  - `kechkiNomzodmi(f: KechkiFakt, bugun: string): boolean`; `haftalikNomzodmi(f: HaftalikFakt, bugun: string): boolean`
  - `otganHafta(bugun: string): { otgan: string; bugun: string }`
  - `type HaftalikQaror = 'yubor' | 'kut' | 'tashla'`; `haftalikQaror(soat: number, tayyor: boolean): HaftalikQaror`
  - `toshkentSoati(now: Date): number`; `tozalashChegarasi(bugun: string): string`
- Produces (`eslatma-matn.ts`):
  - `ESLATMA_HAVOLA`, `ISM_CHEGARA = 64`, `TOXTATISH_MATNI`, `TOXTATILDI`, `SIZGA_EMAS`, `KEYINROQ`
  - `interface KechkiMalumot { ism: string; seriya: number; maqsadBall: number }`; `kechkiMatn(k: KechkiMalumot): string`
  - `interface HaftalikMalumot { ism: string; ball: number; liga: { tier: number; orin: number; kotarildi: boolean } | null; guruh: { orin: number; jami: number } | null; nishonlar: readonly string[] }`; `haftalikMatn(h: HaftalikMalumot): string`
  - `nishonNomi(key: string): string`
  - `toxtatishTugmasi(studentId: number): InlineKeyboardMarkup`; `toxtatishKimniki(data: string): number | null`

- [ ] **Step 1: Qoidalar testi** — `server/src/daf/eslatma/eslatma-qoidalari.spec.ts`:

```ts
import {
  CHEGARA_OYNA_KUN,
  ESLATMA_OYNA_KUN,
  HAFTALIK_CHEGARA,
  JURNAL_SAQLASH_KUN,
  PAUZA_MS,
  eslatmaRejimi,
  haftalikNomzodmi,
  haftalikQaror,
  kechkiNomzodmi,
  kechkiSanalar,
  otganHafta,
  toshkentSoati,
  tozalashChegarasi,
  type HaftalikFakt,
  type JurnalYozuvi,
  type KechkiFakt,
} from './eslatma-qoidalari';

const BUGUN = '2026-10-21'; // chorshanba
const DUSHANBA = '2026-10-19';

const kechki = (o: Partial<KechkiFakt> = {}): KechkiFakt => ({
  ochirilgan: false,
  chatId: '555',
  uzilgan: false,
  eslatmalar: true,
  jurnal: [],
  kunlar: ['2026-10-20'],
  ...o,
});

const haftalik = (o: Partial<HaftalikFakt> = {}): HaftalikFakt => ({
  ochirilgan: false,
  chatId: '555',
  uzilgan: false,
  eslatmalar: true,
  jurnal: [],
  otganHaftaBall: 40,
  ...o,
});

const yozuv = (
  kind: JurnalYozuvi['kind'],
  sentOn: string,
  status: JurnalYozuvi['status'] = 'SENT',
): JurnalYozuvi => ({ kind, sentOn, status });

describe('chegaralar va sanalar', () => {
  it('spec S4 qiymatlari', () => {
    expect([
      ESLATMA_OYNA_KUN,
      HAFTALIK_CHEGARA,
      CHEGARA_OYNA_KUN,
      PAUZA_MS,
      JURNAL_SAQLASH_KUN,
    ]).toEqual([14, 4, 7, 60, 90]);
  });

  it.each<[string | undefined, string]>([
    [undefined, 'off'],
    ['', 'off'],
    ['yes', 'off'],
    ['ON', 'on'],
    [' log ', 'log'],
  ])('DAF_ESLATMALAR=%p → %s', (raw, rejim) => {
    expect(eslatmaRejimi(raw)).toBe(rejim);
  });

  it('14 kunlik oyna bugungidan tashqari, 7 kunlik oyna bugun bilan; o`tgan hafta; 90 kun', () => {
    expect(kechkiSanalar(BUGUN)).toEqual({
      bugun: BUGUN,
      kecha: '2026-10-20',
      oynaBoshi: '2026-10-07',
      chegaraBoshi: '2026-10-15',
    });
    expect(otganHafta(DUSHANBA)).toEqual({
      otgan: '2026-10-12',
      bugun: DUSHANBA,
    });
    expect(tozalashChegarasi(BUGUN)).toBe('2026-07-23');
  });
});

describe('kechkiNomzodmi — spec S4 §1.1', () => {
  it("faol, botga ulangan, kecha mashq qilgan, bugun hali yo'q — oladi", () => {
    expect(kechkiNomzodmi(kechki(), BUGUN)).toBe(true);
  });

  it.each<[string, Partial<KechkiFakt>]>([
    ["o'chirilgan", { ochirilgan: true }],
    ['botga ulanmagan', { chatId: null }],
    ['chat uzilgan', { uzilgan: true }],
    ["eslatmalar o'chirilgan", { eslatmalar: false }],
  ])('%s — olmaydi', (_nima, o) => {
    expect(kechkiNomzodmi(kechki(o), BUGUN)).toBe(false);
  });

  it('14 kun: 14 kun oldingi qator yetadi, 15 kun oldingisi yetmaydi', () => {
    expect(kechkiNomzodmi(kechki({ kunlar: ['2026-10-07'] }), BUGUN)).toBe(true);
    expect(kechkiNomzodmi(kechki({ kunlar: ['2026-10-06'] }), BUGUN)).toBe(false);
    expect(kechkiNomzodmi(kechki({ kunlar: [] }), BUGUN)).toBe(false);
  });

  it("bugun qatori bor (nol ballik urinish ham mashq) — olmaydi", () => {
    expect(
      kechkiNomzodmi(kechki({ kunlar: ['2026-10-20', BUGUN] }), BUGUN),
    ).toBe(false);
  });

  it("ketma-ket ikki kun yo'q: kecha SENT — olmaydi, kecha FAILED — oladi", () => {
    expect(
      kechkiNomzodmi(kechki({ jurnal: [yozuv('EVENING', '2026-10-20')] }), BUGUN),
    ).toBe(false);
    expect(
      kechkiNomzodmi(
        kechki({ jurnal: [yozuv('EVENING', '2026-10-20', 'FAILED')] }),
        BUGUN,
      ),
    ).toBe(true);
  });

  it('7 kunda 4 tagacha: oynada 4 SENT — olmaydi; oynadan tashqarisi va FAILED sanalmaydi', () => {
    const sent = (...kunlar: string[]) => kunlar.map((d) => yozuv('EVENING', d));
    expect(
      kechkiNomzodmi(
        kechki({
          jurnal: sent('2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19'),
        }),
        BUGUN,
      ),
    ).toBe(false);
    expect(
      kechkiNomzodmi(
        kechki({
          jurnal: sent('2026-10-14', '2026-10-15', '2026-10-17', '2026-10-19'),
        }),
        BUGUN,
      ),
    ).toBe(true);
    expect(
      kechkiNomzodmi(
        kechki({
          jurnal: [
            ...sent('2026-10-15', '2026-10-17', '2026-10-19'),
            yozuv('EVENING', '2026-10-16', 'FAILED'),
          ],
        }),
        BUGUN,
      ),
    ).toBe(true);
  });

  it('bugun allaqachon egallangan (FAILED ham) — qayta yuborilmaydi', () => {
    expect(
      kechkiNomzodmi(kechki({ jurnal: [yozuv('EVENING', BUGUN, 'FAILED')] }), BUGUN),
    ).toBe(false);
  });

  it("dushanba xulosasi olgan kuni kechki yo'q; xulosa FAILED bo'lsa — bor", () => {
    const f = (status: JurnalYozuvi['status']) =>
      kechki({ kunlar: ['2026-10-17'], jurnal: [yozuv('WEEKLY', DUSHANBA, status)] });
    expect(kechkiNomzodmi(f('SENT'), DUSHANBA)).toBe(false);
    expect(kechkiNomzodmi(f('FAILED'), DUSHANBA)).toBe(true);
  });
});

describe('haftalikNomzodmi — spec S4 §2', () => {
  it("o'tgan hafta kamida 1 ball — oladi, 0 — yo'q", () => {
    expect(haftalikNomzodmi(haftalik({ otganHaftaBall: 1 }), DUSHANBA)).toBe(true);
    expect(haftalikNomzodmi(haftalik({ otganHaftaBall: 0 }), DUSHANBA)).toBe(false);
  });

  it("shu dushanba qatori bor (FAILED ham) — ikkinchisi yo'q; o'tgan dushanbaniki to'smaydi", () => {
    expect(
      haftalikNomzodmi(
        haftalik({ jurnal: [yozuv('WEEKLY', DUSHANBA, 'FAILED')] }),
        DUSHANBA,
      ),
    ).toBe(false);
    expect(
      haftalikNomzodmi(
        haftalik({ jurnal: [yozuv('WEEKLY', '2026-10-12')] }),
        DUSHANBA,
      ),
    ).toBe(true);
  });

  it("uzilgan chat va o'chirilgan eslatmalar — yo'q", () => {
    expect(haftalikNomzodmi(haftalik({ uzilgan: true }), DUSHANBA)).toBe(false);
    expect(haftalikNomzodmi(haftalik({ eslatmalar: false }), DUSHANBA)).toBe(false);
  });
});

describe('tayyorlik qarori va soat', () => {
  it("tayyor — yubor; tayyor emas — 18:00 gacha kut, 18:00 da tashla", () => {
    expect(haftalikQaror(9, true)).toBe('yubor');
    expect(haftalikQaror(18, true)).toBe('yubor');
    expect(haftalikQaror(9, false)).toBe('kut');
    expect(haftalikQaror(17, false)).toBe('kut');
    expect(haftalikQaror(18, false)).toBe('tashla');
  });

  it('Toshkent soati (UTC+5)', () => {
    expect(toshkentSoati(new Date('2026-10-19T04:00:00Z'))).toBe(9);
    expect(toshkentSoati(new Date('2026-10-19T13:00:00Z'))).toBe(18);
    expect(toshkentSoati(new Date('2026-10-18T19:30:00Z'))).toBe(0);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/eslatma/eslatma-qoidalari.spec.ts`
Expected: FAIL (`Cannot find module './eslatma-qoidalari'`).

- [ ] **Step 3: Qoidalar** — `server/src/daf/eslatma/eslatma-qoidalari.ts`:

```ts
import {
  TASHKENT_OFFSET_MS,
  addDaysToDateStr,
} from '../../common/date/tashkent';

/**
 * Kechki eslatma va dushanba xulosasi qoidalari — BITTA joyda (spec S4 §1.1,
 * §2, §4, §5; ADR-0117). Hammasi sof funksiya: baza va soat yo'q. SQL
 * (`eslatma-auditoriya.ts`) shu qoidalarning tez shakli; yuklama skripti
 * (`scripts/load/daf-yuklama-s4-paritet.ts`) SQL natijasini shu funksiyalar
 * bilan brute force solishtiradi — qoida o'zgarsa ikkalasi birga.
 *
 * Sanalar — Toshkent kuni matni `YYYY-MM-DD`, matn sifatida taqqoslanadi.
 */

/** Oxirgi necha kunda (bugungidan tashqari) mashq bo'lishi kerak. */
export const ESLATMA_OYNA_KUN = 14;
/** 7 kunlik oynada ko'pi bilan nechta kechki eslatma (faqat `SENT`). */
export const HAFTALIK_CHEGARA = 4;
export const CHEGARA_OYNA_KUN = 7;
/** Xabarlar orasidagi pauza: Telegram ≈ 30/s chegarasidan ancha past. */
export const PAUZA_MS = 60;
/** Jurnal qatorlari shuncha kundan keyin o'chiriladi. */
export const JURNAL_SAQLASH_KUN = 90;
/** Dushanba xulosasining oxirgi urinish soati (Toshkent). */
export const OXIRGI_URINISH_SOATI = 18;

export type EslatmaRejimi = 'off' | 'log' | 'on';
export type EslatmaTuri = 'EVENING' | 'WEEKLY';
export type EslatmaHolati = 'SENT' | 'FAILED';

/** `DAF_ESLATMALAR`: noma'lum yoki bo'sh qiymat — `off` (xavfsiz tomon). */
export function eslatmaRejimi(raw: string | undefined): EslatmaRejimi {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'on' || v === 'log' ? v : 'off';
}

export interface KechkiSanalar {
  bugun: string;
  kecha: string;
  /** 14 kunlik oyna `[oynaBoshi, bugun)` — bugungidan tashqari. */
  oynaBoshi: string;
  /** 7 kunlik chegara oynasi `[chegaraBoshi, bugun]` — bugun bilan 7 kun. */
  chegaraBoshi: string;
}

export function kechkiSanalar(bugun: string): KechkiSanalar {
  return {
    bugun,
    kecha: addDaysToDateStr(bugun, -1),
    oynaBoshi: addDaysToDateStr(bugun, -ESLATMA_OYNA_KUN),
    chegaraBoshi: addDaysToDateStr(bugun, -(CHEGARA_OYNA_KUN - 1)),
  };
}

export interface JurnalYozuvi {
  kind: EslatmaTuri;
  sentOn: string;
  status: EslatmaHolati;
}

/** Ikkala tur uchun umumiy faktlar (spec S4 §1.1 birinchi ikki qator, §2). */
export interface OquvchiFakti {
  ochirilgan: boolean;
  chatId: string | null;
  uzilgan: boolean;
  /** `DafStudentSetting.remindersEnabled`, qator yo'q = `true`. */
  eslatmalar: boolean;
  jurnal: readonly JurnalYozuvi[];
}

export interface KechkiFakt extends OquvchiFakti {
  /** `DafStudentDay` qatori bor kunlar (har qanday ball bilan). */
  kunlar: readonly string[];
}

export interface HaftalikFakt extends OquvchiFakti {
  /** O'tgan hafta (dushanba–yakshanba) `DafStudentDay.points` yig'indisi. */
  otganHaftaBall: number;
}

/**
 * ADR-0066 oddiy xabarni uzilgan chatga ham yuborishni talab qiladi — bu
 * muhim xabarlar uchun. Eslatma muhim emas: uzilgan chat o'tkazib yuboriladi
 * (ketma-ket 403 yo'q, ADR-0117).
 */
function yetibBoradimi(f: OquvchiFakti): boolean {
  return !f.ochirilgan && f.chatId !== null && !f.uzilgan && f.eslatmalar;
}

const yuborilgan = (j: JurnalYozuvi) => j.status === 'SENT';

/**
 * Kechki eslatma kimga (spec S4 §1.1). `FAILED` hech qaysi shartga
 * sanalmaydi (yetib bormagan xabar «oldi» emas), lekin shu kun uchun
 * egallangan qator — har qanday holatda — qayta yubormaydi (§4: «`FAILED`
 * qayta urinilmaydi»).
 */
export function kechkiNomzodmi(f: KechkiFakt, bugun: string): boolean {
  if (!yetibBoradimi(f)) return false;
  const s = kechkiSanalar(bugun);
  if (f.kunlar.includes(bugun)) return false;
  if (!f.kunlar.some((d) => d >= s.oynaBoshi && d < bugun)) return false;
  const kechkilar = f.jurnal.filter((j) => j.kind === 'EVENING');
  if (kechkilar.some((j) => j.sentOn === bugun)) return false;
  if (kechkilar.some((j) => yuborilgan(j) && j.sentOn === s.kecha)) return false;
  const oynada = kechkilar.filter(
    (j) => yuborilgan(j) && j.sentOn >= s.chegaraBoshi && j.sentOn < bugun,
  );
  if (oynada.length >= HAFTALIK_CHEGARA) return false;
  return !f.jurnal.some(
    (j) => j.kind === 'WEEKLY' && yuborilgan(j) && j.sentOn === bugun,
  );
}

/** Dushanba xulosasi kimga (spec S4 §2). `bugun` — dushanba. */
export function haftalikNomzodmi(f: HaftalikFakt, bugun: string): boolean {
  if (!yetibBoradimi(f) || f.otganHaftaBall < 1) return false;
  return !f.jurnal.some((j) => j.kind === 'WEEKLY' && j.sentOn === bugun);
}

/** O'tgan hafta `[otgan, bugun)`; `bugun` — joriy haftaning dushanbasi. */
export function otganHafta(bugun: string): { otgan: string; bugun: string } {
  return { otgan: addDaysToDateStr(bugun, -7), bugun };
}

export type HaftalikQaror = 'yubor' | 'kut' | 'tashla';

/**
 * Tayyorlik (spec S4 §2): hafta hisoblangan bo'lsa yuboriladi; aks holda
 * 18:00 gacha keyingi soatda qayta urinish, 18:00 da ham tayyor bo'lmasa —
 * shu hafta yuborilmaydi.
 */
export function haftalikQaror(soat: number, tayyor: boolean): HaftalikQaror {
  if (tayyor) return 'yubor';
  return soat >= OXIRGI_URINISH_SOATI ? 'tashla' : 'kut';
}

export function toshkentSoati(now: Date): number {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
}

/** Jurnalning shu kundan oldingi qatorlari o'chiriladi. */
export function tozalashChegarasi(bugun: string): string {
  return addDaysToDateStr(bugun, -JURNAL_SAQLASH_KUN);
}
```

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/eslatma/eslatma-qoidalari.spec.ts`
Expected: PASS (23 test).

- [ ] **Step 5: Matn testi** — `server/src/daf/eslatma/eslatma-matn.spec.ts`:

```ts
import { NISHON_KATALOGI } from '../nishon/nishon-katalogi';
import {
  ESLATMA_HAVOLA,
  KEYINROQ,
  SIZGA_EMAS,
  TOXTATILDI,
  TOXTATISH_MATNI,
  haftalikMatn,
  kechkiMatn,
  nishonNomi,
  toxtatishKimniki,
  toxtatishTugmasi,
  type HaftalikMalumot,
} from './eslatma-matn';

const TOLIQ: HaftalikMalumot = {
  ism: 'Aziza',
  ball: 340,
  liga: { tier: 0, orin: 2, kotarildi: true },
  guruh: { orin: 3, jami: 12 },
  nishonlar: ['SERIE_7', 'WOERTER_150'],
};

describe('kechkiMatn — spec S4 §1.2', () => {
  it('seriya ≥ 2 — seriyali matn, aynan', () => {
    expect(kechkiMatn({ ism: 'Aziza', seriya: 5, maqsadBall: 80 })).toBe(
      'Assalomu alaykum, Aziza! Bugun hali mashq qilmadingiz — 5 kunlik seriyangiz davom etishi uchun bitta qisqa seans yetadi (taxminan 5 daqiqa). Bugungi maqsad: 80 ball. Davom etish: https://student.dafzentrum.uz/portal/lernen Rahmat!',
    );
  });

  it.each([0, 1])('seriya %i — seriyasiz matn, aynan', (seriya) => {
    expect(kechkiMatn({ ism: 'Aziza', seriya, maqsadBall: 160 })).toBe(
      "Assalomu alaykum, Aziza! Nemis so'zlaringiz xotirada qolishi uchun bugun bir qisqa seans yetadi. Bugungi maqsad: 160 ball. Davom etish: https://student.dafzentrum.uz/portal/lernen Rahmat!",
    );
  });

  it('seriya 2 — seriyali', () => {
    expect(kechkiMatn({ ism: 'Aziza', seriya: 2, maqsadBall: 40 })).toContain(
      '2 kunlik seriyangiz',
    );
  });
});

describe('haftalikMatn — spec S4 §2', () => {
  it('hamma qator bilan, aynan', () => {
    expect(haftalikMatn(TOLIQ)).toBe(
      [
        "Assalomu alaykum, Aziza! O'tgan hafta natijalaringiz:",
        '• Topilgan ball: 340',
        "• Liga: Bronza, xonada 2-o'rin. Tabriklaymiz, Kumush ligasiga ko'tarildingiz!",
        "• Guruhingiz: 3-o'rin, jami 12 guruhdan",
        "• Yangi nishonlar: 7 kun ketma-ket, 150 ta so'z",
        'Yangi haftada omad! Davom etish: https://student.dafzentrum.uz/portal/lernen',
      ].join('\n'),
    );
  });

  it("faqat ball qatori — liga, guruh, nishon yo'q", () => {
    expect(
      haftalikMatn({ ...TOLIQ, liga: null, guruh: null, nishonlar: [] }),
    ).toBe(
      [
        "Assalomu alaykum, Aziza! O'tgan hafta natijalaringiz:",
        '• Topilgan ball: 340',
        'Yangi haftada omad! Davom etish: https://student.dafzentrum.uz/portal/lernen',
      ].join('\n'),
    );
  });

  it("ko'tarilmagan liga — tabrik yo'q", () => {
    const m = haftalikMatn({
      ...TOLIQ,
      liga: { tier: 2, orin: 7, kotarildi: false },
    });
    expect(m).toContain("• Liga: Oltin, xonada 7-o'rin\n");
    expect(m).not.toContain('Tabriklaymiz');
  });
});

describe('umumiy', () => {
  it('ism HTML-escape va qisqartiriladi; bo`sh ism — vergulsiz salom', () => {
    expect(
      kechkiMatn({ ism: ' <b>Ali & Vali</b> ', seriya: 0, maqsadBall: 80 }),
    ).toMatch(/^Assalomu alaykum, &lt;b&gt;Ali &amp; Vali&lt;\/b&gt;! /);
    expect(kechkiMatn({ ism: '   ', seriya: 0, maqsadBall: 80 })).toMatch(
      /^Assalomu alaykum! Nemis/,
    );
    const uzun = kechkiMatn({ ism: 'A'.repeat(100), seriya: 0, maqsadBall: 80 });
    expect(uzun).toContain(`${'A'.repeat(64)}!`);
    expect(uzun).not.toContain('A'.repeat(65));
  });

  it('eng uzun xabar ham 4 096 belgidan qisqa', () => {
    const ism = '&'.repeat(5000);
    expect(
      kechkiMatn({ ism, seriya: 99_999, maqsadBall: 160 }).length,
    ).toBeLessThan(4096);
    expect(
      haftalikMatn({
        ism,
        ball: 99_999_999,
        liga: { tier: 3, orin: 30, kotarildi: true },
        guruh: { orin: 999, jami: 999 },
        nishonlar: NISHON_KATALOGI.map((n) => n.key),
      }).length,
    ).toBeLessThan(4096);
  });

  it("inglizcha so'z yo'q", () => {
    const hammasi = [
      kechkiMatn({ ism: 'Aziza', seriya: 3, maqsadBall: 80 }),
      kechkiMatn({ ism: 'Aziza', seriya: 0, maqsadBall: 80 }),
      haftalikMatn(TOLIQ),
      TOXTATISH_MATNI,
      TOXTATILDI,
      SIZGA_EMAS,
      KEYINROQ,
    ]
      .join('\n')
      .split(ESLATMA_HAVOLA)
      .join('');
    expect(hammasi).not.toMatch(
      /\b(streak|reminder|badge|league|points?|session|summary|stop|goal)\b/i,
    );
  });

  it('nishon nomlari mijozniki bilan bir xil (`client/.../lernen/nishon.ts`)', () => {
    expect(
      [
        'SERIE_7',
        'WOERTER_150',
        'WOERTER_592',
        'LIGA_KUMUSH',
        'XONA_GOLIB',
        'GURUH_BIRINCHI',
        'NOMA_LUM',
      ].map(nishonNomi),
    ).toEqual([
      '7 kun ketma-ket',
      "150 ta so'z",
      "A1 so'zlarining hammasi",
      'Kumush ligasi',
      "Xona g'olibi",
      "Guruhlar jadvalida 1-o'rin",
      'NOMA_LUM',
    ]);
    for (const n of NISHON_KATALOGI) expect(nishonNomi(n.key)).not.toBe(n.key);
  });

  it('tugma: «Eslatmalarni to`xtatish», dr:off:<id>, 64 baytdan qisqa', () => {
    expect(toxtatishTugmasi(10001)).toEqual({
      inline_keyboard: [
        [{ text: "Eslatmalarni to'xtatish", callback_data: 'dr:off:10001' }],
      ],
    });
    expect(toxtatishTugmasi(2147483647).inline_keyboard[0][0]).toEqual({
      text: "Eslatmalarni to'xtatish",
      callback_data: 'dr:off:2147483647',
    });
    expect(Buffer.byteLength('dr:off:2147483647')).toBeLessThanOrEqual(64);
  });

  it('toxtatishKimniki — faqat dr:off:<musbat int4>', () => {
    expect(toxtatishKimniki('dr:off:10001')).toBe(10001);
    expect(toxtatishKimniki('dr:off:2147483647')).toBe(2147483647);
    for (const yomon of [
      'dr:off:0',
      'dr:off:abc',
      'dr:off:12x',
      'dr:off:9999999999',
      'dr:off:',
      'lr:abc:5',
    ]) {
      expect(toxtatishKimniki(yomon)).toBeNull();
    }
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-matn.spec.ts` → FAIL (`Cannot find module './eslatma-matn'`).

- [ ] **Step 6: Matnlar** — `server/src/daf/eslatma/eslatma-matn.ts`:

```ts
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { escapeHtml } from '../../telegram-groups/utils/format.util';
import { LIGA_NOMLARI, darajaNomi } from '../liga/liga-qoidalari';

/**
 * S4 xabar matnlari (spec S4 §1.2, §2, §3) — CEO o'z Telegram'ida ko'rgan
 * matnlar (`scripts/daf-eslatma-sinov.ts`); so'zini o'zgartirish CEO bilan.
 * Ohang: salom → sabab → yumshoq taklif → rahmat, jazo va aybdorlik yo'q.
 * `parse_mode: 'HTML'`: faqat ism escape qilinadi, qolgan matn qat'iy.
 */
export const ESLATMA_HAVOLA = 'https://student.dafzentrum.uz/portal/lernen';
/** Ism shundan uzun bo'lsa qisqartiriladi — xabar 4 096 belgidan oshmasin. */
export const ISM_CHEGARA = 64;
export const TOXTATISH_MATNI = "Eslatmalarni to'xtatish";
export const TOXTATILDI = "Eslatmalar to'xtatildi. Qayta yoqish: ilova → Darajam";
export const SIZGA_EMAS = 'Bu tugma sizga emas';
export const KEYINROQ = "Xatolik — birozdan keyin qayta urinib ko'ring";

const PREFIKS = 'dr:off:';
const INT4_MAX = 2_147_483_647;

function salom(ism: string): string {
  const toza = Array.from(ism.trim()).slice(0, ISM_CHEGARA).join('');
  return toza ? `Assalomu alaykum, ${escapeHtml(toza)}!` : 'Assalomu alaykum!';
}

export interface KechkiMalumot {
  ism: string;
  /** Kechagi kungacha uzluksiz mashq kunlari. */
  seriya: number;
  /** O'quvchining kunlik maqsadi (`MAQSAD_BALL`). */
  maqsadBall: number;
}

/**
 * Kechki eslatma (spec S4 §1.2). Seriya ≥ 2 bo'lsa seriyani saqlashga
 * chaqiradi, aks holda so'zlarni eslab qolishga. Bugun mashq qilmagani uchun
 * «hozir» doim 0 — matnda faqat maqsad aytiladi.
 */
export function kechkiMatn(k: KechkiMalumot): string {
  const taklif =
    k.seriya >= 2
      ? `Bugun hali mashq qilmadingiz — ${k.seriya} kunlik seriyangiz davom etishi uchun bitta qisqa seans yetadi (taxminan 5 daqiqa).`
      : "Nemis so'zlaringiz xotirada qolishi uchun bugun bir qisqa seans yetadi.";
  return `${salom(k.ism)} ${taklif} Bugungi maqsad: ${k.maqsadBall} ball. Davom etish: ${ESLATMA_HAVOLA} Rahmat!`;
}

export interface HaftalikMalumot {
  ism: string;
  ball: number;
  /** O'tgan hafta xonasi; xonada bo'lmagan bo'lsa `null` — qator chiqmaydi. */
  liga: { tier: number; orin: number; kotarildi: boolean } | null;
  /** Eng ko'p ball topgan guruhining o'rni; jadvalda bo'lmasa `null`. */
  guruh: { orin: number; jami: number } | null;
  /** O'tgan hafta olingan nishon kalitlari. */
  nishonlar: readonly string[];
}

/** Dushanba xulosasi (spec S4 §2): ball qatori doim, qolganlari ma'lumot bo'lsa. */
export function haftalikMatn(h: HaftalikMalumot): string {
  const q = [
    `${salom(h.ism)} O'tgan hafta natijalaringiz:`,
    `• Topilgan ball: ${h.ball}`,
  ];
  if (h.liga) {
    const tabrik = h.liga.kotarildi
      ? `. Tabriklaymiz, ${darajaNomi(h.liga.tier + 1)} ligasiga ko'tarildingiz!`
      : '';
    q.push(
      `• Liga: ${darajaNomi(h.liga.tier)}, xonada ${h.liga.orin}-o'rin${tabrik}`,
    );
  }
  if (h.guruh) {
    q.push(`• Guruhingiz: ${h.guruh.orin}-o'rin, jami ${h.guruh.jami} guruhdan`);
  }
  if (h.nishonlar.length > 0) {
    q.push(`• Yangi nishonlar: ${h.nishonlar.map(nishonNomi).join(', ')}`);
  }
  q.push(`Yangi haftada omad! Davom etish: ${ESLATMA_HAVOLA}`);
  return q.join('\n');
}

/**
 * Nishon nomi kalitdan — mijozdagi `nishonNomi` (`client/.../lernen/nishon.ts`)
 * bilan bir xil natija (`eslatma-matn.spec.ts` ikkalasining misollarini
 * solishtiradi). Server ilgari nom bilmasdi: matn faqat mijozda edi.
 */
export function nishonNomi(key: string): string {
  const liga = /^LIGA_([A-Z]+)$/.exec(key);
  if (liga) {
    const nom = LIGA_NOMLARI.find((n) => n.toUpperCase() === liga[1]);
    return nom ? `${nom} ligasi` : key;
  }
  if (key === 'XONA_GOLIB') return "Xona g'olibi";
  if (key === 'GURUH_BIRINCHI') return "Guruhlar jadvalida 1-o'rin";
  const m = /^(SERIE|WOERTER)_(\d+)$/.exec(key);
  if (!m) return key;
  const n = Number(m[2]);
  if (m[1] === 'SERIE') return `${n} kun ketma-ket`;
  return n === 592 ? "A1 so'zlarining hammasi" : `${n} ta so'z`;
}

/**
 * Xabar tagidagi tugma: faqat SHU o'quvchi (ota-ona chati bir nechta bolani
 * ulashi mumkin). `callback_data` ≤ 64 bayt.
 */
export function toxtatishTugmasi(studentId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: TOXTATISH_MATNI, callback_data: `${PREFIKS}${studentId}` }],
    ],
  };
}

/** `dr:off:<studentId>` → id; boshqa hamma narsa (0, int4 dan katta) `null`. */
export function toxtatishKimniki(data: string): number | null {
  const m = /^dr:off:([1-9]\d{0,9})$/.exec(data);
  if (!m) return null;
  const id = Number(m[1]);
  return id <= INT4_MAX ? id : null;
}
```

- [ ] **Step 7: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/eslatma`
Expected: PASS (36 test: qoidalar 23, matn 13).

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf/eslatma && npx eslint --quiet src/daf/eslatma && git add src/daf/eslatma && git commit -m "feat(daf): reminder rules and Telegram texts as pure functions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Yagona yozuvchilar — jurnal, sozlama va qorovul

**Files:**
- Create: `server/src/daf/eslatma/eslatma-jurnali.ts`, `server/src/daf/eslatma/eslatma-jurnali.spec.ts`
- Create: `server/src/daf/eslatma/eslatma-sozlama.ts`, `server/src/daf/eslatma/eslatma-sozlama.spec.ts`
- Create: `server/src/daf/eslatma/eslatma-jurnali.single-source.spec.ts`
- Temporary: `server/scripts/_probe-eslatma-jurnali.ts` (commit qilinmaydi)

**Interfaces:**
- Consumes: `tozalashChegarasi`, `EslatmaTuri`, `EslatmaHolati` (Task 2); `maqsadniSaqla` (`server/src/daf/fortschritt/maqsad.ts`, faqat probada).
- Produces:
  - `interface EgallashKaliti { companyId: number; studentId: number; kind: EslatmaTuri; sentOn: string }`
  - `eslatmaniEgalla(db: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>, k: EgallashKaliti): Promise<number | null>` — yangi qator id si yoki band bo'lsa `null`
  - `natijaniYoz(db, id: number, status: EslatmaHolati): Promise<void>`
  - `eskilariniTozala(db, companyId: number, bugun: string): Promise<number>` — o'chirilgan qatorlar soni
  - `eslatmalarniSaqla(prisma: Pick<PrismaService, 'dafStudentSetting'>, studentId: number, companyId: number, yoqilgan: boolean): Promise<{ eslatmalar: boolean }>`
  - SQL belgilari: `eslatma-egalla`, `eslatma-natija`, `eslatma-tozala`

- [ ] **Step 1: Jurnal testi** — `server/src/daf/eslatma/eslatma-jurnali.spec.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { eskilariniTozala, eslatmaniEgalla, natijaniYoz } from './eslatma-jurnali';

// `any`: a jest.fn is not the overloaded `$queryRaw` type (specs are typechecked).
function db(qatorlar: { id: number }[] = [{ id: 7 }]): any {
  return {
    $queryRaw: jest.fn(async (..._a: unknown[]) => qatorlar),
    $executeRaw: jest.fn(async (..._a: unknown[]) => 3),
  };
}
const sqlOf = (m: jest.Mock) => m.mock.calls[0][0] as Prisma.Sql;
const KALIT = {
  companyId: 1,
  studentId: 10001,
  kind: 'EVENING' as const,
  sentOn: '2026-10-20',
};

describe('eslatma jurnali — spec S4 §4', () => {
  it("yuborishdan oldin egallaydi: ON CONFLICT DO NOTHING RETURNING, FAILED bilan boshlanadi", async () => {
    const d = db();
    expect(await eslatmaniEgalla(d, KALIT)).toBe(7);
    const sql = sqlOf(d.$queryRaw);
    expect(sql.strings.join('?')).toMatch(
      /\/\* eslatma-egalla \*\/[\s\S]*INSERT INTO "DafReminderLog"[\s\S]*'FAILED'[\s\S]*ON CONFLICT \("studentId", "kind", "sentOn"\) DO NOTHING[\s\S]*RETURNING id/,
    );
    expect(sql.values).toEqual([1, 10001, 'EVENING', '2026-10-20']);
  });

  it('band qator (ikkinchi chaqiruv) — null', async () => {
    expect(await eslatmaniEgalla(db([]), KALIT)).toBeNull();
  });

  it('natija: faqat holat yangilanadi', async () => {
    const d = db();
    await natijaniYoz(d, 7, 'SENT');
    const sql = sqlOf(d.$executeRaw);
    expect(sql.strings.join('?')).toMatch(
      /UPDATE "DafReminderLog" SET "status" = \?::"DafReminderStatus" WHERE id = \?/,
    );
    expect(sql.values).toEqual(['SENT', 7]);
  });

  it("tozalash: 90 kundan eski qatorlar, kompaniya bo'yicha", async () => {
    const d = db();
    expect(await eskilariniTozala(d, 1, '2026-10-21')).toBe(3);
    const sql = sqlOf(d.$executeRaw);
    expect(sql.strings.join('?')).toMatch(
      /DELETE FROM "DafReminderLog"[\s\S]*"companyId" = \? AND "sentOn" < \?::date/,
    );
    expect(sql.values).toEqual([1, '2026-07-23']);
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-jurnali.spec.ts` → FAIL (`Cannot find module './eslatma-jurnali'`).

- [ ] **Step 2: Jurnal** — `server/src/daf/eslatma/eslatma-jurnali.ts`:

```ts
import { Prisma } from '@prisma/client';
import {
  tozalashChegarasi,
  type EslatmaHolati,
  type EslatmaTuri,
} from './eslatma-qoidalari';

/**
 * `DafReminderLog` ning YAGONA yozuvchisi (spec S4 §4, ADR-0117;
 * `eslatma-jurnali.single-source.spec.ts`). Qator yuborishdan OLDIN
 * egallanadi: qatorni yaratgan chaqiruv yuboradi, ikkinchisi (cronning ikki
 * nusxasi, qayta ishga tushirish) `null` oladi va hech narsa qilmaydi.
 * Egallangan qator `FAILED` bilan boshlanadi: jarayon yuborishdan oldin
 * yiqilsa, qator «yuborilmadi» bo'lib qoladi — qayta urinilmaydi va
 * chegaraga sanalmaydi.
 */
type Db = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

export interface EgallashKaliti {
  companyId: number;
  studentId: number;
  kind: EslatmaTuri;
  /** Toshkent kuni `YYYY-MM-DD`. */
  sentOn: string;
}

export async function eslatmaniEgalla(
  db: Db,
  k: EgallashKaliti,
): Promise<number | null> {
  const [q] = await db.$queryRaw<{ id: number }[]>(Prisma.sql`/* eslatma-egalla */
    INSERT INTO "DafReminderLog" ("companyId", "studentId", "kind", "sentOn", "status")
    VALUES (${k.companyId}::int, ${k.studentId}::int, ${k.kind}::"DafReminderKind", ${k.sentOn}::date, 'FAILED')
    ON CONFLICT ("studentId", "kind", "sentOn") DO NOTHING
    RETURNING id`);
  return q?.id ?? null;
}

export async function natijaniYoz(
  db: Db,
  id: number,
  status: EslatmaHolati,
): Promise<void> {
  await db.$executeRaw(Prisma.sql`/* eslatma-natija */
    UPDATE "DafReminderLog" SET "status" = ${status}::"DafReminderStatus" WHERE id = ${id}`);
}

/** 90 kundan eski qatorlar (kechki cron oxirida, kompaniya bo'yicha — indeks bilan). */
export function eskilariniTozala(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<number> {
  return db.$executeRaw(Prisma.sql`/* eslatma-tozala */
    DELETE FROM "DafReminderLog"
    WHERE "companyId" = ${companyId} AND "sentOn" < ${tozalashChegarasi(bugun)}::date`);
}
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-jurnali.spec.ts` → PASS (4 test).

- [ ] **Step 3: Sozlama testi** — `server/src/daf/eslatma/eslatma-sozlama.spec.ts`:

```ts
import { eslatmalarniSaqla } from './eslatma-sozlama';

describe('eslatmalarniSaqla — remindersEnabled ning yagona yozuvchisi', () => {
  it("upsert: qator yo'q bo'lsa yaratadi, bor bo'lsa faqat remindersEnabled — dailyGoal ga tegmaydi", async () => {
    const upsert = jest.fn(async () => ({ remindersEnabled: false }));
    const r = await eslatmalarniSaqla(
      { dafStudentSetting: { upsert } } as never,
      10001,
      1,
      false,
    );
    expect(r).toEqual({ eslatmalar: false });
    expect(upsert).toHaveBeenCalledWith({
      where: { studentId: 10001 },
      create: { studentId: 10001, companyId: 1, remindersEnabled: false },
      update: { remindersEnabled: false },
      select: { remindersEnabled: true },
    });
  });

  it('javob bazadagi qiymat', async () => {
    const upsert = jest.fn(async () => ({ remindersEnabled: true }));
    expect(
      await eslatmalarniSaqla({ dafStudentSetting: { upsert } } as never, 10001, 1, true),
    ).toEqual({ eslatmalar: true });
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-sozlama.spec.ts` → FAIL (`Cannot find module './eslatma-sozlama'`).

- [ ] **Step 4: Sozlama** — `server/src/daf/eslatma/eslatma-sozlama.ts`:

```ts
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * `DafStudentSetting.remindersEnabled` ning YAGONA yozuvchisi (spec S4 §3,
 * ADR-0117): `PATCH .../eslatmalar` ham, bot tugmasi ham shuni chaqiradi.
 * `upsert` (Prisma: `INSERT … ON CONFLICT DO UPDATE`, kalit `studentId`) —
 * tanlov qatori yo'q bo'lsa yaratadi (`dailyGoal` standarti `ORTA` bilan),
 * bor bo'lsa faqat `remindersEnabled` ni yozadi: `dailyGoal` ga tegmaydi.
 */
export async function eslatmalarniSaqla(
  prisma: Pick<PrismaService, 'dafStudentSetting'>,
  studentId: number,
  companyId: number,
  yoqilgan: boolean,
): Promise<{ eslatmalar: boolean }> {
  const s = await prisma.dafStudentSetting.upsert({
    where: { studentId },
    create: { studentId, companyId, remindersEnabled: yoqilgan },
    update: { remindersEnabled: yoqilgan },
    select: { remindersEnabled: true },
  });
  return { eslatmalar: s.remindersEnabled };
}
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-sozlama.spec.ts` → PASS (2 test).

- [ ] **Step 5: Qorovul** — `server/src/daf/eslatma/eslatma-jurnali.single-source.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Two single doors (ADR-0117). The reminder log is written only by
 * `eslatma-jurnali.ts`: a write elsewhere could send twice (no claim) or let
 * a FAILED row be retried. `remindersEnabled` is written only by
 * `eslatma-sozlama.ts`: a second writer could switch a student back on.
 * For the column the trigger is naming it at all — so every new reader is a
 * reviewed choice too, listed below with its reason.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const JURNAL_YOZUVCHI = 'src/daf/eslatma/eslatma-jurnali.ts';
const PRISMA_WRITE =
  /\.dafReminderLog\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;
// A nested write through the relation: `dafReminders: { create: … }`.
const NESTED_WRITE =
  /\bdafReminders\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect)\b/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?public"?\.)?"DafReminderLog"/gi;
const USTUN = /\bremindersEnabled\b/;
const USTUN_ALLOWED: Record<string, string> = {
  'src/daf/eslatma/eslatma-sozlama.ts': 'the one writer',
  'src/daf/eslatma/eslatma-auditoriya.ts': 'reads it in the audience SQL',
  'src/daf/fortschritt/fortschritt.service.ts':
    'reads it in the `sozlama` CTE of `oquvchi-raqamlari`',
  'scripts/load/daf-yuklama-s4-paritet.ts':
    'reads it for the brute force (local load DB only)',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(join(SERVER, root))).map((file) => ({
  path: file.slice(SERVER.length + 1).split('\\').join('/'),
  text: readFileSync(file, 'utf8'),
}));

const writers = files
  .filter(
    ({ text }) =>
      [...text.matchAll(PRISMA_WRITE)].length +
        [...text.matchAll(NESTED_WRITE)].length +
        [...text.matchAll(RAW_WRITE)].length >
      0,
  )
  .map(({ path }) => path);

describe('the reminder log and the reminders switch have one door each', () => {
  it('found the writers — a scan that matches nothing proves nothing', () => {
    expect(writers).toContain(JURNAL_YOZUVCHI);
    expect(
      files.some(
        ({ path, text }) =>
          path === 'src/daf/eslatma/eslatma-sozlama.ts' && USTUN.test(text),
      ),
    ).toBe(true);
  });

  it('the patterns see Prisma, nested and raw writes', () => {
    expect([...'tx.dafReminderLog\n  .createManyAndReturn({})'.matchAll(PRISMA_WRITE)]).toHaveLength(1);
    expect([...'data: { dafReminders: { create: {} } }'.matchAll(NESTED_WRITE)]).toHaveLength(1);
    expect([...'UPDATE "DafReminderLog" SET'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'truncate table "DafReminderLog"'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'delete from public."DafReminderLog"'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'prisma.dafReminderLog.findMany({})'.matchAll(PRISMA_WRITE)]).toHaveLength(0);
    expect([...'ON CONFLICT ("studentId", "kind", "sentOn") DO NOTHING'.matchAll(RAW_WRITE)]).toHaveLength(0);
  });

  it('no other file writes the reminder log', () => {
    expect(writers.filter((p) => p !== JURNAL_YOZUVCHI)).toEqual([]);
  });

  it('only the listed files name remindersEnabled', () => {
    expect(
      files
        .filter(({ text }) => USTUN.test(text))
        .map(({ path }) => path)
        .filter((p) => !(p in USTUN_ALLOWED)),
    ).toEqual([]);
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-jurnali.single-source.spec.ts`
Expected: PASS (4 test). (`USTUN_ALLOWED` dagi `eslatma-auditoriya.ts` va paritet skripti Task 4 da yaratiladi; ro'yxatda turishi zarar qilmaydi.)

- [ ] **Step 6: Haqiqiy Postgres'da** — vaqtinchalik `server/scripts/_probe-eslatma-jurnali.ts`:

```ts
/** VAQTINCHA (S4 Task 3): jurnal va sozlama SQL'i haqiqiy Postgres'da. Commit qilinmaydi. */
import { run } from './lib/check-cli';
import { assertLocalDb } from './load/local-db-guard';
import {
  eskilariniTozala,
  eslatmaniEgalla,
  natijaniYoz,
} from '../src/daf/eslatma/eslatma-jurnali';
import { eslatmalarniSaqla } from '../src/daf/eslatma/eslatma-sozlama';
import { maqsadniSaqla } from '../src/daf/fortschritt/maqsad';

assertLocalDb();

run(async (prisma) => {
  const db = prisma as any;
  const s = await prisma.student.findFirstOrThrow({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, companyId: true },
  });
  const k = {
    companyId: s.companyId,
    studentId: s.id,
    kind: 'EVENING' as const,
    sentOn: '2026-10-20',
  };
  const birinchi = await eslatmaniEgalla(db, k);
  const ikkinchi = await eslatmaniEgalla(db, k);
  const haftalik = await eslatmaniEgalla(db, { ...k, kind: 'WEEKLY' });
  const parallel = await Promise.all(
    Array.from({ length: 10 }, () =>
      eslatmaniEgalla(db, { ...k, sentOn: '2026-10-21' }),
    ),
  );
  await natijaniYoz(db, birinchi!, 'SENT');
  await eslatmaniEgalla(db, { ...k, sentOn: '2026-07-22' });
  await eslatmaniEgalla(db, { ...k, sentOn: '2026-07-23' });
  const tozalandi = await eskilariniTozala(db, s.companyId, '2026-10-21');
  await maqsadniSaqla(db, s.id, s.companyId, 'JIDDIY');
  const ochirildi = await eslatmalarniSaqla(db, s.id, s.companyId, false);
  const yangi = await prisma.student.findFirstOrThrow({
    where: { deletedAt: null, dafSetting: { is: null } },
    orderBy: { id: 'desc' },
    select: { id: true, companyId: true },
  });
  const yaratildi = await eslatmalarniSaqla(db, yangi.id, yangi.companyId, false);
  console.log({
    birinchi: typeof birinchi,
    ikkinchi,
    haftalik: typeof haftalik,
    parallelGolib: parallel.filter((x) => x !== null).length,
    qatorlar: await prisma.dafReminderLog.findMany({
      where: { studentId: s.id },
      select: { kind: true, sentOn: true, status: true },
      orderBy: [{ sentOn: 'asc' }, { kind: 'asc' }],
    }),
    tozalandi,
    ochirildi,
    sozlama: await prisma.dafStudentSetting.findUnique({
      where: { studentId: s.id },
      select: { dailyGoal: true, remindersEnabled: true },
    }),
    yaratildi,
    yangiSozlama: await prisma.dafStudentSetting.findUnique({
      where: { studentId: yangi.id },
      select: { dailyGoal: true, remindersEnabled: true },
    }),
  });
});
```

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/_probe-eslatma-jurnali.ts
```

Expected: `birinchi: 'number'`, `ikkinchi: null`, `haftalik: 'number'` (boshqa tur — boshqa kalit), `parallelGolib: 1`, `qatorlar` aynan to'rtta: `EVENING 2026-07-23 FAILED`, `EVENING 2026-10-20 SENT`, `WEEKLY 2026-10-20 FAILED`, `EVENING 2026-10-21 FAILED` (`2026-07-22` o'chirildi; chegara qat'iy `<`), `tozalandi: 1`, `ochirildi: { eslatmalar: false }`, `sozlama: { dailyGoal: 'JIDDIY', remindersEnabled: false }` (maqsadga tegilmadi), `yaratildi: { eslatmalar: false }`, `yangiSozlama: { dailyGoal: 'ORTA', remindersEnabled: false }`. SQL xatosi bo'lsa — kodni tuzatib, testlar + probani qayta yurgizish. Keyin tozalash (sinov bazasida qo'lda, kod emas; qorovul testlar faqat repo fayllarini tekshiradi):

```bash
docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c 'DELETE FROM "DafReminderLog"; UPDATE "DafStudentSetting" SET "remindersEnabled" = true;'
rm server/scripts/_probe-eslatma-jurnali.ts
```

(Proba ikki o'quvchining `DafStudentSetting` qatoriga tegdi — bitta maqsad `JIDDIY` bo'ldi, bitta qator yaratildi. Keyingi tekshiruvlar bazadagi haqiqiy qiymatni o'qiydi, shuning uchun bu ularga ta'sir qilmaydi.)

- [ ] **Step 7: Testlar va typecheck**

Run: `cd server && npx jest src/daf && npm run typecheck`
Expected: PASS, typecheck 0 xato.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf/eslatma && npx eslint --quiet src/daf/eslatma && git status --short && git add src/daf/eslatma && git commit -m "feat(daf): reminder log claimed before the send, one writer for the switch

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Auditoriya SQL'i — `eslatma-auditoriya.ts`, S4 seed va brute force

**Files:**
- Create: `server/src/daf/eslatma/eslatma-auditoriya.ts`, `server/src/daf/eslatma/eslatma-auditoriya.spec.ts`
- Modify: `server/scripts/load/daf-yuklama-kohort.ts` (importlar va fayl oxiri)
- Create: `server/scripts/load/daf-yuklama-s4-seed.ts`
- Create: `server/scripts/load/daf-yuklama-s4-paritet.ts`

**Interfaces:**
- Consumes: `kechkiSanalar`, `otganHafta`, `HAFTALIK_CHEGARA`, `kechkiNomzodmi`, `haftalikNomzodmi`, `JurnalYozuvi` (Task 2); `eslatmaniEgalla`, `natijaniYoz`, `eslatmalarniSaqla` (Task 3); `serieAus`, `wochenStartTag` (`daf/uebung/punkte.ts`).
- Produces:
  - `interface KechkiQator { studentId: number; ism: string; seriya: number; dailyGoal: string | null }`
  - `kechkiAuditoriya(db: Pick<Prisma.TransactionClient, '$queryRaw'>, companyId: number, bugun: string): Promise<KechkiQator[]>` (`studentId` o'sishi tartibida)
  - `interface HaftalikQator { studentId: number; ism: string; ball: number; tier: number | null; orin: number | null; kotarildi: boolean; guruhOrin: number | null; guruhJami: number; nishonlar: string[] }`
  - `haftalikAuditoriya(db, companyId: number, bugun: string): Promise<HaftalikQator[]>` — `bugun` dushanba
  - `haftaTayyormi(db, companyId: number, bugun: string): Promise<boolean>`
  - SQL belgilari: `eslatma-kechki`, `eslatma-haftalik`, `eslatma-tayyor`
  - `s4KechkiKun(): string` (ertaga, Toshkent), `s4HaftalikKun(): string` (shu haftaning dushanbasi) — `scripts/load/daf-yuklama-kohort.ts`

- [ ] **Step 1: Yiqiladigan test** — `server/src/daf/eslatma/eslatma-auditoriya.spec.ts` (shaklni qotiradi; ma'noni Step 8 haqiqiy bazada tekshiradi):

```ts
import type { Prisma } from '@prisma/client';
import {
  haftaTayyormi,
  haftalikAuditoriya,
  kechkiAuditoriya,
} from './eslatma-auditoriya';

// `any`: a jest.fn is not the overloaded `$queryRaw` type (specs are typechecked).
function db(qatorlar: unknown[] = []): any {
  return { $queryRaw: jest.fn(async (..._a: unknown[]) => qatorlar) };
}
const sqlOf = (m: jest.Mock) => m.mock.calls[0][0] as Prisma.Sql;

describe('eslatma auditoriyasi — bitta SQL', () => {
  it("kechki: bitta so'rov, qoida sanalari matn sifatida, 7 kunlik chegara qiymati", async () => {
    const d = db([{ studentId: 10001, ism: 'Aziza', seriya: 3, dailyGoal: null }]);
    expect(await kechkiAuditoriya(d, 1, '2026-10-21')).toHaveLength(1);
    expect(d.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlOf(d.$queryRaw);
    const matn = sql.strings.join('?');
    expect(matn).toContain('/* eslatma-kechki */');
    expect(matn).toContain('"telegramDisconnectedAt" IS NULL');
    expect(matn).toContain('COALESCE(st."remindersEnabled", true)');
    expect(matn).toContain("r.status = 'SENT'");
    expect(sql.values).toEqual([
      '2026-10-21', // seriya: bugundan oldingi kunlar
      '2026-10-20', // seriya: kechadan boshlab
      1,
      '2026-10-07', // 14 kunlik oyna boshi
      '2026-10-21',
      '2026-10-21', // bugun qatori yo'q
      '2026-10-21', // bugun egallangan kechki
      '2026-10-20', // kecha SENT kechki
      '2026-10-21', // bugun SENT xulosa
      '2026-10-15', // 7 kunlik oyna boshi
      '2026-10-21',
      4,
    ]);
  });

  it("haftalik: o'tgan hafta [o'tgan dushanba, shu dushanba)", async () => {
    const d = db();
    await haftalikAuditoriya(d, 1, '2026-10-19');
    const sql = sqlOf(d.$queryRaw);
    expect(sql.strings.join('?')).toContain('/* eslatma-haftalik */');
    expect(sql.values).toEqual([
      1,
      '2026-10-12',
      '2026-10-19',
      '2026-10-19',
      '2026-10-12',
      '2026-10-19',
      1,
      '2026-10-12',
      '2026-10-12',
      '2026-10-19',
      '2026-10-12',
      '2026-10-12',
    ]);
  });

  it("tayyorlik: joriy haftadan oldingi hisoblanmagan xona yo'q", async () => {
    const ha = db([{ tayyor: true }]);
    expect(await haftaTayyormi(ha, 1, '2026-10-19')).toBe(true);
    expect(sqlOf(ha.$queryRaw).values).toEqual([1, '2026-10-19']);
    expect(await haftaTayyormi(db([{ tayyor: false }]), 1, '2026-10-19')).toBe(false);
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-auditoriya.spec.ts` → FAIL (`Cannot find module './eslatma-auditoriya'`).

- [ ] **Step 2: Auditoriya** — `server/src/daf/eslatma/eslatma-auditoriya.ts`:

```ts
import { Prisma } from '@prisma/client';
import {
  HAFTALIK_CHEGARA,
  kechkiSanalar,
  otganHafta,
} from './eslatma-qoidalari';

/**
 * S4 auditoriyasi — har tur BITTA SQL (spec S4 §1.1, §2, §6). Qoidalar
 * `eslatma-qoidalari.ts` dagi sof funksiyalarniki, bu yerda ularning tez
 * shakli; `scripts/load/daf-yuklama-s4-paritet.ts` natijani o'sha funksiyalar
 * bilan brute force solishtiradi. Hech narsa yozmaydi. Sana `'YYYY-MM-DD'`
 * matni + `::date` bilan beriladi.
 */
type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

export interface KechkiQator {
  studentId: number;
  ism: string;
  /**
   * Kechagi kungacha uzluksiz mashq kunlari (`attempts > 0`) — bugun qatori
   * yo'qligi sababli `serieAus(tage, bugun)` ning aynan o'zi.
   */
  seriya: number;
  /** `DafStudentSetting.dailyGoal` yoki `null` (= O'rta). */
  dailyGoal: string | null;
}

/**
 * Kechki eslatma auditoriyasi (spec S4 §1.1). Seriya kichik so'rovi faqat
 * shartlardan o'tgan qatorlar uchun ishlaydi (SELECT ro'yxati WHERE dan
 * keyin): kunlar teskari tartibda raqamlanadi, kechadan boshlab `kun =
 * kecha − (raqam − 1)` bo'lganlari — uzluksiz zanjir; birinchi teshikdan
 * keyin tenglik qaytib kelmaydi.
 */
export function kechkiAuditoriya(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<KechkiQator[]> {
  const s = kechkiSanalar(bugun);
  return db.$queryRaw<KechkiQator[]>(Prisma.sql`/* eslatma-kechki */
    SELECT s.id AS "studentId", s."firstName" AS ism, st."dailyGoal"::text AS "dailyGoal",
      (SELECT COUNT(*)::int FROM (
         SELECT k.day, ROW_NUMBER() OVER (ORDER BY k.day DESC) AS rn
         FROM (SELECT DISTINCT d.day FROM "DafStudentDay" d
               WHERE d."studentId" = s.id AND d.attempts > 0 AND d.day < ${bugun}::date) k
       ) z
       WHERE z.day = ${s.kecha}::date - (z.rn::int - 1)) AS seriya
    FROM "Student" s
    LEFT JOIN "DafStudentSetting" st ON st."studentId" = s.id
    WHERE s."companyId" = ${companyId} AND s."deletedAt" IS NULL
      AND s."telegramChatId" IS NOT NULL AND s."telegramDisconnectedAt" IS NULL
      AND COALESCE(st."remindersEnabled", true)
      AND EXISTS (SELECT 1 FROM "DafStudentDay" d WHERE d."studentId" = s.id
                  AND d.day >= ${s.oynaBoshi}::date AND d.day < ${bugun}::date)
      AND NOT EXISTS (SELECT 1 FROM "DafStudentDay" d
                      WHERE d."studentId" = s.id AND d.day = ${bugun}::date)
      AND NOT EXISTS (SELECT 1 FROM "DafReminderLog" r WHERE r."studentId" = s.id AND (
            (r.kind = 'EVENING' AND r."sentOn" = ${bugun}::date)
         OR (r.kind = 'EVENING' AND r.status = 'SENT' AND r."sentOn" = ${s.kecha}::date)
         OR (r.kind = 'WEEKLY' AND r.status = 'SENT' AND r."sentOn" = ${bugun}::date)))
      AND (SELECT COUNT(*) FROM "DafReminderLog" r
           WHERE r."studentId" = s.id AND r.kind = 'EVENING' AND r.status = 'SENT'
             AND r."sentOn" >= ${s.chegaraBoshi}::date AND r."sentOn" < ${bugun}::date)
          < ${HAFTALIK_CHEGARA}
    ORDER BY s.id`);
}

export interface HaftalikQator {
  studentId: number;
  ism: string;
  /** O'tgan hafta `DafStudentDay.points` yig'indisi (hamma `groupKey`), ≥ 1. */
  ball: number;
  /** O'tgan hafta xonasi: daraja, o'rin (hisoblanmagan bo'lsa `null`), ko'tarildimi. */
  tier: number | null;
  orin: number | null;
  kotarildi: boolean;
  /** O'tgan hafta eng ko'p ball topgan guruhining `DafGroupWeek` o'rni, bo'lmasa `null`. */
  guruhOrin: number | null;
  /** Kompaniyaning o'tgan hafta `DafGroupWeek` qatorlari soni. */
  guruhJami: number;
  /** O'tgan hafta (Toshkent kuni) olingan nishon kalitlari, olingan tartibida. */
  nishonlar: string[];
}

/**
 * Dushanba xulosasi auditoriyasi va qatorlari (spec S4 §2). Guruh — o'tgan
 * hafta shu guruh uchun (`groupKey`) eng ko'p ball, teng bo'lsa `groupKey`
 * kichigi (`COLLATE "C"` — bazaning kollatsiyasiga bog'liq emas). Nishon
 * kuni — `earnedAt` ning Toshkent kuni.
 */
export function haftalikAuditoriya(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<HaftalikQator[]> {
  const h = otganHafta(bugun);
  return db.$queryRaw<HaftalikQator[]>(Prisma.sql`/* eslatma-haftalik */
    WITH ball AS (
      SELECT d."studentId", SUM(d.points)::int AS p
      FROM "DafStudentDay" d
      WHERE d."companyId" = ${companyId} AND d.day >= ${h.otgan}::date AND d.day < ${bugun}::date
      GROUP BY d."studentId"
      HAVING SUM(d.points) >= 1
    ),
    nomzod AS (
      SELECT s.id, s."firstName", b.p
      FROM ball b
      JOIN "Student" s ON s.id = b."studentId"
      LEFT JOIN "DafStudentSetting" st ON st."studentId" = s.id
      WHERE s."deletedAt" IS NULL
        AND s."telegramChatId" IS NOT NULL AND s."telegramDisconnectedAt" IS NULL
        AND COALESCE(st."remindersEnabled", true)
        AND NOT EXISTS (SELECT 1 FROM "DafReminderLog" r WHERE r."studentId" = s.id
                        AND r.kind = 'WEEKLY' AND r."sentOn" = ${bugun}::date)
    ),
    guruh AS (
      SELECT DISTINCT ON (d."studentId") d."studentId", d."groupKey" AS g
      FROM "DafStudentDay" d
      JOIN nomzod n ON n.id = d."studentId"
      WHERE d.day >= ${h.otgan}::date AND d.day < ${bugun}::date AND d."groupKey" <> ''
      GROUP BY d."studentId", d."groupKey"
      ORDER BY d."studentId", SUM(d.points) DESC, d."groupKey" COLLATE "C"
    )
    SELECT n.id AS "studentId", n."firstName" AS ism, n.p AS ball,
      e.tier, e.place AS orin, COALESCE(e.promoted, false) AS kotarildi,
      gw.place AS "guruhOrin",
      (SELECT COUNT(*)::int FROM "DafGroupWeek" x
       WHERE x."companyId" = ${companyId} AND x."weekStart" = ${h.otgan}::date) AS "guruhJami",
      ARRAY(SELECT b.key FROM "DafStudentBadge" b
            WHERE b."studentId" = n.id
              AND (b."earnedAt" + interval '5 hours')::date >= ${h.otgan}::date
              AND (b."earnedAt" + interval '5 hours')::date < ${bugun}::date
            ORDER BY b."earnedAt", b.key COLLATE "C") AS nishonlar
    FROM nomzod n
    LEFT JOIN "DafLeagueEntry" e ON e."studentId" = n.id AND e."weekStart" = ${h.otgan}::date
    LEFT JOIN guruh g ON g."studentId" = n.id
    LEFT JOIN "DafGroupWeek" gw ON gw."groupId" = g.g AND gw."weekStart" = ${h.otgan}::date
    ORDER BY n.id`);
}

/**
 * Xulosa o'tgan hafta hisoblangandan keyin ketadi (spec S4 §2): kompaniyada
 * joriy haftadan oldingi hisoblanmagan xona qolmagan (S3 `kechikkan` bilan
 * bir xil savol; `@@index([companyId, settledAt])`).
 */
export async function haftaTayyormi(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<boolean> {
  const [q] = await db.$queryRaw<{ tayyor: boolean }[]>(Prisma.sql`/* eslatma-tayyor */
    SELECT NOT EXISTS (SELECT 1 FROM "DafLeagueRoom"
      WHERE "companyId" = ${companyId} AND "settledAt" IS NULL
        AND "weekStart" < ${bugun}::date) AS tayyor`);
  return q?.tayyor ?? false;
}
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-auditoriya.spec.ts` → PASS (3 test).

- [ ] **Step 3: Yuklama kunlari** — `server/scripts/load/daf-yuklama-kohort.ts` da `import { Prisma } from '@prisma/client';` qatoridan keyin:

```ts
import {
  addDaysToDateStr,
  tashkentDateStr,
} from '../../src/common/date/tashkent';
import { wochenStartTag } from '../../src/daf/uebung/punkte';
```

va fayl oxiriga:

```ts

/**
 * S4: the evening audience is asked for TOMORROW (Tashkent), so no student
 * has a row on «today» and the 14-day window holds the seeded history; the
 * Monday summary for THIS week's Monday (last week is the one
 * `daf-yuklama-s3-hisob.ts` settled). The S4 seed, parity and measurement
 * must run on the same Tashkent day.
 */
export function s4KechkiKun(): string {
  return addDaysToDateStr(tashkentDateStr(new Date()), 1);
}

export function s4HaftalikKun(): string {
  return wochenStartTag(new Date());
}
```

- [ ] **Step 4: S4 seed** — `server/scripts/load/daf-yuklama-s4-seed.ts`:

```ts
/**
 * LOCAL ONLY. S4 reminder data for the load test (spec S4 §8), AFTER the
 * S1–S3 seeds and `daf-yuklama-s3-hisob.ts` (last week settled):
 *  - the first 5 500 live students get a (fake) Telegram chat; every 25th of
 *    them is disconnected; the 500 past the 5 000 with attempts have no
 *    `DafStudentDay` row, so the 14-day rule leaves them out;
 *  - every 20th turns reminders off, through the module's own writer;
 *  - log history, through the module's own writer, around the evening day
 *    K = `s4KechkiKun()` (tomorrow) and the Monday H = `s4HaftalikKun()`:
 *    id % 7 — EVENING SENT on K−1 (the yesterday rule); id % 11 — EVENING
 *    SENT on K−2, K−4, K−6 (the 7-day window); id % 13 — EVENING FAILED on
 *    K−1 (does not count); id % 17 — EVENING FAILED on K (already claimed:
 *    no resend); id % 19 — WEEKLY SENT on K (no evening after a summary);
 *    id % 23 — WEEKLY FAILED on H (no second summary).
 * Run once per fresh DB: it refuses when reminder rows exist.
 */
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { s4HaftalikKun, s4KechkiKun } from './daf-yuklama-kohort';
import { addDaysToDateStr } from '../../src/common/date/tashkent';
import {
  eslatmaniEgalla,
  natijaniYoz,
} from '../../src/daf/eslatma/eslatma-jurnali';
import { eslatmalarniSaqla } from '../../src/daf/eslatma/eslatma-sozlama';
import type {
  EslatmaHolati,
  EslatmaTuri,
} from '../../src/daf/eslatma/eslatma-qoidalari';

assertLocalDb();

const CHATLI = 5500;

run(async (prisma) => {
  if ((await prisma.dafReminderLog.count()) > 0) {
    throw new Error('Eslatma jurnali allaqachon bor. Bazani qayta yarating.');
  }
  const db = prisma as any;
  const K = s4KechkiKun();
  const H = s4HaftalikKun();
  const chat = await prisma.$executeRaw`
    UPDATE "Student" s
    SET "telegramChatId" = (900000000 + s.id)::text,
        "telegramDisconnectedAt" = CASE WHEN s.id % 25 = 0 THEN (now() AT TIME ZONE 'UTC') END
    FROM (SELECT id FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT ${CHATLI}) t
    WHERE s.id = t.id`;
  const list = await prisma.student.findMany({
    where: { telegramChatId: { not: null }, deletedAt: null },
    select: { id: true, companyId: true },
    orderBy: { id: 'asc' },
  });
  let ochirildi = 0;
  let qatorlar = 0;
  const yoz = async (
    s: { id: number; companyId: number },
    kind: EslatmaTuri,
    sentOn: string,
    status: EslatmaHolati,
  ) => {
    const id = await eslatmaniEgalla(db, {
      companyId: s.companyId,
      studentId: s.id,
      kind,
      sentOn,
    });
    if (id === null) return;
    await natijaniYoz(db, id, status);
    qatorlar += 1;
  };
  for (const s of list) {
    if (s.id % 20 === 0) {
      await eslatmalarniSaqla(db, s.id, s.companyId, false);
      ochirildi += 1;
    }
    if (s.id % 7 === 0) await yoz(s, 'EVENING', addDaysToDateStr(K, -1), 'SENT');
    if (s.id % 11 === 0) {
      for (const d of [-2, -4, -6]) {
        await yoz(s, 'EVENING', addDaysToDateStr(K, d), 'SENT');
      }
    }
    if (s.id % 13 === 0) await yoz(s, 'EVENING', addDaysToDateStr(K, -1), 'FAILED');
    if (s.id % 17 === 0) await yoz(s, 'EVENING', K, 'FAILED');
    if (s.id % 19 === 0) await yoz(s, 'WEEKLY', K, 'SENT');
    if (s.id % 23 === 0) await yoz(s, 'WEEKLY', H, 'FAILED');
  }
  for (const t of ['Student', 'DafStudentSetting', 'DafReminderLog']) {
    await prisma.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(`"${t}"`)}`);
  }
  console.log({
    K,
    H,
    chat,
    chatli: list.length,
    uzilgan: list.filter((s) => s.id % 25 === 0).length,
    ochirildi,
    qatorlar,
  });
  if (list.length === 0 || qatorlar === 0) process.exitCode = 1;
});
```

(`id % 7` va `id % 13` bir kunga tushsa birinchi egallash yutadi — ikkinchisi `null` va hisoblanmaydi; bu ham «bir kun — bitta qator» ni ko'rsatadi.)

- [ ] **Step 5: Paritet skripti** — `server/scripts/load/daf-yuklama-s4-paritet.ts`:

```ts
/**
 * LOCAL ONLY. S4 audience SQL against a brute force (spec S4 §8 «Haqiqiy
 * baza»): `kechkiAuditoriya` for the evening day `s4KechkiKun()` (tomorrow)
 * and `haftalikAuditoriya` for this week's Monday `s4HaftalikKun()`, rebuilt
 * row by row from `Student`, `DafStudentSetting`, `DafStudentDay`,
 * `DafReminderLog`, `DafLeagueEntry`, `DafGroupWeek` and `DafStudentBadge`
 * with the pure rules (`kechkiNomzodmi`, `haftalikNomzodmi`, `serieAus`):
 * the same students, names, streaks, goals, points, league line, group line
 * and badges. Plus `haftaTayyormi` against a count of unsettled rooms. Exit 1
 * on any difference or when an audience is empty.
 */
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { s4HaftalikKun, s4KechkiKun } from './daf-yuklama-kohort';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../src/common/date/tashkent';
import { serieAus } from '../../src/daf/uebung/punkte';
import {
  haftaTayyormi,
  haftalikAuditoriya,
  kechkiAuditoriya,
} from '../../src/daf/eslatma/eslatma-auditoriya';
import {
  haftalikNomzodmi,
  kechkiNomzodmi,
  type JurnalYozuvi,
} from '../../src/daf/eslatma/eslatma-qoidalari';

assertLocalDb();

function qosh<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

run(async (prisma) => {
  const db = prisma as any;
  const K = s4KechkiKun();
  const H = s4HaftalikKun();
  const otgan = addDaysToDateStr(H, -7);
  const xatolar: string[] = [];
  const farq = (nima: string, a: unknown, b: unknown) => {
    const [sa, sb] = [JSON.stringify(a), JSON.stringify(b)];
    if (sa !== sb) xatolar.push(`${nima}: ${sa.slice(0, 300)} ≠ ${sb.slice(0, 300)}`);
  };
  const kompaniyalar = await prisma.student.findMany({
    where: { telegramChatId: { not: null } },
    distinct: ['companyId'],
    select: { companyId: true },
  });
  let kechkiJami = 0;
  let haftalikJami = 0;
  for (const { companyId } of kompaniyalar) {
    const W = utcMidnightFromDateStr(otgan);
    const [oquvchilar, sozlamalar, kunlar, jurnal, kirishlar, guruhHaftalari, nishonlar] =
      await Promise.all([
        prisma.student.findMany({
          where: { companyId },
          select: { id: true, firstName: true, deletedAt: true, telegramChatId: true, telegramDisconnectedAt: true },
        }),
        prisma.dafStudentSetting.findMany({
          where: { companyId },
          select: { studentId: true, remindersEnabled: true, dailyGoal: true },
        }),
        prisma.dafStudentDay.findMany({
          where: { companyId },
          select: { studentId: true, day: true, attempts: true, points: true, groupKey: true },
        }),
        prisma.dafReminderLog.findMany({
          where: { companyId },
          select: { studentId: true, kind: true, sentOn: true, status: true },
        }),
        prisma.dafLeagueEntry.findMany({
          where: { companyId, weekStart: W },
          select: { studentId: true, tier: true, place: true, promoted: true },
        }),
        prisma.dafGroupWeek.findMany({
          where: { companyId, weekStart: W },
          select: { groupId: true, place: true },
        }),
        prisma.dafStudentBadge.findMany({
          where: { companyId },
          select: { studentId: true, key: true, earnedAt: true },
        }),
      ]);
    const sozlama = new Map(sozlamalar.map((s) => [s.studentId, s]));
    const kun = new Map<number, string[]>();
    const tage = new Map<number, string[]>();
    const haftaBall = new Map<number, number>();
    const guruhBall = new Map<number, Map<string, number>>();
    for (const d of kunlar) {
      const k = tashkentDateStr(d.day);
      qosh(kun, d.studentId, k);
      if (d.attempts > 0) qosh(tage, d.studentId, k);
      if (k >= otgan && k < H) {
        haftaBall.set(d.studentId, (haftaBall.get(d.studentId) ?? 0) + d.points);
        if (d.groupKey !== '') {
          const g = guruhBall.get(d.studentId) ?? new Map<string, number>();
          g.set(d.groupKey, (g.get(d.groupKey) ?? 0) + d.points);
          guruhBall.set(d.studentId, g);
        }
      }
    }
    const yozuvlar = new Map<number, JurnalYozuvi[]>();
    for (const j of jurnal) {
      qosh(yozuvlar, j.studentId, { kind: j.kind, sentOn: tashkentDateStr(j.sentOn), status: j.status });
    }
    const fakt = (s: (typeof oquvchilar)[0]) => ({
      ochirilgan: s.deletedAt !== null,
      chatId: s.telegramChatId,
      uzilgan: s.telegramDisconnectedAt !== null,
      eslatmalar: sozlama.get(s.id)?.remindersEnabled ?? true,
      jurnal: yozuvlar.get(s.id) ?? [],
    });
    const tartibda = [...oquvchilar].sort((a, b) => a.id - b.id);

    // Kechki eslatma.
    const kechkiKerak = tartibda
      .filter((s) => kechkiNomzodmi({ ...fakt(s), kunlar: kun.get(s.id) ?? [] }, K))
      .map((s) => [
        s.id,
        s.firstName,
        serieAus((tage.get(s.id) ?? []).filter((d) => d < K), K),
        sozlama.get(s.id)?.dailyGoal ?? null,
      ]);
    const kechkiSql = (await kechkiAuditoriya(db, companyId, K)).map((q) => [
      q.studentId,
      q.ism,
      q.seriya,
      q.dailyGoal,
    ]);
    farq(`kechki (kompaniya ${companyId})`, kechkiSql, kechkiKerak);

    // Dushanba xulosasi.
    const kirish = new Map(kirishlar.map((e) => [e.studentId, e]));
    const gwOrin = new Map(guruhHaftalari.map((g) => [g.groupId, g.place]));
    const nishon = new Map<number, { key: string; earnedAt: Date }[]>();
    for (const b of nishonlar) {
      const k = tashkentDateStr(b.earnedAt);
      if (k >= otgan && k < H) qosh(nishon, b.studentId, b);
    }
    const engKopGuruh = (id: number): string | null => {
      let eng: [string, number] | null = null;
      for (const [g, p] of guruhBall.get(id) ?? []) {
        if (!eng || p > eng[1] || (p === eng[1] && g < eng[0])) eng = [g, p];
      }
      return eng?.[0] ?? null;
    };
    const haftalikKerak = tartibda
      .filter((s) => haftalikNomzodmi({ ...fakt(s), otganHaftaBall: haftaBall.get(s.id) ?? 0 }, H))
      .map((s) => {
        const e = kirish.get(s.id);
        const g = engKopGuruh(s.id);
        const keys = [...(nishon.get(s.id) ?? [])]
          .sort(
            (a, b) =>
              a.earnedAt.getTime() - b.earnedAt.getTime() ||
              (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
          )
          .map((b) => b.key);
        return [
          s.id,
          s.firstName,
          haftaBall.get(s.id) ?? 0,
          e?.tier ?? null,
          e?.place ?? null,
          e?.promoted ?? false,
          g !== null ? (gwOrin.get(g) ?? null) : null,
          guruhHaftalari.length,
          keys,
        ];
      });
    const haftalikSql = (await haftalikAuditoriya(db, companyId, H)).map((q) => [
      q.studentId,
      q.ism,
      q.ball,
      q.tier,
      q.orin,
      q.kotarildi,
      q.guruhOrin,
      q.guruhJami,
      q.nishonlar,
    ]);
    farq(`haftalik (kompaniya ${companyId})`, haftalikSql, haftalikKerak);

    // Tayyorlik.
    const ochiq = await prisma.dafLeagueRoom.count({
      where: { companyId, settledAt: null, weekStart: { lt: utcMidnightFromDateStr(H) } },
    });
    farq(`tayyorlik (kompaniya ${companyId})`, await haftaTayyormi(db, companyId, H), ochiq === 0);

    kechkiJami += kechkiKerak.length;
    haftalikJami += haftalikKerak.length;
  }
  if (kechkiJami === 0) xatolar.push("kechki auditoriya bo'sh — solishtirish hech narsani isbotlamaydi");
  if (haftalikJami === 0) xatolar.push("haftalik auditoriya bo'sh — solishtirish hech narsani isbotlamaydi");
  console.log({ K, H, kechki: kechkiJami, haftalik: haftalikJami, xatolar: xatolar.length });
  for (const x of xatolar.slice(0, 20)) console.log(x);
  if (xatolar.length > 0) process.exitCode = 1;
});
```

- [ ] **Step 6: Seed** (`$S1_DB` — Task 1 Step 6; S1–S3 ma'lumoti Task 1 Step 7 dan; Task 3 probasidan keyin jurnal bo'sh):

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s4-seed.ts
```

Expected: `chatli: 5500`, `uzilgan` ≈ 220, `ochirildi` ≈ 275 (id lar uzluksiz bo'lsa aynan shu), `qatorlar` > 1 500, exit 0. Jurnal bo'sh bo'lmasa (Task 3 tozalanmagan) — «Eslatma jurnali allaqachon bor»: Task 3 Step 6 dagi `DELETE` ni qaytarish.

- [ ] **Step 7: Haqiqiy Postgres'da moslik**

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s4-paritet.ts
```

Expected: `xatolar: 0`, `kechki` ≈ 3 500, `haftalik` ≈ 4 300 (aniq son emas, `xatolar: 0` muhim). Farq bo'lsa — birinchi gumon: seriya kichik so'rovi (`z.day = kecha − (rn − 1)`; `DISTINCT day` — bir kunda bir nechta `groupKey` qatori bo'ladi) va `guruh` CTE dagi `DISTINCT ON` tartibi. SQL'ni tuzatib, Step 2 testi + shu skriptni qayta yurgizish (jurnalga yozilmaydi, seed qayta kerak emas).

- [ ] **Step 8: Testlar va typecheck**

Run: `cd server && npx jest src/daf && npm run typecheck`
Expected: PASS, typecheck 0 xato.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf/eslatma scripts/load/daf-yuklama-kohort.ts scripts/load/daf-yuklama-s4-seed.ts scripts/load/daf-yuklama-s4-paritet.ts && npx eslint --quiet src/daf/eslatma && git add src/daf/eslatma scripts/load/daf-yuklama-kohort.ts scripts/load/daf-yuklama-s4-seed.ts scripts/load/daf-yuklama-s4-paritet.ts && git commit -m "feat(daf): evening and Monday reminder audiences in one SQL each, brute-force parity

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Yuboruvchi — `SmsService` tugmasi va `eslatma-yuborish.ts`

**Files:**
- Modify: `server/src/sms/sms.service.ts` (`sendToStudent` ning `opts` va `sendMessage` chaqiruvi), `server/src/sms/sms.service.spec.ts`
- Create: `server/src/daf/eslatma/eslatma-yuborish.ts`, `server/src/daf/eslatma/eslatma-yuborish.spec.ts`

**Interfaces:**
- Consumes: `kechkiAuditoriya`, `haftalikAuditoriya`, `HaftalikQator` (Task 4); `eslatmaniEgalla`, `natijaniYoz` (Task 3); `kechkiMatn`, `haftalikMatn`, `toxtatishTugmasi`, `HaftalikMalumot` (Task 2); `PAUZA_MS`, `EslatmaRejimi`, `EslatmaTuri`, `EslatmaHolati` (Task 2); `MAQSAD_BALL`, `maqsadDarajasi` (`daf/uebung/punkte.ts`); `describeError` (`telegram-digest/telegram-send.ts`).
- Produces:
  - `SmsService.sendToStudent(studentId, content, type, senderUserId?, companyId?, opts?: { assertCallerBranch?: boolean; replyMarkup?: InlineKeyboardMarkup })`
  - `interface YuborishNatija { auditoriya: number; yuborildi: number; xato: number; otkazildi: number }`
  - `haftalikMalumot(q: HaftalikQator): HaftalikMalumot`
  - `class EslatmaYuborish { constructor(prisma: PrismaService, sms: SmsService); kechki(companyId: number, bugun: string, rejim: EslatmaRejimi, pauzaMs?: number): Promise<YuborishNatija>; haftalik(companyId: number, bugun: string, rejim: EslatmaRejimi, pauzaMs?: number): Promise<YuborishNatija> }` — `pauzaMs` standarti `PAUZA_MS`

- [ ] **Step 1: `SmsService` yiqiladigan testi** — `sms.service.spec.ts` dagi `describe('sendToStudent'` ichida `it('should save FAILED status when bot is not available'` testi yopilgandan (uning `});`) keyin:

```ts

    // S4 (ADR-0117): the reminder carries its stop button; every other
    // caller sends no markup and keeps the exact options it always had.
    it('sends the reply markup when one is given', async () => {
      prisma.student.findFirst.mockResolvedValue({ telegramChatId: '123456' });
      const markup = {
        inline_keyboard: [
          [{ text: "Eslatmalarni to'xtatish", callback_data: 'dr:off:10001' }],
        ],
      };

      await service.sendToStudent(10001, 'Eslatma', 'AUTO', undefined, 1, {
        replyMarkup: markup,
      });

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456',
        'Eslatma',
        { parse_mode: 'HTML', reply_markup: markup },
      );
    });
```

Run: `cd server && npx jest src/sms/sms.service.spec.ts` → FAIL (chaqiruv `{ parse_mode: 'HTML' }` bilan — `reply_markup` yo'q).

- [ ] **Step 2: `SmsService`** — `sms.service.ts` importlariga:

```ts
import type { InlineKeyboardMarkup } from 'telegraf/types';
```

`sendToStudent` imzosidagi:

```ts
    opts?: { assertCallerBranch?: boolean },
```

ni:

```ts
    opts?: {
      assertCallerBranch?: boolean;
      /** S4 (ADR-0117): an inline keyboard under the message — the reminder's stop button. */
      replyMarkup?: InlineKeyboardMarkup;
    },
```

ga, va:

```ts
          const result = await bot.telegram.sendMessage(chatId, content, {
            parse_mode: 'HTML',
          });
```

ni:

```ts
          const result = await bot.telegram.sendMessage(chatId, content, {
            parse_mode: 'HTML',
            ...(opts?.replyMarkup && { reply_markup: opts.replyMarkup }),
          });
```

ga almashtirish.

Run: `cd server && npx jest src/sms src/telegram-digest/direct-send.guard.spec.ts` → PASS (mavjud `{ parse_mode: 'HTML' }` aynan testlari ham; qorovul o'zgarmagan).

- [ ] **Step 3: Yuboruvchi testi** — `server/src/daf/eslatma/eslatma-yuborish.spec.ts`:

```ts
jest.mock('./eslatma-auditoriya', () => ({
  kechkiAuditoriya: jest.fn(),
  haftalikAuditoriya: jest.fn(),
}));
jest.mock('./eslatma-jurnali', () => ({
  eslatmaniEgalla: jest.fn(),
  natijaniYoz: jest.fn(),
}));

import { haftalikAuditoriya, kechkiAuditoriya } from './eslatma-auditoriya';
import { eslatmaniEgalla, natijaniYoz } from './eslatma-jurnali';
import { haftalikMatn, toxtatishTugmasi } from './eslatma-matn';
import { EslatmaYuborish, haftalikMalumot } from './eslatma-yuborish';

const kechki = kechkiAuditoriya as jest.Mock;
const haftalik = haftalikAuditoriya as jest.Mock;
const egalla = eslatmaniEgalla as jest.Mock;
const natija = natijaniYoz as jest.Mock;

const AZIZA = { studentId: 10001, ism: 'Aziza', seriya: 5, dailyGoal: 'JIDDIY' };
const BOBUR = { studentId: 10002, ism: 'Bobur', seriya: 0, dailyGoal: null };
const HAFTALIK_QATOR = {
  studentId: 10001,
  ism: 'Aziza',
  ball: 340,
  tier: 0,
  orin: 2,
  kotarildi: true,
  guruhOrin: 3,
  guruhJami: 12,
  nishonlar: ['SERIE_7'],
};

function make() {
  const prisma = {} as any;
  const sms = {
    sendToStudent: jest.fn(async (..._a: unknown[]) => ({ status: 'SENT' })),
  };
  return { prisma, sms, y: new EslatmaYuborish(prisma, sms as any) };
}

describe('EslatmaYuborish — auditoriya → jurnal → sendToStudent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    natija.mockResolvedValue(undefined);
  });

  it("'on' dan boshqa rejim: auditoriya sanaladi, hech narsa egallanmaydi va yuborilmaydi", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    const { y, sms } = make();
    expect(await y.kechki(1, '2026-10-20', 'log', 0)).toEqual({
      auditoriya: 2,
      yuborildi: 0,
      xato: 0,
      otkazildi: 0,
    });
    expect(egalla).not.toHaveBeenCalled();
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it("'on': har biriga bitta xabar, tugma bilan, kunlik maqsad bilan, natija SENT", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    egalla.mockResolvedValueOnce(11).mockResolvedValueOnce(12);
    const { y, sms, prisma } = make();
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toEqual({
      auditoriya: 2,
      yuborildi: 2,
      xato: 0,
      otkazildi: 0,
    });
    expect(egalla).toHaveBeenCalledWith(prisma, {
      companyId: 1,
      studentId: 10001,
      kind: 'EVENING',
      sentOn: '2026-10-20',
    });
    expect(sms.sendToStudent).toHaveBeenNthCalledWith(
      1,
      10001,
      expect.stringContaining('5 kunlik seriyangiz'),
      'AUTO',
      undefined,
      1,
      { replyMarkup: toxtatishTugmasi(10001) },
    );
    expect(sms.sendToStudent.mock.calls[0][1]).toContain('Bugungi maqsad: 160 ball');
    expect(sms.sendToStudent.mock.calls[1][1]).toContain("Nemis so'zlaringiz");
    expect(sms.sendToStudent.mock.calls[1][1]).toContain('Bugungi maqsad: 80 ball');
    expect(natija.mock.calls).toEqual([
      [prisma, 11, 'SENT'],
      [prisma, 12, 'SENT'],
    ]);
  });

  it('egallangan qator (ikkinchi chaqiruv) — yubormaydi', async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    egalla.mockResolvedValueOnce(null).mockResolvedValueOnce(12);
    const { y, sms } = make();
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toMatchObject({
      yuborildi: 1,
      otkazildi: 1,
    });
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
    expect(sms.sendToStudent.mock.calls[0][0]).toBe(10002);
  });

  it("xatoli o'quvchi qolganlarni to'xtatmaydi; xato ham, FAILED javob ham FAILED", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR, { ...BOBUR, studentId: 10003 }]);
    egalla
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(13);
    const { y, sms, prisma } = make();
    sms.sendToStudent
      .mockRejectedValueOnce(new Error('chat not found'))
      .mockResolvedValueOnce({ status: 'FAILED' })
      .mockResolvedValueOnce({ status: 'SENT' });
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toEqual({
      auditoriya: 3,
      yuborildi: 1,
      xato: 2,
      otkazildi: 0,
    });
    expect(natija.mock.calls).toEqual([
      [prisma, 11, 'FAILED'],
      [prisma, 12, 'FAILED'],
      [prisma, 13, 'SENT'],
    ]);
  });

  it("egallashning o'zi yiqilsa ham keyingisi yuboriladi", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    egalla.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(12);
    const { y, sms } = make();
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toMatchObject({
      yuborildi: 1,
      xato: 1,
    });
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
  });

  it('haftalik: WEEKLY qatori, ixtiyoriy qatorlar bilan matn', async () => {
    haftalik.mockResolvedValue([HAFTALIK_QATOR]);
    egalla.mockResolvedValueOnce(21);
    const { y, sms, prisma } = make();
    expect(await y.haftalik(1, '2026-10-19', 'on', 0)).toMatchObject({
      auditoriya: 1,
      yuborildi: 1,
    });
    expect(egalla).toHaveBeenCalledWith(prisma, {
      companyId: 1,
      studentId: 10001,
      kind: 'WEEKLY',
      sentOn: '2026-10-19',
    });
    expect(sms.sendToStudent.mock.calls[0][1]).toBe(
      haftalikMatn(haftalikMalumot(HAFTALIK_QATOR)),
    );
    expect(sms.sendToStudent.mock.calls[0][1]).toContain('Kumush ligasiga');
  });

  it('pauza: har yuborishdan keyin kutadi', async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR, { ...BOBUR, studentId: 10003 }]);
    egalla.mockResolvedValue(11);
    const { y } = make();
    const t0 = Date.now();
    await y.kechki(1, '2026-10-20', 'on', 20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
  });

  it("haftalikMalumot: xona yoki o'rin yo'q — liga qatori yo'q; guruh o'rni yo'q — guruh qatori yo'q", () => {
    expect(haftalikMalumot({ ...HAFTALIK_QATOR, tier: null, orin: null }).liga).toBeNull();
    expect(haftalikMalumot({ ...HAFTALIK_QATOR, orin: null }).liga).toBeNull();
    expect(haftalikMalumot({ ...HAFTALIK_QATOR, guruhOrin: null }).guruh).toBeNull();
    expect(haftalikMalumot(HAFTALIK_QATOR)).toEqual({
      ism: 'Aziza',
      ball: 340,
      liga: { tier: 0, orin: 2, kotarildi: true },
      guruh: { orin: 3, jami: 12 },
      nishonlar: ['SERIE_7'],
    });
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-yuborish.spec.ts` → FAIL (`Cannot find module './eslatma-yuborish'`).

- [ ] **Step 4: Yuboruvchi** — `server/src/daf/eslatma/eslatma-yuborish.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../../sms/sms.service';
import { describeError } from '../../telegram-digest/telegram-send';
import { MAQSAD_BALL, maqsadDarajasi } from '../uebung/punkte';
import {
  haftalikAuditoriya,
  kechkiAuditoriya,
  type HaftalikQator,
} from './eslatma-auditoriya';
import { eslatmaniEgalla, natijaniYoz } from './eslatma-jurnali';
import {
  haftalikMatn,
  kechkiMatn,
  toxtatishTugmasi,
  type HaftalikMalumot,
} from './eslatma-matn';
import {
  PAUZA_MS,
  type EslatmaHolati,
  type EslatmaRejimi,
  type EslatmaTuri,
} from './eslatma-qoidalari';

export interface YuborishNatija {
  auditoriya: number;
  yuborildi: number;
  xato: number;
  /** Qatori boshqa chaqiruvda egallangan (cronning ikki nusxasi, qayta ishga tushirish). */
  otkazildi: number;
}

const kut = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Auditoriya qatori → xulosa matnining kirishi: ma'lumoti yo'q qator chiqmaydi. */
export function haftalikMalumot(q: HaftalikQator): HaftalikMalumot {
  return {
    ism: q.ism,
    ball: q.ball,
    liga:
      q.tier !== null && q.orin !== null
        ? { tier: q.tier, orin: q.orin, kotarildi: q.kotarildi }
        : null,
    guruh: q.guruhOrin !== null ? { orin: q.guruhOrin, jami: q.guruhJami } : null,
    nishonlar: q.nishonlar,
  };
}

/**
 * S4 yuboruvchisi (spec S4 §5, ADR-0117): auditoriya → jurnalda egallash →
 * `SmsService.sendToStudent` (audit `SmsMessage` va «SMS» tabi; to'g'ridan-
 * to'g'ri `.sendMessage(` yo'q — ADR-0025 qorovuli o'zgarmaydi) → natija.
 * Ketma-ket, har yuborishdan keyin `pauzaMs`. Bitta o'quvchidagi xato logga
 * yoziladi va qolganlarini to'xtatmaydi. `on` dan boshqa rejimda faqat
 * auditoriya sanaladi — jurnalga ham yozilmaydi.
 */
@Injectable()
export class EslatmaYuborish {
  private readonly logger = new Logger(EslatmaYuborish.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async kechki(
    companyId: number,
    bugun: string,
    rejim: EslatmaRejimi,
    pauzaMs: number = PAUZA_MS,
  ): Promise<YuborishNatija> {
    const qatorlar = await kechkiAuditoriya(this.prisma, companyId, bugun);
    if (rejim !== 'on') return this.faqatSon(qatorlar.length);
    return this.yubor(companyId, 'EVENING', bugun, qatorlar, pauzaMs, (q) =>
      kechkiMatn({
        ism: q.ism,
        seriya: q.seriya,
        maqsadBall: MAQSAD_BALL[maqsadDarajasi(q.dailyGoal)],
      }),
    );
  }

  async haftalik(
    companyId: number,
    bugun: string,
    rejim: EslatmaRejimi,
    pauzaMs: number = PAUZA_MS,
  ): Promise<YuborishNatija> {
    const qatorlar = await haftalikAuditoriya(this.prisma, companyId, bugun);
    if (rejim !== 'on') return this.faqatSon(qatorlar.length);
    return this.yubor(companyId, 'WEEKLY', bugun, qatorlar, pauzaMs, (q) =>
      haftalikMatn(haftalikMalumot(q)),
    );
  }

  private faqatSon(auditoriya: number): YuborishNatija {
    return { auditoriya, yuborildi: 0, xato: 0, otkazildi: 0 };
  }

  private async yubor<T extends { studentId: number }>(
    companyId: number,
    kind: EslatmaTuri,
    sentOn: string,
    qatorlar: T[],
    pauzaMs: number,
    matn: (q: T) => string,
  ): Promise<YuborishNatija> {
    const n = this.faqatSon(qatorlar.length);
    for (const q of qatorlar) {
      try {
        const id = await eslatmaniEgalla(this.prisma, {
          companyId,
          studentId: q.studentId,
          kind,
          sentOn,
        });
        if (id === null) {
          n.otkazildi += 1;
          continue;
        }
        let holat: EslatmaHolati = 'FAILED';
        try {
          const sms = await this.sms.sendToStudent(
            q.studentId,
            matn(q),
            'AUTO',
            undefined,
            companyId,
            { replyMarkup: toxtatishTugmasi(q.studentId) },
          );
          if (sms.status === 'SENT') holat = 'SENT';
        } finally {
          await natijaniYoz(this.prisma, id, holat);
        }
        if (holat === 'SENT') n.yuborildi += 1;
        else n.xato += 1;
        if (pauzaMs > 0) await kut(pauzaMs);
      } catch (err) {
        n.xato += 1;
        this.logger.warn(
          `Eslatma (${kind}) o'quvchi ${q.studentId}: ${describeError(err)}`,
        );
      }
    }
    return n;
  }
}
```

(`sendToStudent` ichidagi xato uning o'zida `FAILED` bo'lib qaytadi; bu yerdagi `catch` — kutilmagan xato: baza, o'quvchi topilmadi. `finally` holatni har holda yozadi; uning o'zi yiqilsa ham `catch` ushlaydi. «xatoli o'quvchi» testidagi birinchi qatorda `n.xato` faqat `catch` da bir marta oshadi: `finally` dan keyin `throw` davom etadi va `if (holat …)` qatoriga yetmaydi.)

- [ ] **Step 5: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/eslatma src/sms`
Expected: PASS (`eslatma-yuborish.spec.ts` 8 test; `sms.service.spec.ts` yangi testi bilan).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf/eslatma src/sms && npx eslint --quiet src/daf/eslatma src/sms && git add src/daf/eslatma src/sms && git commit -m "feat(daf): reminder sender through SmsService with a stop button and pacing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cronlar va modul — `eslatma.cron.ts`, `EslatmaModule`

**Files:**
- Create: `server/src/daf/eslatma/eslatma.cron.ts`, `server/src/daf/eslatma/eslatma.cron.spec.ts`
- Create: `server/src/daf/eslatma/eslatma.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `EslatmaYuborish`, `YuborishNatija` (Task 5); `haftaTayyormi` (Task 4); `eskilariniTozala` (Task 3); `eslatmaRejimi`, `haftalikQaror`, `toshkentSoati`, `EslatmaRejimi` (Task 2); `HolidaysService.findActiveHolidayCovering(date, null)`; `isTashkentSunday` (`telegram-groups/utils/format.util.ts`); `tashkentDateStr`, `utcMidnightFromDateStr`, `dayOfWeekForDateStr` (`common/date/tashkent.ts`).
- Produces:
  - `class EslatmaCron { kechkiTick(): Promise<void>; haftalikTick(): Promise<void>; kechki(now: Date): Promise<number>; haftalik(now: Date): Promise<number> }` — `kechki`/`haftalik` muvaffaqiyatli kompaniyalar sonini qaytaradi; `@Cron('0 30 19 * * 1-6')` va `@Cron('0 0 9-18 * * 1')`, `timeZone: 'Asia/Tashkent'`
  - `EslatmaModule` (`imports: [SmsModule, TelegramModule, HolidaysModule]`, `providers: [EslatmaYuborish, EslatmaCron]`; Task 8 handlerni qo'shadi)

- [ ] **Step 1: Cron testi** — `server/src/daf/eslatma/eslatma.cron.spec.ts`:

```ts
jest.mock('./eslatma-auditoriya', () => ({ haftaTayyormi: jest.fn() }));
jest.mock('./eslatma-jurnali', () => ({
  eskilariniTozala: jest.fn(async () => 0),
}));

import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import { haftaTayyormi } from './eslatma-auditoriya';
import { eskilariniTozala } from './eslatma-jurnali';
import { EslatmaCron } from './eslatma.cron';

const tayyor = haftaTayyormi as jest.Mock;
const tozala = eskilariniTozala as jest.Mock;

const SESHANBA_1930 = new Date('2026-10-20T14:30:00Z');
const YAKSHANBA_1930 = new Date('2026-10-18T14:30:00Z');
const DUSHANBA = (soat: number) => new Date(Date.UTC(2026, 9, 19, soat - 5));

function make(o: { bayram?: boolean } = {}) {
  const prisma = {
    company: { findMany: jest.fn(async () => [{ id: 1 }, { id: 2 }]) },
  } as any;
  const holidays = {
    findActiveHolidayCovering: jest.fn(async () => (o.bayram ? { id: 9 } : null)),
  } as any;
  const n = { auditoriya: 3, yuborildi: 3, xato: 0, otkazildi: 0 };
  const yuborish = {
    kechki: jest.fn(async () => n),
    haftalik: jest.fn(async () => n),
  } as any;
  return { cron: new EslatmaCron(prisma, holidays, yuborish), prisma, holidays, yuborish };
}

describe('EslatmaCron', () => {
  const oldin = process.env.DAF_ESLATMALAR;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DAF_ESLATMALAR = 'on';
  });
  afterAll(() => {
    if (oldin === undefined) delete process.env.DAF_ESLATMALAR;
    else process.env.DAF_ESLATMALAR = oldin;
  });

  it('jadval: kechki du–sha 19:30, xulosa dushanba 9:00–18:00 har soat, Toshkent', () => {
    const meta = (fn: object) => Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', fn);
    expect(meta(EslatmaCron.prototype.kechkiTick)).toEqual(
      expect.objectContaining({ cronTime: '0 30 19 * * 1-6', timeZone: 'Asia/Tashkent' }),
    );
    expect(meta(EslatmaCron.prototype.haftalikTick)).toEqual(
      expect.objectContaining({ cronTime: '0 0 9-18 * * 1', timeZone: 'Asia/Tashkent' }),
    );
  });

  it('off (standart, o`zgaruvchi yo`q): hech narsa — kompaniyalar ham o`qilmaydi', async () => {
    delete process.env.DAF_ESLATMALAR;
    const { cron, prisma, yuborish } = make();
    expect(await cron.kechki(SESHANBA_1930)).toBe(0);
    expect(await cron.haftalik(DUSHANBA(9))).toBe(0);
    expect(prisma.company.findMany).not.toHaveBeenCalled();
    expect(yuborish.kechki).not.toHaveBeenCalled();
    expect(yuborish.haftalik).not.toHaveBeenCalled();
  });

  it("log: auditoriya so'raladi, rejim uzatiladi, jurnal tozalanmaydi", async () => {
    process.env.DAF_ESLATMALAR = 'log';
    const { cron, yuborish } = make();
    expect(await cron.kechki(SESHANBA_1930)).toBe(2);
    expect(yuborish.kechki).toHaveBeenCalledWith(1, '2026-10-20', 'log');
    expect(tozala).not.toHaveBeenCalled();
  });

  it('on: har kompaniya, oxirida 90 kunlik tozalash', async () => {
    const { cron, prisma, yuborish } = make();
    expect(await cron.kechki(SESHANBA_1930)).toBe(2);
    expect(yuborish.kechki).toHaveBeenCalledWith(1, '2026-10-20', 'on');
    expect(yuborish.kechki).toHaveBeenCalledWith(2, '2026-10-20', 'on');
    expect(tozala).toHaveBeenCalledWith(prisma, 1, '2026-10-20');
    expect(tozala).toHaveBeenCalledWith(prisma, 2, '2026-10-20');
  });

  it("yakshanba va umumiy bayram kuni kechki eslatma yo'q", async () => {
    const yak = make();
    expect(await yak.cron.kechki(YAKSHANBA_1930)).toBe(0);
    expect(yak.holidays.findActiveHolidayCovering).not.toHaveBeenCalled();
    const bayram = make({ bayram: true });
    expect(await bayram.cron.kechki(SESHANBA_1930)).toBe(0);
    expect(bayram.holidays.findActiveHolidayCovering).toHaveBeenCalledWith(
      utcMidnightFromDateStr('2026-10-20'),
      null,
    );
    expect(bayram.yuborish.kechki).not.toHaveBeenCalled();
  });

  it("bir kompaniyaning xatosi boshqasini to'xtatmaydi", async () => {
    const { cron, yuborish } = make();
    yuborish.kechki.mockRejectedValueOnce(new Error('db down'));
    expect(await cron.kechki(SESHANBA_1930)).toBe(1);
    expect(yuborish.kechki).toHaveBeenCalledTimes(2);
  });

  it('xulosa: hafta tayyor — yuboriladi, bayram dushanbasida ham', async () => {
    tayyor.mockResolvedValue(true);
    const { cron, yuborish, holidays, prisma } = make({ bayram: true });
    expect(await cron.haftalik(DUSHANBA(9))).toBe(2);
    expect(tayyor).toHaveBeenCalledWith(prisma, 1, '2026-10-19');
    expect(yuborish.haftalik).toHaveBeenCalledWith(1, '2026-10-19', 'on');
    expect(holidays.findActiveHolidayCovering).not.toHaveBeenCalled();
  });

  it('xulosa: tayyor emas — 17:00 da kutadi, 18:00 da shu hafta tashlanadi; ikkalasida yubormaydi', async () => {
    tayyor.mockResolvedValue(false);
    const { cron, yuborish } = make();
    expect(await cron.haftalik(DUSHANBA(17))).toBe(0);
    expect(await cron.haftalik(DUSHANBA(18))).toBe(0);
    expect(yuborish.haftalik).not.toHaveBeenCalled();
  });

  it("xulosa: dushanba emas — hech narsa", async () => {
    const { cron } = make();
    expect(await cron.haftalik(SESHANBA_1930)).toBe(0);
    expect(tayyor).not.toHaveBeenCalled();
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma.cron.spec.ts` → FAIL (`Cannot find module './eslatma.cron'`).

- [ ] **Step 2: Cron** — `server/src/daf/eslatma/eslatma.cron.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { HolidaysService } from '../../holidays/holidays.service';
import {
  dayOfWeekForDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { isTashkentSunday } from '../../telegram-groups/utils/format.util';
import { describeError } from '../../telegram-digest/telegram-send';
import { haftaTayyormi } from './eslatma-auditoriya';
import { eskilariniTozala } from './eslatma-jurnali';
import { EslatmaYuborish, type YuborishNatija } from './eslatma-yuborish';
import {
  eslatmaRejimi,
  haftalikQaror,
  toshkentSoati,
  type EslatmaRejimi,
} from './eslatma-qoidalari';

/**
 * S4 cronlari (spec S4 §1, §2, §5; ADR-0117). `DAF_ESLATMALAR` har yurishda
 * o'qiladi: `off` (standart) — hech narsa; `log` — auditoriya sanaladi va
 * logga yoziladi; `on` — yuboriladi. Har kompaniya alohida: birining xatosi
 * logga yoziladi, qolganlari davom etadi. `CRONS_ENABLED=false` da
 * `ScheduleModule` yuklanmaydi — alohida tekshiruv shart emas.
 */
@Injectable()
export class EslatmaCron {
  private readonly logger = new Logger(EslatmaCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
    private readonly yuborish: EslatmaYuborish,
  ) {}

  /** Dushanba–shanba 19:30; yakshanba va umumiy bayram kunida yo'q (spec §1.1). */
  @Cron('0 30 19 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async kechkiTick(): Promise<void> {
    try {
      await this.kechki(new Date());
    } catch (err) {
      this.logger.error(`Kechki eslatma yiqildi: ${describeError(err)}`);
    }
  }

  /**
   * Dushanba 09:00, hafta hali hisoblanmagan bo'lsa 10:00 … 18:00 har soatda
   * (spec §2). Bayram dushanbasida ham — xulosa qo'ng'iroq emas. Yuborilgan
   * o'quvchi keyingi soatlarda auditoriyaga kirmaydi (shu dushanba qatori bor).
   */
  @Cron('0 0 9-18 * * 1', { timeZone: 'Asia/Tashkent' })
  async haftalikTick(): Promise<void> {
    try {
      await this.haftalik(new Date());
    } catch (err) {
      this.logger.error(`Dushanba xulosasi yiqildi: ${describeError(err)}`);
    }
  }

  async kechki(now: Date): Promise<number> {
    const rejim = eslatmaRejimi(process.env.DAF_ESLATMALAR);
    if (rejim === 'off' || isTashkentSunday(now)) return 0;
    const bugun = tashkentDateStr(now);
    const bayram = await this.holidays.findActiveHolidayCovering(
      utcMidnightFromDateStr(bugun),
      null,
    );
    if (bayram) return 0;
    let ok = 0;
    for (const c of await this.kompaniyalar()) {
      try {
        const n = await this.yuborish.kechki(c.id, bugun, rejim);
        this.hisobot('kechki', rejim, c.id, n);
        if (rejim === 'on') await eskilariniTozala(this.prisma, c.id, bugun);
        ok += 1;
      } catch (err) {
        this.logger.error(
          `Kechki eslatma yiqildi (kompaniya ${c.id}): ${describeError(err)}`,
        );
      }
    }
    return ok;
  }

  async haftalik(now: Date): Promise<number> {
    const rejim = eslatmaRejimi(process.env.DAF_ESLATMALAR);
    if (rejim === 'off') return 0;
    const bugun = tashkentDateStr(now);
    if (dayOfWeekForDateStr(bugun) !== 1) return 0;
    const soat = toshkentSoati(now);
    let ok = 0;
    for (const c of await this.kompaniyalar()) {
      try {
        const qaror = haftalikQaror(
          soat,
          await haftaTayyormi(this.prisma, c.id, bugun),
        );
        if (qaror === 'kut') {
          this.logger.warn(
            `Dushanba xulosasi: kompaniya ${c.id}, o'tgan hafta hali hisoblanmagan — ${soat + 1}:00 da qayta urinadi`,
          );
          continue;
        }
        if (qaror === 'tashla') {
          this.logger.warn(
            `Dushanba xulosasi: kompaniya ${c.id}, o'tgan hafta 18:00 gacha hisoblanmadi — shu hafta yuborilmaydi`,
          );
          continue;
        }
        this.hisobot('haftalik', rejim, c.id, await this.yuborish.haftalik(c.id, bugun, rejim));
        ok += 1;
      } catch (err) {
        this.logger.error(
          `Dushanba xulosasi yiqildi (kompaniya ${c.id}): ${describeError(err)}`,
        );
      }
    }
    return ok;
  }

  private kompaniyalar(): Promise<{ id: number }[]> {
    return this.prisma.company.findMany({ select: { id: true } });
  }

  private hisobot(
    tur: 'kechki' | 'haftalik',
    rejim: EslatmaRejimi,
    companyId: number,
    n: YuborishNatija,
  ): void {
    this.logger.log(
      rejim === 'log'
        ? `Eslatma (log): kompaniya ${companyId}, ${tur} auditoriya ${n.auditoriya} — yuborilmadi`
        : `Eslatma: kompaniya ${companyId}, ${tur}: ${n.auditoriya} auditoriya, ${n.yuborildi} yuborildi, ${n.xato} xato, ${n.otkazildi} o'tkazildi`,
    );
  }
}
```

Run: `cd server && npx jest src/daf/eslatma/eslatma.cron.spec.ts` → PASS (9 test).

- [ ] **Step 3: Modul** — `server/src/daf/eslatma/eslatma.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HolidaysModule } from '../../holidays/holidays.module';
import { SmsModule } from '../../sms/sms.module';
import { TelegramModule } from '../../telegram/telegram.module';
import { EslatmaCron } from './eslatma.cron';
import { EslatmaYuborish } from './eslatma-yuborish';

/**
 * S4: kechki eslatma va dushanba xulosasi (ADR-0117). `DafModule` dan
 * alohida: yuborish `SmsModule` (u `TelegramModule` ni oladi) orqali, `DafModule`
 * esa `AppActivityModule` ga import qilingan — o'quv bo'limi Telegram
 * zanjiriga bog'lanmaydi. Bir tomonlama: bu modulni hech kim import qilmaydi.
 */
@Module({
  imports: [SmsModule, TelegramModule, HolidaysModule],
  providers: [EslatmaYuborish, EslatmaCron],
})
export class EslatmaModule {}
```

`server/src/app.module.ts` da `import { DafModule } from './daf/daf.module';` qatoridan keyin:

```ts
import { EslatmaModule } from './daf/eslatma/eslatma.module';
```

va `imports` ro'yxatidagi:

```ts
    DafModule,
    AppActivityModule,
```

ni:

```ts
    DafModule,
    EslatmaModule,
    AppActivityModule,
```

ga almashtirish.

- [ ] **Step 4: Testlar, typecheck, build**

Run: `cd server && npx jest src/daf/eslatma && npm run typecheck && npm run build`
Expected: PASS, 0 xato. (DI tutunishi — Task 8 Step 6 dagi backend ishga tushirishda.)

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf/eslatma src/app.module.ts && npx eslint --quiet src/daf/eslatma src/app.module.ts && git add src/daf/eslatma src/app.module.ts && git commit -m "feat(daf): 19:30 reminder and Monday summary crons behind DAF_ESLATMALAR

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ilovadan o'chirish — `PATCH eslatmalar` va `fortschritt.eslatmalar`

**Files:**
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (import; `Fortschritt` va `OquvchiRaqamlari` interfeyslari; `uebersicht` javobi; `oquvchiRaqamlari` izohi va SQL; `maqsadniOzgartir` dan keyin yangi metod)
- Modify: `server/src/daf/fortschritt/zentrum-sql.fake-spec.ts`, `server/src/daf/fortschritt/fortschritt.service.spec.ts`
- Create: `server/src/daf/dto/eslatmalar.dto.ts`, `server/src/daf/dto/eslatmalar.dto.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts` (fayl oxiriga marshrut), `server/src/daf/daf-portal.controller.spec.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (`'GET /student-portal/lernen/fortschritt'` bloki), `server/src/common/permissions/route-access.snapshot.json`
- Temporary: `server/scripts/_probe-eslatma-fortschritt.ts` (commit qilinmaydi)

**Interfaces:**
- Consumes: `eslatmalarniSaqla` (Task 3).
- Produces:
  - `Fortschritt.eslatmalar: boolean`, `Fortschritt.telegramUlangan: boolean`
  - `FortschrittService.eslatmalarniOzgartir(studentId: number, companyId: number, yoqilgan: boolean): Promise<{ eslatmalar: boolean }>`
  - `class EslatmalarDto { yoqilgan: boolean }`
  - `DafPortalController.patchEslatmalar(dto, studentId, companyId)`; HTTP `PATCH /api/student-portal/lernen/eslatmalar` `{ yoqilgan: boolean }` → `{ eslatmalar: boolean }`
  - `zentrumQueryRaw(rows, dailyGoal?, eslatma?: () => { eslatmalar: boolean; telegramUlangan: boolean })`

- [ ] **Step 1: Soxta bazaga ikki ustun** — `zentrum-sql.fake-spec.ts` dagi:

```ts
export function zentrumQueryRaw(
  rows: () => KunQatori[],
  dailyGoal: () => string | null = () => null,
) {
```

ni:

```ts
export function zentrumQueryRaw(
  rows: () => KunQatori[],
  dailyGoal: () => string | null = () => null,
  /** S4: `remindersEnabled` (qator yo'q = true) va kartaning botga ulanganligi. */
  eslatma: () => { eslatmalar: boolean; telegramUlangan: boolean } = () => ({
    eslatmalar: true,
    telegramUlangan: false,
  }),
) {
```

ga, va `/* oquvchi-raqamlari */` javobidagi:

```ts
          dailyGoal: dailyGoal(),
        },
```

ni:

```ts
          dailyGoal: dailyGoal(),
          ...eslatma(),
        },
```

ga almashtirish.

- [ ] **Step 2: Yiqiladigan servis testlari** — `fortschritt.service.spec.ts`:
  - fayl tepasidagi importlarga `import type { Prisma } from '@prisma/client';`;
  - `fakePrisma` imzosidagi `dailyGoal: string | null = null,` dan keyin `eslatma = { eslatmalar: true, telegramUlangan: false },` va ichidagi `() => dailyGoal,` ni `() => dailyGoal,\n      () => eslatma,` ga;
  - fayl oxiriga:

```ts

describe('eslatmalar (S4)', () => {
  it("sozlama qatori yo'q — yoqilgan; karta botga ulanmagan", async () => {
    const f = await new FortschrittService(fakePrisma()).uebersicht(55, 1);
    expect(f.eslatmalar).toBe(true);
    expect(f.telegramUlangan).toBe(false);
  });

  it("o'chirilgan va ulangan holat o'qiladi — qo'shimcha so'rov yo'q", async () => {
    const prisma = fakePrisma([], [], null, {
      eslatmalar: false,
      telegramUlangan: true,
    });
    prisma.dafLexemeState.count = jest.fn(async () => 3);
    const f = await new FortschrittService(prisma).uebersicht(55, 1);
    expect(f.eslatmalar).toBe(false);
    expect(f.telegramUlangan).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("SQL: sozlama CTE ga ustun, ulanish shu so'rovda, oxirgi ikki qiymat o'zgarmadi", async () => {
    const prisma = fakePrisma();
    await new FortschrittService(prisma).uebersicht(55, 1);
    const sql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const matn = sql.strings.join('?');
    expect(matn).toContain('"remindersEnabled" AS e');
    expect(matn).toContain('COALESCE((SELECT e FROM sozlama), true) AS eslatmalar');
    expect(matn).toContain('"telegramDisconnectedAt" IS NULL');
    expect(sql.values.slice(-2)).toEqual([0, tashkentDateStr(new Date())]);
  });

  it('eslatmalarniOzgartir — yagona yozuvchi orqali', async () => {
    const prisma = fakePrisma();
    prisma.dafStudentSetting = {
      upsert: jest.fn(async () => ({ remindersEnabled: false })),
    };
    expect(
      await new FortschrittService(prisma).eslatmalarniOzgartir(55, 1, false),
    ).toEqual({ eslatmalar: false });
    expect(prisma.dafStudentSetting.upsert).toHaveBeenCalledWith({
      where: { studentId: 55 },
      create: { studentId: 55, companyId: 1, remindersEnabled: false },
      update: { remindersEnabled: false },
      select: { remindersEnabled: true },
    });
  });
});
```

Run: `cd server && npx jest src/daf/fortschritt/fortschritt.service.spec.ts -t "eslatmalar"`
Expected: FAIL (`f.eslatmalar` — `undefined` emas, fake qiymat keladi, lekin servis uni javobga qo'ymaydi: `Expected: true, Received: undefined`; `eslatmalarniOzgartir is not a function`).

- [ ] **Step 3: Servisga ulanishlar** — `fortschritt.service.ts`:
  - importlarga (`import { bugunBoshmi, maqsadniSaqla } from './maqsad';` dan keyin):

```ts
import { eslatmalarniSaqla } from '../eslatma/eslatma-sozlama';
```

  - `interface Fortschritt` dagi `maqsad: MaqsadHolati;` dan keyin:

```ts
  /** S4: Telegram eslatmalari yoqilganmi (sozlama qatori yo'q = yoqilgan). */
  eslatmalar: boolean;
  /** S4: karta botga ulangan va chat uzilmagan (ADR-0066 belgisi yo'q). */
  telegramUlangan: boolean;
```

  - `interface OquvchiRaqamlari` dagi `dailyGoal: string | null;` dan keyin:

```ts
  eslatmalar: boolean;
  telegramUlangan: boolean;
```

  - `uebersicht` javobidagi `maqsad: maqsadHolati(maqsadDarajasi(oz.dailyGoal), oz.heutePunkte, bosh),` dan keyin:

```ts
      eslatmalar: oz.eslatmalar,
      telegramUlangan: oz.telegramUlangan,
```

  - `maqsadniOzgartir` metodidan keyin:

```ts

  /** `PATCH .../eslatmalar` — S4: o'quvchi faqat o'z eslatmalarini o'zgartiradi. */
  eslatmalarniOzgartir(
    studentId: number,
    companyId: number,
    yoqilgan: boolean,
  ): Promise<{ eslatmalar: boolean }> {
    return eslatmalarniSaqla(this.prisma, studentId, companyId, yoqilgan);
  }
```

  - `oquvchiRaqamlari` izohidagi `- \`dailyGoal\` — …` bandidan keyin:

```ts
   * - `eslatmalar`, `telegramUlangan` — S4: `remindersEnabled` (qator yo'q =
   *   true) va kartaning botga ulanganligi; `sozlama` / `ulanish` CTE lari,
   *   alohida so'rov yo'q. `ulanish` `o` CTE sidan OLDIN turadi: oxirgi ikki
   *   bog'langan qiymat hamon `minus`, `heuteTag`.
```

  - SQL dagi:

```ts
      sozlama AS (
        SELECT "dailyGoal"::text AS g FROM "DafStudentSetting"
        WHERE "studentId" = ${studentId}
      ),
      o AS (SELECT id, p, GREATEST(p - ${minus}::int, 0) AS op FROM q),
```

ni:

```ts
      sozlama AS (
        SELECT "dailyGoal"::text AS g, "remindersEnabled" AS e FROM "DafStudentSetting"
        WHERE "studentId" = ${studentId}
      ),
      ulanish AS (
        SELECT ("telegramChatId" IS NOT NULL AND "telegramDisconnectedAt" IS NULL) AS u
        FROM "Student" WHERE id = ${studentId}
      ),
      o AS (SELECT id, p, GREATEST(p - ${minus}::int, 0) AS op FROM q),
```

ga, va:

```ts
        (SELECT g FROM sozlama) AS "dailyGoal"
      FROM r`,
```

ni:

```ts
        (SELECT g FROM sozlama) AS "dailyGoal",
        COALESCE((SELECT e FROM sozlama), true) AS eslatmalar,
        COALESCE((SELECT u FROM ulanish), false) AS "telegramUlangan"
      FROM r`,
```

ga almashtirish.

Run: `cd server && npx jest src/daf/fortschritt` → PASS (yangi 4 test; `seans-natija.spec.ts` fake standart qiymati bilan o'zgarmay o'tadi).

- [ ] **Step 4: DTO testi** — `server/src/daf/dto/eslatmalar.dto.spec.ts`:

```ts
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EslatmalarDto } from './eslatmalar.dto';

/** `main.ts` dagi global pipe bilan bir xil sozlama. */
describe('EslatmalarDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: EslatmalarDto };

  it.each([true, false])('qabul qiladi: %p', async (yoqilgan) => {
    await expect(pipe.transform({ yoqilgan }, meta)).resolves.toEqual({
      yoqilgan,
    });
  });

  it("matn, bo'sh tana va ortiqcha maydon — 400", async () => {
    for (const body of [{ yoqilgan: 'true' }, {}, { yoqilgan: true, studentId: 7 }]) {
      await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
```

Run: `cd server && npx jest src/daf/dto/eslatmalar.dto.spec.ts` → FAIL (`Cannot find module './eslatmalar.dto'`).

- [ ] **Step 5: DTO** — `server/src/daf/dto/eslatmalar.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';

/** `PATCH .../eslatmalar` tanasi (spec S4 §3) — faqat haqiqiy boolean. */
export class EslatmalarDto {
  @IsBoolean()
  yoqilgan!: boolean;
}
```

Run: `cd server && npx jest src/daf/dto/eslatmalar.dto.spec.ts` → PASS (3 test).

- [ ] **Step 6: Yiqiladigan kontroller testlari** — `daf-portal.controller.spec.ts`:
  - `// The 20 routes of the learning section…` → `// The 21 routes of the learning section…`, va

```ts
  it('has the 20 learning routes', () => {
    expect(routes).toHaveLength(20);
  });
```

ni:

```ts
  it('has the 21 learning routes', () => {
    expect(routes).toHaveLength(21);
  });
```

ga almashtirish;
  - fayl oxiriga:

```ts

describe('DafPortalController — eslatmalar (S4)', () => {
  it('PATCH eslatmalar — faqat tokendagi o`quvchiniki', async () => {
    const fortschritt = {
      eslatmalarniOzgartir: jest.fn(async () => ({ eslatmalar: false })),
    };
    const controller = new DafPortalController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      fortschritt as any,
    );
    expect(
      await controller.patchEslatmalar({ yoqilgan: false } as any, 55, 1),
    ).toEqual({ eslatmalar: false });
    expect(fortschritt.eslatmalarniOzgartir).toHaveBeenCalledWith(55, 1, false);
  });

  it('yo`l va usul', () => {
    const proto = DafPortalController.prototype as any;
    expect(Reflect.getMetadata('path', proto.patchEslatmalar)).toBe('eslatmalar');
    expect(Reflect.getMetadata('method', proto.patchEslatmalar)).toBe(
      RequestMethod.PATCH,
    );
  });
});
```

Run: `cd server && npx jest src/daf/daf-portal.controller.spec.ts` → FAIL (20 ≠ 21, `patchEslatmalar` yo'q).

- [ ] **Step 7: Kontroller** — `daf-portal.controller.ts` importlariga `import { EslatmalarDto } from './dto/eslatmalar.dto';` (`MaqsadDto` importidan keyin), va `getGuruhlar` metodidan keyin (klassni yopuvchi `}` dan oldin):

```ts

  /**
   * Telegram eslatmalari (spec S4 §3). `studentId` TOKENDAN — o'quvchi faqat
   * o'zinikini o'zgartiradi. Yozuvchi bitta (`eslatmalarniSaqla`): bot
   * tugmasi ham shuni chaqiradi. Javob — `{ eslatmalar }`.
   */
  @Patch('eslatmalar')
  patchEslatmalar(
    @Body() dto: EslatmalarDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.fortschritt.eslatmalarniOzgartir(
      studentId,
      companyId,
      dto.yoqilgan,
    );
  }
```

(Klass darajasidagi `@StudentOnly()` va `@UseGuards(StudentCardGuard)` marshrutni qamraydi; `daf-portal.student-card.e2e.spec.ts` marshrutlarni metadatadan o'qiydi — `studentId`siz token = 404 va 0 so'rov tekshiruvi o'zgartirishsiz unga ham yuradi.)

- [ ] **Step 8: Marshrut siyosati** — `branch-route-policy.ts` dagi:

```ts
      'deliberately not limited to a branch (06.09 §6.1).',
    routes: [
```

ni:

```ts
      'deliberately not limited to a branch (06.09 §6.1). ' +
      '`PATCH .../eslatmalar` (S4, ADR-0117) is SELF the ordinary way: the ' +
      "caller's own reminder switch on their own `DafStudentSetting` row.",
    routes: [
```

ga, va shu blokdagi:

```ts
      'GET /student-portal/lernen/guruhlar',
    ],
```

ni:

```ts
      'GET /student-portal/lernen/guruhlar',
      'PATCH /student-portal/lernen/eslatmalar',
    ],
```

ga almashtirish.

- [ ] **Step 9: Kirish suratiga qator** — `route-access.snapshot.json` da:

```json
  "PATCH /student-portal/lernen/maqsad": [
    "Student"
  ],
```

dan OLDIN:

```json
  "PATCH /student-portal/lernen/eslatmalar": [
    "Student"
  ],
```

- [ ] **Step 10: Testlar va typecheck**

Run: `cd server && npx jest src/daf src/common/permissions src/common/auth && npm run typecheck`
Expected: PASS (e2e: 21 marshrut × 3 holat — 404/404/403, so'rov 0; manifest va surat mos), typecheck 0 xato.

- [ ] **Step 11: Haqiqiy Postgres'da** — vaqtinchalik `server/scripts/_probe-eslatma-fortschritt.ts` (Task 4 seedidan keyingi holat: chatli, uzilgan va chatsiz o'quvchilar bor):

```ts
/** VAQTINCHA (S4 Task 7): `oquvchi-raqamlari` dagi yangi ustunlar va PATCH yozuvchisi. Commit qilinmaydi. */
import { run } from './lib/check-cli';
import { assertLocalDb } from './load/local-db-guard';
import { FortschrittService } from '../src/daf/fortschritt/fortschritt.service';

assertLocalDb();

run(async (prisma) => {
  const db = prisma as any;
  const svc = new FortschrittService(db);
  const ol = (where: object) =>
    prisma.student.findFirstOrThrow({
      where: { deletedAt: null, ...where },
      orderBy: { id: 'asc' },
      select: { id: true, companyId: true },
    });
  const ulangan = await ol({ telegramChatId: { not: null }, telegramDisconnectedAt: null });
  const ulanmagan = await ol({ telegramChatId: null });
  const uzilgan = await ol({ telegramDisconnectedAt: { not: null } });
  const oldin = await svc.uebersicht(ulangan.id, ulangan.companyId);
  await svc.eslatmalarniOzgartir(ulangan.id, ulangan.companyId, false);
  const keyin = await svc.uebersicht(ulangan.id, ulangan.companyId);
  await svc.eslatmalarniOzgartir(ulangan.id, ulangan.companyId, true);
  const qaytdi = await svc.uebersicht(ulangan.id, ulangan.companyId);
  console.log({
    oldinUlangan: oldin.telegramUlangan,
    keyin: [keyin.eslatmalar, keyin.telegramUlangan],
    qaytdi: qaytdi.eslatmalar,
    maqsadOzgarmadi: keyin.maqsad.daraja === oldin.maqsad.daraja,
    ulanmagan: (await svc.uebersicht(ulanmagan.id, ulanmagan.companyId)).telegramUlangan,
    uzilgan: (await svc.uebersicht(uzilgan.id, uzilgan.companyId)).telegramUlangan,
  });
});
```

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/_probe-eslatma-fortschritt.ts
rm server/scripts/_probe-eslatma-fortschritt.ts
```

Expected: `oldinUlangan: true`, `keyin: [false, true]`, `qaytdi: true`, `maqsadOzgarmadi: true`, `ulanmagan: false`, `uzilgan: false`. (Proba oxirida o'quvchining eslatmalari yoqilgan qoladi; seed uni o'chirgan bo'lsa ham keyingi tekshiruvlar bazadagi haqiqiy qiymatni o'qiydi.)

- [ ] **Step 12: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf src/common/auth/branch-route-policy.ts && npx eslint --quiet src/daf src/common/auth/branch-route-policy.ts && git status --short && git add src/daf src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json && git commit -m "feat(daf): student switches reminders off in the app, state in fortschritt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Telegram tugmasi — `eslatma-telegram.handler.ts`

**Files:**
- Create: `server/src/daf/eslatma/eslatma-telegram.handler.ts`
- Create: `server/src/daf/eslatma/eslatma-telegram.handler.spec.ts`, `server/src/daf/eslatma/eslatma-telegram.handler.registration.spec.ts`
- Modify: `server/src/daf/eslatma/eslatma.module.ts` (`providers`)

**Interfaces:**
- Consumes: `eslatmalarniSaqla` (Task 3); `toxtatishKimniki`, `TOXTATILDI`, `SIZGA_EMAS`, `KEYINROQ` (Task 2); `TelegramService.getBot()`, `TelegramService.useBeforeScenes(mw)`; `BotContext` (`telegram/types/context`); `describeError`.
- Produces: `class EslatmaTelegramHandler implements OnApplicationBootstrap { onApplicationBootstrap(): void; onAction(ctx: BotContext): Promise<void> }` — `dr:off:*` callbacklari; boshqa hamma narsa `next()`.

- [ ] **Step 1: Xatti-harakat testi** — `server/src/daf/eslatma/eslatma-telegram.handler.spec.ts`:

```ts
import { KEYINROQ, SIZGA_EMAS, TOXTATILDI } from './eslatma-matn';
import { EslatmaTelegramHandler } from './eslatma-telegram.handler';

function setup(
  student: unknown = { companyId: 1, telegramChatId: '555' },
) {
  const prisma = {
    student: { findFirst: jest.fn().mockResolvedValue(student) },
    dafStudentSetting: {
      upsert: jest.fn().mockResolvedValue({ remindersEnabled: false }),
    },
  };
  const handler = new EslatmaTelegramHandler(prisma as never, {} as never);
  return { handler, prisma };
}

function ctx(data: string, chatId = 555, type = 'private') {
  return {
    chat: { id: chatId, type },
    callbackQuery: { data },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 1 }),
  };
}

describe('EslatmaTelegramHandler — «Eslatmalarni to`xtatish»', () => {
  it("o'z chati: o'chiradi, tugmani oladi, javob beradi", async () => {
    const { handler, prisma } = setup();
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(prisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: 10001, deletedAt: null },
      select: { companyId: true, telegramChatId: true },
    });
    expect(prisma.dafStudentSetting.upsert).toHaveBeenCalledWith({
      where: { studentId: 10001 },
      create: { studentId: 10001, companyId: 1, remindersEnabled: false },
      update: { remindersEnabled: false },
      select: { remindersEnabled: true },
    });
    expect(c.answerCbQuery).toHaveBeenCalledWith();
    expect(c.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(c.reply).toHaveBeenCalledWith(TOXTATILDI);
  });

  it("boshqa chat (ota-onaning boshqa bolasi ham) o'chira olmaydi", async () => {
    const { handler, prisma } = setup();
    const c = ctx('dr:off:10001', 999);
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(SIZGA_EMAS);
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
    expect(c.reply).not.toHaveBeenCalled();
  });

  it("o'chirilgan yoki topilmagan o'quvchi — «sizga emas»", async () => {
    const { handler, prisma } = setup(null);
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(SIZGA_EMAS);
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
  });

  it("noto'g'ri tugma va guruh chati — jim, bazaga tegmaydi", async () => {
    const { handler, prisma } = setup();
    for (const c of [ctx('dr:off:0'), ctx('dr:off:10001', -100, 'group')]) {
      await handler.onAction(c as never);
      expect(c.answerCbQuery).toHaveBeenCalledWith();
    }
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it('baza xatosi — «keyinroq», yiqilmaydi', async () => {
    const { handler, prisma } = setup();
    prisma.student.findFirst.mockRejectedValueOnce(new Error('db down'));
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(KEYINROQ);
  });
});
```

- [ ] **Step 2: Ro'yxatga olish testi** — `server/src/daf/eslatma/eslatma-telegram.handler.registration.spec.ts`:

```ts
import { Composer, Context } from 'telegraf';
import { EslatmaTelegramHandler } from './eslatma-telegram.handler';

// Registration before the scenes (ADR-0078 path): dr:off:* to onAction, the rest to next().

const callback = (data: string): Context =>
  new Context(
    {
      update_id: 1,
      callback_query: {
        id: 'q',
        from: { id: 700, is_bot: false, first_name: 'A' },
        chat_instance: 'c',
        data,
      },
    } as never,
    {} as never,
    { username: 'bot' } as never,
  ) as never;

function setup(bot: object | null = {}) {
  const telegram = {
    getBot: () => bot,
    useBeforeScenes: jest.fn<void, [Composer<Context>]>(),
  };
  const handler = new EslatmaTelegramHandler({} as never, telegram as never);
  return { handler, telegram };
}

describe('EslatmaTelegramHandler — registration (before the scenes)', () => {
  it('registers one middleware when the bot exists', () => {
    const { handler, telegram } = setup();
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
  });

  it('registers nothing without a bot and does not throw', () => {
    const { handler, telegram } = setup(null);
    expect(() => handler.onApplicationBootstrap()).not.toThrow();
    expect(telegram.useBeforeScenes).not.toHaveBeenCalled();
  });

  it('dr:off:* reaches onAction, other callbacks go to next()', async () => {
    const { handler, telegram } = setup();
    const onAction = jest.spyOn(handler, 'onAction').mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);
    const next = jest.fn().mockResolvedValue(undefined);

    await mw(callback('dr:off:10001'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    await mw(callback('lr:0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10:5'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
```

Run: `cd server && npx jest src/daf/eslatma/eslatma-telegram.handler` → FAIL (`Cannot find module './eslatma-telegram.handler'`).

- [ ] **Step 3: Handler** — `server/src/daf/eslatma/eslatma-telegram.handler.ts`:

```ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Composer } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { eslatmalarniSaqla } from './eslatma-sozlama';
import {
  KEYINROQ,
  SIZGA_EMAS,
  TOXTATILDI,
  toxtatishKimniki,
} from './eslatma-matn';

/**
 * «Eslatmalarni to'xtatish» tugmasi (`dr:off:<studentId>`, spec S4 §3).
 * Sahnalardan oldin ishlaydi (`useBeforeScenes`, vazifalar va dars bahosi
 * handlerlari kabi): ochiq scene bosishni yutmaydi, boshqa hamma narsa
 * `next()` ga o'tadi. Bosgan chat tugmadagi o'quvchining `telegramChatId`
 * siga teng bo'lishi shart: ota-ona chati bir nechta bolani ulashi mumkin —
 * faqat tugmadagi o'quvchi o'chadi; yo'naltirilgan xabarning tugmasi boshqa
 * chatda hech narsani o'zgartirmaydi.
 */
@Injectable()
export class EslatmaTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(EslatmaTelegramHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // TELEGRAM_BOT_TOKEN yo'q — bot o'chiq
    const c = new Composer<BotContext>();
    c.action(/^dr:off:/, (ctx) => this.onAction(ctx));
    this.telegram.useBeforeScenes(c);
  }

  async onAction(ctx: BotContext): Promise<void> {
    try {
      await this.handle(ctx);
    } catch (err) {
      this.logger.error(`eslatma tugmasi yiqildi: ${describeError(err)}`);
      await ctx.answerCbQuery(KEYINROQ).catch(() => undefined);
    }
  }

  private async handle(ctx: BotContext): Promise<void> {
    const q = ctx.callbackQuery;
    const studentId = toxtatishKimniki(q && 'data' in q ? q.data : '');
    if (!studentId || ctx.chat?.type !== 'private') {
      await ctx.answerCbQuery();
      return;
    }
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { companyId: true, telegramChatId: true },
    });
    if (!s || s.telegramChatId !== String(ctx.chat.id)) {
      await ctx.answerCbQuery(SIZGA_EMAS);
      return;
    }
    await eslatmalarniSaqla(this.prisma, studentId, s.companyId, false);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await ctx.reply(TOXTATILDI);
  }
}
```

`server/src/daf/eslatma/eslatma.module.ts` ga `import { EslatmaTelegramHandler } from './eslatma-telegram.handler';` va `providers: [EslatmaYuborish, EslatmaCron],` ni `providers: [EslatmaYuborish, EslatmaCron, EslatmaTelegramHandler],` ga almashtirish.

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/eslatma`
Expected: PASS (handler 5 + ro'yxat 3 test va avvalgilari).

- [ ] **Step 5: Typecheck va build**

Run: `cd server && npm run typecheck && npm run build`
Expected: 0 xato.

- [ ] **Step 6: Backend ishga tushadi (DI tutunishi)** — xotira `reference_throwaway_local_db` retsepti, `$S1_DB` bilan, bot va cronlarsiz:

```bash
docker run -d --name redis-s4 -p 127.0.0.1:6417:6379 redis:7-alpine
cd server && DATABASE_URL="$S1_DB" PORT=4417 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= REDIS_HOST=127.0.0.1 REDIS_PORT=6417 node --env-file=/Users/a1111/Desktop/daf-erp-system/server/.env dist/src/main.js > /private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/s4-backend.log 2>&1
```

Ikkinchi buyruqni `run_in_background: true` bilan yurgizib, `Monitor` bilan `until grep -qE 'Nest application successfully started|Error' /private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/s4-backend.log; do sleep 2; done` kutish. Expected: `Nest application successfully started`; `Nest can't resolve dependencies` yoki `EslatmaCron`/`EslatmaYuborish` haqida xato YO'Q. Keyin jarayonni to'xtatish (`kill <pid>`). Redis konteyneri Task 14 gacha qoladi.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write src/daf/eslatma && npx eslint --quiet src/daf/eslatma && git add src/daf/eslatma && git commit -m "feat(daf): stop-reminders button in Telegram, only for the button's own chat

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: CEO uchun sinov nusxasi — `scripts/daf-eslatma-sinov.ts`

**Files:**
- Create: `server/scripts/lib/daf-eslatma-sinov.ts`, `server/scripts/lib/daf-eslatma-sinov.spec.ts`
- Create: `server/scripts/daf-eslatma-sinov.ts`

**Interfaces:**
- Consumes: `kechkiMatn`, `haftalikMatn`, `toxtatishTugmasi` (Task 2); `MAQSAD_BALL`; `makePrisma` (`scripts/lib/check-cli.ts`); `Telegram` (`telegraf`).
- Produces:
  - `NAMUNA_ISM = 'Aziza'`; `interface SinovXabari { nomi: string; matn: string }`; `sinovXabarlari(): SinovXabari[]` (uch xabar: seriyali, seriyasiz, dushanba)
  - `interface SinovArgs { user: number | null; chat: string | null; send: boolean }`; `parseSinovArgs(argv: string[]): SinovArgs` (aynan bittasi: `--user=<id>` yoki `--chat=<id>`; `--send` ixtiyoriy)

- [ ] **Step 1: Yiqiladigan test** — `server/scripts/lib/daf-eslatma-sinov.spec.ts`:

```ts
jest.mock('telegraf', () => ({
  Telegram: jest.fn(() => {
    throw new Error('Telegram must not be constructed on import');
  }),
}));

import { Telegram } from 'telegraf';
import { NAMUNA_ISM, parseSinovArgs, sinovXabarlari } from './daf-eslatma-sinov';

describe('CEO sinov nusxasi', () => {
  it("uch xabar namunaviy ma'lumot bilan: seriyali, seriyasiz, dushanba (hamma qator)", () => {
    const x = sinovXabarlari();
    expect(x.map((m) => m.nomi)).toEqual([
      'Kechki eslatma — seriya bilan',
      'Kechki eslatma — seriyasiz',
      'Dushanba xulosasi',
    ]);
    for (const m of x) expect(m.matn).toContain(`Assalomu alaykum, ${NAMUNA_ISM}!`);
    expect(x[0].matn).toContain('5 kunlik seriyangiz');
    expect(x[1].matn).toContain("Nemis so'zlaringiz");
    for (const qator of ['• Liga:', '• Guruhingiz:', '• Yangi nishonlar:']) {
      expect(x[2].matn).toContain(qator);
    }
  });

  it('argumentlar: aynan bitta manzil, --send ixtiyoriy', () => {
    expect(parseSinovArgs(['--user=10000'])).toEqual({ user: 10000, chat: null, send: false });
    expect(parseSinovArgs(['--chat=123456', '--send'])).toEqual({ user: null, chat: '123456', send: true });
    for (const yomon of [
      [],
      ['--user=1', '--chat=2'],
      ['--user=abc'],
      ['--chat=-100123'],
      ['--boshqa'],
    ]) {
      expect(() => parseSinovArgs(yomon)).toThrow(/Ishlatish/);
    }
  });

  it('skript import qilinganda hech narsa yubormaydi (main() faqat to`g`ridan-to`g`ri yurganda)', () => {
    jest.isolateModules(() => {
      require('../daf-eslatma-sinov');
    });
    expect(Telegram).not.toHaveBeenCalled();
  });
});
```

Run: `cd server && npx jest scripts/lib/daf-eslatma-sinov.spec.ts` → FAIL (`Cannot find module './daf-eslatma-sinov'`).

- [ ] **Step 2: Sof qism** — `server/scripts/lib/daf-eslatma-sinov.ts`:

```ts
import { MAQSAD_BALL } from '../../src/daf/uebung/punkte';
import { haftalikMatn, kechkiMatn } from '../../src/daf/eslatma/eslatma-matn';

/**
 * CEO sinov nusxasining matnlari (spec S4 §5 «Sinov nusxasi») — haqiqiy
 * matn funksiyalari, namunaviy ma'lumot bilan: hech qanday o'quvchi
 * o'qilmaydi.
 */
export const NAMUNA_ISM = 'Aziza';

export interface SinovXabari {
  nomi: string;
  matn: string;
}

export function sinovXabarlari(): SinovXabari[] {
  return [
    {
      nomi: 'Kechki eslatma — seriya bilan',
      matn: kechkiMatn({ ism: NAMUNA_ISM, seriya: 5, maqsadBall: MAQSAD_BALL.ORTA }),
    },
    {
      nomi: 'Kechki eslatma — seriyasiz',
      matn: kechkiMatn({ ism: NAMUNA_ISM, seriya: 0, maqsadBall: MAQSAD_BALL.ORTA }),
    },
    {
      nomi: 'Dushanba xulosasi',
      matn: haftalikMatn({
        ism: NAMUNA_ISM,
        ball: 340,
        liga: { tier: 0, orin: 2, kotarildi: true },
        guruh: { orin: 3, jami: 12 },
        nishonlar: ['SERIE_7', 'WOERTER_150'],
      }),
    },
  ];
}

export interface SinovArgs {
  user: number | null;
  chat: string | null;
  send: boolean;
}

const USAGE =
  'Ishlatish: daf-eslatma-sinov.ts --user=<CEO user id> | --chat=<shaxsiy chat id> [--send]';

export function parseSinovArgs(argv: string[]): SinovArgs {
  let user: number | null = null;
  let chat: string | null = null;
  let send = false;
  for (const a of argv) {
    const m = /^--(user|chat)=([1-9]\d*)$/.exec(a);
    if (a === '--send') send = true;
    else if (m?.[1] === 'user') user = Number(m[2]);
    else if (m?.[1] === 'chat') chat = m[2];
    else throw new Error(USAGE);
  }
  if ((user === null) === (chat === null)) throw new Error(USAGE);
  return { user, chat, send };
}
```

- [ ] **Step 3: Skript** — `server/scripts/daf-eslatma-sinov.ts`:

```ts
/**
 * Sends the three S4 texts (evening with a streak, evening without, Monday
 * summary) with sample data to ONE staff chat, for the CEO to read before
 * `DAF_ESLATMALAR=on` (spec S4 §5 «Sinov nusxasi», ADR-0117). It never reads
 * a student and never writes the database. Without `--send` it only prints
 * the texts.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/daf-eslatma-sinov.ts --user=<CEO user id> --send
 *   … --chat=<private chat id> --send     (no database read at all)
 *
 * `--user` accepts only a live CEO account with a linked chat. The button
 * under each message is `dr:off:0`: the bot ties it to nobody, a press changes
 * nothing.
 */
import { Telegram } from 'telegraf';
import { makePrisma } from './lib/check-cli';
import { parseSinovArgs, sinovXabarlari } from './lib/daf-eslatma-sinov';
import { toxtatishTugmasi } from '../src/daf/eslatma/eslatma-matn';

async function ceoChati(userId: number): Promise<string> {
  const prisma = makePrisma();
  try {
    const u = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { telegramChatId: true },
    });
    if (!u?.telegramChatId) {
      throw new Error(`CEO ${userId} topilmadi yoki uning Telegram'i ulanmagan`);
    }
    return u.telegramChatId;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseSinovArgs(process.argv.slice(2));
  const xabarlar = sinovXabarlari();
  for (const x of xabarlar) {
    console.log(`── ${x.nomi} (${x.matn.length} belgi)\n${x.matn}\n`);
  }
  if (!args.send) {
    console.log('Quruq yurish: hech narsa yuborilmadi. Yuborish uchun --send.');
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN yo'q");
  const chatId = args.chat ?? (await ceoChati(args.user!));
  const telegram = new Telegram(token);
  for (const x of xabarlar) {
    await telegram.sendMessage(chatId, x.matn, {
      parse_mode: 'HTML',
      reply_markup: toxtatishTugmasi(0),
    });
  }
  console.log(`${xabarlar.length} ta xabar yuborildi.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
```

(`toxtatishTugmasi(0)` — `toxtatishKimniki` 0 ni rad etadi, handler bosishga jim javob beradi.)

- [ ] **Step 4: Testlar va quruq yurish**

```bash
cd server && npx jest scripts/lib/daf-eslatma-sinov.spec.ts
cd server && npx ts-node --transpile-only scripts/daf-eslatma-sinov.ts --chat=1
```

Expected: PASS (3 test); skript uch matnni chiqaradi va `Quruq yurish: hech narsa yuborilmadi. Yuborish uchun --send.` deydi — bazaga ham, Telegram'ga ham murojaat yo'q. **`--send` bu rejada yurgizilmaydi** — CEO'ga sinov nusxasini controller deploy'dan keyin qo'lda yuboradi (Task 13 Step 8).

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npx prettier --write scripts/daf-eslatma-sinov.ts scripts/lib/daf-eslatma-sinov.ts scripts/lib/daf-eslatma-sinov.spec.ts && git add scripts/daf-eslatma-sinov.ts scripts/lib/daf-eslatma-sinov.ts scripts/lib/daf-eslatma-sinov.spec.ts && git commit -m "feat(daf): CEO preview script for the three reminder texts, dry run by default

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ilova — tiplar, so'rov va sof yordamchi

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts` (`interface Fortschritt`; yangi `EslatmalarJavob`)
- Create: `client/src/components/student-portal/lernen/eslatma.ts`, `client/src/components/student-portal/lernen/eslatma.test.ts`
- Modify: `client/src/components/student-portal/lernen/queries.ts`, `client/src/components/student-portal/lernen/queries.test.ts`

**Interfaces:**
- Consumes: HTTP `PATCH /student-portal/lernen/eslatmalar` `{ yoqilgan }` → `{ eslatmalar }`; `GET fortschritt` ning `eslatmalar`, `telegramUlangan` (Task 7).
- Produces:
  - `Fortschritt.eslatmalar?: boolean`, `Fortschritt.telegramUlangan?: boolean` (eski serverda yo'q); `interface EslatmalarJavob { eslatmalar: boolean }`
  - `type EslatmaHolati = "yoqilgan" | "ochirilgan" | "ulanmagan"`; `eslatmaHolati(f: Pick<Fortschritt, "eslatmalar" | "telegramUlangan">): EslatmaHolati | null`; `ESLATMA_SARLAVHA`, `ESLATMA_IZOH`, `ULANMAGAN_IZOH`, `SAQLANMADI`
  - `eslatmalarMutation(qc: QueryClient): UseMutationOptions<EslatmalarJavob, unknown, boolean, { oldin?: Fortschritt }>`; `useEslatmalarOzgartir()`

- [ ] **Step 1: Tiplar** — `types.ts` dagi `interface Fortschritt` ichida:

```ts
  /** Kunlik maqsad (S2). Eski server javobida yo'q — karta chizilmaydi. */
  maqsad?: Maqsad;
}
```

ni:

```ts
  /** Kunlik maqsad (S2). Eski server javobida yo'q — karta chizilmaydi. */
  maqsad?: Maqsad;
  /** S4: Telegram eslatmalari yoqilganmi. Eski server javobida yo'q — qator chizilmaydi. */
  eslatmalar?: boolean;
  /** S4: karta botga ulangan va chat uzilmagan. */
  telegramUlangan?: boolean;
}

/** `PATCH .../eslatmalar` javobi. */
export interface EslatmalarJavob {
  eslatmalar: boolean;
}
```

ga almashtirish.

- [ ] **Step 2: Yiqiladigan test** — `client/src/components/student-portal/lernen/eslatma.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ESLATMA_IZOH,
  ESLATMA_SARLAVHA,
  SAQLANMADI,
  ULANMAGAN_IZOH,
  eslatmaHolati,
} from "./eslatma";

describe("eslatmaHolati", () => {
  it("ulangan: yoqilgan yoki o'chirilgan", () => {
    expect(eslatmaHolati({ eslatmalar: true, telegramUlangan: true })).toBe("yoqilgan");
    expect(eslatmaHolati({ eslatmalar: false, telegramUlangan: true })).toBe("ochirilgan");
  });

  it("botga ulanmagan — sozlamadan qat'i nazar «ulanmagan»", () => {
    expect(eslatmaHolati({ eslatmalar: true, telegramUlangan: false })).toBe("ulanmagan");
    expect(eslatmaHolati({ eslatmalar: false, telegramUlangan: false })).toBe("ulanmagan");
  });

  it("eski server (maydon yo'q) — null, qator chizilmaydi", () => {
    expect(eslatmaHolati({})).toBeNull();
    expect(eslatmaHolati({ eslatmalar: true })).toBeNull();
  });

  it("matnlar — lotin o'zbekcha, inglizcha so'z yo'q", () => {
    expect([ESLATMA_SARLAVHA, ESLATMA_IZOH, ULANMAGAN_IZOH]).toEqual([
      "Telegram eslatmalari",
      "Kechki eslatma va dushanba xulosasi",
      "Botga ulang",
    ]);
    expect([ESLATMA_SARLAVHA, ESLATMA_IZOH, ULANMAGAN_IZOH, SAQLANMADI].join(" ")).not.toMatch(
      /\b(reminder|notification|on|off|bot)\b/i,
    );
  });
});
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/eslatma.test.ts` → FAIL (`Failed to resolve import "./eslatma"`).

- [ ] **Step 3: Yordamchi** — `client/src/components/student-portal/lernen/eslatma.ts`:

```ts
import type { Fortschritt } from "./types";

/**
 * «Darajam» dagi «Telegram eslatmalari» qatorining holati (spec S4 §7).
 * Botga ulanmagan o'quvchida almashtirgich faol emas — sozlama nima bo'lishidan
 * qat'i nazar. Eski server maydonlarni yubormaydi: qator chizilmaydi.
 */
export type EslatmaHolati = "yoqilgan" | "ochirilgan" | "ulanmagan";

export function eslatmaHolati(
  f: Pick<Fortschritt, "eslatmalar" | "telegramUlangan">,
): EslatmaHolati | null {
  if (f.eslatmalar === undefined || f.telegramUlangan === undefined) return null;
  if (!f.telegramUlangan) return "ulanmagan";
  return f.eslatmalar ? "yoqilgan" : "ochirilgan";
}

export const ESLATMA_SARLAVHA = "Telegram eslatmalari";
export const ESLATMA_IZOH = "Kechki eslatma va dushanba xulosasi";
export const ULANMAGAN_IZOH = "Botga ulang";
export const SAQLANMADI = "Saqlab bo'lmadi. Qayta urinib ko'ring";
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/eslatma.test.ts` → PASS (4 test).

- [ ] **Step 4: Yiqiladigan so'rov testi** — `queries.test.ts`:
  - tepadagi `vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));` ni `vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));` ga;
  - `import { QueryClient, QueryObserver } from "@tanstack/react-query";` ni `import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";` ga;
  - importlarga `import api from "@/lib/api";`, `queries` importiga `eslatmalarMutation,`, `types` importiga `Fortschritt`;
  - fayl oxiriga:

```ts

describe("eslatmalarMutation — almashtirgich darrov saqlanadi (spec S4 §7)", () => {
  const KEY = ["lernen", "fortschritt"];
  const boshlangich = { eslatmalar: true, telegramUlangan: true } as Fortschritt;

  it("so'rovdan oldin ko'rinadi, server javobi bilan qoladi", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, boshlangich);
    let sorovPaytida: boolean | undefined;
    // `as never`: the axios generic signature is not worth restating in a test.
    vi.mocked(api.patch).mockImplementationOnce((async () => {
      sorovPaytida = qc.getQueryData<Fortschritt>(KEY)?.eslatmalar;
      return { data: { eslatmalar: false } };
    }) as never);
    await new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false);
    expect(api.patch).toHaveBeenCalledWith("/student-portal/lernen/eslatmalar", { yoqilgan: false });
    expect(sorovPaytida).toBe(false);
    expect(qc.getQueryData<Fortschritt>(KEY)?.eslatmalar).toBe(false);
  });

  it("xato — eski holatga qaytadi", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, boshlangich);
    vi.mocked(api.patch).mockRejectedValueOnce(new Error("network"));
    await new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false).catch(() => undefined);
    expect(qc.getQueryData<Fortschritt>(KEY)?.eslatmalar).toBe(true);
  });
});
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/queries.test.ts` → FAIL (`eslatmalarMutation` eksport qilinmagan).

- [ ] **Step 5: So'rov** — `queries.ts`:
  - `@tanstack/react-query` importiga `type UseMutationOptions,` qo'shish;
  - `./types` importiga `EslatmalarJavob,` qo'shish (alifbo bo'yicha `DrillResult,` dan keyin);
  - `useMaqsadOzgartir` funksiyasidan keyin:

```ts

/**
 * Telegram eslatmalari almashtirgichi (spec S4 §7): darrov ko'rinadi
 * (`onMutate`), xato bo'lsa eski holatga qaytadi, muvaffaqiyatda server
 * javobi yoziladi. Alohida funksiya — test uni `MutationObserver` bilan
 * hooksiz yurgizadi.
 */
export function eslatmalarMutation(
  qc: QueryClient,
): UseMutationOptions<EslatmalarJavob, unknown, boolean, { oldin?: Fortschritt }> {
  const KEY = ["lernen", "fortschritt"];
  const yoz = (eslatmalar: boolean) =>
    qc.setQueryData<Fortschritt>(KEY, (old) => (old ? { ...old, eslatmalar } : old));
  return {
    mutationFn: (yoqilgan) =>
      api.patch<EslatmalarJavob>(`${BASE}/eslatmalar`, { yoqilgan }).then((r) => r.data),
    onMutate: async (yoqilgan) => {
      await qc.cancelQueries({ queryKey: KEY });
      const oldin = qc.getQueryData<Fortschritt>(KEY);
      yoz(yoqilgan);
      return { oldin };
    },
    onError: (_err, _yoqilgan, ctx) => {
      if (ctx?.oldin) qc.setQueryData(KEY, ctx.oldin);
    },
    onSuccess: (javob) => yoz(javob.eslatmalar),
  };
}

export function useEslatmalarOzgartir() {
  const qc = useQueryClient();
  return useMutation(eslatmalarMutation(qc));
}
```

- [ ] **Step 6: Testlar va tiplar**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/client && npx vitest run src/components/student-portal/lernen && npx tsc --noEmit -p . && npx eslint src/components/student-portal/lernen
```

Expected: PASS (yangi 4 + 2 test), 0 tip xatosi, lint toza.

- [ ] **Step 7: Commit** (client fayllariga prettier YO'Q)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4 && git add client/src/components/student-portal/lernen/types.ts client/src/components/student-portal/lernen/eslatma.ts client/src/components/student-portal/lernen/eslatma.test.ts client/src/components/student-portal/lernen/queries.ts client/src/components/student-portal/lernen/queries.test.ts && git commit -m "feat(lernen): reminders switch state and an optimistic save with rollback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ilova — «Darajam» dagi «Telegram eslatmalari» qatori

**Files:**
- Create: `client/src/components/student-portal/lernen/reyting/eslatmalar-qatori.tsx`, `client/src/components/student-portal/lernen/reyting/eslatmalar-qatori.test.ts`
- Modify: `client/src/components/student-portal/lernen/reyting/reyting-ekrani.tsx` (import va `DarajamTab`)

**Interfaces:**
- Consumes: `useFortschritt`, `useEslatmalarOzgartir` (Task 10); `eslatmaHolati`, `ESLATMA_SARLAVHA`, `ESLATMA_IZOH`, `ULANMAGAN_IZOH`, `SAQLANMADI` (Task 10); `Card` (`../../lumio`); `getErrorMessage` (`@/lib/get-error-message`); `toast` (`react-hot-toast`).
- Produces: `EslatmalarQatori()` — eski serverda hech narsa chizmaydi; aks holda `role="switch"` tugmasi bilan karta.

- [ ] **Step 1: Yiqiladigan test** — `eslatmalar-qatori.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { EslatmalarQatori } from "./eslatmalar-qatori";
import type { Fortschritt } from "../types";

function render(f: Partial<Fortschritt>): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "fortschritt"], f as Fortschritt);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(EslatmalarQatori)),
  );
}

const matni = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("EslatmalarQatori", () => {
  it("yoqilgan: almashtirgich yoqiq va faol, izoh bilan", () => {
    const html = render({ eslatmalar: true, telegramUlangan: true });
    expect(html).toContain("Telegram eslatmalari");
    expect(html).toContain("Kechki eslatma va dushanba xulosasi");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('disabled=""');
  });

  it("o'chirilgan: almashtirgich o'chiq, faol", () => {
    const html = render({ eslatmalar: false, telegramUlangan: true });
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('disabled=""');
  });

  it("botga ulanmagan: «Botga ulang», almashtirgich faol emas", () => {
    const html = render({ eslatmalar: true, telegramUlangan: false });
    expect(html).toContain("Botga ulang");
    expect(html).not.toContain("Kechki eslatma va dushanba xulosasi");
    expect(html).toContain('disabled=""');
  });

  it("eski server (maydonlar yo'q) — hech narsa chizilmaydi", () => {
    expect(render({ gesamt: 10 })).toBe("");
  });

  it("ekranda inglizcha so'z yo'q", () => {
    expect(matni(render({ eslatmalar: true, telegramUlangan: true }))).not.toMatch(
      /\b(reminder|notification|on|off|switch)\b/i,
    );
  });
});
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/reyting/eslatmalar-qatori.test.ts` → FAIL (`Failed to resolve import "./eslatmalar-qatori"`).

- [ ] **Step 2: Komponent** — `client/src/components/student-portal/lernen/reyting/eslatmalar-qatori.tsx`:

```tsx
"use client";

import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { Card } from "../../lumio";
import { useEslatmalarOzgartir, useFortschritt } from "../queries";
import {
  ESLATMA_IZOH,
  ESLATMA_SARLAVHA,
  SAQLANMADI,
  ULANMAGAN_IZOH,
  eslatmaHolati,
} from "../eslatma";

/**
 * «Darajam» tabida «Nishonlarim» ostida (spec S4 §7): «Telegram eslatmalari»,
 * almashtirgich va bir qatorli izoh. Bosish darrov saqlanadi (xato bo'lsa
 * xabar va eski holat — `eslatmalarMutation`). Botga ulanmagan o'quvchida
 * «Botga ulang» izohi, almashtirgich faol emas. Ma'lumot `fortschritt`
 * so'rovidan — alohida so'rov yo'q.
 */
export function EslatmalarQatori() {
  const { data } = useFortschritt();
  const ozgartir = useEslatmalarOzgartir();
  const holat = data ? eslatmaHolati(data) : null;
  if (!holat) return null;

  const yoqiq = data?.eslatmalar === true;
  const faol = holat !== "ulanmagan";

  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p id="eslatmalar-sarlavha" className="font-display text-sm font-extrabold text-ink-900">
          {ESLATMA_SARLAVHA}
        </p>
        <p className="text-xs font-semibold text-ink-500">{faol ? ESLATMA_IZOH : ULANMAGAN_IZOH}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={yoqiq}
        aria-labelledby="eslatmalar-sarlavha"
        disabled={!faol || ozgartir.isPending}
        onClick={() =>
          ozgartir.mutate(!yoqiq, {
            onError: (err) => toast.error(getErrorMessage(err, SAQLANMADI)),
          })
        }
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
          yoqiq ? "bg-teal-500" : "bg-line",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1 left-0 h-5 w-5 rounded-full bg-white shadow transition-transform",
            yoqiq ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </Card>
  );
}
```

- [ ] **Step 3: «Darajam» ga ulash** — `reyting-ekrani.tsx` da `import { Nishonlarim } from "./nishonlarim";` dan keyin:

```tsx
import { EslatmalarQatori } from "./eslatmalar-qatori";
```

`DarajamTab` dagi:

```tsx
      <Nishonlarim />
    </div>
```

ni:

```tsx
      <Nishonlarim />
      <EslatmalarQatori />
    </div>
```

ga, va `DarajamTab` izohidagi `* Ostida «Nishonlarim» (S2) — o'z so'rovi bilan, faqat shu tab ochilganda.` ni `* Ostida «Nishonlarim» (S2) — o'z so'rovi bilan, faqat shu tab ochilganda — va «Telegram eslatmalari» qatori (S4, `fortschritt` dan).` ga almashtirish.

- [ ] **Step 4: Testlar, tiplar, lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/client && npx vitest run src/components/student-portal && npx tsc --noEmit -p . && npx eslint src/components/student-portal/lernen
```

Expected: PASS (yangi 5 test), 0 tip xatosi, lint toza.

- [ ] **Step 5: Commit** (client fayllariga prettier YO'Q)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4 && git add client/src/components/student-portal/lernen/reyting/eslatmalar-qatori.tsx client/src/components/student-portal/lernen/reyting/eslatmalar-qatori.test.ts client/src/components/student-portal/lernen/reyting/reyting-ekrani.tsx && git commit -m "feat(lernen): Telegram reminders switch under the badges on the level tab

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Yuklama sinovi — auditoriya vaqti, to'liq yurish soxta botda, `fortschritt` p95

**Files:**
- Create: `server/scripts/load/daf-yuklama-s4-olchov.ts`
- Modify: `docs/superpowers/specs/2026-10-19-musobaqa-s4-telegram-design.md` (yangi §12)

**Interfaces:**
- Consumes: `kechkiAuditoriya`, `haftalikAuditoriya` (Task 4); `EslatmaYuborish` (Task 5); `SmsService` (Task 5 o'zgarishi bilan); `EntityHistoryService` (`src/common/entity-history`); `s4KechkiKun`, `s4HaftalikKun` (Task 4); `PAUZA_MS` (Task 2); S1–S3 o'lchov skripti `scripts/load/daf-yuklama-olchov.ts` (o'zgarmaydi).
- Produces: hech narsa (o'lchov).

**Nima o'lchanadi.** (1) Ikkala auditoriya so'rovi 20 marta — p50/p95, chegara p95 < 2 000 ms (5 000 o'quvchi). (2) To'liq kechki va dushanba yurishi haqiqiy `SmsService` (har xabarga `SmsMessage` + tarix qatori) bilan, soxta botda, pauzasiz: auditoriyadagi har o'quvchiga aynan bitta xabar, bitta `SENT` qator, xabar < 4 096 va tugmali; ikkinchi yurish hech kimga yubormaydi. (3) `fortschritt` p95 (S4 ustunlari bilan) — mavjud o'lchov skripti. Moslik — Task 4 Step 7 da (o'zgarmagan ma'lumotda qayta yurgizish shart emas).

- [ ] **Step 1: O'lchov skripti** — `server/scripts/load/daf-yuklama-s4-olchov.ts`:

```ts
/**
 * LOCAL ONLY. S4 volume (spec S4 §8 «Yuklama»): the two audience queries
 * timed (20 runs each, p50 / p95), then one full evening run and one full
 * Monday run through the REAL `SmsService` (an `SmsMessage` and a history row
 * per message) on a fake bot with no pacing: every audience student gets
 * exactly one message (HTML, under 4 096 characters, with the stop button)
 * and one SENT log row; a second run sends nothing. Exit 1 on any failure or
 * when an audience p95 is 2 000 ms or more. Needs `daf-yuklama-s4-seed.ts`
 * from the same Tashkent day; run once per seed (the run claims the rows).
 */
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { s4HaftalikKun, s4KechkiKun } from './daf-yuklama-kohort';
import { utcMidnightFromDateStr } from '../../src/common/date/tashkent';
import { EntityHistoryService } from '../../src/common/entity-history';
import { SmsService } from '../../src/sms/sms.service';
import {
  haftalikAuditoriya,
  kechkiAuditoriya,
} from '../../src/daf/eslatma/eslatma-auditoriya';
import { EslatmaYuborish } from '../../src/daf/eslatma/eslatma-yuborish';
import { PAUZA_MS } from '../../src/daf/eslatma/eslatma-qoidalari';

assertLocalDb();

const OLCHOV = 20;
const AUDITORIYA_CHEGARA_MS = 2_000;

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

interface Markup {
  inline_keyboard: { callback_data?: string }[][];
}

run(async (prisma) => {
  const db = prisma as any;
  const K = s4KechkiKun();
  const H = s4HaftalikKun();
  const xatolar: string[] = [];
  const { companyId } = await prisma.student.findFirstOrThrow({
    where: { telegramChatId: { not: null } },
    orderBy: { id: 'asc' },
    select: { companyId: true },
  });
  const allaqachon = await prisma.dafReminderLog.count({
    where: {
      companyId,
      status: 'SENT',
      OR: [
        { kind: 'EVENING', sentOn: utcMidnightFromDateStr(K) },
        { kind: 'WEEKLY', sentOn: utcMidnightFromDateStr(H) },
      ],
    },
  });
  if (allaqachon > 0) {
    throw new Error(
      'Bu kunlar uchun allaqachon yuborilgan — bazani qayta yarating va S4 seedini yurgizing.',
    );
  }

  const vaqt = async (fn: () => Promise<unknown>) => {
    const xs: number[] = [];
    for (let i = 0; i < OLCHOV; i += 1) {
      const t = performance.now();
      await fn();
      xs.push(performance.now() - t);
    }
    return { p50: Math.round(pct(xs, 50)), p95: Math.round(pct(xs, 95)) };
  };
  const kechkiVaqt = await vaqt(() => kechkiAuditoriya(db, companyId, K));
  const haftalikVaqt = await vaqt(() => haftalikAuditoriya(db, companyId, H));
  for (const [nomi, v] of [
    ['kechki', kechkiVaqt],
    ['haftalik', haftalikVaqt],
  ] as const) {
    if (v.p95 >= AUDITORIYA_CHEGARA_MS) xatolar.push(`${nomi} auditoriya p95 ${v.p95} ms`);
  }

  let yuborilgan = 0;
  const bot = {
    telegram: {
      sendMessage: async (
        _chat: string,
        matn: string,
        o: { parse_mode?: string; reply_markup?: Markup },
      ) => {
        yuborilgan += 1;
        const tugma = o.reply_markup?.inline_keyboard[0]?.[0]?.callback_data ?? '';
        if (matn.length >= 4096 || o.parse_mode !== 'HTML' || !tugma.startsWith('dr:off:')) {
          throw new Error(`noto'g'ri xabar: ${matn.slice(0, 60)}`);
        }
        return { message_id: yuborilgan };
      },
    },
  };
  const sms = new SmsService(
    db,
    { getBot: () => bot } as any,
    new EntityHistoryService(db, { emit: () => true } as any),
  );
  const yuborish = new EslatmaYuborish(db, sms);

  const yurish = async (tur: 'kechki' | 'haftalik') => {
    const kun = tur === 'kechki' ? K : H;
    const kind = tur === 'kechki' ? 'EVENING' : 'WEEKLY';
    const auditoriya = (
      tur === 'kechki'
        ? await kechkiAuditoriya(db, companyId, K)
        : await haftalikAuditoriya(db, companyId, H)
    ).length;
    const oldin = yuborilgan;
    const t = performance.now();
    const n =
      tur === 'kechki'
        ? await yuborish.kechki(companyId, K, 'on', 0)
        : await yuborish.haftalik(companyId, H, 'on', 0);
    const ms = Math.round(performance.now() - t);
    const sent = await prisma.dafReminderLog.count({
      where: { companyId, kind, sentOn: utcMidnightFromDateStr(kun), status: 'SENT' },
    });
    if (auditoriya === 0) xatolar.push(`${tur}: auditoriya bo'sh — sinov hech narsani isbotlamaydi`);
    if (n.yuborildi !== auditoriya || n.xato !== 0 || yuborilgan - oldin !== auditoriya) {
      xatolar.push(`${tur}: ${JSON.stringify(n)}, botga ${yuborilgan - oldin} ≠ ${auditoriya}`);
    }
    if (sent !== auditoriya) xatolar.push(`${tur}: SENT qatorlar ${sent} ≠ ${auditoriya}`);
    const ikkinchi =
      tur === 'kechki'
        ? await yuborish.kechki(companyId, K, 'on', 0)
        : await yuborish.haftalik(companyId, H, 'on', 0);
    if (ikkinchi.auditoriya !== 0 || ikkinchi.yuborildi !== 0) {
      xatolar.push(`${tur}: ikkinchi yurish ${JSON.stringify(ikkinchi)}`);
    }
    return {
      tur,
      auditoriya,
      ms,
      prodTaxminiyS: Math.round((ms + auditoriya * PAUZA_MS) / 1000),
    };
  };
  const yurishlar = [await yurish('kechki'), await yurish('haftalik')];

  console.table([
    { amal: 'kechki auditoriya', ...kechkiVaqt },
    { amal: 'haftalik auditoriya', ...haftalikVaqt },
  ]);
  console.table(yurishlar);
  console.log({ K, H, xatolar: xatolar.length });
  for (const x of xatolar.slice(0, 20)) console.log(x);
  if (xatolar.length > 0) process.exitCode = 1;
});
```

- [ ] **Step 2: Sinov bazasi holati** — Task 4 seedidan keyin jurnal faqat seed qatorlarini saqlaydi (Task 7 probasi jurnalga yozmaydi). Agar baza o'chib ketgan bo'lsa — Task 1 Step 6–7, so'ng Task 4 Step 6 ni qaytarish. Ish dushanbani kesib o'tgan bo'lsa — avval `daf-yuklama-s3-hisob.ts` (Task 1 Step 7 ning oxirgi buyrug'i), keyin jurnalni tozalab (`docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c 'DELETE FROM "DafReminderLog";'`) Task 4 Step 6 seedini qayta yurgizish (seed va o'lchov bir Toshkent kunida).

- [ ] **Step 3: S4 o'lchov**

```bash
uptime && cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s4-olchov.ts
```

Expected: `xatolar: 0`; ikkala auditoriya p95 < 2 000 ms (raqamlarni yozib olish); `yurishlar` jadvalida `auditoriya` ≈ 3 500 (kechki) va ≈ 4 300 (haftalik), `ms` va `prodTaxminiyS` (60 ms pauza bilan prodda shuncha soniya). Uzoq yurishi mumkin — `run_in_background: true`. Auditoriya sekin bo'lsa birinchi gumon — seriya kichik so'rovi (`EXPLAIN ANALYZE` ni o'sha SQL bilan, `$S1_DB` da `psql` orqali yurgizib ko'rish; `DafStudentDay_studentId_day_groupKey_key` ishlatilishi kerak).

- [ ] **Step 4: `fortschritt` p95 qayta o'lchovi** (S4 ustunlari `oquvchi-raqamlari` da):

```bash
uptime && cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-olchov.ts
```

Expected: har qatorda `ok: true` (jumladan `fortschritt` va uning DUE/OCHIQ/TUGAGAN kohort qatorlari < 200 ms); `same-row concurrency … OK`; `badge concurrency … OK`; `league join concurrency … OK`. Biror `ok: false` bo'lsa — Step 5 ga o'tilmaydi; birinchi gumon — `ulanish` CTE (`Student` PK bo'yicha bitta qator; rejada `Index Scan using "Student_pkey"`).

- [ ] **Step 5: Natijalarni spec'ga yozish** — `2026-10-19-musobaqa-s4-telegram-design.md` oxiriga (§11 jadvalidan keyin; spec §8 «Yuklama» natija joyini aytmaydi, §11 — «Xavflar», shuning uchun yangi bo'lim):

```markdown

---

## 12. Yuklama natijalari

O'lchangan <sana>, lokal sinov bazasi `daf_s1_yuklama` (S1–S3 yuklama
ma'lumoti + S4 seed: 5 500 o'quvchida soxta chat, har 25-chisi uzilgan, har
20-chisida eslatmalar o'chirilgan, jurnal tarixi), kod `<qisqa sha>`, load
average <qiymat>.

| Amal | p50 | p95 | Chegara (p95) | Holat |
| --- | --- | --- | --- | --- |
| Kechki auditoriya (<n> o'quvchi) | … | … | 2 000 | … |
| Dushanba auditoriyasi (<n> o'quvchi) | … | … | 2 000 | … |
| `fortschritt` (S4 ustunlari bilan), tasodifiy aralash | … | … | 200 | … |
| `fortschritt` · DUE / OCHIQ / TUGAGAN | … | … | 200 | … |

**To'liq yurish (haqiqiy `SmsService`, soxta bot, pauzasiz):** kechki <n>
xabar — <ms> ms, dushanba <n> xabar — <ms> ms; har o'quvchiga bitta xabar va
bitta `SENT` qator, ikkinchi yurish 0 xabar. Prodda 60 ms pauza bilan
taxminan <s> s va <s> s.
**Moslik:** kechki va dushanba auditoriyasi brute force bilan — farq 0
(Task 4); tayyorlik — mos.
```

Burchak qavsdagi va `…` joylarni o'lchov chiqargan raqamlar bilan to'ldirish (shablon matn qolmasin).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4 && npx --prefix server prettier --write server/scripts/load/daf-yuklama-s4-olchov.ts && (cd server && npx jest src/daf/eslatma/eslatma-jurnali.single-source.spec.ts) && git add server/scripts/load/daf-yuklama-s4-olchov.ts docs/superpowers/specs/2026-10-19-musobaqa-s4-telegram-design.md && git commit -m "test(daf): S4 load test, audience timing and a full run on a fake bot

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ADR-0117, CLAUDE.md, yangilik, to'liq tekshiruv

**Files:**
- Create: `docs/adr/0117-daf-telegram-eslatma-darhol-royxat.md`
- Modify: `docs/adr/README.md`
- Modify: `server/CLAUDE.md` (`### DaF progress (…)` sarlavhasi va bo'limi; «Instant by design» bandi; Environment Variables jadvali)
- Modify: `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR raqamini tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4 && git fetch origin && ls docs/adr | sort | tail -3 && git ls-tree origin/main docs/adr/ --name-only | sort | tail -3
```

Expected: shu shoxda eng kattasi `0116`, `main` da `0117` yo'q (19.10 da `main` ning eng kattasi `0113`). Band bo'lsa — keyingi bo'sh raqam olinadi va hamma `ADR-0117` (`git grep -n "ADR-0117"`: `schema.prisma` izohlari, `eslatma-*.ts`, `eslatma.cron.ts`, `eslatma.module.ts`, `sms.service.ts`, `branch-route-policy.ts`, `daf-schema.spec.ts`, `eslatma-jurnali.single-source.spec.ts`, `daf-eslatma-sinov.ts`, shu vazifa fayllari) almashtiriladi; fayl `git mv` bilan.

- [ ] **Step 2: ADR** — `docs/adr/0117-daf-telegram-eslatma-darhol-royxat.md`:

```markdown
# ADR-0117 — DaF Telegram eslatmasi va dushanba xulosasi: «darhol» ro'yxatida, uzilgan chat o'tkaziladi, oldindan egallanadigan jurnal, o'chirgich

**Holati:** Qabul qilindi
**Sana:** 2026-10-19
**Bog'liq:** `docs/superpowers/specs/2026-10-19-musobaqa-s4-telegram-design.md`, ADR-0025, ADR-0066, ADR-0114, ADR-0115, ADR-0116, `server/src/daf/eslatma/`

## Kontekst

Prodda mashq qilgan 102 o'quvchidan 64 tasi faqat bir kun mashq qilgan: asosiy muammo — qaytib kelmaslik. CEO (2026-10-19): faol o'quvchiga kechki eslatma kuniga ko'pi bilan bitta (19:30), haftada 4 tagacha; dushanba 09:00 hafta xulosasi; o'quvchi ikki joydan o'chira oladi; matnlar avval CEO Telegram'ida ko'riladi. ADR-0025 bo'yicha Telegram xabari 20:00 xulosasini kutadi, agar u «darhol» ro'yxatida bo'lmasa; ADR-0066 oddiy xabarni uzilgan chatga ham yuborishni talab qiladi.

## Qaror

1. **«Darhol» ro'yxatiga qo'shildi** (ADR-0025): kechki eslatma (19:30, dushanba–shanba, yakshanba va umumiy bayram kunida yo'q) va dushanba xulosasi (09:00, tayyor bo'lmasa 10:00–18:00 har soat; bayramda ham) o'z cronlari bilan ketadi, 20:00 xulosasiga tushmaydi. Yuborish faqat `SmsService.sendToStudent(…, 'AUTO', …)` orqali (audit `SmsMessage` va «SMS» tabi); `sendToStudent` ga ixtiyoriy `replyMarkup` qo'shildi; `direct-send.guard.spec.ts` o'zgarmadi — yangi to'g'ridan-to'g'ri yuboruvchi yo'q.
2. **Uzilgan chat o'tkaziladi** — ADR-0066 dan istisno: u qoida muhim xabarlar (chek, qarz) uchun; eslatma muhim emas, uzilgan chatga yuborish ketma-ket 403 va botning obro'sini tushirishdan boshqa narsa bermaydi. Auditoriya `telegramDisconnectedAt IS NULL` bilan so'raladi.
3. **Kimga** — spec §1.1 va §2 shartlari, sof funksiyalarda (`eslatma-qoidalari.ts`) va BITTA SQL'da (`eslatma-auditoriya.ts`); yuklama skripti ikkalasini brute force bilan solishtiradi. `FAILED` hech qaysi shartga sanalmaydi.
4. **Jurnal yuborishdan OLDIN egallanadi:** `DafReminderLog` (`@@unique([studentId, kind, sentOn])`, `sentOn` — Toshkent kuni), `INSERT … ON CONFLICT DO NOTHING RETURNING id`; qatorni yaratgan chaqiruv yuboradi, ikkinchi nusxa hech narsa qilmaydi; qator `FAILED` bilan boshlanadi va natija `SENT`/`FAILED` ga yangilanadi; `FAILED` qayta urinilmaydi. Yagona yozuvchi `eslatma-jurnali.ts` (qorovul spec `src/` va `scripts/` ni tekshiradi). 90 kundan eski qatorlar kechki cron oxirida o'chiriladi.
5. **O'chirish:** `DafStudentSetting.remindersEnabled` (standart `true`), bitta o'chirish ikkala xabarni to'xtatadi. Yagona yozuvchi `eslatmalarniSaqla` — ilovadagi `PATCH /student-portal/lernen/eslatmalar` va xabar tagidagi `dr:off:<studentId>` tugmasi; tugma faqat o'z chatidan ishlaydi (ota-ona chatida bir bola o'chirsa boshqalari qoladi).
6. **O'chirgich `DAF_ESLATMALAR`** = `off` (standart) | `log` | `on`, har yurishda o'qiladi. Tezlik: ketma-ket, ≈ 60 ms oraliq; bitta o'quvchining xatosi qolganlarini to'xtatmaydi.

## Ko'rib chiqilgan muqobillar

- **20:00 xulosasiga qo'shish** — eslatma o'quvchi hali mashq qila oladigan vaqtda kelishi kerak; xulosa boshqa xabarlar bilan aralashadi. Rad.
- **Uzilgan chatga ham yuborish (ADR-0066 kabi)** — har kecha yuzlab 403; ma'nosi yo'q. Rad.
- **Yuborgandan keyin jurnalga yozish** — cronning ikki nusxasi ikki marta yuboradi. Rad.
- **O'quvchi vaqtni o'zi tanlashi, ota-onaga alohida xabar, ilova push'i** — S4 dan tashqarida (spec §10).

## Oqibatlar

- **Deploy tartibi:** migratsiya `20261019100000_daf_reminders` → kod (`DAF_ESLATMALAR` qo'yilmagan = `off`) → Railway'da `DAF_ESLATMALAR=log` bir kun (logda «Eslatma (log): kompaniya …, kechki auditoriya N» — son real ko'rinishini tekshirish) → CEO sinov nusxasini (`scripts/daf-eslatma-sinov.ts --user=<CEO id> --send`) tasdiqlaydi → `on`.
- Har eslatma `SmsMessage` va tarix qatori yozadi: o'quvchi kartasining «SMS» tabida ko'rinadi (kuniga ~ faol o'quvchilar soni qator).
- `log` rejimida tayyor dushanba haftasi 09:00–18:00 har soat bitta log qatori beradi.
- Telegram 429 yoki boshqa xato shu o'quvchi uchun `FAILED` bo'ladi va o'sha kuni qayta urinilmaydi.
- Yuklama natijalari: spec §12.
```

- [ ] **Step 3: README indeksi** — `docs/adr/README.md` dagi `| [0116](…` qatoridan keyin:

```markdown
| [0117](0117-daf-telegram-eslatma-darhol-royxat.md) | DaF Telegram eslatmasi (19:30, du–sha) va dushanba xulosasi (09:00, tayyorlik + 10–18 qayta urinish) ADR-0025 ning «darhol» ro'yxatida, `SmsService` orqali; uzilgan chat o'tkaziladi (ADR-0066 istisnosi); `DafReminderLog` yuborishdan oldin egallanadi (`ON CONFLICT DO NOTHING RETURNING`), `FAILED` qayta urinilmaydi; `remindersEnabled` — yagona yozuvchi; `DAF_ESLATMALAR` off/log/on | Qabul qilindi | 2026-10-19 |
```

- [ ] **Step 4: `server/CLAUDE.md`** — sarlavha `### DaF progress (`src/daf/`, ADR-0114, ADR-0115, ADR-0116)` ni `### DaF progress (`src/daf/`, ADR-0114, ADR-0115, ADR-0116, ADR-0117)` ga; `new league logic goes into \`daf/liga/\`, not into it.` bilan tugaydigan bandidan keyin:

```markdown
- **Reminders are instant, go through `SmsService` and skip a disconnected chat (ADR-0117).** `daf/eslatma/`: the 19:30 evening reminder (Mon–Sat, not on a company-wide holiday) and the Monday summary (09:00, retried hourly until 18:00 while last week has an unsettled room) are on ADR-0025's instant list and are sent only by `EslatmaYuborish` through `SmsService.sendToStudent(…, 'AUTO', …, { replyMarkup })` — never a new `.sendMessage(`. Who gets one is the pure rules of `eslatma-qoidalari.ts`, mirrored by one SQL each in `eslatma-auditoriya.ts` (`scripts/load/daf-yuklama-s4-paritet.ts` compares them); `telegramDisconnectedAt IS NULL` is required — a reminder is not important enough for ADR-0066's «send anyway». `DAF_ESLATMALAR` (`off` default | `log` | `on`) is read on every run.
- **`DafReminderLog` is claimed before the send (ADR-0117).** `eslatmaniEgalla` is `INSERT … ON CONFLICT DO NOTHING RETURNING id` on `(studentId, kind, sentOn)`: only the call that made the row sends, a second cron instance gets `null`. The row starts `FAILED` and becomes `SENT`/`FAILED`; a `FAILED` row is never retried and never counts toward the yesterday / 4-in-7-days / summary-today rules. Only `eslatma-jurnali.ts` writes the table and only `eslatma-sozlama.ts` (`eslatmalarniSaqla`) writes `remindersEnabled` — `eslatma-jurnali.single-source.spec.ts` fails on any other write, and on any unlisted file naming the column. The bot's `dr:off:<studentId>` button works only from that student's own `telegramChatId`.
```

«Instant by design» bandidagi `the lesson rating request after class (\`src/lesson-ratings/\`, ADR-0089 — 07:00–22:50 cron, no night messages).` ni `the lesson rating request after class (\`src/lesson-ratings/\`, ADR-0089 — 07:00–22:50 cron, no night messages), the DaF evening reminder and Monday summary (\`src/daf/eslatma/\`, ADR-0117 — through \`SmsService\`, gated by \`DAF_ESLATMALAR\`, a disconnected chat skipped).` ga almashtirish.

Environment Variables jadvalining oxirgi qatori (`| \`R2_TASKS_BUCKET_NAME\` …| _files off_ |`) dan keyin:

```markdown
| `DAF_ESLATMALAR`                           | DaF reminders switch (ADR-0117): `off` — the 19:30 and Monday crons do nothing; `log` — they count the audience and log it, writing and sending nothing; `on` — they send. Anything else reads as `off`. Read on every run.                                                                                                                                                                                                                                                                                                                                                              | _off_                        |
```

- [ ] **Step 5: Yangilik** — `client/src/qollanma/yangiliklar.ts` dagi `export const yangiliklar: Yangilik[] = [` qatoridan keyin (ro'yxat boshiga):

```ts
  {
    sana: "2026-10-19",
    sarlavha: "O'quvchilarga Telegram eslatmasi va dushanba xulosasi",
    matn: "CEO yoqqan kundan boshlab Ta'lim ilovasida mashq qiladigan o'quvchilar botdan ikki xil yumshoq xabar oladi. Kechki eslatma (19:30, dushanba–shanba) — oxirgi 14 kunda mashq qilgan, lekin bugun hali mashq qilmagan o'quvchiga: ketma-ket ikki kun va haftada 4 tadan ko'p yuborilmaydi, yakshanba va bayram kunida yo'q. Dushanba xulosasi (09:00) — o'tgan haftada ball topganlarga: ball, liga o'rni, guruh o'rni, yangi nishonlar. O'quvchi ikkalasini «Reyting → Darajam» dagi «Telegram eslatmalari» almashtirgichi yoki xabar tagidagi «Eslatmalarni to'xtatish» tugmasi bilan o'chiradi. Botni bloklagan o'quvchiga eslatma yuborilmaydi. Yuborilgan xabarlar o'quvchi kartasining «SMS» tabida ko'rinadi.",
    rollar: [1, 2, 3, 4],
  },
```

- [ ] **Step 6: To'liq tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/server && npm run typecheck && npm run build && npm test
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4/client && npx tsc --noEmit -p . && npx vitest run && npx eslint src --quiet && npx next build
```

Expected: hammasi yashil. `build` va `test` parallel emas (xotira `build∥test`). Yiqilsa — sababini tuzatib, faqat yiqilgan buyruqni qayta yurgizish.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s4 && git add docs/adr/0117-daf-telegram-eslatma-darhol-royxat.md docs/adr/README.md server/CLAUDE.md client/src/qollanma/yangiliklar.ts && git commit -m "docs(adr): ADR-0117 DaF reminders on the instant list, claimed log, kill switch

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Controller uchun qo'lda qadamlar (rejaning ishi emas, faqat yozib qo'yiladi)** — PR tavsifiga: (1) deploy'dan keyin Railway'da `DAF_ESLATMALAR=log`; (2) ertasi kuni `railway logs --service caring-courage --environment production` da `Eslatma (log): kompaniya …, kechki auditoriya N` — N real ko'rinadimi; (3) `railway run --service caring-courage --environment production npx ts-node --transpile-only scripts/daf-eslatma-sinov.ts --user=<CEO id> --send` — CEO uch matnni o'z Telegram'ida ko'radi; (4) CEO tasdiqlagach `DAF_ESLATMALAR=on`. Hech biri bu rejada bajarilmaydi.

---

### Task 14: Brauzer tekshiruvi (spec §8 «Brauzer») va tozalash

**Files:** kod o'zgarmaydi (topilgan xato — o'z TDD tuzatish kommiti bilan).

- [ ] **Step 1: Backend va ilovani ko'tarish** — xotira `reference_throwaway_local_db` retsepti bo'yicha, `$S1_DB` bilan (Task 12 dan keyingi holat): Task 8 Step 6 dagi Redis (`redis-s4`, port 6417), `CRONS_ENABLED=false` (hech qanday eslatma yuborilmaydi), bo'sh `TELEGRAM_BOT_TOKEN=` va `TELEGRAM_ADMIN_BOT_TOKEN=`, `PORT=4417`:

```bash
cd server && npm run build && DATABASE_URL="$S1_DB" PORT=4417 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= REDIS_HOST=127.0.0.1 REDIS_PORT=6417 node --env-file=/Users/a1111/Desktop/daf-erp-system/server/.env dist/src/main.js > /private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/s4-backend.log 2>&1
```

(`run_in_background: true`, `Nest application successfully started` ni `Monitor` bilan kutish.) Client `127.0.0.1:<port>` da (xotira `reference_local_role_browser_check`: CORS shimi va kirish yordamchisi). O'quvchi bilan kirish: seed paroli `123456` (`prisma/seed.ts`), telefon bazadan.

- [ ] **Step 2: Sinov o'quvchilari**

```bash
export Q="docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -tA"
$Q -c "SELECT s.id, s.phone FROM \"Student\" s WHERE s.\"deletedAt\" IS NULL AND s.\"telegramChatId\" IS NOT NULL AND s.\"telegramDisconnectedAt\" IS NULL AND s.id % 20 <> 0 ORDER BY s.id LIMIT 1"
$Q -c "SELECT s.id, s.phone FROM \"Student\" s WHERE s.\"deletedAt\" IS NULL AND s.\"telegramChatId\" IS NULL ORDER BY s.id LIMIT 1"
```

Expected: birinchisi — ulangan, eslatmalari yoqilgan o'quvchi (`$ULANGAN`); ikkinchisi — chatsiz (`$ULANMAGAN`).

- [ ] **Step 3: Ro'yxat** (built-in brauzer, 390×844 va desktop; yorug' va qorong'i):
  1. `$ULANGAN` bilan kirish → «Reyting» → «Darajam»: «Nishonlarim» ostida «Telegram eslatmalari», «Kechki eslatma va dushanba xulosasi», almashtirgich yoqiq (yashil) — skrinshot (390, yorug'/qorong'i).
  2. Almashtirgichni bosish: darrov o'chiq ko'rinadi; tarmoq oynasida `PATCH …/eslatmalar` `{ "yoqilgan": false }` → 200 `{ "eslatmalar": false }`; sahifani yangilash — o'chiq qoladi; `$Q -c "SELECT \"remindersEnabled\", \"dailyGoal\" FROM \"DafStudentSetting\" WHERE \"studentId\" = <ULANGAN id>"` → `f|<avvalgi maqsad>` (maqsad o'zgarmagan). Qayta bosib yoqish → `t`. Skrinshot (o'chiq holat, 390 va desktop).
  3. Xato holati: backend jarayonini to'xtatib almashtirgichni bosish → «Saqlab bo'lmadi. Qayta urinib ko'ring» xabari, almashtirgich eski holatiga qaytadi — skrinshot; backendni Step 1 buyrug'i bilan qayta ko'tarish.
  4. `$ULANMAGAN` bilan kirish → «Darajam»: «Botga ulang», almashtirgich xira va bosilmaydi (fokus bilan Space ham hech narsa qilmaydi) — skrinshot (yorug'/qorong'i).
  5. Klaviatura: Tab almashtirgichga keladi, fokus halqasi ko'rinadi, Space/Enter almashtiradi; ekran o'quvchi nomi «Telegram eslatmalari» (`aria-labelledby`).
  6. Ekranda inglizcha so'z yo'qligini ko'z bilan tekshirish.

- [ ] **Step 4: Natijani CEO'ga yuborish** — skrinshotlarni bir qatorli izoh bilan. Topilgan xato → alohida tuzatish (yiqiladigan test → tuzatish → test), shu bosqichda. Telegram tugmasi va matnlar brauzerda tekshirilmaydi: tugma — Task 8 testlari, matnlar — CEO sinov nusxasi (Task 13 Step 8, controller).

- [ ] **Step 5: Tozalash** — backend/client jarayonlarini to'xtatish, `docker rm -f redis-s4`, `docker exec daf-postgres dropdb -U daf_user daf_s1_yuklama`, `rm -f /private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/s4-backend.log`.

- [ ] **Step 6: Commit** — faqat shu vazifada tuzatish bo'lsa: tuzatilgan fayllar `git add <fayllar>` va `git commit -m "fix(lernen): <nima tuzatildi>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"` (server fayllariga avval prettier). Tuzatish bo'lmasa — `git status --short` bo'sh.

---

## Spec qamrovi (o'z-o'zini tekshirish)

| Spec bo'limi | Vazifa |
| --- | --- |
| §1.1 kechki eslatma 19:30, yakshanba/bayram yo'q | 6 (cron, `isTashkentSunday`, `findActiveHolidayCovering(…, null)`) |
| §1.1 yetti shart (o'chirilmagan, ulangan, uzilmagan, yoqilgan, 14 kun, bugun yo'q, kecha yo'q, 4/7, xulosa olgan kun) | 2 (`kechkiNomzodmi`), 4 (SQL + brute force) |
| §1.1 ADR-0066 dan istisno (uzilgan chat o'tkaziladi) | 2 (izoh), 4 (SQL), 13 (ADR) |
| §1.2 ikki kechki matn, seriya ≥ 2, ism escape, havola, `{ball}` = kunlik maqsad, tugma | 2 (`kechkiMatn`, `toxtatishTugmasi`), 4 (seriya SQL), 5 (`MAQSAD_BALL[maqsadDarajasi]`) |
| §2 dushanba 09:00, ≥ 1 ball, ulangan, yoqilgan, bayramda ham | 2 (`haftalikNomzodmi`), 4, 6 |
| §2 xulosa matni, ixtiyoriy liga/guruh/nishon qatorlari | 2 (`haftalikMatn`, `nishonNomi`), 4 (SQL), 5 (`haftalikMalumot`) |
| §2 tayyorlik, 10–18 qayta urinish, 18:00 dan keyin yuborilmaydi | 2 (`haftalikQaror`), 4 (`haftaTayyormi`), 6 |
| §3 `remindersEnabled`, bitta o'chirish ikkalasini to'xtatadi | 1, 4 (ikkala SQL), 3 |
| §3 ilovada almashtirgich, `PATCH eslatmalar`, `GET fortschritt.eslatmalar` (qo'shimcha so'rovsiz) | 7, 10, 11 |
| §3 Telegram tugmasi `dr:off:<id>`, `useBeforeScenes`, chat tengligi, tugma olib tashlanadi, javob matni | 2 (matnlar), 8 |
| §3 yagona yozuvchi `eslatmalarniSaqla` (upsert, `dailyGoal` ga tegmaydi) | 3 (+ qorovul), 7, 8 |
| §4 `DafReminderLog` sxemasi, unique, index | 1 |
| §4 oldindan egallash `ON CONFLICT DO NOTHING RETURNING`, `SENT`/`FAILED`, `FAILED` qayta urinilmaydi va sanalmaydi | 3, 5, 2 |
| §4 yagona yozuvchi qorovuli (S2/S3 shaklida) | 3 |
| §4 90 kunlik tozalash kechki cron oxirida | 3, 6 |
| §5 `SmsService.sendToStudent(…, 'AUTO', …)`, `replyMarkup`, `direct-send.guard.spec.ts` o'zgarmaydi | 5 |
| §5 ADR-0025 «darhol» ro'yxati (ADR-0117) | 13 |
| §5 ≈ 60 ms pauza, xato faqat shu o'quvchiniki | 5, 12 |
| §5 `DAF_ESLATMALAR` off/log/on | 2 (`eslatmaRejimi`), 6 |
| §5 CEO sinov nusxasi `--user`/`--chat`, import qilinganda ishlamaydi, o'quvchiga yubormaydi | 9 (yuborish — controller, 13 Step 8) |
| §6 server tuzilishi (`daf/eslatma/` fayllari, `fortschritt` ga kichik ulanish) | 2–8 |
| §6 marshrut: `@StudentOnly` + `StudentCardGuard`, manifest SELF, snapshot, DTO `@IsBoolean` | 7 |
| §7 ekran: «Darajam» da «Nishonlarim» ostida, izoh, ulanmagan holat, darrov saqlash, xato bo'lsa qaytarish | 10, 11, 14 |
| §8 birlik testlari (14 kun, 4/7, ketma-ket, yakshanba/bayram, xulosadan keyingi kechki, matnlar, escape, < 4096, idempotentlik, `FAILED`) | 2, 3, 5, 6 |
| §8 server testlari (cron rejimlari, xatoli o'quvchi, boshqa chat tugmasi, PATCH e2e, manifest, snapshot) | 5, 6, 7, 8 |
| §8 haqiqiy baza: auditoriya va xulosa SQL'i brute force bilan | 4 (paritet), 3 va 7 (probalar) |
| §8 yuklama: auditoriya vaqti, to'liq yurish soxta botda, `fortschritt` p95 qayta | 12 |
| §8 brauzer: almashtirgich holatlari, 390 px va desktop, yorug'/qorong'i | 14 |
| §9 ADR-0117, `server/CLAUDE.md` bandlari, yangilik, deploy tartibi | 13 |
| §10 qilinmaydiganlar | rejada yo'q (vaqt tanlash, ota-ona xabari, push, o'qituvchi xabari, matn sozlamasi, A/B, «seriya uzildi») |
| §11 xavflar | 2, 3, 5, 6, 8, 12 (mos ravishda) |

**Placeholder tekshiruvi:** «TBD/TODO» yo'q. Task 12 Step 5 dagi `<sana>`, `<ms>`, `…` — o'lchov chiqaradigan raqamlar uchun shablon (S3 §11 bilan bir xil), qadamning o'zi ularni to'ldirishni talab qiladi. Task 14 Step 6 dagi `<nima tuzatildi>` — faqat tuzatish bo'lsa yoziladigan kommit matni. Task 13 Step 8 dagi `<CEO id>` — controller qo'lda qo'yadigan qiymat.

**Nom va tip mosligi:** `eslatmaniEgalla(db, { companyId, studentId, kind, sentOn })` Task 3 ↔ 4 (seed) ↔ 5; `natijaniYoz(db, id, status)` 3 ↔ 4 ↔ 5; `eskilariniTozala(db, companyId, bugun)` 3 ↔ 6; `eslatmalarniSaqla(prisma, studentId, companyId, yoqilgan)` → `{ eslatmalar }` 3 ↔ 4 ↔ 7 ↔ 8; `kechkiAuditoriya(db, companyId, bugun)` → `KechkiQator { studentId, ism, seriya, dailyGoal }` 4 ↔ 5 ↔ 12; `haftalikAuditoriya(db, companyId, bugun)` → `HaftalikQator { studentId, ism, ball, tier, orin, kotarildi, guruhOrin, guruhJami, nishonlar }` 4 ↔ 5 (`haftalikMalumot`) ↔ 12; `haftaTayyormi(db, companyId, bugun)` 4 ↔ 6; `EslatmaYuborish.kechki/haftalik(companyId, bugun, rejim, pauzaMs?)` → `YuborishNatija { auditoriya, yuborildi, xato, otkazildi }` 5 ↔ 6 ↔ 12; `kechkiMatn({ ism, seriya, maqsadBall })`, `haftalikMatn(HaftalikMalumot)`, `toxtatishTugmasi(id)`, `toxtatishKimniki(data)` 2 ↔ 5 ↔ 8 ↔ 9; `FortschrittService.eslatmalarniOzgartir(studentId, companyId, yoqilgan)` ↔ `patchEslatmalar(dto, studentId, companyId)` 7; server `Fortschritt.eslatmalar/telegramUlangan` ↔ client `Fortschritt.eslatmalar?/telegramUlangan?`, server `{ eslatmalar }` ↔ client `EslatmalarJavob` 7 ↔ 10; kesh kaliti `["lernen","fortschritt"]` 10 ↔ 11; SQL belgilari `eslatma-egalla`, `eslatma-natija`, `eslatma-tozala`, `eslatma-kechki`, `eslatma-haftalik`, `eslatma-tayyor` kod ↔ testlar; relatsiya nomi `dafReminders` 1 ↔ 3 (qorovul); `s4KechkiKun`/`s4HaftalikKun` 4 ↔ 12.
