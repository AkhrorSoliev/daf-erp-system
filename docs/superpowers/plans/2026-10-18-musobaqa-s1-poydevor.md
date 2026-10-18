# Musobaqa S1 — poydevor: implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ball, seriya va haftalik reytingni urinishlar tarixidan emas, kunlik yig'indi jadvalidan (`DafStudentDay`) o'qish; seans oxiri natijasini server qaytarsin; 5 000 o'quvchida yuklama chegarasini isbotlash; 07.09 dan qolgan brauzer tekshiruvini yopish.

**Architecture:** Yangi hosila jadval `DafStudentDay` (o'quvchi × Toshkent kuni × guruh). Har urinish bitta yozuvchi — `recordAttempt` — orqali `DafAttempt` qatori bilan birga shu jadvalga `+points`, `+1 attempt` qo'shadi (bitta tranzaksiya, Postgres `ON CONFLICT … DO UPDATE`). `FortschrittService` faqat shu jadvaldan o'qiydi. `abschluss` javobiga `natija` (ball, seriya, o'rin oldin/hozir) qo'shiladi va mijozdagi "seans boshidagi surat" mexanizmi o'chadi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), jest (server), Next.js + vitest (client), ts-node skriptlar.

**Spec:** [`docs/superpowers/specs/2026-10-18-musobaqa-s1-poydevor-design.md`](../specs/2026-10-18-musobaqa-s1-poydevor-design.md)

## Global Constraints

- Ball qoidasi, daraja chegaralari, seriya qoidasi, saralash (ball ↓, teng bo'lsa `studentId` ↑), "nol ballilar ko'rinadi", markaz TOP 50 + o'z qatori, "markaz filialga cheklanmaydi" — O'ZGARMAYDI (06.09 dizayni §3, §5–§7).
- Hafta = Toshkent dushanbasi 00:00 dan. Kun = Toshkent kuni (`tashkentDateStr`, `common/date/tashkent.ts`).
- `groupKey` NULL emas: guruhsiz = `''`.
- Raw SQL faqat tagged `$queryRaw` / `$executeRaw`; `*Unsafe` taqiqlangan (server/CLAUDE.md).
- Yuklama chegarasi: p95 < 200 ms (`fortschritt`, ikki reyting, `recordAttempt`), `seansNatijasi` p95 < 300 ms — 5 000 o'quvchi, 50 parallel.
- Kommit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server fayllari: `npx prettier --write` → `npx eslint --quiet` → `npx jest <yo'l>`. Client fayllariga prettier ISHLATILMAYDI.
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1`. Hamma buyruq shu ildizdan (yoki `server/`, `client/` ichidan). Asosiy katalogda commit qilinmaydi.

## Fayl xaritasi

| Fayl | Nima | Vazifa |
| --- | --- | --- |
| `server/prisma/schema.prisma` | `DafStudentDay` modeli + `Student.dafStudentDays` | 1 |
| `server/prisma/migrations/20261018200000_daf_student_day/migration.sql` | jadval, indekslar, boshlang'ich to'ldirish | 1 |
| `server/src/daf/daf-schema.spec.ts` | jadval shakli qorovuli | 1, 7 |
| `server/src/daf/shared/attempt-writer.ts` | `recordAttempt`, `kunlikKalit` | 2 |
| `server/src/daf/shared/attempt-writer.spec.ts` | yozuvchi testlari | 2 |
| `server/src/daf/shared/attempt-writer.single-source.spec.ts` | "boshqa joyda yozilmaydi" qorovuli | 3 |
| `server/src/daf/uebung/uebung.service.ts` | `pruefen`, `juft` → `recordAttempt` | 3 |
| `server/src/daf/daf-attempt.service.ts` | `recordDrill`, `record` → `recordAttempt` | 3 |
| 5 ta spec fake | `$transaction`, `$executeRaw` qo'shiladi | 3 |
| `server/src/daf/uebung/punkte.ts` (+spec) | `wochenStartTag` | 4 |
| `server/src/daf/fortschritt/fortschritt.service.ts` | o'qish `DafStudentDay` dan; `seansNatijasi` | 4, 5 |
| `server/src/daf/fortschritt/fortschritt.service.spec.ts` | fake'lar yangi jadvalga | 4 |
| `server/src/daf/fortschritt/fortschritt.parity.spec.ts` | eski formula = yangi o'qish | 4 |
| `server/src/daf/fortschritt/seans-natija.spec.ts` | `seansNatijasi` testlari | 5 |
| `server/src/daf/daf-portal.controller.ts` (+spec) | javobga `natija` | 5 |
| `client/src/components/student-portal/lernen/types.ts` | `SeansNatijasi` | 6 |
| `client/.../lernen/uebung/natija-xabari.ts` (+test) | `natijaQatorlari`, `orinXabari(…, joy)` | 6 |
| `client/.../lernen/uebung/natija-ekrani.tsx` | `natija` prop | 6 |
| `client/.../lernen/uebung/seans-ekrani.tsx` | surat mexanizmi o'chadi | 6 |
| `client/.../lernen/uebung/seans-boshlangich.ts` (+test) | O'CHIRILADI | 6 |
| `client/.../lernen/queries.ts` | takrorlash yakunida invalidatsiya | 6 |
| `server/scripts/lib/daf-student-day-sql.ts` | urinishlardan yig'indi SQL'i (bitta manba) | 7 |
| `server/scripts/audit-daf-student-day.ts` | moslik auditi (faqat o'qiydi) | 7 |
| `server/scripts/rebuild-daf-student-day.ts` | qayta qurish (dry run / `--apply`) | 7 |
| `server/scripts/load/local-db-guard.ts` | "faqat lokal baza" qorovuli | 8 |
| `server/scripts/load/daf-yuklama-seed.ts` | 5 000 o'quvchi × hafta urinishlar | 8 |
| `server/scripts/load/daf-yuklama-olchov.ts` | p50/p95 o'lchov + EXPLAIN | 8 |
| `docs/adr/0114-daf-kunlik-yigindi-hosila-jadval.md` | ADR | 9 |
| `server/CLAUDE.md` | DaF yozuvchi bo'limi | 9 |

---

### Task 0: Worktree tayyorlash

**Files:** yo'q (muhit).

- [ ] **Step 1: Paketlarni o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npm install
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/client && npm install
```

- [ ] **Step 2: Prisma klientini yaratish va boshlang'ich holatni tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npx prisma generate && npx jest src/daf
```

Expected: hamma DaF testlari PASS (boshlang'ich holat yashil). Yiqilsa — ishni boshlamasdan sababini yozib, to'xtash.

---

### Task 1: `DafStudentDay` modeli va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (Student modeli ~747-qator, `DafAttempt` modelidan keyin)
- Create: `server/prisma/migrations/20261018200000_daf_student_day/migration.sql`
- Modify: `server/src/daf/daf-schema.spec.ts`

**Interfaces:**
- Produces: Prisma modeli `dafStudentDay` — maydonlar `id, studentId, companyId, day (Date, @db.Date), groupKey (string, default ''), points, attempts, updatedAt`; unique `studentId_day_groupKey`.

- [ ] **Step 1: Yiqiladigan sxema testini yozish** — `daf-schema.spec.ts` dagi `describe('Daf sxemasi'` blokining oxiriga:

```ts
  // DafStudentDay — a DERIVED table: the source of truth stays DafAttempt
  // (points included). groupKey is never NULL: a NULL key would not block
  // a duplicate row. (Task 7 adds: the rebuild script must exist.)
  it('DafStudentDay is derived and its key cannot duplicate', () => {
    const schema = readFileSync(
      join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const block = schema.slice(schema.indexOf('model DafStudentDay {'));
    const body = block.slice(0, block.indexOf('\n}'));
    expect(body).toMatch(/groupKey\s+String\s+@default\(""\)/);
    expect(body).toMatch(/@@unique\(\[studentId, day, groupKey\]\)/);
    expect(body).toMatch(/day\s+DateTime\s+@db\.Date/);
    expect(fieldsOf('DafAttempt')).toContain('points');
  });
```

- [ ] **Step 2: Test yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts -t DafStudentDay`
Expected: FAIL (`model DafStudentDay` topilmaydi).

- [ ] **Step 3: Modelni qo'shish** — `schema.prisma`, `model DafAttempt { … }` blokidan keyin:

```prisma
/// DERIVED: the source of truth is DafAttempt. Rebuilt from it at any time by
/// `scripts/rebuild-daf-student-day.ts`. One writer: `recordAttempt`
/// (src/daf/shared/attempt-writer.ts). ADR-0114.
model DafStudentDay {
  id        Int      @id @default(autoincrement())
  studentId Int
  companyId Int
  /// Tashkent calendar day.
  day       DateTime @db.Date
  /// The attempt's sealed groupId; "" for no group (never NULL: a NULL key
  /// would not block a duplicate row).
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

va `model Student` ichida `dafAttempts       DafAttempt[]` qatoridan keyin:

```prisma
  dafStudentDays    DafStudentDay[]
```

- [ ] **Step 4: Migratsiya faylini yozish** — `server/prisma/migrations/20261018200000_daf_student_day/migration.sql`:

```sql
-- DafStudentDay: derived daily totals of DafAttempt (ADR-0114).
CREATE TABLE "DafStudentDay" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "groupKey" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafStudentDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafStudentDay_studentId_day_groupKey_key" ON "DafStudentDay"("studentId", "day", "groupKey");
CREATE INDEX "DafStudentDay_companyId_day_idx" ON "DafStudentDay"("companyId", "day");
CREATE INDEX "DafStudentDay_groupKey_day_idx" ON "DafStudentDay"("groupKey", "day");

ALTER TABLE "DafStudentDay" ADD CONSTRAINT "DafStudentDay_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from the attempts that already exist. "createdAt" is a UTC
-- timestamp without time zone; +5 hours is the Tashkent day (no DST).
INSERT INTO "DafStudentDay" ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
SELECT "studentId",
       "companyId",
       ("createdAt" + interval '5 hours')::date,
       COALESCE("groupId", ''),
       COALESCE(SUM("points"), 0)::int,
       COUNT(*)::int,
       now()
FROM "DafAttempt"
GROUP BY 1, 2, 3, 4;
```

- [ ] **Step 5: Klientni qayta yaratish**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 6: Lokal sinov bazasini ochish va migratsiyani tekshirish** (Task 8 da ham shu baza ishlatiladi; nom: `daf_s1_yuklama`)

```bash
docker exec daf-postgres createdb -U daf_user daf_s1_yuklama
```

`DATABASE_URL` ni shellda yig'ing (parolni ekranga chiqarmang): `export S1_DB="postgresql://daf_user:$(docker exec daf-postgres printenv POSTGRES_PASSWORD)@127.0.0.1:5433/daf_s1_yuklama"`. Keyin:

```bash
cd server && DATABASE_URL="$S1_DB" node node_modules/prisma/build/index.js migrate deploy
```

Bo'sh bazada deploy ikki marta to'xtaydi (xotira `reference_throwaway_local_db`): `20260805120000_branch_tenancy_leads_holidays_mock` oldidan `INSERT INTO "Company"(id, name, ...)` (id 1001), `20260806120000_drop_company_defaults_and_branch_sequence` oldidan `INSERT INTO "Branch"(id, "companyId", ...)` (id 1, companyId 1001); har biridan keyin `migrate resolve --rolled-back <nom>` va deploy qayta. Oxirida:

```bash
cd server && DATABASE_URL="$S1_DB" npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
```

Expected: bo'sh skript (`-- This is an empty migration.`) — qo'lda yozilgan SQL sxemaga aynan mos.

- [ ] **Step 7: Sxema testi**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1 && npx --prefix server prettier --write server/src/daf/daf-schema.spec.ts && git add server/prisma/schema.prisma server/prisma/migrations/20261018200000_daf_student_day server/src/daf/daf-schema.spec.ts && git commit -m "feat(daf): DafStudentDay derived daily totals table with backfill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bitta yozuvchi — `recordAttempt`

**Files:**
- Create: `server/src/daf/shared/attempt-writer.ts`
- Create: `server/src/daf/shared/attempt-writer.spec.ts`

**Interfaces:**
- Produces:
  - `type AttemptData = Omit<Prisma.DafAttemptUncheckedCreateInput, 'id' | 'createdAt'>`
  - `kunlikKalit(createdAt: Date, groupId: string | null | undefined): { day: string; groupKey: string }`
  - `recordAttempt(prisma: PrismaService, data: AttemptData): Promise<void>`

- [ ] **Step 1: Yiqiladigan testlarni yozish** — `attempt-writer.spec.ts`:

```ts
import { kunlikKalit, recordAttempt } from './attempt-writer';

function fakePrisma() {
  return {
    dafAttempt: { create: jest.fn(async (args: unknown) => args) },
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const DATA = {
  studentId: 10001,
  companyId: 1,
  branchId: 3,
  groupId: 'g-1',
  isCorrect: true,
  given: 'das Haus',
  points: 10,
};

describe('kunlikKalit', () => {
  it('a Tashkent evening after 19:00 UTC is already the next day', () => {
    expect(kunlikKalit(new Date('2026-10-18T19:30:00Z'), 'g-1')).toEqual({
      day: '2026-10-19',
      groupKey: 'g-1',
    });
  });

  it('no group is the empty string, never null', () => {
    expect(kunlikKalit(new Date('2026-10-18T10:00:00Z'), null).groupKey).toBe('');
    expect(kunlikKalit(new Date('2026-10-18T10:00:00Z'), undefined).groupKey).toBe('');
  });
});

describe('recordAttempt', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-18T19:30:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('writes the attempt and the day row in one transaction', async () => {
    const prisma = fakePrisma();
    await recordAttempt(prisma as any, DATA);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    const created = prisma.dafAttempt.create.mock.calls[0][0] as {
      data: { createdAt: Date; points: number };
    };
    expect(created.data.createdAt).toEqual(new Date('2026-10-18T19:30:00Z'));
    expect(created.data.points).toBe(10);

    // Tagged template: [strings, ...values].
    const values = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual([10001, 1, '2026-10-19', 'g-1', 10]);
  });

  it('an attempt without points adds 0 points and still counts', async () => {
    const prisma = fakePrisma();
    const { points: _p, ...rest } = DATA;
    await recordAttempt(prisma as any, { ...rest, groupId: null });
    const values = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual([10001, 1, '2026-10-19', '', 0]);
  });

  it('a failed day row fails the whole write', async () => {
    const prisma = fakePrisma();
    prisma.$executeRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(recordAttempt(prisma as any, DATA)).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/shared/attempt-writer.spec.ts`
Expected: FAIL (`Cannot find module './attempt-writer'`).

- [ ] **Step 3: Yozuvchini yozish** — `attempt-writer.ts`:

```ts
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tashkentDateStr } from '../../common/date/tashkent';

/** What `dafAttempt.create` takes, minus `createdAt` — the writer sets it. */
export type AttemptData = Omit<
  Prisma.DafAttemptUncheckedCreateInput,
  'id' | 'createdAt'
>;

/**
 * The day row an attempt belongs to. The writer, the rebuild SQL and the
 * parity test all follow this one rule: the Tashkent day of `createdAt`,
 * and the sealed group ("" for none, never NULL — ADR-0114).
 */
export function kunlikKalit(
  createdAt: Date,
  groupId: string | null | undefined,
): { day: string; groupKey: string } {
  return { day: tashkentDateStr(createdAt), groupKey: groupId ?? '' };
}

/**
 * The ONE way a DafAttempt row is written (attempt-writer.single-source.spec).
 * The attempt and its day total commit together; the increment runs inside
 * Postgres, so two answers at the same moment never lose each other's sum.
 */
export async function recordAttempt(
  prisma: PrismaService,
  data: AttemptData,
): Promise<void> {
  const createdAt = new Date();
  const { day, groupKey } = kunlikKalit(createdAt, data.groupId);
  const points = data.points ?? 0;
  await prisma.$transaction([
    prisma.dafAttempt.create({ data: { ...data, createdAt } }),
    prisma.$executeRaw`
      INSERT INTO "DafStudentDay"
        ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
      VALUES (${data.studentId}, ${data.companyId}, ${day}::date, ${groupKey}, ${points}, 1, now())
      ON CONFLICT ("studentId", "day", "groupKey") DO UPDATE SET
        "points" = "DafStudentDay"."points" + EXCLUDED."points",
        "attempts" = "DafStudentDay"."attempts" + 1,
        "updatedAt" = now()`,
  ]);
}
```

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/shared/attempt-writer.spec.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npx prettier --write src/daf/shared/attempt-writer.ts src/daf/shared/attempt-writer.spec.ts && npx eslint --quiet src/daf/shared && git add src/daf/shared/attempt-writer.ts src/daf/shared/attempt-writer.spec.ts && git commit -m "feat(daf): recordAttempt writes the attempt and its day total together

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: To'rt yozish joyini `recordAttempt` ga o'tkazish

**Files:**
- Create: `server/src/daf/shared/attempt-writer.single-source.spec.ts`
- Modify: `server/src/daf/uebung/uebung.service.ts:1550-1563` (`pruefen`), `:1750-1776` (`juft`)
- Modify: `server/src/daf/daf-attempt.service.ts:62-73` (`recordDrill`), `:117-129` (`record`)
- Modify (fake'lar): `server/src/daf/uebung/uebung.service.spec.ts` (`fakePrisma`, ~364-qator), `uebung.service.dialog-bild.spec.ts` (~101), `uebung.service.uhr.spec.ts` (~86), `uebung.service.bild.spec.ts` (~120), `server/src/daf/daf-attempt.service.spec.ts` (~29), va `daf-portal.controller.spec.ts` dagi `fakeUebungPrisma` (agar unda `dafAttempt` bo'lsa)

**Interfaces:**
- Consumes: `recordAttempt(prisma, data: AttemptData)`, `AttemptData` (Task 2).

- [ ] **Step 1: Qorovul testini yozish** — `attempt-writer.single-source.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * DafAttempt and DafStudentDay have one door: `recordAttempt` (ADR-0114).
 * A write anywhere else would leave the day totals behind the attempts, and
 * every ranking reads the totals. Scripts that rebuild or seed the table
 * write raw SQL and are named here on purpose.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const PRISMA_WRITE =
  /\.(dafAttempt|dafStudentDay)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const RAW_WRITE = /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(DafAttempt|DafStudentDay)"/g;

const ALLOWED: Record<string, string[]> = {
  'src/daf/shared/attempt-writer.ts': ['DafAttempt', 'DafStudentDay'],
  'scripts/rebuild-daf-student-day.ts': ['DafStudentDay'],
  'scripts/lib/daf-student-day-sql.ts': ['DafStudentDay'],
  'scripts/load/daf-yuklama-seed.ts': ['DafAttempt', 'DafStudentDay'],
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

const model = (name: string) =>
  name.startsWith('dafA') || name === 'DafAttempt' ? 'DafAttempt' : 'DafStudentDay';

const writes = ROOTS.flatMap((root) => walk(join(SERVER, root))).flatMap((file) => {
  const path = file.slice(SERVER.length + 1).split('\\').join('/');
  const text = readFileSync(file, 'utf8');
  return [
    ...[...text.matchAll(PRISMA_WRITE)].map((m) => ({ path, table: model(m[1]) })),
    ...[...text.matchAll(RAW_WRITE)].map((m) => ({ path, table: model(m[2]) })),
  ];
});

describe('DafAttempt / DafStudentDay are written only by recordAttempt', () => {
  it('found the writer — a scan that matches nothing proves nothing', () => {
    expect(writes.some((w) => w.path === 'src/daf/shared/attempt-writer.ts')).toBe(true);
  });

  it('the patterns see Prisma and raw writes', () => {
    expect([...'tx\n  .dafAttempt\n  .create(\n'.matchAll(PRISMA_WRITE)]).toHaveLength(1);
    expect([...'DELETE FROM "DafStudentDay"'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'prisma.dafAttempt.findMany({})'.matchAll(PRISMA_WRITE)]).toHaveLength(0);
  });

  it('no other file writes either table', () => {
    expect(
      writes
        .filter((w) => !(ALLOWED[w.path] ?? []).includes(w.table))
        .map((w) => `${w.path}: ${w.table}`),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Qorovul yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/shared/attempt-writer.single-source.spec.ts`
Expected: FAIL — `no other file writes either table` 4 ta joyni ko'rsatadi (`uebung.service.ts` ×2, `daf-attempt.service.ts` ×2). Keyingi qadamlar ularni yopadi.

- [ ] **Step 3: `pruefen` va `juft`** — `uebung.service.ts` importlariga qo'shish:

```ts
import { recordAttempt, type AttemptData } from '../shared/attempt-writer';
```

`pruefen` ichida:

```ts
    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        …
        ...this.seansMaydonlari(input, itemType, itemId, format, isCorrect),
      },
    } as any);
```

ni quyidagiga almashtirish (ichki maydonlar o'zgarmaydi):

```ts
    await recordAttempt(this.prisma, {
      studentId: ctx.studentId,
      companyId: ctx.companyId,
      branchId,
      groupId,
      lexemeId: itemType === 'WORT' ? itemId : null,
      isCorrect,
      given,
      durationMs: durationMs ?? null,
      points,
      ...this.seansMaydonlari(input, itemType, itemId, format, isCorrect),
    } as AttemptData);
```

`juft` dagi `this.prisma.dafAttempt.create({ data: { … } } as any)` ni ham xuddi shunday `recordAttempt(this.prisma, { …o'sha maydonlar… } as AttemptData)` ga almashtirish (ichidagi izohlar qoladi).

- [ ] **Step 4: `recordDrill` va `record`** — `daf-attempt.service.ts` importlariga `import { recordAttempt } from './shared/attempt-writer';`, va ikkala `await this.prisma.dafAttempt.create({ data: { … } });` ni `await recordAttempt(this.prisma, { … });` ga (bir xil maydonlar, `data:` qatlamisiz).

- [ ] **Step 5: Fake'larga tranzaksiya qo'shish** — har bir faylda `dafAttempt: {` obyekti bor fake'ning yuqori darajasiga (o'sha `return {` ichiga) qo'shish:

```ts
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
```

Ro'yxat: `uebung.service.spec.ts` (`fakePrisma`), `uebung.service.dialog-bild.spec.ts`, `uebung.service.uhr.spec.ts`, `uebung.service.bild.spec.ts`, `daf-attempt.service.spec.ts` (`prisma = { … }` ichida; tip e'loni `let prisma: {…}` ga `$executeRaw: jest.Mock; $transaction: jest.Mock;` ham qo'shiladi). Tekshirish: `grep -rln 'dafAttempt: {' src --include='*.spec.ts'` chiqargan har fayl ro'yxatda bo'lishi kerak.

- [ ] **Step 6: DaF testlari**

Run: `cd server && npx jest src/daf`
Expected: PASS, shu jumladan `attempt-writer.single-source.spec.ts` (endi faqat ruxsat etilgan yozuvchi qoldi). Mavjud `expect(prisma.dafAttempt.create).toHaveBeenCalled()` va `.mock.calls[0][0]` tekshiruvlari o'zgarmay ishlaydi: `recordAttempt` `create` ni `{ data }` bilan chaqiradi, `data` ga faqat `createdAt` qo'shiladi.

- [ ] **Step 7: Typecheck**

Run: `cd server && npm run typecheck`
Expected: 0 xato. `as AttemptData` kerak bo'lmagan joyda olib tashlash mumkin.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npx prettier --write src/daf/uebung/uebung.service.ts src/daf/daf-attempt.service.ts src/daf/uebung/*.spec.ts src/daf/daf-attempt.service.spec.ts && npx eslint --quiet src/daf && git add -A src/daf && git commit -m "refactor(daf): every attempt goes through recordAttempt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `FortschrittService` kunlik jadvaldan o'qiydi

**Files:**
- Modify: `server/src/daf/uebung/punkte.ts`, `server/src/daf/uebung/punkte.spec.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.spec.ts`
- Create: `server/src/daf/fortschritt/fortschritt.parity.spec.ts`

**Interfaces:**
- Consumes: `kunlikKalit` (Task 2).
- Produces:
  - `wochenStartTag(jetzt: Date): string` (`punkte.ts`) — dushanba `YYYY-MM-DD`
  - `FortschrittService` private `serieFuer(studentId: number, heute: string): Promise<number>`
  - private `zentrumHaftaligi(studentId, companyId, montag: Date)` va `gruppeHaftaligi(groupId, companyId, montag: Date)` — `montag` = `utcMidnightFromDateStr(wochenStartTag(now))`; qaytaradigan shakl o'zgarmaydi (`HaftalikYigindi`).

- [ ] **Step 1: `wochenStartTag` testi** — `punkte.spec.ts` oxiriga:

```ts
describe('wochenStartTag', () => {
  it('Sunday 23:50 Tashkent still belongs to the week that began on Monday', () => {
    // 2026-10-18 is a Sunday; 18:50Z = 23:50 Tashkent.
    expect(wochenStartTag(new Date('2026-10-18T18:50:00Z'))).toBe('2026-10-12');
  });

  it('Monday 00:10 Tashkent starts the new week', () => {
    // 2026-10-18T19:10Z = Monday 2026-10-19 00:10 Tashkent.
    expect(wochenStartTag(new Date('2026-10-18T19:10:00Z'))).toBe('2026-10-19');
  });

  it('wochenStartUtc is the same Monday at 00:00 Tashkent', () => {
    const jetzt = new Date('2026-10-15T08:00:00Z');
    expect(wochenStartUtc(jetzt).toISOString()).toBe('2026-10-11T19:00:00.000Z');
    expect(wochenStartTag(jetzt)).toBe('2026-10-12');
  });
});
```

va import qatoriga `wochenStartTag` qo'shish. Run: `cd server && npx jest src/daf/uebung/punkte.spec.ts` → FAIL (`wochenStartTag is not a function`).

- [ ] **Step 2: `wochenStartTag` ni yozish** — `punkte.ts` da `wochenStartUtc` ni ikkiga bo'lish:

```ts
/** The Monday ('YYYY-MM-DD', Tashkent) of the week `jetzt` falls in. */
export function wochenStartTag(jetzt: Date): string {
  const heute = tashkentDateStr(jetzt);
  const wochentag = dayOfWeekForDateStr(heute); // 0 = yakshanba
  const zurueck = wochentag === 0 ? 6 : wochentag - 1;
  return addDaysToDateStr(heute, -zurueck);
}

export function wochenStartUtc(jetzt: Date): Date {
  const [my, mm, md] = wochenStartTag(jetzt).split('-').map(Number);
  return new Date(Date.UTC(my, mm - 1, md) - TASHKENT_OFFSET_MS);
}
```

(`wochenStartUtc` ustidagi mavjud izoh qoladi.) Run → PASS.

- [ ] **Step 3: Mavjud spec fake'larini yangi jadvalga o'tkazish** — `fortschritt.service.spec.ts`:
  - `fakePrisma()` dagi `dafAttempt: { aggregate, findMany, groupBy }` ni `dafStudentDay: { aggregate, findMany, groupBy }` ga almashtirish (bir xil standart qiymatlar);
  - fayldagi har `prisma.dafAttempt.aggregate` / `.groupBy` / `.findMany` ni `prisma.dafStudentDay.…` ga almashtirish (`sed -i '' 's/prisma\.dafAttempt\./prisma.dafStudentDay./g'` keyin ko'z bilan tekshirish);
  - `'markaz jadvali FILIALGA cheklanmaydi'` testida `where` endi `{ companyId: 1, day: { gte: … } }` — `branchId` yo'qligi va `companyId === 1` tekshiruvi o'zgarmaydi.

Run: `cd server && npx jest src/daf/fortschritt/fortschritt.service.spec.ts` → FAIL (servis hali `dafAttempt` o'qiydi).

- [ ] **Step 4: Servisni yangi jadvalga o'tkazish** — `fortschritt.service.ts`:

Importlar:

```ts
import { tashkentDateStr, utcMidnightFromDateStr } from '../../common/date/tashkent';
import { serieAus, stufeFuer, wochenStartTag } from '../uebung/punkte';
```

(`attendance/shared/date-utils` importi olib tashlanadi.) Fayl darajasida yordamchi:

```ts
/** The week's lower bound for the `@db.Date` column. */
function montagGte(jetzt: Date): Date {
  return utcMidnightFromDateStr(wochenStartTag(jetzt));
}

/** A `@db.Date` value is UTC midnight of its calendar day. */
function tagStr(day: Date): string {
  return day.toISOString().slice(0, 10);
}
```

`uebersicht` boshidagi `Promise.all`:

```ts
    const heute = tashkentDateStr(new Date());
    const [jamiy, serie, groupId, faelligeWoerter] = await Promise.all([
      this.prisma.dafStudentDay.aggregate({
        where: { studentId },
        _sum: { points: true },
      }),
      this.serieFuer(studentId, heute),
      currentGroupId(this.prisma, studentId),
      this.prisma.dafLexemeState.count({
        where: { studentId, dueAt: { lte: new Date() } },
      } as any),
    ]);
```

va keyingi `const heute…`, `kunlar…`, `serieAus(...)` qatorlari o'chadi; `const wochenStart = wochenStartUtc(new Date());` → `const montag = montagGte(new Date());`, va `zentrumHaftaligi(..., montag)`, `gruppeHaftaligi(..., montag)`. Yangi private metod:

```ts
  /**
   * Days with at least one attempt — the streak rule is unchanged
   * (06.09 design §7). At most one row per day per group, so this stays
   * small however many answers the student gave.
   */
  private async serieFuer(studentId: number, heute: string): Promise<number> {
    const kunlar = await this.prisma.dafStudentDay.findMany({
      where: { studentId, attempts: { gt: 0 } },
      select: { day: true },
      distinct: ['day'],
    });
    return serieAus(
      kunlar.map((k) => tagStr(k.day)),
      heute,
    );
  }
```

`reyting()`: `const wochenStart = wochenStartUtc(new Date());` → `const montag = montagGte(new Date());` va uni uzatish. `gruppeHaftaligi` ichidagi so'rov:

```ts
    const haftalik = await this.prisma.dafStudentDay.groupBy({
      by: ['studentId'],
      where: { companyId, groupKey: groupId, day: { gte: montag } },
      _sum: { points: true },
    });
```

`zentrumHaftaligi` ichidagi so'rov:

```ts
    const haftalik = await this.prisma.dafStudentDay.groupBy({
      by: ['studentId'],
      where: { companyId, day: { gte: montag } },
      _sum: { points: true },
    });
```

Parametr nomi va tipi `wochenStart: Date` → `montag: Date` (barcha uch private metod va `gruppeReytingi`, `zentrumReytingi`).

Run: `cd server && npx jest src/daf/fortschritt` → PASS.

- [ ] **Step 5: Moslik testini yozish** — `fortschritt.parity.spec.ts`:

```ts
import { FortschrittService } from './fortschritt.service';
import { kunlikKalit } from '../shared/attempt-writer';
import { serieAus, wochenStartUtc } from '../uebung/punkte';
import { tashkentDateStr } from '../../common/date/tashkent';

/**
 * The OLD formulas read DafAttempt directly; the service now reads the
 * day totals. Same attempts → same numbers. The day key comes from the
 * writer's own `kunlikKalit`, so a change to the bucketing rule shows here.
 */
type Urinish = { studentId: number; groupId: string | null; points: number; createdAt: Date };

const NOW = new Date('2026-10-19T09:00:00Z'); // Monday 14:00 Tashkent
const U: Urinish[] = [
  // Sunday 23:50 Tashkent — last week, must NOT count this week.
  { studentId: 7, groupId: 'g-1', points: 40, createdAt: new Date('2026-10-18T18:50:00Z') },
  // Monday 00:10 Tashkent — this week.
  { studentId: 7, groupId: 'g-1', points: 20, createdAt: new Date('2026-10-18T19:10:00Z') },
  { studentId: 55, groupId: 'g-1', points: 10, createdAt: new Date('2026-10-19T05:00:00Z') },
  // Group changed mid-day: the points stay with the group they were earned in.
  { studentId: 55, groupId: 'g-2', points: 30, createdAt: new Date('2026-10-19T07:00:00Z') },
  // No group.
  { studentId: 9, groupId: null, points: 30, createdAt: new Date('2026-10-19T08:00:00Z') },
  // Streak days for 55: 17th and 18th (Tashkent).
  { studentId: 55, groupId: 'g-1', points: 0, createdAt: new Date('2026-10-17T06:00:00Z') },
  { studentId: 55, groupId: 'g-1', points: 0, createdAt: new Date('2026-10-18T06:00:00Z') },
];

type Row = { studentId: number; companyId: number; day: Date; groupKey: string; points: number; attempts: number };

function rows(): Row[] {
  const m = new Map<string, Row>();
  for (const u of U) {
    const { day, groupKey } = kunlikKalit(u.createdAt, u.groupId);
    const key = `${u.studentId}|${day}|${groupKey}`;
    const r = m.get(key) ?? { studentId: u.studentId, companyId: 1, day: new Date(`${day}T00:00:00.000Z`), groupKey, points: 0, attempts: 0 };
    r.points += u.points;
    r.attempts += 1;
    m.set(key, r);
  }
  return [...m.values()];
}

function matches(r: Row, where: any): boolean {
  if (where.studentId !== undefined && r.studentId !== where.studentId) return false;
  if (where.companyId !== undefined && r.companyId !== where.companyId) return false;
  if (where.groupKey !== undefined && r.groupKey !== where.groupKey) return false;
  if (where.day?.gte && r.day < where.day.gte) return false;
  if (where.attempts?.gt !== undefined && !(r.attempts > where.attempts.gt)) return false;
  return true;
}

function fakeDayPrisma() {
  const data = rows();
  return {
    dafStudentDay: {
      aggregate: jest.fn(async ({ where }: any) => ({
        _sum: { points: data.filter((r) => matches(r, where)).reduce((s, r) => s + r.points, 0) },
      })),
      findMany: jest.fn(async ({ where }: any) => {
        const days = new Map<string, Date>();
        for (const r of data.filter((x) => matches(x, where))) days.set(r.day.toISOString(), r.day);
        return [...days.values()].map((day) => ({ day }));
      }),
      groupBy: jest.fn(async ({ where }: any) => {
        const sums = new Map<number, number>();
        for (const r of data.filter((x) => matches(x, where))) sums.set(r.studentId, (sums.get(r.studentId) ?? 0) + r.points);
        return [...sums].map(([studentId, points]) => ({ studentId, _sum: { points } }));
      }),
    },
    enrollment: {
      findFirst: jest.fn(async ({ where }: any) => (where.studentId === 55 ? { groupId: 'g-1' } : null)),
      findMany: jest.fn(async () => [{ studentId: 7 }, { studentId: 55 }]),
    },
    student: { findMany: jest.fn(async () => [7, 9, 55].map((id) => ({ id, firstName: `S${id}`, lastName: 'X' }))) },
    dafLexemeState: { count: jest.fn(async () => 0) },
  } as any;
}

/** The old formulas, straight from attempts. */
function eski(studentId: number) {
  const mine = U.filter((u) => u.studentId === studentId);
  const montag = wochenStartUtc(NOW);
  const haftaSum = (pred: (u: Urinish) => boolean) => {
    const m = new Map<number, number>();
    for (const u of U.filter((x) => x.createdAt >= montag && pred(x))) m.set(u.studentId, (m.get(u.studentId) ?? 0) + u.points);
    return m;
  };
  return {
    gesamt: mine.reduce((s, u) => s + u.points, 0),
    serie: serieAus(mine.map((u) => tashkentDateStr(u.createdAt)), tashkentDateStr(NOW)),
    wochePunkte: haftaSum(() => true).get(studentId) ?? 0,
    gruppeWoche: haftaSum((u) => u.groupId === 'g-1'),
  };
}

describe('day totals give the same numbers as the attempts', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it.each([7, 9, 55])('student %i: total, streak and this week', async (id) => {
    const f = await new FortschrittService(fakeDayPrisma()).uebersicht(id, 1);
    const e = eski(id);
    expect(f.gesamt).toBe(e.gesamt);
    expect(f.serie).toBe(e.serie);
    expect(f.wochePunkte).toBe(e.wochePunkte);
  });

  it('the Sunday 23:50 attempt stays in last week', async () => {
    const f = await new FortschrittService(fakeDayPrisma()).uebersicht(7, 1);
    expect(f.wochePunkte).toBe(20);
  });

  it('the group table counts only points earned in that group', async () => {
    const r = await new FortschrittService(fakeDayPrisma()).reyting(55, 1, 'gruppe');
    const e = eski(55).gruppeWoche;
    expect(r.find((z) => z.studentId === 55)!.punkte).toBe(e.get(55));
    expect(r.find((z) => z.studentId === 7)!.punkte).toBe(e.get(7));
  });

  it('the centre table ranks exactly like the old weekly sum', async () => {
    const r = await new FortschrittService(fakeDayPrisma()).reyting(55, 1, 'zentrum');
    expect(r.map((z) => [z.studentId, z.punkte])).toEqual([
      [55, 40],
      [9, 30],
      [7, 20],
    ]);
  });
});
```

- [ ] **Step 6: Testlar**

Run: `cd server && npx jest src/daf/fortschritt src/daf/uebung/punkte.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npx prettier --write src/daf/uebung/punkte.ts src/daf/uebung/punkte.spec.ts src/daf/fortschritt && npx eslint --quiet src/daf/fortschritt src/daf/uebung/punkte.ts && git add src/daf/uebung/punkte.ts src/daf/uebung/punkte.spec.ts src/daf/fortschritt && git commit -m "perf(daf): progress and weekly rankings read the day totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Seans oxiri natijasi serverdan

**Files:**
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts`
- Create: `server/src/daf/fortschritt/seans-natija.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts:184-205`
- Modify: `server/src/daf/daf-portal.controller.spec.ts`

**Interfaces:**
- Consumes: `serieFuer`, `zentrumHaftaligi`, `gruppeHaftaligi`, `saralaBarqaror`, `platziniTop` (Task 4, shu fayl).
- Produces:
  ```ts
  export interface SeansNatijasi {
    punkte: number;
    serie: number;
    serieYangi: boolean;
    orin: {
      gruppe: { oldin: number; hozir: number } | null;
      zentrum: { oldin: number; hozir: number };
    };
  }
  FortschrittService.seansNatijasi(sessionId: string, studentId: number, companyId: number): Promise<SeansNatijasi>
  FortschrittService.seansNatijasiXavfsiz(sessionId: string | undefined, studentId: number, companyId: number): Promise<SeansNatijasi | null>
  ```
  Kontroller javoblari: `POST lessons/:id/abschluss` → `AbschlussNatija & { natija: SeansNatijasi | null }`; `POST wiederholung/abschluss` → `{ questionCount, firstTryCorrect, natija }`.

- [ ] **Step 1: Yiqiladigan testlar** — `seans-natija.spec.ts`:

```ts
import { FortschrittService } from './fortschritt.service';

const NOW = new Date('2026-10-19T09:00:00Z'); // Monday 14:00 Tashkent

function fake(opts: {
  session: { points: number; createdAt: Date; groupId: string | null }[];
  todayAttempts: number;
  week: { studentId: number; points: number }[];
  groupWeek?: { studentId: number; points: number }[];
  groupId?: string | null;
}) {
  return {
    dafAttempt: { findMany: jest.fn(async () => opts.session) },
    dafStudentDay: {
      aggregate: jest.fn(async ({ _sum }: any) =>
        _sum.attempts ? { _sum: { attempts: opts.todayAttempts } } : { _sum: { points: 0 } },
      ),
      findMany: jest.fn(async () => [
        { day: new Date('2026-10-18T00:00:00.000Z') },
        { day: new Date('2026-10-19T00:00:00.000Z') },
      ]),
      groupBy: jest.fn(async ({ where }: any) =>
        (where.groupKey ? (opts.groupWeek ?? []) : opts.week).map((w) => ({
          studentId: w.studentId,
          _sum: { points: w.points },
        })),
      ),
    },
    enrollment: {
      findFirst: jest.fn(async () => (opts.groupId ? { groupId: opts.groupId } : null)),
      findMany: jest.fn(async () => (opts.groupWeek ?? []).map((w) => ({ studentId: w.studentId }))),
    },
  } as any;
}

describe('seansNatijasi', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it('points come from the session, the rank moves by this week’s share', async () => {
    const svc = new FortschrittService(
      fake({
        session: [
          { points: 30, createdAt: new Date('2026-10-19T08:50:00Z'), groupId: 'g-1' },
          { points: 20, createdAt: new Date('2026-10-19T08:55:00Z'), groupId: 'g-1' },
        ],
        todayAttempts: 2,
        week: [
          { studentId: 55, points: 70 }, // 20 before this session
          { studentId: 7, points: 40 },
        ],
        groupWeek: [
          { studentId: 55, points: 70 },
          { studentId: 7, points: 40 },
        ],
        groupId: 'g-1',
      }),
    );
    const n = await svc.seansNatijasi('s-1', 55, 1);
    expect(n.punkte).toBe(50);
    expect(n.orin.zentrum).toEqual({ oldin: 2, hozir: 1 });
    expect(n.orin.gruppe).toEqual({ oldin: 2, hozir: 1 });
    expect(n.serie).toBe(2);
    expect(n.serieYangi).toBe(true); // nothing else today
  });

  it('not the first practice today → serieYangi false', async () => {
    const svc = new FortschrittService(
      fake({
        session: [{ points: 10, createdAt: new Date('2026-10-19T08:50:00Z'), groupId: null }],
        todayAttempts: 5,
        week: [{ studentId: 55, points: 10 }],
      }),
    );
    const n = await svc.seansNatijasi('s-1', 55, 1);
    expect(n.serieYangi).toBe(false);
    expect(n.orin.gruppe).toBeNull();
  });

  it('a session that began last Sunday subtracts only this week’s points', async () => {
    const svc = new FortschrittService(
      fake({
        session: [
          // Sunday 23:55 Tashkent — last week.
          { points: 40, createdAt: new Date('2026-10-18T18:55:00Z'), groupId: null },
          // Monday 00:05 Tashkent — this week.
          { points: 10, createdAt: new Date('2026-10-18T19:05:00Z'), groupId: null },
        ],
        todayAttempts: 1,
        week: [
          { studentId: 55, points: 10 },
          { studentId: 7, points: 5 },
        ],
      }),
    );
    const n = await svc.seansNatijasi('s-1', 55, 1);
    expect(n.punkte).toBe(50);
    // Before: 55 had 0 this week, so 7 (5) was ahead.
    expect(n.orin.zentrum).toEqual({ oldin: 2, hozir: 1 });
  });

  it('seansNatijasiXavfsiz: no session id → null; a failure → null, not a throw', async () => {
    const svc = new FortschrittService(fake({ session: [], todayAttempts: 0, week: [] }));
    expect(await svc.seansNatijasiXavfsiz(undefined, 55, 1)).toBeNull();
    jest.spyOn(svc, 'seansNatijasi').mockRejectedValueOnce(new Error('db down'));
    expect(await svc.seansNatijasiXavfsiz('s-1', 55, 1)).toBeNull();
  });
});
```

Run: `cd server && npx jest src/daf/fortschritt/seans-natija.spec.ts` → FAIL (`seansNatijasi is not a function`).

- [ ] **Step 2: Servisga yozish** — `fortschritt.service.ts`:

Importlarga `Logger` (`import { Injectable, Logger } from '@nestjs/common';`) va `wochenStartUtc` (`from '../uebung/punkte'`). Klassga `private readonly logger = new Logger(FortschrittService.name);`. Interfeys (fayl tepasida, `ReytingZeile` dan keyin) — yuqoridagi `SeansNatijasi`. Fayl darajasidagi yordamchi:

```ts
/** The same list with one student's points lowered by `minus` (never below 0). */
function ayir(
  royxat: HaftalikYigindi[],
  studentId: number,
  minus: number,
): HaftalikYigindi[] {
  return royxat.map((s) =>
    s.studentId === studentId
      ? { studentId, _sum: { points: Math.max(0, ballOl(s) - minus) } }
      : s,
  );
}
```

Metodlar:

```ts
  /**
   * The session's result for the end screen (spec §5). "Before" = everyone
   * else as now, this student's week without this session's share of it.
   * Both ranks go through the same sort, so the two can be compared.
   */
  async seansNatijasi(
    sessionId: string,
    studentId: number,
    companyId: number,
  ): Promise<SeansNatijasi> {
    const jetzt = new Date();
    const heute = tashkentDateStr(jetzt);
    const montag = montagGte(jetzt);
    const montagUtc = wochenStartUtc(jetzt);

    const [urinishlar, bugun, groupId, serie, zentrum] = await Promise.all([
      this.prisma.dafAttempt.findMany({
        where: { sessionId, studentId },
        select: { points: true, createdAt: true, groupId: true },
      }),
      this.prisma.dafStudentDay.aggregate({
        where: { studentId, day: utcMidnightFromDateStr(heute) },
        _sum: { attempts: true },
      }),
      currentGroupId(this.prisma, studentId),
      this.serieFuer(studentId, heute),
      this.zentrumHaftaligi(studentId, companyId, montag),
    ]);

    const sum = (xs: { points: number }[]) =>
      xs.reduce((s, x) => s + x.points, 0);
    const shuHafta = urinishlar.filter((u) => u.createdAt >= montagUtc);
    const bugungi = urinishlar.filter(
      (u) => tashkentDateStr(u.createdAt) === heute,
    ).length;

    const zentrumOldin = saralaBarqaror(ayir(zentrum, studentId, sum(shuHafta)));

    let gruppe: SeansNatijasi['orin']['gruppe'] = null;
    if (groupId) {
      const { saralangan } = await this.gruppeHaftaligi(groupId, companyId, montag);
      if (saralangan.length > 0) {
        const minus = sum(shuHafta.filter((u) => u.groupId === groupId));
        gruppe = {
          oldin: platziniTop(saralaBarqaror(ayir(saralangan, studentId, minus)), studentId),
          hozir: platziniTop(saralangan, studentId),
        };
      }
    }

    return {
      punkte: sum(urinishlar),
      serie,
      serieYangi: bugungi > 0 && (bugun._sum.attempts ?? 0) === bugungi,
      orin: {
        gruppe,
        zentrum: {
          oldin: platziniTop(zentrumOldin, studentId),
          hozir: platziniTop(zentrum, studentId),
        },
      },
    };
  }

  /**
   * The end screen's figures are decoration: the lesson is already saved
   * when this runs, so a failure here must not turn the answer into an
   * error (the client would say «Natija saqlanmadi»).
   */
  async seansNatijasiXavfsiz(
    sessionId: string | undefined,
    studentId: number,
    companyId: number,
  ): Promise<SeansNatijasi | null> {
    if (!sessionId) return null;
    try {
      return await this.seansNatijasi(sessionId, studentId, companyId);
    } catch (err) {
      this.logger.warn(
        `Seans natijasi hisoblanmadi (sessionId=${sessionId}, studentId=${studentId}): ${(err as Error).message}`,
      );
      return null;
    }
  }
```

Run: `cd server && npx jest src/daf/fortschritt` → PASS.

- [ ] **Step 3: Kontroller testi** — `daf-portal.controller.spec.ts` oxiriga:

```ts
describe('DafPortalController — seans yakuni natija bilan', () => {
  const natija = {
    punkte: 50,
    serie: 3,
    serieYangi: true,
    orin: { gruppe: null, zentrum: { oldin: 4, hozir: 2 } },
  };

  function make() {
    const uebung = {
      abschluss: jest.fn(async () => ({ bestScore: 9, runs: 1 })),
      wiederholungAbschluss: jest.fn(async () => ({ questionCount: 12, firstTryCorrect: 10 })),
    };
    const fortschritt = { seansNatijasiXavfsiz: jest.fn(async () => natija) };
    const controller = new DafPortalController(
      {} as any,
      {} as any,
      {} as any,
      uebung as any,
      fortschritt as any,
    );
    return { controller, uebung, fortschritt };
  }

  it('lesson end adds natija, studentId from the token', async () => {
    const { controller, fortschritt } = make();
    const r = await controller.postAbschluss(
      5,
      { richtig: 9, gesamt: 12, sessionId: 's-1' } as any,
      55,
      1,
    );
    expect(r).toEqual({ bestScore: 9, runs: 1, natija });
    expect(fortschritt.seansNatijasiXavfsiz).toHaveBeenCalledWith('s-1', 55, 1);
  });

  it('review end adds natija', async () => {
    const { controller } = make();
    const r = await controller.postWiederholungAbschluss({ sessionId: 's-2' } as any, 55, 1);
    expect(r).toEqual({ questionCount: 12, firstTryCorrect: 10, natija });
  });

  it('natija is computed after the lesson is saved', async () => {
    const { controller, uebung, fortschritt } = make();
    const order: string[] = [];
    uebung.abschluss.mockImplementation(async () => {
      order.push('abschluss');
      return { bestScore: 9, runs: 1 };
    });
    fortschritt.seansNatijasiXavfsiz.mockImplementation(async () => {
      order.push('natija');
      return natija;
    });
    await controller.postAbschluss(5, { richtig: 9, gesamt: 12, sessionId: 's-1' } as any, 55, 1);
    expect(order).toEqual(['abschluss', 'natija']);
  });
});
```

Run: `cd server && npx jest src/daf/daf-portal.controller.spec.ts` → FAIL (`natija` yo'q).

- [ ] **Step 4: Kontrollerni o'zgartirish** — `daf-portal.controller.ts`:

```ts
  @Post('lessons/:id/abschluss')
  async postAbschluss(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AbschlussDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    const ergebnis = await this.uebung.abschluss(id, dto, { studentId, companyId });
    // After the save: the figures read what this session just wrote.
    const natija = await this.fortschritt.seansNatijasiXavfsiz(
      dto.sessionId,
      studentId,
      companyId,
    );
    return { ...ergebnis, natija };
  }

  @Post('wiederholung/abschluss')
  async postWiederholungAbschluss(
    @Body() dto: WiederholungAbschlussDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    const yakun = await this.uebung.wiederholungAbschluss(dto, { studentId, companyId });
    const natija = await this.fortschritt.seansNatijasiXavfsiz(
      dto.sessionId,
      studentId,
      companyId,
    );
    return { ...yakun, natija };
  }
```

(Mavjud JSDoc izohlar qoladi.)

- [ ] **Step 5: Testlar va typecheck**

Run: `cd server && npx jest src/daf && npm run typecheck`
Expected: PASS, 0 xato. `daf-portal.student-card.e2e.spec.ts` (tokensiz → 404, Prisma chaqiruvi 0) o'zgarmay o'tadi.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npx prettier --write src/daf/fortschritt src/daf/daf-portal.controller.ts src/daf/daf-portal.controller.spec.ts && npx eslint --quiet src/daf && git add src/daf && git commit -m "feat(daf): session end returns points, streak and rank before/after

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ilova — natija serverdan, surat mexanizmi o'chadi

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts:122-127, 342-345`
- Modify: `client/src/components/student-portal/lernen/uebung/natija-xabari.ts`, `natija-xabari.test.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`
- Modify: `client/src/components/student-portal/lernen/queries.ts:263-268`
- Delete: `client/src/components/student-portal/lernen/uebung/seans-boshlangich.ts`, `seans-boshlangich.test.ts`

**Interfaces:**
- Consumes: server javobidagi `natija: SeansNatijasi | null` (Task 5).
- Produces: `natijaQatorlari(n: SeansNatijasi | null | undefined): { ball: number | null; serie: number | null; orin: string | null }`; `orinXabari(oldin, keyin, joy?: "Guruhda" | "Markazda")`.

- [ ] **Step 1: Tiplar** — `types.ts`, `AbschlussErgebnis` dan oldin:

```ts
/** Seans oxiri — server hisoblagan ball, seriya va o'rin (oldin/hozir). */
export interface SeansNatijasi {
  punkte: number;
  serie: number;
  /** Bugungi birinchi mashq — seriya qatori faqat shunda ko'rinadi. */
  serieYangi: boolean;
  orin: {
    gruppe: { oldin: number; hozir: number } | null;
    zentrum: { oldin: number; hozir: number };
  };
}
```

`AbschlussErgebnis` ga `natija?: SeansNatijasi | null;`, `SeansYakun` ga ham `natija?: SeansNatijasi | null;` (ixtiyoriy — eski server javobi ham o'qiladi).

- [ ] **Step 2: Yiqiladigan test** — `natija-xabari.test.ts` oxiriga (import qatoriga `natijaQatorlari` qo'shiladi):

```ts
describe("natijaQatorlari", () => {
  const base = {
    punkte: 50,
    serie: 4,
    serieYangi: true,
    orin: { gruppe: { oldin: 3, hozir: 1 }, zentrum: { oldin: 9, hozir: 7 } },
  };

  it("no answer from the server draws nothing", () => {
    expect(natijaQatorlari(null)).toEqual({ ball: null, serie: null, orin: null });
  });

  it("points, the streak on the first practice of the day, the group rank", () => {
    expect(natijaQatorlari(base)).toEqual({
      ball: 50,
      serie: 4,
      orin: "Guruhda 1-o'rin — 2 pog'ona ko'tarildingiz",
    });
  });

  it("0 points and a later session show neither line", () => {
    const r = natijaQatorlari({ ...base, punkte: 0, serieYangi: false });
    expect(r.ball).toBeNull();
    expect(r.serie).toBeNull();
  });

  it("an unchanged rank is not repeated", () => {
    const r = natijaQatorlari({ ...base, orin: { gruppe: { oldin: 2, hozir: 2 }, zentrum: { oldin: 5, hozir: 5 } } });
    expect(r.orin).toBeNull();
  });

  it("no group: the centre rank speaks", () => {
    const r = natijaQatorlari({ ...base, orin: { gruppe: null, zentrum: { oldin: 9, hozir: 12 } } });
    expect(r.orin).toBe("Markazda 12-o'rin — 3 pog'ona tushdingiz");
  });
});
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/natija-xabari.test.ts` → FAIL.

- [ ] **Step 3: `natija-xabari.ts`** — `orinXabari` imzosini kengaytirish (standart `"Guruhda"`, mavjud chaqiruvlar o'zgarmaydi):

```ts
export function orinXabari(
  oldin: number | null,
  keyin: number | null,
  joy: "Guruhda" | "Markazda" = "Guruhda",
): string | null {
  if (keyin == null) return null;
  if (oldin == null) return `${joy} ${keyin}-o'rin`;
  if (oldin === keyin) return null;
  const farq = Math.abs(oldin - keyin);
  const yonalish = keyin < oldin ? "ko'tarildingiz" : "tushdingiz";
  return `${joy} ${keyin}-o'rin — ${farq} pog'ona ${yonalish}`;
}

/**
 * The end screen's three lines, straight from the server's `natija`
 * (spec §5): points only when above 0, the streak only on the day's
 * first practice, a rank only when it moved. The group speaks first;
 * a student with no group gets the centre.
 */
export function natijaQatorlari(n: SeansNatijasi | null | undefined): {
  ball: number | null;
  serie: number | null;
  orin: string | null;
} {
  if (!n) return { ball: null, serie: null, orin: null };
  const orin = n.orin.gruppe
    ? orinXabari(n.orin.gruppe.oldin, n.orin.gruppe.hozir)
    : orinXabari(n.orin.zentrum.oldin, n.orin.zentrum.hozir, "Markazda");
  return {
    ball: n.punkte > 0 ? n.punkte : null,
    serie: n.serieYangi ? n.serie : null,
    orin,
  };
}
```

(`import type { SeansNatijasi } from "../types";` fayl tepasiga.) Run → PASS.

- [ ] **Step 4: `natija-ekrani.tsx`**:
  - `NatijaEkraniProps` dan `gesamtBoshida`, `serieBoshida`, `orinBoshida` va ularning izohini olib tashlab, o'rniga:
    ```ts
      /** Server javobidagi seans natijasi; yo'q bo'lsa yutuqlar kartasi chizilmaydi. */
      natija: SeansNatijasi | null;
    ```
  - importlar: `useFortschritt` va `orinXabari` olib tashlanadi; `natijaQatorlari` va `type SeansNatijasi` qo'shiladi.
  - komponent ichida `const fortschritt = useFortschritt();` dan `const yutuqlarBormi = …` gacha bo'lgan blok o'rniga:
    ```tsx
      const qator = natijaQatorlari(natija);
      const sanaladiganBall = useSanaladiganBall(qator.ball);
      const yutuqlarBormi = qator.ball != null || qator.serie != null || qator.orin != null;
    ```
  - JSX: `ballKorsatilsinmi && sanaladiganBall != null` → `qator.ball != null && sanaladiganBall != null`; `serieOshdimi` → `qator.serie != null`, `value={`${qator.serie} kun`}`; `orinXabariMatni` → `qator.orin`.
  - Komponent ustidagi JSDoc'ning "Ball, seriya va o'rin ham xuddi shunday…" xatboshisini: "Ball, seriya va o'rinni server `natija` sifatida qaytaradi — bu ekran faqat ko'rsatadi (spec 2026-10-18 §5)." ga almashtirish.

- [ ] **Step 5: `seans-ekrani.tsx`**:
  - importlardan `useFortschritt`, `fortschrittSurati`, `keyingiBoshlangichSurati`, `type FortschrittSurati` (va `./seans-boshlangich` importi butunlay) olib tashlanadi;
  - `const fortschritt = useFortschritt();` (128-qator) o'chadi;
  - `boshlangichFortschritt` ref (180–183) va uning izohi o'chadi;
  - boshlash effekti (185–213) quyidagiga:
    ```tsx
      // The session starts once, when the questions arrive.
      const boshlandiMi = React.useRef(false);
      React.useEffect(() => {
        if (boshlandiMi.current) return;
        if (!seans.data || seans.data.length === 0) return;
        boshlandiMi.current = true;
        setHolat(boshla(seans.data));
      }, [seans.data]);
    ```
  - tugash effektidan `void fortschritt.refetch();` va uning izohi (479–485) o'chadi; pastdagi eslint-izoh ro'yxatidan `fortschritt` bandi o'chadi;
  - `qaytaOtish`:
    ```tsx
      const qaytaOtish = async () => {
        const { data } = await seans.refetch();
        if (!data) return;
        yozildi.current = false;
        // The previous run's result must not leak into the new end screen.
        abschluss.reset();
        wiederholungAbschluss.reset();
        tugashDavomiyligi.current = null;
        setHolat(boshla(data));
        … (setNatija(null) dan setSeansBoshi gacha o'zgarmaydi)
      };
    ```
    va uning ustidagi "fortschritt ham XUDDI SHUNDAY…" bilan boshlanuvchi izoh bloki qisqaradi: "Qayta o'tishda seans YANGI so'rov bilan yangilanadi — Leitner orqali qaytgan so'zlar birinchi safargidan farq qilishi mumkin." ;
  - `<NatijaEkrani …>` dan `gesamtBoshida`, `serieBoshida`, `orinBoshida` o'rniga:
    ```tsx
            natija={
              (darsMi ? abschluss.data?.natija : wiederholungAbschluss.data?.natija) ?? null
            }
    ```

- [ ] **Step 6: Takrorlash yakunida keshni yangilash** — `queries.ts`:

```ts
export function useWiederholungAbschluss() {
  const qc = useQueryClient();
  return useMutation<SeansYakun, unknown, { sessionId: string }>({
    mutationFn: (body) =>
      api.post(`${BASE}/wiederholung/abschluss`, body).then((r) => r.data),
    // The path's chips must show the new total when the student goes back.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lernen", "fortschritt"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
    },
  });
}
```

(ustidagi izohdagi "`fortschritt` ni `seans-ekrani` o'zi yangilaydi" jumlasi "ilgarilash chiplari shu yerda yangilanadi" ga almashtiriladi.)

- [ ] **Step 7: Surat modulini o'chirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1 && git rm client/src/components/student-portal/lernen/uebung/seans-boshlangich.ts client/src/components/student-portal/lernen/uebung/seans-boshlangich.test.ts && grep -rn "seans-boshlangich\|gesamtBoshida\|serieBoshida\|orinBoshida" client/src || echo "toza"
```

Expected: `toza`.

- [ ] **Step 8: Tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/client && npx tsc --noEmit -p . && npx vitest run src/components/student-portal && npx eslint src/components/student-portal/lernen
```

Expected: tsc 0 xato, vitest PASS, eslint 0 error.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1 && git add -A client/src/components/student-portal/lernen && git commit -m "feat(lernen): end screen shows the server's natija; snapshot diff removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Audit va qayta qurish skriptlari

**Files:**
- Create: `server/scripts/lib/daf-student-day-sql.ts`
- Create: `server/scripts/audit-daf-student-day.ts`
- Create: `server/scripts/rebuild-daf-student-day.ts`
- Modify: `server/src/daf/daf-schema.spec.ts`

**Interfaces:**
- Produces:
  - `DIFF_SQL: Prisma.Sql` — farqli qatorlar (`studentId, day, groupKey, expectedPoints, actualPoints, expectedAttempts, actualAttempts`)
  - `REBUILD_SQL: Prisma.Sql` — `INSERT … SELECT` (migratsiyadagi bilan bir xil)

- [ ] **Step 1: SQL manbai** — `scripts/lib/daf-student-day-sql.ts`:

```ts
import { Prisma } from '@prisma/client';

/**
 * Expected day totals, built from DafAttempt by the same rule as
 * `kunlikKalit` (src/daf/shared/attempt-writer.ts): the Tashkent day of
 * "createdAt" (+5 h, no DST) and the sealed group ("" for none).
 * The migration 20261018200000_daf_student_day carries a copy of the
 * INSERT; keep the two the same.
 */
const EXPECTED = Prisma.sql`
  SELECT "studentId", "companyId",
         ("createdAt" + interval '5 hours')::date AS day,
         COALESCE("groupId", '') AS "groupKey",
         COALESCE(SUM("points"), 0)::int AS points,
         COUNT(*)::int AS attempts
  FROM "DafAttempt"
  GROUP BY 1, 2, 3, 4`;

export const DIFF_SQL = Prisma.sql`
  WITH e AS (${EXPECTED})
  SELECT COALESCE(e."studentId", d."studentId") AS "studentId",
         to_char(COALESCE(e.day, d.day), 'YYYY-MM-DD') AS day,
         COALESCE(e."groupKey", d."groupKey") AS "groupKey",
         e.points AS "expectedPoints", d.points AS "actualPoints",
         e.attempts AS "expectedAttempts", d.attempts AS "actualAttempts"
  FROM e
  FULL OUTER JOIN "DafStudentDay" d
    ON d."studentId" = e."studentId" AND d.day = e.day AND d."groupKey" = e."groupKey"
  WHERE e.points IS DISTINCT FROM d.points
     OR e.attempts IS DISTINCT FROM d.attempts
     OR e."companyId" IS DISTINCT FROM d."companyId"
  ORDER BY 1, 2, 3
  LIMIT 1000`;

export const REBUILD_SQL = Prisma.sql`
  INSERT INTO "DafStudentDay" ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
  SELECT "studentId", "companyId", day, "groupKey", points, attempts, now()
  FROM (${EXPECTED}) e`;
```

- [ ] **Step 2: Audit** — `scripts/audit-daf-student-day.ts`:

```ts
/**
 * READ-ONLY. Compares DafStudentDay with the totals rebuilt from DafAttempt
 * (ADR-0114). Exits 1 on any difference.
 *
 *   railway run --service caring-courage --environment production npx ts-node --transpile-only scripts/audit-daf-student-day.ts
 */
import { run, dbEnvLabel } from './lib/check-cli';
import { DIFF_SQL } from './lib/daf-student-day-sql';

run(async (prisma) => {
  console.log('DB:', dbEnvLabel());
  const rows = await prisma.$queryRaw<
    {
      studentId: number;
      day: string;
      groupKey: string;
      expectedPoints: number | null;
      actualPoints: number | null;
      expectedAttempts: number | null;
      actualAttempts: number | null;
    }[]
  >(DIFF_SQL);
  if (rows.length === 0) {
    console.log('Farq 0 — kunlik jadval urinishlar bilan mos.');
    return;
  }
  console.table(rows.slice(0, 50));
  console.error(`Farq: ${rows.length} qator (eng ko'pi 1000 ko'rsatiladi).`);
  process.exitCode = 1;
});
```

(`run` Prisma klientini o'zi ochadi va yopadi — `scripts/lib/check-cli.ts:99`.)

- [ ] **Step 3: Qayta qurish** — `scripts/rebuild-daf-student-day.ts`:

```ts
/**
 * Rebuilds DafStudentDay from DafAttempt (ADR-0114). Dry run by default
 * (prints the difference); --apply replaces the table in one transaction.
 *
 * The table is locked first (EXCLUSIVE): a concurrent recordAttempt waits
 * for the rebuild to commit and then adds its own increment, so no answer
 * is lost or counted twice. Run it after anything deletes or rewrites
 * DafAttempt rows, or after the points formula changes.
 */
import { run, dbEnvLabel } from './lib/check-cli';
import { DIFF_SQL, REBUILD_SQL } from './lib/daf-student-day-sql';
import { Prisma } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

run(async (prisma) => {
  console.log('DB:', dbEnvLabel(), APPLY ? '(APPLY)' : '(dry run)');
  const before = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log(`Farq oldin: ${before.length} qator`);
  if (!APPLY) return;
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE "DafStudentDay" IN EXCLUSIVE MODE`;
      await tx.$executeRaw`DELETE FROM "DafStudentDay"`;
      await tx.$executeRaw(REBUILD_SQL);
    },
    { timeout: 120_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
  const after = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log(`Farq keyin: ${after.length} qator`);
  if (after.length > 0) process.exitCode = 1;
});
```

- [ ] **Step 4: Sinov bazasida ishga tushirish**

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/audit-daf-student-day.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/rebuild-daf-student-day.ts --apply
```

Expected: ikkalasi `Farq … 0`. (Bo'sh bazada ham 0 — haqiqiy sinov Task 8 da 1 mln urinish bilan.)

- [ ] **Step 5: Sxema testiga "qayta qurish mavjud" sharti** — `daf-schema.spec.ts` dagi `DafStudentDay is derived…` testi oxiriga:

```ts
    // The table is derived only while it can be rebuilt (ADR-0114).
    expect(
      existsSync(join(__dirname, '..', '..', 'scripts', 'rebuild-daf-student-day.ts')),
    ).toBe(true);
```

va fayl boshidagi importni `import { existsSync, readFileSync } from 'fs';` ga almashtirish.

- [ ] **Step 6: Sxema va qorovul testlari**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts src/daf/shared`
Expected: PASS (rebuild skripti bor; uning va `daf-student-day-sql.ts` dagi `DafStudentDay` yozuvlari ruxsat etilgan).

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npx prettier --write scripts/lib/daf-student-day-sql.ts scripts/audit-daf-student-day.ts scripts/rebuild-daf-student-day.ts src/daf/daf-schema.spec.ts && git add scripts/lib/daf-student-day-sql.ts scripts/audit-daf-student-day.ts scripts/rebuild-daf-student-day.ts src/daf/daf-schema.spec.ts && git commit -m "feat(daf): audit and rebuild scripts for the day totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Yuklama sinovi (5 000 o'quvchi, 50 parallel)

**Files:**
- Create: `server/scripts/load/local-db-guard.ts`
- Create: `server/scripts/load/daf-yuklama-seed.ts`
- Create: `server/scripts/load/daf-yuklama-olchov.ts`
- Modify: `docs/superpowers/specs/2026-10-18-musobaqa-s1-poydevor-design.md` §10

**Interfaces:**
- Consumes: `FortschrittService` (Task 4–5), `recordAttempt` (Task 2), `REBUILD_SQL`/`DIFF_SQL` (Task 7).
- Produces: `assertLocalDb(): void` — `DATABASE_URL` host `127.0.0.1`/`localhost` bo'lmasa `throw`.

- [ ] **Step 1: Qorovul** — `scripts/load/local-db-guard.ts`:

```ts
/** Load scripts write a million rows: they refuse any database but a local one. */
export function assertLocalDb(): void {
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://none').hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Faqat lokal baza (hozir: ${host}). To'xtatildi.`);
  }
}
```

- [ ] **Step 2: Seed** — `scripts/load/daf-yuklama-seed.ts`:

```ts
/**
 * LOCAL ONLY. Fills a throwaway DB for the S1 load test: 5 000 students,
 * ~1 M attempts this week + ~300 k over the last 90 days, then rebuilds the
 * day totals and checks them (spec §6).
 */
import { run } from '../lib/check-cli';
import { REBUILD_SQL, DIFF_SQL } from '../lib/daf-student-day-sql';
import { assertLocalDb } from './local-db-guard';

assertLocalDb();

run(async (prisma) => {
  await prisma.$executeRaw`DELETE FROM "DafStudentDay"`;
  await prisma.$executeRaw`DELETE FROM "DafAttempt"`;
  const week = await prisma.$executeRaw`
    INSERT INTO "DafAttempt" ("studentId", "companyId", "groupId", "isCorrect", "given", "points", "createdAt")
    SELECT s.id, s."companyId", e."groupId", true, '"x"'::jsonb,
           CASE WHEN random() < 0.5 THEN 10 ELSE 0 END,
           w.monday + random() * (w.utc_now - w.monday)
    FROM (SELECT id, "companyId" FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 5000) s
    LEFT JOIN LATERAL (
      SELECT "groupId" FROM "Enrollment"
      WHERE "studentId" = s.id AND status = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1
    ) e ON true
    CROSS JOIN generate_series(1, 200)
    CROSS JOIN (
      -- "createdAt" is UTC without a time zone: say UTC explicitly.
      SELECT (now() AT TIME ZONE 'UTC') AS utc_now,
             date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours') - interval '5 hours' AS monday
    ) w`;
  const history = await prisma.$executeRaw`
    INSERT INTO "DafAttempt" ("studentId", "companyId", "groupId", "isCorrect", "given", "points", "createdAt")
    SELECT s.id, s."companyId", NULL, true, '"x"'::jsonb, 10, (now() AT TIME ZONE 'UTC') - random() * interval '90 days'
    FROM (SELECT id, "companyId" FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 5000) s
    CROSS JOIN generate_series(1, 60)`;
  await prisma.$executeRaw(REBUILD_SQL);
  await prisma.$executeRaw`ANALYZE "DafAttempt"`;
  await prisma.$executeRaw`ANALYZE "DafStudentDay"`;
  const diff = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log({ week, history, diff: diff.length });
  if (diff.length > 0) process.exitCode = 1;
});
```

- [ ] **Step 3: O'lchov** — `scripts/load/daf-yuklama-olchov.ts`:

```ts
/**
 * LOCAL ONLY. p50 / p95 of the S1 reads and the writer, 50 students at once,
 * 10 rounds (spec §6). Exits 1 when a p95 limit is crossed.
 */
import { randomUUID } from 'crypto';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { FortschrittService } from '../../src/daf/fortschritt/fortschritt.service';
import { recordAttempt } from '../../src/daf/shared/attempt-writer';

assertLocalDb();

const PARALLEL = 50;
const ROUNDS = 10;
const LIMIT: Record<string, number> = {
  fortschritt: 200,
  'reyting zentrum': 200,
  'reyting gruppe': 200,
  recordAttempt: 200,
  seansNatijasi: 300,
};

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

run(async (prisma) => {
  const svc = new FortschrittService(prisma as any);
  const students = await prisma.$queryRaw<{ id: number; companyId: number; groupId: string | null }[]>`
    SELECT s.id, s."companyId",
           (SELECT "groupId" FROM "Enrollment" e WHERE e."studentId" = s.id AND e.status = 'ACTIVE'
            ORDER BY e."createdAt" DESC LIMIT 1) AS "groupId"
    FROM "Student" s WHERE s."deletedAt" IS NULL ORDER BY random() LIMIT ${PARALLEL}`;

  const samples: Record<string, number[]> = Object.fromEntries(Object.keys(LIMIT).map((k) => [k, []]));
  for (let round = 0; round < ROUNDS; round += 1) {
    const sessionId = randomUUID();
    for (const [name, op] of [
      ['fortschritt', (s: (typeof students)[0]) => svc.uebersicht(s.id, s.companyId)],
      ['reyting zentrum', (s: (typeof students)[0]) => svc.reyting(s.id, s.companyId, 'zentrum')],
      ['reyting gruppe', (s: (typeof students)[0]) => svc.reyting(s.id, s.companyId, 'gruppe')],
      [
        'recordAttempt',
        (s: (typeof students)[0]) =>
          recordAttempt(prisma as any, {
            studentId: s.id,
            companyId: s.companyId,
            groupId: s.groupId,
            isCorrect: true,
            given: 'x',
            points: 10,
            sessionId,
          }),
      ],
      ['seansNatijasi', (s: (typeof students)[0]) => svc.seansNatijasi(sessionId, s.id, s.companyId)],
    ] as const) {
      const ms = await Promise.all(students.map((s) => timed(() => op(s))));
      samples[name].push(...ms);
    }
  }

  const table = Object.entries(samples).map(([name, xs]) => ({
    name,
    p50: Math.round(pct(xs, 50)),
    p95: Math.round(pct(xs, 95)),
    limit: LIMIT[name],
    ok: pct(xs, 95) < LIMIT[name],
  }));
  console.table(table);

  const plan = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
    EXPLAIN ANALYZE SELECT "studentId", SUM(points) FROM "DafStudentDay"
    WHERE "companyId" = ${students[0].companyId}
      AND day >= (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date
    GROUP BY 1`;
  console.log(plan.map((r) => r['QUERY PLAN']).join('\n'));

  if (table.some((r) => !r.ok)) process.exitCode = 1;
});
```

- [ ] **Step 4: Sinov bazasini to'ldirish** (Task 1 Step 6 dagi `daf_s1_yuklama`)

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only prisma/seed.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-seed.ts
```

Expected: seed — 6 000 o'quvchi (xotira); yuklama seed — `week ≈ 1 000 000`, `history ≈ 300 000`, `diff: 0`. **Ogohlantirish:** `prisma/seed.ts` o'zi olgan bazaning HAMMA jadvalini o'chiradi — `DATABASE_URL` aniq `$S1_DB` bo'lishi va `server/.env` bo'lmasligi shart (worktree'da yo'q).

- [ ] **Step 5: O'lchov**

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-olchov.ts
```

Expected: har qatorda `ok: true`; EXPLAIN'da `Index … DafStudentDay_companyId_day_idx` (yoki Bitmap Index Scan), `Seq Scan on "DafAttempt"` YO'Q. Biror `ok: false` bo'lsa — Step 6 ga o'tilmaydi: sekin so'rovning EXPLAIN'ini olib, indeks yoki so'rovni tuzatish, Task 4/5 testlarini qayta yurgizish, o'lchovni takrorlash.

- [ ] **Step 6: Natijalarni spec'ga yozish** — `2026-10-18-musobaqa-s1-poydevor-design.md` §10 dagi `_(Bajarish paytida to'ldiriladi…)_` qatorini o'lchov jadvali (nom, p50, p95, chegara) va EXPLAIN xulosasi (qaysi indeks, necha ms) bilan almashtirish.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1 && npx --prefix server prettier --write server/scripts/load && git add server/scripts/load docs/superpowers/specs/2026-10-18-musobaqa-s1-poydevor-design.md && git commit -m "test(daf): load test for 5 000 students, results in the spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ADR, CLAUDE.md, to'liq tekshiruv

**Files:**
- Create: `docs/adr/0114-daf-kunlik-yigindi-hosila-jadval.md`
- Modify: `docs/adr/README.md` (indeks)
- Modify: `server/CLAUDE.md` (DaF bo'limi; agar yo'q bo'lsa «Lesson ratings» bo'limidan oldin yangi `### DaF progress (src/daf/)`)

- [ ] **Step 1: ADR raqamini tekshirish** — `ls docs/adr | sort | tail -3`. 0111 band bo'lsa, keyingi bo'sh raqam olinadi va shu vazifadagi hamma havola almashtiriladi.

- [ ] **Step 2: ADR yozish** — mavjud ADR shaklida (sarlavha, Holat: Qabul qilindi, Sana, Kontekst, Qaror, Oqibatlar). Mazmuni:
  - Kontekst: `fortschritt` butun tarixni o'qirdi; reyting har so'rovda markazning haftalik urinishlarini yig'ardi; reklamadan keyin 1 000–5 000 o'quvchi; S2–S4 xuddi shu yig'indilarni so'raydi.
  - Qaror: `DafStudentDay` — hosila; asl yozuv `DafAttempt` (ball ham); bitta yozuvchi `recordAttempt` (qorovul test); `groupKey ''`; formula o'zgarsa yoki urinish o'chirilsa `rebuild-daf-student-day.ts --apply`; audit skripti.
  - 06.09 dizaynidagi "progress jadvali ataylab yo'q" qoidasi bilan munosabat: holat sifatida ball saqlanmaydi — yig'indi har doim urinishlardan qayta quriladi.
  - Oqibatlar: yuklama raqamlari (spec §10); `daf-schema.spec.ts` qorovuli; prod'da deploydan keyin audit bir marta.

- [ ] **Step 3: README indeksiga qator** — mavjud qatorlar shaklida.

- [ ] **Step 4: `server/CLAUDE.md`** — inglizcha, 4–6 band:

```markdown
### DaF progress (`src/daf/`, ADR-0114)

- **Every attempt goes through `recordAttempt`** (`daf/shared/attempt-writer.ts`): the `DafAttempt` row and its `DafStudentDay` day total (`+points`, `+1 attempt`, Postgres `ON CONFLICT … DO UPDATE`) commit in one transaction. `attempt-writer.single-source.spec.ts` fails on any other write of either table.
- **`DafStudentDay` is derived** (student × Tashkent day × `groupKey`, `''` for no group, never NULL). `DafAttempt` stays the source of truth, points included. After anything deletes or rewrites attempts, or after the points formula changes, run `scripts/rebuild-daf-student-day.ts --apply`; `scripts/audit-daf-student-day.ts` (read-only) must then report 0.
- **`FortschrittService` reads only `DafStudentDay`** for total, streak and both weekly rankings; the ranking rules of the 06.09 design are unchanged.
- **The session end answers with `natija`** (`seansNatijasiXavfsiz`): points of the session, streak, `serieYangi`, rank before/after for group and centre. A failure there returns `null` and never fails the save.
```

- [ ] **Step 5: To'liq tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/server && npm run typecheck && npm run build && npm test
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1/client && npx tsc --noEmit -p . && npx vitest run && npx eslint src --quiet && npx next build
```

Expected: hammasi yashil. `build` va `test` parallel emas (xotira `build∥test`). Yiqilsa — sababini tuzatib, faqat yiqilgan buyruqni qayta yurgizish.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s1 && git add docs/adr server/CLAUDE.md && git commit -m "docs(adr): ADR-0111 DaF day totals are a derived table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Brauzer tekshiruvi (spec §7)

**Files:** kod o'zgarmaydi (topilgan xato bo'lsa — o'z tuzatish kommiti bilan).

- [ ] **Step 1: Sinov bazasiga DaF kontentini qo'yish** — `daf_s1_yuklama` da kontent yo'q bo'lsa: `cd server && DATABASE_URL="$S1_DB" npm run daf:inhalt-seed` (skript nima o'chirishini avval o'qib chiqing). Yuklama urinishlarini tozalash: `DELETE FROM "DafAttempt"` + rebuild `--apply` (haqiqiy seanslar uchun toza holat).

- [ ] **Step 2: Backend va ilovani ko'tarish** — xotira `reference_throwaway_local_db` retsepti bo'yicha: alohida Redis, `CRONS_ENABLED=false`, bo'sh Telegram tokenlari, `PORT` band bo'lmagan, client `127.0.0.1:<port>` da. O'quvchi bilan kirish: seed paroli `123456` (`prisma/seed.ts` 23-qator), o'quvchi raqami bazadan.

- [ ] **Step 3: Ro'yxatni o'tish** (built-in brauzer, 390×844 va desktop):
  1. 390px yo'l: zigzag, unit sarlavhalari, tepadagi 4 belgi — skrinshot.
  2. Dushanba holati: tepadagi o'rin chipi va «Markaz» tabi bir xil o'rin (bir urinishdan keyin ham) — skrinshot.
  3. Takrorlash ketma-ket 2 marta: ikkinchisida «bugun takrorlanadigan so'z yo'q».
  4. Bo'limlari tugagan, yakuniy sinovi tugamagan unit — yo'lda to'g'ri holat.
  5. Qorong'i rejim: yo'l, seans, natija, reyting — skrinshotlar.
  6. Yangi seans oxiri: «+N ball», seriya (kunning birinchi seansida), o'rin o'zgarishi — skrinshot; ikkinchi seansda seriya qatori YO'Q.
- [ ] **Step 4: iOS klaviatura** — `mcp__Claude_Code_iOS_Simulator__control` `attach`, Safari'da `http://<mac-ip>:<port>/portal/lernen`, `Yozish` savoli: pastdagi tugma klaviatura ustida ko'rinadi — skrinshot.
- [ ] **Step 5: Natijani CEO'ga yuborish** — skrinshotlarni `SendUserFile` bilan, har biriga bir qatorli izoh. Topilgan xato → alohida tuzatish (TDD), shu bosqichda.
- [ ] **Step 6: Tozalash** — `dropdb daf_s1_yuklama`, Redis konteynerini o'chirish, backend/client jarayonlarini to'xtatish.

---

## Spec qamrovi (o'z-o'zini tekshirish)

| Spec bo'limi | Vazifa |
| --- | --- |
| §2 jadval, NULL emas, boshlang'ich to'ldirish | 1 |
| §3 bitta yozuvchi, ON CONFLICT, qorovul | 2, 3 |
| §4 o'quvchilar, moslik testi | 4 |
| §5 `natija`, mijoz faqat ko'rsatadi, surat o'chadi | 5, 6 |
| §6 yuklama, EXPLAIN, §10 natijalar | 8 |
| §7 brauzer, iOS Simulator, skrinshotlar | 10 |
| §8 ADR, server/CLAUDE.md | 9 |
| §9 audit, rebuild, testlar | 2, 4, 5, 6, 7 |
| Prod'dan keyin audit | deploy paytida (PR tavsifida yoziladi) |
