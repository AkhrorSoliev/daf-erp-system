# Avtomatik pauza — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ketma-ket 3 ta sababsiz dars qoldirgan o'quvchini tizim har kuni ertalab o'zi muzlatsin (pauza), 2-darsda esa ogohlantirish yuborilsin — shunda ketgan o'quvchiga qarz yozilishi va markazning ustoz oyligini qoplashi to'xtaydi.

**Architecture:** Yangi tushuncha kiritilmaydi. «Pauza» — bu mavjud o'quvchi darajasidagi `StudentStatus.FROZEN` (`PATCH /students/:id/status`), faqat **tizim aktori** nomidan bajariladi. Ketma-ketlikni mavjud `AbsenceStreakService` sanaydi (`/outreach` allaqachon shundan o'qiydi) — unga uchta yangi qoida qo'shiladi. Yangi `absence-pause` moduli sozlamani saqlaydi va kunlik cron'ni yuritadi.

**Tech Stack:** NestJS + Prisma (PostgreSQL, Neon) + `@nestjs/schedule` cron; klient Next.js (App Router) + TanStack Query + shadcn/ui.

**Spec:** [`docs/superpowers/specs/2026-09-19-avtomatik-pauza-dars-qoldirish.md`](../specs/2026-09-19-avtomatik-pauza-dars-qoldirish.md)

## Global Constraints

- **Til:** kod izohlari va UI matnlari — **lotin alifbosidagi o'zbekcha**. Kirill yoki arab yozuvi ishlatilmaydi. `server/CLAUDE.md` faqat inglizcha (o'zgartirilsa).
- **Migratsiya:** `npx prisma migrate dev` bu repoda **ishlamaydi**. Tartib: `migrate diff` → SQL'ni tozalash → `prisma/migrations/<timestamp>_<name>/migration.sql` → `npx prisma db execute --file <fayl>` → `npx prisma migrate resolve --applied <migration_name>`.
- **Testlar:** har o'zgarishdan keyin `cd server && npm test` (hammasi), `npx jest <path>` (bitta fayl). Tugatishdan oldin `npm run typecheck` **va** `npx eslint src` — ikkalasi ham gate.
- **Format:** tegilgan fayllarga `npx prettier --write`.
- **Vaqt zonasi:** har qanday kun chegarasi `common/date/tashkent` dan (`tashkentDateStr`, `utcMidnightFromDateStr`). Yangi nusxa yozilmaydi.
- **Vaqtga bog'liq test yozilmaydi** — CI'da 23:40–00:02 oralig'ida yiqiladigan naqsh bor. Cron metodi `jest.useFakeTimers` bilan emas, to'g'ridan-to'g'ri chaqirib sinaladi.
- **Bildirishnoma qabul qiluvchi filtri** har doim uchtasi birga: `deletedAt: null` + `isActive: true` + `status: UserStatus.ACTIVE`.
- **Yangi fayl 500 qatordan oshmasin.**
- **Commit:** har task oxirida, worktree ichida (`.worktrees/avtomatik-pauza`). Commit xabari oxirida:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Migratsiya hech kimni pauza qilmasligi shart:** `AbsencePauseSetting.enabled` sukut bo'yicha `false`.

## Fayl tuzilmasi

| Fayl | Mas'uliyat |
|---|---|
| `server/src/outreach/absence-streak.service.ts` (o'zgartirish) | Ketma-ketlikni sanashning **yagona** ta'rifi: sanoq oynasi, `PlannedAbsence`, bekor qilingan dars |
| `server/src/students/students-status.service.ts` (o'zgartirish) | Status o'zgartirish yadrosi + `StatusChangeActor` (odam / tizim) |
| `server/src/absence-pause/absence-pause-setting.service.ts` (yangi) | Sozlamani o'qish/yozish (`enabled`, ikki chegara, kunlik chegara) |
| `server/src/absence-pause/absence-auto-pause.cron.service.ts` (yangi) | Kunlik yurish: nomzodlarni topish, chegara qorovuli, pauza, xabarlar |
| `server/src/absence-pause/absence-pause-notify.service.ts` (yangi) | 4 kanalli xabar tarqatish (o'quvchi Telegram, admin/ustoz/CEO) |
| `server/src/absence-pause/absence-pause.controller.ts` (yangi) | `GET`/`PATCH /absence-pause/settings` |
| `server/src/absence-pause/absence-pause.module.ts` (yangi) | Modul |
| `server/src/absence-pause/dto/update-absence-pause-settings.dto.ts` (yangi) | Validatsiya |
| `server/src/absence-pause/absence-pause.constants.ts` (yangi) | `AUTO_PAUSE_REASON_PREFIX` — cron va outreach o'qishi uchun bitta manba |
| `server/src/outreach/outreach.service.ts` (o'zgartirish) | Chegara sozlamadan; `getAutoPaused` |
| `client/src/app/(dashboard)/settings/absence-pause/page.tsx` (yangi) | Sozlamalar sahifasi |
| `client/src/components/settings/absence-pause-settings-client.tsx` (yangi) | Forma |
| `client/src/components/outreach/paused-tab.tsx` (yangi) | «Pauzadagilar» tabi |

---

## Task 1: Sanoq qoidasi — oyna, oldindan qoldirish, bekor qilingan dars

**Files:**
- Modify: `server/src/outreach/absence-streak.service.ts`
- Test: `server/src/outreach/absence-streak.service.spec.ts`

**Interfaces:**
- Consumes: hech narsa (birinchi task)
- Produces:
  - `export function streakWindowStart(e: { startDate: Date | null; createdAt: Date; statusChangedAt: Date | null }): string` — `YYYY-MM-DD`
  - `AbsenceStreakService.computeStreaks({ companyId: number; branchIds?: number[]; threshold?: number }): Promise<StreakRow[]>` — imzo **o'zgarmaydi**, xatti-harakati o'zgaradi
  - `StreakRow` — o'zgarmaydi: `{ enrollmentId, studentId, groupId, consecutiveAbsentCount, lastAbsenceDate, lastPresentDate }`

### Nega bu uchta qoida

1. **Sanoq oynasi.** Davomat `(studentId, groupId)` bo'yicha saqlanadi, yozuvga bog'lanmagan. Oynasiz: admin o'quvchini faollashtiradi → u hali darsga ulgurmagan → oxirgi 3 qator hamon ABSENT → ertasi ertalab cron uni **yana** pauza qiladi (cheksiz halqa). Va guruhdan chiqib, o'sha guruhga qayta yozilgan o'quvchi eski ABSENT larni meros qilib oladi.
2. **`PlannedAbsence.kind = SABABSIZ`.** Hozir oldindan aytilgan qoldirish `EXCUSED` bo'lib tushadi va sanoqni uzadi — ya'ni har safar oldindan qo'ng'iroq qilib pauzadan cheksiz qochish mumkin.
3. **Bekor qilingan dars.** `LessonCancellation` o'tgan darsni `EXCUSED` ga o'giradi va `cancellationId` qo'yadi. Bu o'quvchining aybi emas va uni sanoqda **umuman ko'rsatmaslik** kerak — uzish ham noto'g'ri bo'lardi (markaz darsni bekor qilgani ketma-ketlikni yuvib yubormasin).

- [ ] **Step 1: Yangi testlarni yoz (yiqiladi)**

`server/src/outreach/absence-streak.service.spec.ts` oxiriga qo'sh:

```typescript
import { streakWindowStart } from './absence-streak.service';

describe('streakWindowStart', () => {
  it("startDate bo'lsa o'shani oladi", () => {
    expect(
      streakWindowStart({
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        statusChangedAt: null,
      }),
    ).toBe('2026-09-01');
  });

  it("startDate yo'q bo'lsa createdAt ga tushadi", () => {
    expect(
      streakWindowStart({
        startDate: null,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        statusChangedAt: null,
      }),
    ).toBe('2026-08-20');
  });

  it('faollashtirilgan kun kechroq — oyna o\'shandan boshlanadi', () => {
    expect(
      streakWindowStart({
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        statusChangedAt: new Date('2026-09-15T06:00:00.000Z'),
      }),
    ).toBe('2026-09-15');
  });

  it('Toshkent kuni bo\'yicha: UTC 20:00 — ertangi kun', () => {
    // 2026-09-15T20:00Z = Toshkentda 16-sentabr 01:00
    expect(
      streakWindowStart({
        startDate: null,
        createdAt: new Date('2026-09-15T20:00:00.000Z'),
        statusChangedAt: null,
      }),
    ).toBe('2026-09-16');
  });
});

describe('AbsenceStreakService — so\'rov shakli', () => {
  const companyId = 1001;

  function makeService(
    enrollments: {
      id: string;
      studentId: number;
      groupId: string;
      startDate: Date | null;
      createdAt: Date;
      statusChangedAt: Date | null;
    }[],
    rawRows: {
      studentId: number;
      groupId: string;
      dateStr: string;
      status: AttendanceStatus;
    }[],
  ) {
    const queryRaw = jest.fn().mockResolvedValue(rawRows);
    const prisma = {
      enrollment: { findMany: jest.fn().mockResolvedValue(enrollments) },
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: queryRaw,
    };
    return {
      service: new AbsenceStreakService(prisma as never),
      prisma,
      queryRaw,
    };
  }

  const enr = {
    id: 'e1',
    studentId: 10001,
    groupId: 'g1',
    startDate: null,
    createdAt: new Date('2026-09-01T06:00:00.000Z'),
    statusChangedAt: new Date('2026-09-10T06:00:00.000Z'),
  };

  it('xom SQL ga sanoq oynasi sanasi uzatiladi', async () => {
    const { service, queryRaw } = makeService([enr], []);
    await service.computeStreaks({ companyId });

    // Tagged-template: [strings, ...values]. Oyna sanalari massivi — oxirgi
    // uchinchi qiymat (studentIds, groupIds, sinceDates, companyId).
    const values = queryRaw.mock.calls[0].slice(1);
    expect(values).toContainEqual(['2026-09-10']);
  });

  it("faollashtirishdan oldingi ABSENT lar sanalmaydi", async () => {
    // Baza oynadan oldingi qatorlarni qaytarmaydi — servis ham ularni
    // so'ramaydi. Bu yerda tekshiriladigan narsa: qaytgan 1 ta ABSENT
    // uchun streak 1, 3 emas.
    const { service } = makeService(
      [enr],
      [
        {
          studentId: 10001,
          groupId: 'g1',
          dateStr: '2026-09-12',
          status: AttendanceStatus.ABSENT,
        },
      ],
    );
    const rows = await service.computeStreaks({ companyId, threshold: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].consecutiveAbsentCount).toBe(1);
  });

  it("chegaradan past streak qaytarilmaydi", async () => {
    const { service } = makeService(
      [enr],
      [
        {
          studentId: 10001,
          groupId: 'g1',
          dateStr: '2026-09-12',
          status: AttendanceStatus.ABSENT,
        },
      ],
    );
    const rows = await service.computeStreaks({ companyId, threshold: 2 });
    expect(rows).toHaveLength(0);
  });
});
```

Mavjud `describe("AbsenceStreakService.computeStreaks — bitta so'rovli yo'l")` blokidagi `makeService` ning `enrollments` argumentiga uchta yangi maydon qo'shilishi kerak — test faylidagi `Array.from({ length: 250 }, ...)` va boshqa joylardagi obyektlarga `startDate: null, createdAt: new Date('2026-09-01T06:00:00.000Z'), statusChangedAt: null` qo'sh.

- [ ] **Step 2: Testni ishga tushir — yiqilishi kerak**

```bash
cd server && npx jest src/outreach/absence-streak.service.spec.ts
```

Kutilgan: `streakWindowStart is not a function` va so'rov shakli testlari yiqiladi.

- [ ] **Step 3: `streakWindowStart` ni yoz**

`server/src/outreach/absence-streak.service.ts` — importlarga qo'sh:

```typescript
import { tashkentDateStr } from '../attendance/shared/date-utils';
```

Fayl oxiriga (`consecutiveAbsentCount` yonida):

```typescript
/**
 * Sanoq oynasining boshi — bu sanadan OLDINGI davomat umuman sanalmaydi.
 *
 * NEGA KERAK: davomat `(studentId, groupId)` bo'yicha saqlanadi, yozuvga
 * (`Enrollment`) bog'lanmagan. Oynasiz ikkita xato chiqadi:
 *
 *  1. Cheksiz halqa. Admin pauzadagi o'quvchini faollashtiradi; u hali
 *     darsga kelmagan, oxirgi 3 qator hamon ABSENT — ertasi ertalab cron
 *     uni YANA pauza qiladi va admin hech qachon yuta olmaydi.
 *  2. Meros. Guruhdan chiqib, keyin o'sha guruhga qayta yozilgan o'quvchi
 *     eski ABSENT lari bilan keladi va birinchi kechasiyoq pauzaga tushadi.
 *
 * `statusChangedAt` — cascade `FROZEN → ACTIVE` qaytarganda yozadigan
 * maydon, ya'ni FAOLLASHTIRISH SANOQNI NOLDAN BOSHLAYDI: o'quvchi yangi
 * imkoniyat (3 ta dars, ≈1 hafta) oladi.
 *
 * Sanalar MATN sifatida solishtiriladi — `YYYY-MM-DD` da leksikografik
 * tartib xronologik tartibga teng, va bu `@db.Date` (UTC yarim tuni) bilan
 * haqiqiy vaqt belgisini bitta `>` da aralashtirib yuborish xavfini yopadi.
 */
export function streakWindowStart(e: {
  startDate: Date | null;
  createdAt: Date;
  statusChangedAt: Date | null;
}): string {
  const dates = [tashkentDateStr(e.startDate ?? e.createdAt)];
  if (e.statusChangedAt) dates.push(tashkentDateStr(e.statusChangedAt));
  return dates.reduce((a, b) => (a > b ? a : b));
}
```

- [ ] **Step 4: `computeStreaks` ni oynaga o'tkaz**

`computeStreaks` ichidagi `enrollment.findMany` ning `select` iga uchta maydon qo'sh:

```typescript
      select: {
        id: true,
        studentId: true,
        groupId: true,
        startDate: true,
        createdAt: true,
        statusChangedAt: true,
      },
```

`findMany` dan keyin, `if (enrollments.length === 0) return [];` ostiga:

```typescript
    // Har yozuv uchun o'z oynasi — pastdagi so'rovga uchinchi massiv bo'lib
    // ketadi va "shu sanadan oldingi davomatni ko'rsatma" degan ma'noni
    // beradi.
    const windows = enrollments.map((e) => ({
      studentId: e.studentId,
      groupId: e.groupId,
      since: streakWindowStart(e),
    }));
```

`fetchLastTenPerPair` chaqiruvini o'zgartir:

```typescript
    const lastTenByPair = await this.fetchLastTenPerPair(
      params.companyId,
      windows,
    );
```

`lastPresentDate` uchun zaxira so'rovga ham oyna qo'sh — aks holda pauza kartasida «oxirgi kelgan sana» sifatida boshqa davrdagi dars ko'rinadi. `qualifying.map` ichidagi `findFirst` ni almashtir:

```typescript
        let lastPresentDate: Date | null = inLastTen?.date ?? null;
        if (!lastPresentDate) {
          const earlier = await this.prisma.attendance.findFirst({
            where: {
              studentId: e.studentId,
              groupId: e.groupId,
              companyId: params.companyId,
              cancellationId: null,
              date: { gte: utcMidnightFromDateStr(streakWindowStart(e)) },
              status: {
                in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE],
              },
            },
            orderBy: { date: 'desc' },
            select: { date: true },
          });
          lastPresentDate = earlier?.date ?? null;
        }
```

`utcMidnightFromDateStr` ni importga qo'sh:

```typescript
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';
```

- [ ] **Step 5: Xom SQL ni yangila**

`fetchLastTenPerPair` ni butunlay almashtir:

```typescript
  /**
   * Har bir `(studentId, groupId)` juftligi uchun oxirgi 10 ta SANALADIGAN
   * davomat, o'z sanoq oynasi ichida.
   *
   * Sana MATN sifatida o'qiladi va UTC yarim tuniga o'giriladi. Sababi nozik:
   * `Attendance.date` — `@db.Date` ustuni, Prisma uni UTC yarim tuni qilib
   * beradi, xom SQL yo'li esa (node-postgres) MAHALLIY yarim tun qilib beradi.
   * To'g'ridan-to'g'ri olsak, sanalar Toshkent ofsetiga siljib ketardi.
   *
   * PARTITION BY ustunlari ataylab (groupId, studentId) tartibida — Attendance
   * jadvalidagi unique indeks aynan shu tartibda (groupId, studentId, date),
   * shuning uchun Postgres oynani qo'shimcha saralashsiz hisoblaydi.
   *
   * Uchta filtr shu yerda, TypeScript'da emas — chunki ular `rn <= 10`
   * oynasidan OLDIN ishlashi kerak: bekor qilingan dars o'nlikning bir
   * o'rnini egallab, haqiqiy davomatni ko'rinmas qilib qo'ymasin.
   *
   *  - `w.since` — sanoq oynasi (`streakWindowStart`).
   *  - `cancellationId IS NULL` — markaz bekor qilgan dars o'quvchining
   *    aybi emas; sanamaydi ham, uzmaydi ham.
   *  - `PlannedAbsence` — oldindan aytilgan SABABSIZ qoldirish EXCUSED
   *    bo'lib tushadi; shu join uni qayta ABSENT qiladi, aks holda har
   *    safar oldindan qo'ng'iroq qilib pauzadan cheksiz qochish mumkin.
   *    SABABLI (kasal) avvalgidek uzadi.
   */
  private async fetchLastTenPerPair(
    companyId: number,
    windows: { studentId: number; groupId: string; since: string }[],
  ): Promise<Map<string, AttendanceRow[]>> {
    const byPair = new Map<string, AttendanceRow[]>();

    // Juda katta ro'yxatda bitta so'rov cheksiz o'smasin.
    for (let i = 0; i < windows.length; i += PAIR_CHUNK_SIZE) {
      const chunk = windows.slice(i, i + PAIR_CHUNK_SIZE);
      const studentIds = chunk.map((p) => p.studentId);
      const groupIds = chunk.map((p) => p.groupId);
      const sinceDates = chunk.map((p) => p.since);

      const rows = await this.prisma.$queryRaw<RawAttendanceRow[]>`
        SELECT t."studentId", t."groupId", t."dateStr", t."status"
        FROM (
          SELECT a."studentId",
                 a."groupId",
                 to_char(a."date", 'YYYY-MM-DD') AS "dateStr",
                 CASE
                   WHEN a."status" = 'EXCUSED' AND pa."kind" = 'SABABSIZ'
                     THEN 'ABSENT'
                   ELSE a."status"::text
                 END AS "status",
                 ROW_NUMBER() OVER (
                   PARTITION BY a."groupId", a."studentId"
                   ORDER BY a."date" DESC
                 ) AS rn
          FROM "Attendance" a
          JOIN unnest(
                 ${studentIds}::int[],
                 ${groupIds}::text[],
                 ${sinceDates}::date[]
               ) AS w("studentId", "groupId", "since")
            ON w."studentId" = a."studentId"
           AND w."groupId" = a."groupId"
          LEFT JOIN "PlannedAbsence" pa
            ON pa."studentId" = a."studentId"
           AND pa."groupId" = a."groupId"
           AND pa."date" = a."date"
          WHERE a."companyId" = ${companyId}
            AND a."cancellationId" IS NULL
            AND a."date" >= w."since"
        ) t
        WHERE t.rn <= ${LAST_N_ATTENDANCES}
        ORDER BY t."groupId", t."studentId", t."dateStr" DESC
      `;

      for (const r of rows) {
        const k = pairKey(r.studentId, r.groupId);
        const row: AttendanceRow = {
          date: new Date(`${r.dateStr}T00:00:00.000Z`),
          status: r.status,
        };
        const list = byPair.get(k);
        if (list) list.push(row);
        else byPair.set(k, [row]);
      }
    }

    return byPair;
  }
```

Sinf ustidagi doc-blokka qo'sh (`computeStreaks` izohiga):

```
   * EXCUSED, PRESENT va LATE ketma-ketlikni uzadi — faqat sababsiz
   * qoldirishlar sanaladi. Ikkita istisno: oldindan «sababsiz» deb
   * belgilangan qoldirish (EXCUSED bo'lib tushadi, lekin sanaladi) va
   * bekor qilingan dars (umuman ko'rinmaydi).
```

- [ ] **Step 6: Testlar o'tishini tekshir**

```bash
cd server && npx jest src/outreach/absence-streak.service.spec.ts
```

Kutilgan: PASS (yangi + mavjud testlar).


- [ ] **Step 7: Prod'da READ-ONLY tekshir**

`server/scripts/_verify-streak-rule.ts` yarat (`_*.ts` gitignore'da):

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AbsenceStreakService } from '../src/outreach/absence-streak.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const svc = new AbsenceStreakService(prisma as never);
  for (const t of [2, 3, 4]) {
    const rows = await svc.computeStreaks({ companyId: 1001, threshold: t });
    console.log(`chegara ${t}: ${rows.length} ta yozuv`);
    for (const r of rows.slice(0, 5)) {
      const last = r.lastPresentDate?.toISOString().slice(0, 10) ?? 'hech qachon';
      console.log(`  #${r.studentId} — ${r.consecutiveAbsentCount} dars, oxirgi kelgan: ${last}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
```

Ishga tushir:

```bash
cd server && railway run npx ts-node --transpile-only scripts/_verify-streak-rule.ts
```

Kutilgan (19.09.2026 holati): `chegara 2: ~21`, `chegara 3: ~5`, `chegara 4: ~2`.
Agar `chegara 3` 10 dan oshsa — **to'xta va xabar ber**: kunlik chegara
fail-closed bo'lgani uchun birinchi yurish hech kimni pauza qilmaydi, ya'ni
qoidada xato bor degani.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write server/src/outreach/absence-streak.service.ts server/src/outreach/absence-streak.service.spec.ts
git add server/src/outreach/absence-streak.service.ts server/src/outreach/absence-streak.service.spec.ts
git commit -m "$(cat <<'MSG'
Ketma-ket qoldirish sanogi: oyna, oldindan qoldirish, bekor qilingan dars

Uchta qoida qo'shildi, uchalasi ham xom SQL ichida (rn <= 10 oynasidan
OLDIN ishlashi kerak):
- Sanoq oynasi: faollashtirilgan yozuvda eski ABSENT lar sanalmaydi.
  Oynasiz cron faollashtirilgan o'quvchini ertasiga yana pauza qilardi.
- Oldindan aytilgan SABABSIZ qoldirish sanaladi (EXCUSED bo'lib tushsa ham).
- Bekor qilingan dars (cancellationId) umuman ko'rinmaydi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: Tizim aktori — status o'zgartirishni cron ham chaqira olsin

**Files:**
- Modify: `server/src/students/students-status.service.ts`
- Modify: `server/src/billing/enrollment-billing.service.ts` (faqat `performedById` tipini kengaytirish)
- Test: `server/src/students/students-status.service.spec.ts` (yangi fayl)

**Interfaces:**
- Consumes: hech narsa
- Produces:
  - `export type StatusChangeActor = { kind: 'user'; id: number } | { kind: 'system' }`
  - `StudentsStatusService.changeStatus(id: number, dto: ChangeStudentStatusDto, userId: number, companyId: number)` — imzo **o'zgarmaydi** (mavjud chaqiruvchilar buzilmaydi)
  - `StudentsStatusService.pauseForAbsence(params: { studentId: number; companyId: number; streak: number; lastAbsenceDate: Date }): Promise<void>`

### Nega

`changeStatus` odam uchun yozilgan: `assertCallerMayTouchStudent` (filial tekshiruvi) va «sozlangan sabab bo'lsa — ro'yxatdan tanlash majburiy» qoidasi bor. Cronning na foydalanuvchisi, na filiali bor. ADR-0008 («ro'yxatdan o'tish aktori oshkora») naqshi: aktorni **oshkora** qilish, «userId yo'q = tekshiruvni o'tkazib yubor» degan jim qoidani kiritmaslik.

- [ ] **Step 1: Testni yoz (yiqiladi)**

`server/src/students/students-status.service.spec.ts` yarat:

```typescript
import { StudentStatus, EnrollmentStatus } from '@prisma/client';
import { StudentsStatusService } from './students-status.service';

describe('StudentsStatusService.pauseForAbsence', () => {
  const companyId = 1001;

  function makeService(student: Record<string, unknown> | null) {
    const prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(student),
        update: jest.fn().mockResolvedValue({ id: 10001 }),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      studentExitReason: { findFirst: jest.fn(), count: jest.fn() },
      $transaction: jest.fn(),
    };
    const statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date('2026-09-19T02:30:00.000Z'),
        statusChangedById: undefined,
        statusChangeReason: 'x',
      }),
    };
    const statusCascadeService = { cascade: jest.fn().mockResolvedValue([]) };
    const entityHistoryService = { recordStatusChange: jest.fn() };
    const enrollmentBillingService = { refundPrepaidWithOverride: jest.fn() };
    const service = new StudentsStatusService(
      prisma as never,
      statusHistoryService as never,
      statusCascadeService as never,
      entityHistoryService as never,
      enrollmentBillingService as never,
    );
    return {
      service,
      prisma,
      statusHistoryService,
      statusCascadeService,
      entityHistoryService,
    };
  }

  const activeStudent = {
    id: 10001,
    companyId,
    status: StudentStatus.ACTIVE,
  };

  it('tizim aktori filial tekshiruvisiz muzlatadi va sababni o\'zi yozadi', async () => {
    const { service, prisma, statusHistoryService, statusCascadeService } =
      makeService(activeStudent);

    await service.pauseForAbsence({
      studentId: 10001,
      companyId,
      streak: 3,
      lastAbsenceDate: new Date('2026-09-12T00:00:00.000Z'),
    });

    expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        fromStatus: StudentStatus.ACTIVE,
        toStatus: StudentStatus.FROZEN,
        changedById: undefined,
        reason: expect.stringContaining('Avtomatik pauza:'),
      }),
    );
    // Sabab o'quvchiga tushuntirish uchun sonni va sanani olib yuradi.
    const reason = statusHistoryService.changeStatus.mock.calls[0][0].reason;
    expect(reason).toContain('3 ta');
    expect(reason).toContain('12.09.2026');

    // Ro'yxatdan sabab tanlash TALAB QILINMAYDI.
    expect(prisma.studentExitReason.count).not.toHaveBeenCalled();
    expect(prisma.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StudentStatus.FROZEN,
          isActive: false,
          statusChangeReasonId: null,
        }),
      }),
    );
    expect(statusCascadeService.cascade).toHaveBeenCalledWith(
      'Student',
      '10001',
      StudentStatus.FROZEN,
      undefined,
    );
  });

  it('ACTIVE bo\'lmagan o\'quvchini jimgina o\'tkazib yuboradi', async () => {
    const { service, statusHistoryService } = makeService({
      ...activeStudent,
      status: StudentStatus.FROZEN,
    });

    await service.pauseForAbsence({
      studentId: 10001,
      companyId,
      streak: 3,
      lastAbsenceDate: new Date('2026-09-12T00:00:00.000Z'),
    });

    expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
  });

  it('boshqa kompaniyaning o\'quvchisiga tegmaydi', async () => {
    const { service, statusHistoryService } = makeService(null);

    await service.pauseForAbsence({
      studentId: 10001,
      companyId,
      streak: 3,
      lastAbsenceDate: new Date('2026-09-12T00:00:00.000Z'),
    });

    expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testni ishga tushir — yiqilishi kerak**

```bash
cd server && npx jest src/students/students-status.service.spec.ts
```

Kutilgan: `service.pauseForAbsence is not a function`.

- [ ] **Step 3: `refundPrepaidForFreeze` va billing tipini kengaytir**

`server/src/billing/enrollment-billing.service.ts` — `refundPrepaidWithOverride` params:

```typescript
      performedById?: number;
```

(`number` → `number?`. Ichkarida u faqat `reverseTransaction` va
`reverseAccrualForAttendance` ga uzatiladi — ikkalasi ham ixtiyoriy id
qabul qiladi, va tizim yo'li override'siz ishlagani uchun u shoxga
umuman kirmaydi.)

`server/src/students/students-status.service.ts` — `refundPrepaidForFreeze`:

```typescript
  private async refundPrepaidForFreeze(
    studentId: number,
    userId: number | undefined,
    overrides: Record<string, number> | undefined,
  ): Promise<
```

- [ ] **Step 4: Aktorni kirit va `changeStatus` ni ajrat**

`students-status.service.ts` ning yuqorisiga (import'lardan keyin):

```typescript
/**
 * Status o'zgartirishni KIM so'rayotgani — oshkora, chunki ikki chaqiruvchi
 * ikki xil tekshiruvdan o'tadi.
 *
 * Bu ADR-0008 dagi naqsh: «userId yo'q = tekshiruvni o'tkazib yubor» degan
 * JIM qoida o'sha ADR yozilishiga sabab bo'lgan xatoning o'zi. Cron —
 * tizimdagi yagona egasiz yo'l, shuning uchun u o'zini shunday deb ataydi.
 */
export type StatusChangeActor =
  | { kind: 'user'; id: number }
  | { kind: 'system' };
```

`changeStatus` ni yupqa o'ramga aylantir va yadroni `applyStatusChange` ga ko'chir:

```typescript
  async changeStatus(
    id: number,
    dto: ChangeStudentStatusDto,
    userId: number,
    companyId: number,
  ) {
    return this.applyStatusChange(id, dto, { kind: 'user', id: userId }, companyId);
  }
```

Mavjud `changeStatus` tanasini `applyStatusChange` ga ko'chir va uchta joyini o'zgartir:

```typescript
  private async applyStatusChange(
    id: number,
    dto: ChangeStudentStatusDto,
    actor: StatusChangeActor,
    companyId: number,
  ) {
    const actorId = actor.kind === 'user' ? actor.id : undefined;

    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    // (1) Filial tekshiruvi faqat odam uchun. Cron butun kompaniya bo'yicha
    // yuradi va uning filiali yo'q; qamrov o'rniga uni kunlik chegara
    // (fail-closed) va sozlamadagi o'chirish tugmasi ushlab turadi.
    if (actor.kind === 'user') {
      await assertCallerMayTouchStudent(this.prisma, actor.id, id, companyId);
    }
```

`GRADUATED` taqiqi joyida qoladi (ikkala aktor uchun ham).

Sabab bo'limini aktorga qarab shohlantir — mavjud `if (dto.reasonId) { ... } else if (exitType) { ... }` blokini shunday o'ra:

```typescript
    const exitType = STATUS_TO_EXIT_TYPE[dto.status];
    let reasonId: string | null = null;
    let reasonText: string | null = dto.reason?.trim() || null;

    // (2) Sabab ro'yxati — odam uchun majburiy, tizim uchun ma'nosiz:
    // «Avtomatik pauza» degan qator ro'yxatda yo'q va uni sozlamalarga
    // qo'shish adminni chalg'itardi (u qo'lda tanlanadigan sabab emas).
    // Tizim o'z sababini matn bilan yozadi va reasonId ni null qoldiradi.
    if (actor.kind === 'user') {
      // ...mavjud blok butunligicha shu yerda...
    }
```

Qolgan chaqiruvlarda `userId` ni `actorId` ga almashtir:

```typescript
    const auditData = await this.statusHistoryService.changeStatus({
      ...
      changedById: actorId,
      ...
    });
```

```typescript
      frozenRefundResults = await this.refundPrepaidForFreeze(
        id,
        actorId,
        dto.frozenRefundOverrides,
      );
```

```typescript
    await this.entityHistoryService.recordStatusChange({
      ...
      changedById: actorId,
      ...
    });

    await this.statusCascadeService.cascade(
      'Student',
      String(id),
      dto.status,
      actorId,
    );
```

- [ ] **Step 5: `pauseForAbsence` ni yoz**

`students-status.service.ts` ga public metod qo'sh (`changeStatus` ostiga):

```typescript
  /**
   * Avtomatik pauza — cron chaqiradigan yagona kirish nuqtasi.
   *
   * Nega alohida metod, `applyStatusChange` ni ochiq qilish emas: bu yo'l
   * FAQAT `ACTIVE → FROZEN` ni biladi. Tizim aktori filial tekshiruvini
   * chetlab o'tadi, shuning uchun u bajara oladigan amallar ro'yxati eng
   * tor bo'lishi kerak — `EXPELLED` yoki `ARCHIVED` hech qachon avtomatik
   * bo'lmaydi.
   *
   * ACTIVE bo'lmagan o'quvchi JIMGINA o'tkazib yuboriladi: cron nomzodlarni
   * yig'gani bilan pauza qilgani orasida admin uni chiqarib yuborgan
   * bo'lishi mumkin, va bu xato emas.
   */
  async pauseForAbsence(params: {
    studentId: number;
    companyId: number;
    streak: number;
    lastAbsenceDate: Date;
  }): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, deletedAt: null, companyId: params.companyId },
      select: { id: true, status: true },
    });
    if (!student || student.status !== StudentStatus.ACTIVE) return;

    await this.applyStatusChange(
      params.studentId,
      {
        status: StudentStatus.FROZEN,
        reason: buildAutoPauseReason(params.streak, params.lastAbsenceDate),
      } as ChangeStudentStatusDto,
      { kind: 'system' },
      params.companyId,
    );
  }
```

Sabab matnini quruvchi — `server/src/absence-pause/absence-pause.constants.ts` yarat:

```typescript
/**
 * Avtomatik pauza sababining boshlanishi.
 *
 * `/outreach` ning «Pauzadagilar» tabi muzlatilgan o'quvchilar ichidan
 * avtomatiklarini aynan shu prefiks bo'yicha ajratadi — qo'lda muzlatilgan
 * 209 ta o'quvchi bilan aralashib ketmasligi uchun. Ikkala tomon bitta
 * konstantadan o'qiydi: matnni bir joyda o'zgartirsang ro'yxat jimgina
 * bo'shab qolardi.
 */
export const AUTO_PAUSE_REASON_PREFIX = 'Avtomatik pauza:';

/** `12.09.2026` — Toshkent kalendar kuni, admin o'qiydigan ko'rinishda. */
function formatDate(d: Date): string {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [y, m, day] = s.split('-');
  return `${day}.${m}.${y}`;
}

export function buildAutoPauseReason(streak: number, lastAbsence: Date): string {
  return `${AUTO_PAUSE_REASON_PREFIX} ${streak} ta ketma-ket dars qoldirildi (oxirgisi ${formatDate(lastAbsence)})`;
}
```

`students-status.service.ts` ga import:

```typescript
import { buildAutoPauseReason } from '../absence-pause/absence-pause.constants';
```

> Konstantalar fayli servis emas — modul bog'liqligi tug'dirmaydi, shuning
> uchun `students` → `absence-pause` yo'nalishida aylanma import bo'lmaydi.

- [ ] **Step 6: Testlar o'tishini tekshir**

```bash
cd server && npx jest src/students/students-status.service.spec.ts && npx jest src/students
```

Kutilgan: PASS. Mavjud `students` testlari ham buzilmasligi kerak — `changeStatus` imzosi o'zgarmadi.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write server/src/students/students-status.service.ts server/src/students/students-status.service.spec.ts server/src/absence-pause/absence-pause.constants.ts server/src/billing/enrollment-billing.service.ts
git add server/src/students/students-status.service.ts server/src/students/students-status.service.spec.ts server/src/absence-pause/absence-pause.constants.ts server/src/billing/enrollment-billing.service.ts
git commit -m "$(cat <<'MSG'
Status o'zgartirishda aktor oshkora: odam yoki tizim

changeStatus odam uchun yozilgan edi — filial tekshiruvi va sabab
ro'yxati bor, cronning esa na foydalanuvchisi, na filiali bor.
ADR-0008 naqshi bo'yicha aktor oshkora qilindi; "userId yo'q =
tekshiruvni o'tkazib yubor" degan jim qoida kiritilmadi.

Tizim yo'li faqat ACTIVE -> FROZEN ni biladi (pauseForAbsence).
changeStatus imzosi o'zgarmadi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: Ma'lumotlar modeli + sozlama moduli

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_absence_pause/migration.sql`
- Create: `server/src/absence-pause/absence-pause-setting.service.ts`
- Create: `server/src/absence-pause/dto/update-absence-pause-settings.dto.ts`
- Create: `server/src/absence-pause/absence-pause.controller.ts`
- Create: `server/src/absence-pause/absence-pause.module.ts`
- Modify: `server/src/app.module.ts`
- Test: `server/src/absence-pause/absence-pause-setting.service.spec.ts`
- Test: `server/src/absence-pause/absence-pause.controller.spec.ts`

**Interfaces:**
- Consumes: `AUTO_PAUSE_REASON_PREFIX` (Task 2)
- Produces:
  - `interface AbsencePauseSettings { enabled: boolean; warnThreshold: number; pauseThreshold: number; dailyCap: number }`
  - `AbsencePauseSettingService.get(companyId: number): Promise<AbsencePauseSettings>`
  - `AbsencePauseSettingService.update(companyId: number, dto: UpdateAbsencePauseSettingsDto, userId: number): Promise<AbsencePauseSettings>`
  - Endpointlar: `GET /absence-pause/settings` (CEO, Branch Director), `PATCH /absence-pause/settings` (CEO)

- [ ] **Step 1: Schema'ga ikkita model va ikkita bildirishnoma turini qo'sh**

`server/prisma/schema.prisma` — `NotificationType` enum'iga:

```prisma
  ABSENCE_WARNING
  ENROLLMENT_AUTO_PAUSED
```

Fayl oxiriga ikkita model (`SalaryPeriodSetting` yonida turishi mantiqiy):

```prisma
/// Avtomatik pauza qoidasi — kompaniyaga bitta qator.
///
/// SCD2 EMAS (SalaryPeriodSetting dan farqi shu): bu sozlama prognozga ham,
/// oylik hisobiga ham kirmaydi, shuning uchun o'tmishni "o'sha kuni chegara
/// nechta edi" deb qayta o'qishning hojati yo'q. O'zgarish tarixi
/// EntityHistory ga tushadi.
///
/// `enabled` sukut bo'yicha FALSE — migratsiya o'z-o'zidan hech kimni
/// muzlatmasligi uchun. Yoqish CEO ning ongli qadami.
model AbsencePauseSetting {
  id             String   @id @default(uuid())
  companyId      Int      @unique
  enabled        Boolean  @default(false)
  warnThreshold  Int      @default(2)
  pauseThreshold Int      @default(3)
  dailyCap       Int      @default(10)
  updatedById    Int?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

/// Yuborilgan ogohlantirishlar jurnali.
///
/// IKKI VAZIFASI BOR:
///  1. Takrorni to'xtatadi. Cron har kuni yuradi, sanoq esa keyingi darsgacha
///     o'zgarmaydi — kunlik marker bo'lsa o'quvchi har kuni bir xil xabar
///     olardi. Unique kaliti `(enrollmentId, absenceDate)`: bir qoldirish —
///     bir xabar.
///  2. Samaradorlik jurnali. Bir oydan keyin "ogohlantirilganlarning
///     nechtasi qaytdi?" savoliga javob beradigan yagona yozuv shu.
///
/// `SalaryPeriodSetting` kabi Company/Enrollment ga relation qo'yilmagan —
/// bu jadvallar hech qachon qattiq o'chirilmaydi (soft delete), shuning
/// uchun FK dan foyda yo'q, lekin u Company va Enrollment modellariga
/// teskari maydon qo'shishni talab qilardi.
model AbsenceWarningLog {
  id            String   @id @default(uuid())
  enrollmentId  String
  studentId     Int
  groupId       String
  absenceDate   DateTime @db.Date
  streak        Int
  sentToStudent Boolean  @default(false)
  companyId     Int
  createdAt     DateTime @default(now())

  @@unique([enrollmentId, absenceDate])
  @@index([companyId, createdAt])
  @@index([studentId])
}
```

- [ ] **Step 2: Migratsiyani qo'lda yasa**

```bash
cd server
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/absence-pause-diff.sql
cat /tmp/absence-pause-diff.sql
```

**Diqqat:** dev bazada oldindan mavjud drift bor (`Branch.workingDays`,
`Transaction_reversedAt_idx`, `TelegramGroup` FK va h.k.). Diff ularni ham
chiqaradi. **Faqat quyidagi to'rt narsaga tegishli qatorlarni olib qol**,
qolganini o'chir — aks holda prod deploy'da sinadi:

1. `ALTER TYPE "NotificationType" ADD VALUE 'ABSENCE_WARNING';`
2. `ALTER TYPE "NotificationType" ADD VALUE 'ENROLLMENT_AUTO_PAUSED';`
3. `CREATE TABLE "AbsencePauseSetting" (...)` + uning unique indeksi
4. `CREATE TABLE "AbsenceWarningLog" (...)` + uning uchta indeksi

Tozalangan SQL ni yoz:

```bash
mkdir -p prisma/migrations/20260919120000_absence_pause
cp /tmp/absence-pause-diff-cleaned.sql prisma/migrations/20260919120000_absence_pause/migration.sql
```

- [ ] **Step 3: Dev bazaga qo'lla va yozib qo'y**

```bash
cd server
npx prisma db execute --file prisma/migrations/20260919120000_absence_pause/migration.sql
npx prisma migrate resolve --applied 20260919120000_absence_pause
npx prisma generate
```

> **Agar enum qo'shish `db execute` da yiqilsa** («unsafe use of new value»):
> enum qiymatlarini alohida faylga ajratib, avval ularni, keyin jadvallarni
> qo'lla. Postgres bitta tranzaksiyada enum qiymatini qo'shib darhol
> ishlatishga ruxsat bermaydi — shuning uchun bu migratsiyada yangi enum
> qiymatlari **hech qayerda ishlatilmaydi** (ular faqat keyingi tasklarda,
> alohida deploy'da yoziladigan qatorlarda paydo bo'ladi).

- [ ] **Step 4: Sozlama servisi testini yoz (yiqiladi)**

`server/src/absence-pause/absence-pause-setting.service.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';

describe('AbsencePauseSettingService', () => {
  const companyId = 1001;

  function makeService(existing: Record<string, unknown> | null) {
    const prisma = {
      absencePauseSetting: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockImplementation(({ data }) => ({ ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...existing,
          ...data,
        })),
      },
    };
    const entityHistoryService = { recordUpdate: jest.fn() };
    return {
      service: new AbsencePauseSettingService(
        prisma as never,
        entityHistoryService as never,
      ),
      prisma,
      entityHistoryService,
    };
  }

  it("qator yo'q bo'lsa O'CHIQ holda yaratadi", async () => {
    const { service, prisma } = makeService(null);
    const s = await service.get(companyId);
    expect(s.enabled).toBe(false);
    expect(s.warnThreshold).toBe(2);
    expect(s.pauseThreshold).toBe(3);
    expect(s.dailyCap).toBe(10);
    expect(prisma.absencePauseSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId, enabled: false }),
    });
  });

  it('mavjud qatorni qaytaradi', async () => {
    const { service, prisma } = makeService({
      companyId,
      enabled: true,
      warnThreshold: 2,
      pauseThreshold: 4,
      dailyCap: 25,
    });
    const s = await service.get(companyId);
    expect(s).toEqual({
      enabled: true,
      warnThreshold: 2,
      pauseThreshold: 4,
      dailyCap: 25,
    });
    expect(prisma.absencePauseSetting.create).not.toHaveBeenCalled();
  });

  it('ogohlantirish chegarasi pauza chegarasidan kichik bo\'lishi shart', async () => {
    const { service } = makeService({
      companyId,
      enabled: false,
      warnThreshold: 2,
      pauseThreshold: 3,
      dailyCap: 10,
    });
    await expect(
      service.update(companyId, { warnThreshold: 3 }, 10001),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bitta maydonni yangilaganda qolganlari joyida qoladi', async () => {
    const { service, prisma, entityHistoryService } = makeService({
      companyId,
      enabled: false,
      warnThreshold: 2,
      pauseThreshold: 3,
      dailyCap: 10,
    });
    await service.update(companyId, { enabled: true }, 10001);
    expect(prisma.absencePauseSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId },
        data: { enabled: true, updatedById: 10001 },
      }),
    );
    // O'zgarish tarixga tushadi — bu pul oqimini to'xtatadigan tugma.
    expect(entityHistoryService.recordUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Testni ishga tushir — yiqilishi kerak**

```bash
cd server && npx jest src/absence-pause/absence-pause-setting.service.spec.ts
```

Kutilgan: `Cannot find module './absence-pause-setting.service'`.

- [ ] **Step 6: DTO ni yoz**

`server/src/absence-pause/dto/update-absence-pause-settings.dto.ts`:

```typescript
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAbsencePauseSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Nechta ketma-ket qoldirishda ogohlantirish yuborilsin. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  warnThreshold?: number;

  /** Nechta ketma-ket qoldirishda pauza qilinsin. */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  pauseThreshold?: number;

  /**
   * Bir yurishda ruxsat etilgan eng ko'p pauza. Oshsa — HECH KIM pauza
   * qilinmaydi (fail-closed), CEO ga xabar ketadi.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dailyCap?: number;
}
```

- [ ] **Step 7: Servisni yoz**

`server/src/absence-pause/absence-pause-setting.service.ts`:

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { UpdateAbsencePauseSettingsDto } from './dto/update-absence-pause-settings.dto';

export interface AbsencePauseSettings {
  enabled: boolean;
  warnThreshold: number;
  pauseThreshold: number;
  dailyCap: number;
}

/**
 * Avtomatik pauza qoidasining sozlamasi — kompaniyaga bitta qator.
 *
 * Nega sozlama, qattiq raqam emas: 2026-07-14 da avtomatik guruh yopish
 * kutilmagan natija bergani uchun butunlay o'chirilgan edi, va o'chirish
 * uchun deploy kerak bo'lgandi. Bu safar o'chirish tugmasi va chegaralar
 * CEO qo'lida — dasturchisiz.
 */
@Injectable()
export class AbsencePauseSettingService {
  constructor(
    private prisma: PrismaService,
    private entityHistory: EntityHistoryService,
  ) {}

  /**
   * Sozlamani o'qiydi; qator bo'lmasa O'CHIQ holda yaratadi.
   *
   * Seed emas, lazy create: migratsiya bilan qator kelsa "yoqilganmi?"
   * degan savol deploy paytida tug'ilardi. Bu yerda javob doim bir xil —
   * yangi kompaniya ham, migratsiyadan keyingi birinchi o'qish ham
   * `enabled: false` beradi.
   */
  async get(companyId: number): Promise<AbsencePauseSettings> {
    const row = await this.prisma.absencePauseSetting.findUnique({
      where: { companyId },
    });
    if (row) return this.toSettings(row);

    const created = await this.prisma.absencePauseSetting.create({
      data: { companyId, enabled: false },
    });
    return this.toSettings(created);
  }

  async update(
    companyId: number,
    dto: UpdateAbsencePauseSettingsDto,
    userId: number,
  ): Promise<AbsencePauseSettings> {
    const current = await this.get(companyId);
    const next: AbsencePauseSettings = {
      enabled: dto.enabled ?? current.enabled,
      warnThreshold: dto.warnThreshold ?? current.warnThreshold,
      pauseThreshold: dto.pauseThreshold ?? current.pauseThreshold,
      dailyCap: dto.dailyCap ?? current.dailyCap,
    };

    // Teng bo'lsa ogohlantirish va pauza bitta darsda ketadi — o'quvchi
    // xabarni muzlatilgandan KEYIN olardi, ya'ni ogohlantirishning ma'nosi
    // qolmaydi.
    if (next.warnThreshold >= next.pauseThreshold) {
      throw new BadRequestException(
        "Ogohlantirish chegarasi pauza chegarasidan kichik bo'lishi kerak",
      );
    }

    const data: Record<string, unknown> = { updatedById: userId };
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.warnThreshold !== undefined) data.warnThreshold = dto.warnThreshold;
    if (dto.pauseThreshold !== undefined)
      data.pauseThreshold = dto.pauseThreshold;
    if (dto.dailyCap !== undefined) data.dailyCap = dto.dailyCap;

    const updated = await this.prisma.absencePauseSetting.update({
      where: { companyId },
      data,
    });

    // Bu tugma pul oqimini to'xtatadi — kim yoqib-o'chirgani yozilib borsin.
    await this.entityHistory.recordUpdate({
      entityType: 'AbsencePauseSetting',
      entityId: companyId,
      oldValues: current,
      newValues: next,
      changedById: userId,
      companyId,
    });

    return this.toSettings(updated);
  }

  private toSettings(row: {
    enabled: boolean;
    warnThreshold: number;
    pauseThreshold: number;
    dailyCap: number;
  }): AbsencePauseSettings {
    return {
      enabled: row.enabled,
      warnThreshold: row.warnThreshold,
      pauseThreshold: row.pauseThreshold,
      dailyCap: row.dailyCap,
    };
  }
}
```

> `entityHistory.recordUpdate` ning aniq imzosini
> `server/src/common/entity-history/entity-history.service.ts` dan tekshir va
> moslashtir (`entityId` raqam yoki matn bo'lishi mumkin).

- [ ] **Step 8: Controller va modulni yoz**

`server/src/absence-pause/absence-pause.controller.ts`:

```typescript
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateAbsencePauseSettingsDto } from './dto/update-absence-pause-settings.dto';

@Controller('absence-pause')
@UseGuards(RolesGuard)
export class AbsencePauseController {
  constructor(private settings: AbsencePauseSettingService) {}

  @Get('settings')
  @Roles('CEO', 'Branch Director')
  get(@CurrentUser('companyId') companyId: number) {
    return this.settings.get(companyId);
  }

  /**
   * Yozish FAQAT CEO.
   *
   * Sozlama butun kompaniyaga taalluqli — filial direktori o'zgartirsa
   * ikkinchi filialdagi o'quvchilarga ham ta'sir qilardi, va u buni
   * ko'rmasdi ham.
   */
  @Patch('settings')
  @Roles('CEO')
  update(
    @Body() dto: UpdateAbsencePauseSettingsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.settings.update(companyId, dto, userId);
  }
}
```

`server/src/absence-pause/absence-pause.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AbsencePauseController } from './absence-pause.controller';
import { AbsencePauseSettingService } from './absence-pause-setting.service';

@Module({
  controllers: [AbsencePauseController],
  providers: [AbsencePauseSettingService],
  // Cron (Task 4) va OutreachService (Task 5) chegarani shu servisdan
  // o'qiydi — ikkinchi nusxa bo'lsa ro'yxat va harakat zid bo'lardi.
  exports: [AbsencePauseSettingService],
})
export class AbsencePauseModule {}
```

`server/src/app.module.ts` — `imports` ro'yxatiga `AbsencePauseModule` qo'sh.

- [ ] **Step 9: Controller guard testini yoz**

`server/src/absence-pause/absence-pause.controller.spec.ts`:

```typescript
import { Reflector } from '@nestjs/core';
import { AbsencePauseController } from './absence-pause.controller';

describe('AbsencePauseController — rollar', () => {
  const reflector = new Reflector();

  it("o'qish CEO va Branch Director uchun ochiq", () => {
    const roles = reflector.get<string[]>(
      'roles',
      AbsencePauseController.prototype.get,
    );
    expect(roles).toEqual(['CEO', 'Branch Director']);
  });

  it('yozish faqat CEO uchun', () => {
    const roles = reflector.get<string[]>(
      'roles',
      AbsencePauseController.prototype.update,
    );
    expect(roles).toEqual(['CEO']);
  });

  it('Student hech qayerga kira olmaydi', () => {
    for (const handler of [
      AbsencePauseController.prototype.get,
      AbsencePauseController.prototype.update,
    ]) {
      const roles = reflector.get<string[]>('roles', handler);
      expect(roles).not.toContain('Student');
    }
  });
});
```

> `reflector.get` ning kalit nomini (`'roles'`) mavjud controller
> spec'laridan tekshir — masalan `server/src/outreach/outreach.controller.spec.ts`.

- [ ] **Step 10: Testlar o'tishini tekshir**

```bash
cd server && npx jest src/absence-pause && npm run typecheck
```

Kutilgan: PASS.

- [ ] **Step 11: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write "server/src/absence-pause/**/*.ts" server/prisma/schema.prisma
git add server/prisma/schema.prisma server/prisma/migrations server/src/absence-pause server/src/app.module.ts
git commit -m "$(cat <<'MSG'
Avtomatik pauza sozlamasi: model, migratsiya, endpoint

AbsencePauseSetting kompaniyaga bitta qator, enabled sukut bo'yicha FALSE
— migratsiya o'z-o'zidan hech kimni muzlatmaydi, yoqish CEO ning ongli
qadami. 2026-07-14 da avtomatik guruh yopish o'chirilganda buning uchun
deploy kerak bo'lgan edi; endi o'chirish tugmasi CEO qo'lida.

AbsenceWarningLog unique kaliti (enrollmentId, absenceDate): bir
qoldirish — bir xabar. Ayni paytda "ogohlantirilganlarning nechtasi
qaytdi?" savoliga javob beradigan yagona yozuv.

Yozish faqat CEO: sozlama butun kompaniyaga taalluqli.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: Cron + xabarlar

**Files:**
- Create: `server/src/absence-pause/absence-pause-notify.service.ts`
- Create: `server/src/absence-pause/absence-auto-pause.cron.service.ts`
- Modify: `server/src/absence-pause/absence-pause.module.ts`
- Test: `server/src/absence-pause/absence-auto-pause.cron.service.spec.ts`

**Interfaces:**
- Consumes:
  - `AbsenceStreakService.computeStreaks({ companyId, threshold })` (Task 1)
  - `StudentsStatusService.pauseForAbsence({ studentId, companyId, streak, lastAbsenceDate })` (Task 2)
  - `AbsencePauseSettingService.get(companyId)` (Task 3)
  - `AUTO_PAUSE_REASON_PREFIX` (Task 2)
- Produces:
  - `AbsencePauseNotifyService.warnStudent(...)`, `.announcePause(...)`, `.alertCeos(...)`
  - `AbsenceAutoPauseCronService.runForCompany(companyId: number): Promise<{ paused: number; warned: number; blockedByCap: boolean }>`

### Nega 07:30

Prodda eng erta dars **08:00**, eng kech tugash **20:00**. Ertalabki yurishda kechagi davomat yakunlangan (davomatning 5,6% i keyingi kunlarda tuzatiladi — kechqurungi yurish ularni o'tkazib yuborardi), pauza birinchi darsdan **oldin** ro'yxatga tushadi, va o'quvchi xabarni yarim tunda emas, odam o'qiydigan vaqtda oladi.

### Nega kunlik chegara fail-closed

Davomat noto'g'ri kiritilgan kun yoki migratsiya bir kechada yuzlab o'quvchini muzlatib qo'yishi mumkin, va buni qaytarish 200 marta tugma bosish demak. Chegara oshsa **hech kim** pauza qilinmaydi va CEO xabar oladi. Hisoblagich saqlanmaydi — bitta yurishda tekshiriladi.

- [ ] **Step 1: Cron testini yoz (yiqiladi)**

`server/src/absence-pause/absence-auto-pause.cron.service.spec.ts`:

```typescript
import { AbsenceAutoPauseCronService } from './absence-auto-pause.cron.service';

describe('AbsenceAutoPauseCronService.runForCompany', () => {
  const companyId = 1001;

  function streak(studentId: number, count: number) {
    return {
      enrollmentId: `e-${studentId}`,
      studentId,
      groupId: `g-${studentId}`,
      consecutiveAbsentCount: count,
      lastAbsenceDate: new Date('2026-09-18T00:00:00.000Z'),
      lastPresentDate: null,
    };
  }

  function makeService(
    settings: {
      enabled: boolean;
      warnThreshold: number;
      pauseThreshold: number;
      dailyCap: number;
    },
    streaks: ReturnType<typeof streak>[],
    overrides: Partial<{
      pauseForAbsence: jest.Mock;
      warnedAlready: string[];
    }> = {},
  ) {
    const settingService = { get: jest.fn().mockResolvedValue(settings) };
    const streakService = { computeStreaks: jest.fn().mockResolvedValue(streaks) };
    const statusService = {
      pauseForAbsence: overrides.pauseForAbsence ?? jest.fn().mockResolvedValue(undefined),
    };
    const notify = {
      warnStudent: jest.fn().mockResolvedValue(true),
      announcePause: jest.fn().mockResolvedValue(undefined),
      alertCeos: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      absenceWarningLog: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (overrides.warnedAlready ?? []).map((id) => ({ enrollmentId: id })),
          ),
        create: jest.fn().mockResolvedValue({}),
      },
      enrollment: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            streaks
              .filter((s) => where.id.in.includes(s.enrollmentId))
              .map((s) => ({
                id: s.enrollmentId,
                studentId: s.studentId,
                groupId: s.groupId,
                student: {
                  id: s.studentId,
                  firstName: 'Ali',
                  lastName: 'Valiyev',
                  telegramChatId: '123',
                },
                group: {
                  id: s.groupId,
                  name: '#001',
                  branchId: 1,
                  teachers: [{ teacherId: 500 }],
                },
              })),
          ),
        ),
      },
    };
    const service = new AbsenceAutoPauseCronService(
      prisma as never,
      settingService as never,
      streakService as never,
      statusService as never,
      notify as never,
    );
    return { service, settingService, streakService, statusService, notify, prisma };
  }

  const on = { enabled: true, warnThreshold: 2, pauseThreshold: 3, dailyCap: 10 };

  it("o'chiq bo'lsa hech narsa qilmaydi", async () => {
    const { service, streakService, statusService } = makeService(
      { ...on, enabled: false },
      [streak(10001, 5)],
    );
    const r = await service.runForCompany(companyId);
    expect(r).toEqual({ paused: 0, warned: 0, blockedByCap: false });
    expect(streakService.computeStreaks).not.toHaveBeenCalled();
    expect(statusService.pauseForAbsence).not.toHaveBeenCalled();
  });

  it('chegaradan oshganda HECH KIM pauza qilinmaydi, CEO xabar oladi', async () => {
    const many = Array.from({ length: 11 }, (_, i) => streak(10001 + i, 3));
    const { service, statusService, notify } = makeService(
      { ...on, dailyCap: 10 },
      many,
    );
    const r = await service.runForCompany(companyId);
    expect(r.blockedByCap).toBe(true);
    expect(r.paused).toBe(0);
    expect(statusService.pauseForAbsence).not.toHaveBeenCalled();
    expect(notify.alertCeos).toHaveBeenCalledWith(
      companyId,
      expect.stringContaining('11'),
    );
  });

  it('chegara oshsa ham OGOHLANTIRISHLAR yuboriladi', async () => {
    const many = [
      ...Array.from({ length: 11 }, (_, i) => streak(10001 + i, 3)),
      streak(20001, 2),
    ];
    const { service, notify } = makeService({ ...on, dailyCap: 10 }, many);
    const r = await service.runForCompany(companyId);
    expect(r.blockedByCap).toBe(true);
    expect(r.warned).toBe(1);
    expect(notify.warnStudent).toHaveBeenCalledTimes(1);
  });

  it('pauza va ogohlantirishni chegaraga qarab ajratadi', async () => {
    const { service, statusService, notify } = makeService(on, [
      streak(10001, 3),
      streak(10002, 4),
      streak(10003, 2),
    ]);
    const r = await service.runForCompany(companyId);
    expect(r).toEqual({ paused: 2, warned: 1, blockedByCap: false });
    expect(statusService.pauseForAbsence).toHaveBeenCalledTimes(2);
    expect(notify.warnStudent).toHaveBeenCalledTimes(1);
    expect(notify.announcePause).toHaveBeenCalledTimes(2);
  });

  it('bitta pauza yiqilsa qolganlari davom etadi', async () => {
    const pauseForAbsence = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const { service, notify } = makeService(
      on,
      [streak(10001, 3), streak(10002, 3)],
      { pauseForAbsence },
    );
    const r = await service.runForCompany(companyId);
    expect(r.paused).toBe(1);
    // Yiqilgan holat jim qolmaydi.
    expect(notify.alertCeos).toHaveBeenCalledWith(
      companyId,
      expect.stringContaining('xatolik'),
    );
  });

  it('bir qoldirish uchun ikkinchi ogohlantirish ketmaydi', async () => {
    const { service, notify } = makeService(on, [streak(10001, 2)], {
      warnedAlready: ['e-10001'],
    });
    const r = await service.runForCompany(companyId);
    expect(r.warned).toBe(0);
    expect(notify.warnStudent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testni ishga tushir — yiqilishi kerak**

```bash
cd server && npx jest src/absence-pause/absence-auto-pause.cron.service.spec.ts
```

Kutilgan: `Cannot find module './absence-auto-pause.cron.service'`.

- [ ] **Step 3: Xabar servisini yoz**

`server/src/absence-pause/absence-pause-notify.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';

const STUDENT_PORTAL_URL = 'https://student.dafzentrum.uz';

interface PauseTarget {
  enrollmentId: string;
  studentId: number;
  streak: number;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    telegramChatId: string | null;
  };
  group: { id: string; name: string; branchId: number; teachers: { teacherId: number }[] };
}

/**
 * Avtomatik pauza xabarlari.
 *
 * Yuborish XATOSI hech qachon pauzani yiqitmaydi — pul oqimini to'xtatish
 * xabardan muhimroq, va Telegram vaqtincha ishlamagani uchun o'quvchining
 * hisobiga qarz yozilib turishi mantiqsiz bo'lardi. Har bir yuborish
 * o'z try/catch ida.
 */
@Injectable()
export class AbsencePauseNotifyService {
  private readonly logger = new Logger(AbsencePauseNotifyService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private push: PushService,
    private telegram: TelegramService,
  ) {}

  /**
   * 2-darsda (yoki sozlamadagi `warnThreshold` da) o'quvchining o'ziga.
   * Qaytaradi: Telegram yetib bordimi (`AbsenceWarningLog.sentToStudent`).
   */
  async warnStudent(
    target: PauseTarget,
    remainingLessons: number,
  ): Promise<boolean> {
    const text =
      `⚠️ <b>Darslarni qoldiryapsiz</b>\n\n` +
      `${target.group.name} guruhida ketma-ket <b>${target.streak} ta</b> darsga kelmadingiz.\n\n` +
      `Yana <b>${remainingLessons} ta</b> dars qoldirsangiz, guruhdagi o'rningiz vaqtincha to'xtatiladi.\n\n` +
      `Agar sabab bo'lsa, iltimos markazga xabar bering.\n🔗 ${STUDENT_PORTAL_URL}`;

    const sent = await this.sendToStudent(target.student.telegramChatId, text);

    await this.notifyStaff(
      target,
      NotificationType.ABSENCE_WARNING,
      'Dars qoldirish ogohlantirishi',
      `${target.student.firstName} ${target.student.lastName} — ${target.group.name}: ketma-ket ${target.streak} ta dars. Pauzagacha ${remainingLessons} ta.`,
    );

    return sent;
  }

  /** Pauza bo'lgandan keyin — o'quvchiga, filial adminlariga va ustozga. */
  async announcePause(target: PauseTarget): Promise<void> {
    const text =
      `⏸ <b>Guruhdagi o'rningiz vaqtincha to'xtatildi</b>\n\n` +
      `${target.group.name} guruhida ketma-ket <b>${target.streak} ta</b> darsga kelmadingiz.\n\n` +
      `Darslaringiz uchun endi hisob yozilmaydi. Qaytishni xohlasangiz, ` +
      `markazga murojaat qiling — o'rningiz tiklanadi.`;

    await this.sendToStudent(target.student.telegramChatId, text);

    await this.notifyStaff(
      target,
      NotificationType.ENROLLMENT_AUTO_PAUSED,
      'Avtomatik pauza',
      `${target.student.firstName} ${target.student.lastName} — ${target.group.name}: ketma-ket ${target.streak} ta darsdan keyin pauzaga o'tkazildi.`,
    );
  }

  /** Kunlik chegara oshgani yoki yurishda xatolik — kompaniya CEO lariga. */
  async alertCeos(companyId: number, message: string): Promise<void> {
    const ceos = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true, telegramChatId: true },
    });

    for (const ceo of ceos) {
      await this.deliver(ceo, {
        type: NotificationType.SYSTEM,
        title: 'Avtomatik pauza',
        message,
        url: '/settings/absence-pause',
        companyId,
        relatedEntityType: 'AbsencePauseSetting',
        relatedEntityId: String(companyId),
      });
    }
  }

  /**
   * Filial adminlari + guruh ustoz(lar)i.
   *
   * Ustoz ATAYLAB ro'yxatda: ertalab davomat ro'yxati qisqargan bo'ladi va
   * u buning sababini bilmay qolmasin.
   */
  private async notifyStaff(
    target: PauseTarget,
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<void> {
    const teacherIds = target.group.teachers.map((t) => t.teacherId);
    const recipients = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        OR: [
          {
            branches: { some: { branchId: target.group.branchId } },
            roles: { some: { role: { name: 'Administrator' } } },
          },
          { id: { in: teacherIds } },
        ],
      },
      select: { id: true, telegramChatId: true, companyId: true },
    });

    for (const user of recipients) {
      await this.deliver(user, {
        type,
        title,
        message,
        url: `/students/${target.studentId}`,
        companyId: user.companyId ?? undefined,
        relatedEntityType: 'Student',
        relatedEntityId: String(target.studentId),
      });
    }
  }

  private async sendToStudent(
    chatId: string | null,
    text: string,
  ): Promise<boolean> {
    if (!chatId) return false;
    try {
      const bot = this.telegram.getBot();
      if (!bot) return false;
      await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      this.logger.warn(
        `O'quvchiga Telegram yuborilmadi (${chatId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** DB + SSE + Push + Telegram — attendance-reminder dagi bilan bir xil. */
  private async deliver(
    user: { id: number; telegramChatId: string | null },
    p: {
      type: NotificationType;
      title: string;
      message: string;
      url: string;
      companyId?: number;
      relatedEntityType: string;
      relatedEntityId: string;
    },
  ): Promise<void> {
    try {
      const notification = await this.notifications.create({
        userId: user.id,
        type: p.type,
        title: p.title,
        message: p.message,
        relatedEntityType: p.relatedEntityType,
        relatedEntityId: p.relatedEntityId,
        companyId: p.companyId,
      });
      this.gateway.sendToUser(user.id, { type: 'notification', notification });
    } catch (err) {
      this.logger.warn(
        `Bildirishnoma yozilmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await this.push.sendToUser(user.id, {
        title: p.title,
        body: p.message,
        url: p.url,
      });
    } catch (err) {
      this.logger.warn(
        `Push yuborilmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (user.telegramChatId) {
      try {
        const bot = this.telegram.getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            user.telegramChatId,
            `<b>${p.title}</b>\n${p.message}`,
            { parse_mode: 'HTML' },
          );
        }
      } catch (err) {
        this.logger.warn(
          `Telegram yuborilmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
```

> `NotificationsService.create`, `PushService.sendToUser` va
> `NotificationsGateway.sendToUser` imzolarini
> `server/src/attendance/attendance-reminder.service.ts:439-478` dan
> tekshirib, aynan moslashtir.

- [ ] **Step 4: Cron servisini yoz**

`server/src/absence-pause/absence-auto-pause.cron.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { AbsenceStreakService, type StreakRow } from '../outreach/absence-streak.service';
import { StudentsStatusService } from '../students/students-status.service';
import { AbsencePauseNotifyService } from './absence-pause-notify.service';

export interface AutoPauseRunResult {
  paused: number;
  warned: number;
  blockedByCap: boolean;
}

/**
 * Ketma-ket dars qoldirgan o'quvchini avtomatik muzlatadi (pauza).
 *
 * NEGA ERTALAB, KECHQURUN EMAS: prodda eng erta dars 08:00, eng kech
 * tugash 20:00. Ertalabki yurishda kechagi davomat yakunlangan — davomatning
 * 5,6% i keyingi kunlarda tuzatiladi va kechqurungi yurish ularni o'tkazib
 * yuborardi. Pauza birinchi darsdan oldin ro'yxatga tushadi, xabar esa
 * yarim tunda emas, odam o'qiydigan vaqtda boradi.
 *
 * Yakshanba va bayramlarda ham yuradi: davomatsiz kun sanoqni o'zgartirmaydi,
 * lekin kechikkan tuzatishlar ushlanadi.
 *
 * `CRONS_ENABLED=false` da `ScheduleModule` umuman yuklanmaydi, shuning
 * uchun bu yerda alohida gate kerak emas.
 */
@Injectable()
export class AbsenceAutoPauseCronService {
  private readonly logger = new Logger(AbsenceAutoPauseCronService.name);

  constructor(
    private prisma: PrismaService,
    private settings: AbsencePauseSettingService,
    private streaks: AbsenceStreakService,
    private studentsStatus: StudentsStatusService,
    private notify: AbsencePauseNotifyService,
  ) {}

  @Cron('0 30 7 * * *', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    for (const c of companies) {
      try {
        const r = await this.runForCompany(c.id);
        if (r.paused || r.warned || r.blockedByCap) {
          this.logger.log(
            `Kompaniya ${c.id}: ${r.paused} pauza, ${r.warned} ogohlantirish` +
              (r.blockedByCap ? ' (chegara oshdi — pauza qilinmadi)' : ''),
          );
        }
      } catch (err) {
        this.logger.error(
          `Kompaniya ${c.id} uchun avtomatik pauza yiqildi: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async runForCompany(companyId: number): Promise<AutoPauseRunResult> {
    const settings = await this.settings.get(companyId);
    if (!settings.enabled) {
      return { paused: 0, warned: 0, blockedByCap: false };
    }

    // BITTA so'rov: ogohlantirish chegarasidan boshlab hammasi. Pauza
    // ro'yxati shundan ajratiladi — ikkinchi marta hisoblash ro'yxat bilan
    // harakatning zid bo'lishiga yo'l ochardi.
    const rows = await this.streaks.computeStreaks({
      companyId,
      threshold: settings.warnThreshold,
    });

    const toPause = rows.filter(
      (r) => r.consecutiveAbsentCount >= settings.pauseThreshold,
    );
    const toWarn = rows.filter(
      (r) => r.consecutiveAbsentCount < settings.pauseThreshold,
    );

    const targets = await this.loadTargets([...toPause, ...toWarn]);

    // FAIL-CLOSED: nomzodlar chegaradan ko'p bo'lsa HECH KIM pauza
    // qilinmaydi. Davomat noto'g'ri kiritilgan kun yoki migratsiya bir
    // kechada yuzlab o'quvchini muzlatib qo'yishi mumkin, va buni qaytarish
    // yuz marta tugma bosish degani. Ogohlantirishlar chegaraga bog'liq
    // emas — ular hech narsani buzmaydi.
    const blockedByCap = toPause.length > settings.dailyCap;
    if (blockedByCap) {
      await this.notify.alertCeos(
        companyId,
        `Avtomatik pauza to'xtatildi: ${toPause.length} ta nomzod topildi, ` +
          `kunlik chegara esa ${settings.dailyCap}. Hech kim pauza qilinmadi. ` +
          `Davomat ma'lumotini tekshiring yoki chegarani oshiring.`,
      );
    }

    let paused = 0;
    const failures: string[] = [];

    if (!blockedByCap) {
      for (const row of toPause) {
        const target = targets.get(row.enrollmentId);
        if (!target) continue;
        try {
          // Yaxlit tranzaksiya EMAS: mavjud status oqimi tranzaksion emas
          // (ichida faqat oldindan to'langan darslarni qaytarish o'z
          // Serializable tranzaksiyasida ketadi). Nomzodlar bir-biridan
          // mustaqil, shuning uchun bu bezarar — biri yiqilsa boshqasi
          // yarim holatda qolmaydi.
          await this.studentsStatus.pauseForAbsence({
            studentId: row.studentId,
            companyId,
            streak: row.consecutiveAbsentCount,
            lastAbsenceDate: row.lastAbsenceDate,
          });
          paused++;
          await this.notify.announcePause(target);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`#${row.studentId}: ${msg}`);
          this.logger.error(`Pauza yiqildi #${row.studentId}: ${msg}`);
        }
      }
    }

    const warned = await this.sendWarnings(
      companyId,
      toWarn,
      targets,
      settings.pauseThreshold,
    );

    if (failures.length > 0) {
      await this.notify.alertCeos(
        companyId,
        `Avtomatik pauzada ${failures.length} ta xatolik: ${failures.join('; ')}`,
      );
    }

    return { paused, warned, blockedByCap };
  }

  /**
   * Bir qoldirish — bir xabar.
   *
   * Cron har kuni yuradi, sanoq esa keyingi darsgacha o'zgarmaydi. Kunlik
   * marker bo'lsa o'quvchi bir xil xabarni har kuni olardi, shuning uchun
   * marker — qoldirish SANASI.
   */
  private async sendWarnings(
    companyId: number,
    rows: StreakRow[],
    targets: Map<string, PauseTargetRow>,
    pauseThreshold: number,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const already = await this.prisma.absenceWarningLog.findMany({
      where: {
        companyId,
        OR: rows.map((r) => ({
          enrollmentId: r.enrollmentId,
          absenceDate: r.lastAbsenceDate,
        })),
      },
      select: { enrollmentId: true },
    });
    const sentSet = new Set(already.map((a) => a.enrollmentId));

    let warned = 0;
    for (const row of rows) {
      if (sentSet.has(row.enrollmentId)) continue;
      const target = targets.get(row.enrollmentId);
      if (!target) continue;

      const remaining = pauseThreshold - row.consecutiveAbsentCount;
      try {
        const sentToStudent = await this.notify.warnStudent(
          { ...target, streak: row.consecutiveAbsentCount },
          remaining,
        );
        await this.prisma.absenceWarningLog.create({
          data: {
            enrollmentId: row.enrollmentId,
            studentId: row.studentId,
            groupId: row.groupId,
            absenceDate: row.lastAbsenceDate,
            streak: row.consecutiveAbsentCount,
            sentToStudent,
            companyId,
          },
        });
        warned++;
      } catch (err) {
        this.logger.warn(
          `Ogohlantirish yiqildi #${row.studentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return warned;
  }

  private async loadTargets(
    rows: StreakRow[],
  ): Promise<Map<string, PauseTargetRow>> {
    if (rows.length === 0) return new Map();
    const enrollments = await this.prisma.enrollment.findMany({
      where: { id: { in: rows.map((r) => r.enrollmentId) } },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            telegramChatId: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            branchId: true,
            teachers: { select: { teacherId: true } },
          },
        },
      },
    });
    return new Map(
      enrollments.map((e) => [
        e.id,
        {
          enrollmentId: e.id,
          studentId: e.studentId,
          streak: 0,
          student: e.student,
          group: e.group,
        },
      ]),
    );
  }
}

interface PauseTargetRow {
  enrollmentId: string;
  studentId: number;
  streak: number;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    telegramChatId: string | null;
  };
  group: {
    id: string;
    name: string;
    branchId: number;
    teachers: { teacherId: number }[];
  };
}
```

> **Tip bitta bo'lsin.** Yuqoridagi kodda `PauseTargetRow` ni YOZMA —
> notify servisidagi `PauseTarget` ni `export` qil va cron shuni import
> qilsin:
>
> ```typescript
> import {
>   AbsencePauseNotifyService,
>   type PauseTarget,
> } from './absence-pause-notify.service';
> ```
>
> Cron faylining oxiridagi `interface PauseTargetRow { ... }` blokini
> butunlay o'chir va `Map<string, PauseTargetRow>` larni
> `Map<string, PauseTarget>` ga almashtir.

- [ ] **Step 5: Modulni yig'**

`server/src/absence-pause/absence-pause.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AbsencePauseController } from './absence-pause.controller';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { AbsencePauseNotifyService } from './absence-pause-notify.service';
import { AbsenceAutoPauseCronService } from './absence-auto-pause.cron.service';
import { OutreachModule } from '../outreach/outreach.module';
import { StudentsModule } from '../students/students.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [OutreachModule, StudentsModule, NotificationsModule, TelegramModule],
  controllers: [AbsencePauseController],
  providers: [
    AbsencePauseSettingService,
    AbsencePauseNotifyService,
    AbsenceAutoPauseCronService,
  ],
  exports: [AbsencePauseSettingService],
})
export class AbsencePauseModule {}
```

`OutreachModule` dan `AbsenceStreakService` ni, `StudentsModule` dan
`StudentsStatusService` ni eksport qilish kerak bo'lsa — o'sha modullarning
`exports` ro'yxatiga qo'sh. `OutreachModule` hozir faqat `OutreachService`
ni eksport qiladi.

> **Aylanma bog'liqlik xavfi:** Task 5 da `OutreachService`
> `AbsencePauseSettingService` ni oladi, bu yerda esa `AbsencePauseModule`
> `OutreachModule` ni import qiladi. Yechim: Task 5 da `OutreachModule` ga
> `forwardRef(() => AbsencePauseModule)` qo'yiladi va ikkala tomonda
> `@Inject(forwardRef(...))` ishlatiladi. Muqobil (soddaroq): chegarani
> `OutreachService` ga controller orqali uzatish. **Task 5 da qaysi yo'l
> tanlanishi o'sha yerda hal qilinadi.**

- [ ] **Step 6: Testlar o'tishini tekshir**

```bash
cd server && npx jest src/absence-pause && npm run typecheck
```

Kutilgan: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write "server/src/absence-pause/**/*.ts"
git add server/src/absence-pause
git commit -m "$(cat <<'MSG'
Avtomatik pauza cron'i va xabarlar

Har kuni 07:30 (Toshkent) — kechqurun emas, chunki davomatning 5,6% i
keyingi kunlarda tuzatiladi va kechki yurish ularni o'tkazib yuborardi;
bundan tashqari o'quvchi xabarni yarim tunda olmaydi.

Kunlik chegara fail-closed: nomzodlar chegaradan ko'p bo'lsa HECH KIM
pauza qilinmaydi va CEO xabar oladi. Ogohlantirishlar chegaraga bog'liq
emas. Bitta pauza yiqilsa qolganlari davom etadi, xatolar CEO xabariga
yig'iladi.

Xabar yuborish xatosi pauzani yiqitmaydi — pul oqimini to'xtatish
Telegramdan muhimroq.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: Outreach — chegara sozlamadan, «Pauzadagilar» endpointi

**Files:**
- Create: `server/src/absence-pause/absence-pause-setting.module.ts`
- Modify: `server/src/absence-pause/absence-pause.module.ts`
- Modify: `server/src/outreach/outreach.module.ts`
- Modify: `server/src/outreach/outreach.service.ts`
- Modify: `server/src/outreach/outreach.controller.ts`
- Test: `server/src/outreach/outreach.service.spec.ts`
- Test: `server/src/outreach/outreach.controller.spec.ts`

**Interfaces:**
- Consumes: `AbsencePauseSettingService.get(companyId)` (Task 3), `AUTO_PAUSE_REASON_PREFIX` (Task 2)
- Produces:
  - `OutreachService.getAutoPaused(ctx): Promise<{ total: number; items: AutoPausedItem[] }>`
  - `GET /outreach/auto-paused` (CEO, Branch Director, Administrator)
  - `getRemovalQueue` javobiga `pauseThreshold: number` qo'shiladi

### Aylanma bog'liqlikni yechish

`OutreachService` sozlamani o'qishi kerak, `AbsencePauseModule` esa
`AbsenceStreakService` ni `OutreachModule` dan oladi — to'g'ridan-to'g'ri
import qilinsa halqa hosil bo'ladi. `forwardRef` o'rniga sozlama servisi
**o'z kichik moduliga** ajratiladi: uning bog'liqligi yo'q (`PrismaModule`
va `EntityHistoryModule` global), shuning uchun ikkala tomon ham uni
bemalol import qila oladi.

- [ ] **Step 1: Sozlama servisini alohida modulga ajrat**

`server/src/absence-pause/absence-pause-setting.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';

/**
 * Sozlama servisi ataylab o'z modulida — `OutreachModule` ham,
 * `AbsencePauseModule` ham undan o'qiydi, va ikkalasi bitta modulda
 * bo'lsa aylanma bog'liqlik hosil bo'lardi (`AbsencePauseModule` cron
 * uchun `OutreachModule` dan `AbsenceStreakService` ni oladi).
 *
 * `forwardRef` bilan halqani "yechish" ham mumkin edi, lekin u halqani
 * yashiradi; kichik modul uni butunlay yo'q qiladi.
 */
@Module({
  providers: [AbsencePauseSettingService],
  exports: [AbsencePauseSettingService],
})
export class AbsencePauseSettingModule {}
```

`absence-pause.module.ts` dan `AbsencePauseSettingService` provider'ini
olib tashla va o'rniga `AbsencePauseSettingModule` ni import qil:

```typescript
@Module({
  imports: [
    AbsencePauseSettingModule,
    OutreachModule,
    StudentsModule,
    NotificationsModule,
    TelegramModule,
  ],
  controllers: [AbsencePauseController],
  providers: [AbsencePauseNotifyService, AbsenceAutoPauseCronService],
})
export class AbsencePauseModule {}
```

`outreach.module.ts`:

```typescript
@Module({
  imports: [AbsencePauseSettingModule],
  controllers: [OutreachController],
  providers: [OutreachService, AbsenceStreakService],
  exports: [OutreachService, AbsenceStreakService],
})
export class OutreachModule {}
```

- [ ] **Step 2: Testni yoz (yiqiladi)**

`server/src/outreach/outreach.service.spec.ts` ga qo'sh (fayl bo'lmasa yarat):

```typescript
import { OutreachService } from './outreach.service';
import { AUTO_PAUSE_REASON_PREFIX } from '../absence-pause/absence-pause.constants';

describe('OutreachService.getAutoPaused', () => {
  const ctx = {
    userId: 1,
    companyId: 1001,
    roles: ['CEO'],
    branchScope: null,
  };

  function makeService(students: Record<string, unknown>[], branchScope: number[] | null = null) {
    const prisma = {
      student: { findMany: jest.fn().mockResolvedValue(students) },
      callLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const streaks = { computeStreaks: jest.fn().mockResolvedValue([]) };
    const settings = {
      get: jest.fn().mockResolvedValue({
        enabled: true,
        warnThreshold: 2,
        pauseThreshold: 3,
        dailyCap: 10,
      }),
    };
    return {
      service: new OutreachService(
        prisma as never,
        streaks as never,
        settings as never,
      ),
      prisma,
      settings,
    };
  }

  it("faqat AVTOMATIK muzlatilganlarni beradi", async () => {
    const { service, prisma } = makeService([]);
    await service.getAutoPaused({ ...ctx });
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FROZEN',
          statusChangeReason: { startsWith: AUTO_PAUSE_REASON_PREFIX },
        }),
      }),
    );
  });

  it("bo'sh filial qamrovida hech narsa qaytarmaydi", async () => {
    const { service, prisma } = makeService([], []);
    const r = await service.getAutoPaused({ ...ctx, branchScope: [] });
    expect(r).toEqual({ total: 0, items: [] });
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it("ogohlantirilgan sana qatorga qo'shiladi", async () => {
    // absenceWarningLog mock'ini makeService ichiga qo'sh:
    //   absenceWarningLog: { findMany: jest.fn().mockResolvedValue([
    //     { enrollmentId: 'e-1', absenceDate: new Date('2026-09-12T00:00:00.000Z') },
    //   ]) }
    // va enrollment/student mock'lari bitta 'e-1' qatorini bersin.
    // Kutilgan: items[0].warnedAt === '2026-09-12T00:00:00.000Z'
  });

  it("chegara sozlamadan olinadi, qat'iy 3 emas", async () => {
    const { service, settings } = makeService([]);
    const streaksMock = (service as never as { absenceStreak: { computeStreaks: jest.Mock } })
      .absenceStreak;
    await service.getRemovalQueue({ ...ctx });
    expect(settings.get).toHaveBeenCalledWith(1001);
    expect(streaksMock.computeStreaks).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 2 }),
    );
  });
});
```

> Konstruktor argumentlari tartibini haqiqiy `OutreachService` bilan
> moslashtir — quyidagi Step 3 da uchinchi argument qo'shiladi.

- [ ] **Step 3: `OutreachService` ga sozlamani ulash**

Konstruktor:

```typescript
  constructor(
    private prisma: PrismaService,
    private absenceStreak: AbsenceStreakService,
    private pauseSettings: AbsencePauseSettingService,
  ) {}
```

`getStats` va `getRemovalQueue` dagi `threshold: 3` ni almashtir:

```typescript
    // Chegara sozlamadan — CEO uni 3 dan 4 ga o'zgartirsa, bu ro'yxat ham
    // darhol ergashadi. Qat'iy 3 qolsa, avtomatika bir chegarada ishlab,
    // admin boshqa ro'yxatni ko'rib turardi.
    const settings = await this.pauseSettings.get(ctx.companyId);
```

`getRemovalQueue` da:

```typescript
    const streaks = await this.absenceStreak.computeStreaks({
      companyId: ctx.companyId,
      branchIds,
      threshold: settings.warnThreshold,
    });
```

Har qatorga **ogohlantirilgan sana**ni qo'sh — admin kimga xabar ketganini
ko'rib, takror qo'ng'iroq qilmasin. `enrollmentIds` allaqachon qo'lda:

```typescript
    // Ogohlantirish yuborilganmi — "Ogohlantirildi 12.09" belgisi uchun.
    // Bitta so'rov: har yozuv uchun eng oxirgi jurnal qatori.
    const warnLogs = await this.prisma.absenceWarningLog.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      orderBy: { absenceDate: 'desc' },
      select: { enrollmentId: true, absenceDate: true },
    });
    const warnedAtByEnrollment = new Map<string, Date>();
    for (const w of warnLogs) {
      if (!warnedAtByEnrollment.has(w.enrollmentId)) {
        warnedAtByEnrollment.set(w.enrollmentId, w.absenceDate);
      }
    }
```

`items` ni qurayotgan `map` ichiga:

```typescript
          warnedAt:
            warnedAtByEnrollment.get(s.enrollmentId)?.toISOString() ?? null,
```

Qaytish qiymatiga `pauseThreshold` qo'sh — klient «pauzagacha N» ni shundan
hisoblaydi:

```typescript
    return {
      total: items.length,
      pauseThreshold: settings.pauseThreshold,
      items,
    };
```

`getStats` da ham `threshold: settings.warnThreshold` — **lekin** hisoblagich
pauza nomzodlarini ko'rsatishi kerak, ogohlantirilganlarni emas:

```typescript
      removalQueue: streaks.filter(
        (s) => s.consecutiveAbsentCount >= settings.pauseThreshold,
      ).length,
```

> Bu bosh sahifadagi «e'tibor» raqamiga ham ta'sir qiladi
> (`DashboardSummaryService` shu `getStats` dan o'qiydi) — raqam hozirgidek
> pauza yoqasidagilarni sanab turadi.

- [ ] **Step 4: `getAutoPaused` ni yoz**

`outreach.service.ts` ga qo'sh:

```typescript
  /**
   * Avtomatik pauzaga tushgan o'quvchilar — «Pauzadagilar» tabi.
   *
   * Qo'lda muzlatilganlar ARALASHMAYDI: prodda 209 ta muzlatilgan o'quvchi
   * bor va ularning aksariyati boshqa sabablar bilan muzlatilgan. Ajratish
   * belgisi — sabab matnining boshlanishi (`AUTO_PAUSE_REASON_PREFIX`),
   * cron ham, bu yer ham bitta konstantadan o'qiydi.
   */
  async getAutoPaused(ctx: UserContext) {
    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) {
      return { total: 0, items: [] };
    }

    const students = await this.prisma.student.findMany({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        status: StudentStatus.FROZEN,
        statusChangeReason: { startsWith: AUTO_PAUSE_REASON_PREFIX },
        ...(branchIds
          ? { branches: { some: { branchId: { in: branchIds } } } }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        parentPhone: true,
        photo: true,
        balance: true,
        statusChangedAt: true,
        statusChangeReason: true,
        enrollments: {
          where: { status: EnrollmentStatus.FROZEN, deletedAt: null },
          orderBy: { statusChangedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            group: {
              select: {
                id: true,
                name: true,
                course: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { statusChangedAt: 'desc' },
    });

    const calledSet = await this.getCalledStudentIds(
      ctx.companyId,
      students.map((s) => s.id),
      tashkentDateStr(new Date()),
    );

    const items = students.map((s) => ({
      studentId: s.id,
      pausedAt: s.statusChangedAt?.toISOString() ?? null,
      reason: s.statusChangeReason,
      calledToday: calledSet.has(s.id),
      student: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        parentPhone: s.parentPhone,
        photo: s.photo,
        balance: s.balance,
      },
      group: s.enrollments[0]?.group ?? null,
    }));

    return { total: items.length, items };
  }
```

Import'larga qo'sh:

```typescript
import { AttendanceStatus, EnrollmentStatus, StudentStatus } from '@prisma/client';
import { AbsencePauseSettingService } from '../absence-pause/absence-pause-setting.service';
import { AUTO_PAUSE_REASON_PREFIX } from '../absence-pause/absence-pause.constants';
```

> `StudentBranch` munosabati nomi (`branches`) va `Student.balance` tipini
> `server/src/students/shared/student-select.ts` dan tekshirib moslashtir.

- [ ] **Step 5: Controller endpointini qo'sh**

`outreach.controller.ts`:

```typescript
  @Get('auto-paused')
  getAutoPaused(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.outreach.getAutoPaused({
      userId,
      companyId,
      roles,
      branchScope,
    });
  }
```

Sinf darajasidagi `@Roles('CEO', 'Branch Director', 'Administrator')`
o'z-o'zidan qo'llanadi — qo'shimcha dekorator kerak emas.

- [ ] **Step 6: Testlar o'tishini tekshir**

```bash
cd server && npx jest src/outreach src/absence-pause && npm run typecheck
```

Kutilgan: PASS. `src/dashboard` testlari ham o'tishi kerak — ular
`OutreachService` ni mock qiladi, lekin konstruktor o'zgargani uchun
mock'larni tekshir:

```bash
cd server && npx jest src/dashboard
```

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write "server/src/outreach/**/*.ts" "server/src/absence-pause/**/*.ts"
git add server/src/outreach server/src/absence-pause
git commit -m "$(cat <<'MSG'
Outreach: chegara sozlamadan, Pauzadagilar ro'yxati

Ro'yxat va avtomatika bitta chegaradan o'qiydi — qat'iy 3 qolsa, CEO
chegarani 4 ga o'zgartirganda admin boshqa ro'yxatni ko'rib turardi.

Pauzadagilar tabi qo'lda muzlatilgan 209 o'quvchi bilan aralashmasligi
uchun sabab matnining prefiksi bo'yicha ajratadi; cron ham, o'qish ham
bitta konstantadan.

Sozlama servisi o'z kichik moduliga ajratildi — aks holda
AbsencePauseModule va OutreachModule aylanma bog'liqlik hosil qilardi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: Klient — sozlamalar sahifasi

**Files:**
- Create: `client/src/app/(dashboard)/settings/absence-pause/page.tsx`
- Create: `client/src/components/settings/absence-pause-settings-client.tsx`
- Modify: `client/src/lib/settings-nav.ts`
- Modify: `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: `GET/PATCH /absence-pause/settings` (Task 3)
- Produces: `/settings/absence-pause` sahifasi

- [ ] **Step 1: Mavjud sozlama sahifasini namuna sifatida o'qi**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
ls client/src/app/\(dashboard\)/settings/
cat client/src/app/\(dashboard\)/settings/holidays/page.tsx
```

Yangi sahifa **aynan shu naqshni** takrorlasin: server komponenti sahifa,
ichida `"use client"` komponenti, TanStack Query bilan `apiClient`.

- [ ] **Step 2: Menyuga qator qo'sh**

`client/src/lib/settings-nav.ts` — «Administratsiya» bo'limiga, «Sabablar»dan keyin:

```typescript
      {
        title: "Avtomatik pauza",
        url: "/settings/absence-pause",
        icon: PauseCircle,
        visibleForRoles: [1, 2],
      },
```

`PauseCircle` ni `lucide-react` importiga qo'sh.

> `visibleForRoles: [1, 2]` — CEO va filial direktori. Yozish serverda
> faqat CEO; direktor ko'radi, lekin saqlay olmaydi (tugma o'chiq).

- [ ] **Step 3: Breadcrumb qo'sh**

`client/src/lib/breadcrumb-routes.ts` ga `/settings/absence-pause` → `"Avtomatik pauza"`.

- [ ] **Step 4: Forma komponentini yoz**

`client/src/components/settings/absence-pause-settings-client.tsx`:

Ma'lumot qatlami — aynan shunday (uslub va komponentlarni mavjud sozlama
sahifasidan ko'chir):

```typescript
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

interface AbsencePauseSettings {
  enabled: boolean;
  warnThreshold: number;
  pauseThreshold: number;
  dailyCap: number;
}

export function AbsencePauseSettingsClient({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AbsencePauseSettings | null>(null);

  const { data, isLoading } = useQuery<AbsencePauseSettings>({
    queryKey: ["absence-pause-settings"],
    queryFn: async () => {
      const res = await apiClient.get("/absence-pause/settings");
      return res.data;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: AbsencePauseSettings) => {
      const res = await apiClient.patch("/absence-pause/settings", next);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absence-pause-settings"] });
      toast.success("Saqlandi");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Saqlashda xatolik";
      toast.error(message);
    },
  });

  // Teng bo'lsa ogohlantirish pauza bilan bir kunda ketadi va ma'nosi
  // qolmaydi. Server ham tekshiradi — bu faqat darhol javob berish uchun.
  const thresholdsInvalid =
    !!form && form.warnThreshold >= form.pauseThreshold;

  // ...render: Switch (enabled) + uchta raqamli input + Saqlash tugmasi
  // (disabled={!canEdit || thresholdsInvalid || save.isPending})
}
```

`canEdit` sahifadan keladi: `useAuth()` dan rol o'qib, `roles.includes("CEO")`.

Ko'rinish talablari:

- `useQuery(["absence-pause-settings"])` → `GET /absence-pause/settings`
- `useMutation` → `PATCH /absence-pause/settings`, muvaffaqiyatda
  `invalidateQueries` + `toast.success("Saqlandi")`
- Maydonlar:
  - `enabled` — `Switch`. Yorlig'i: **«Avtomatik pauza yoqilgan»**.
    Ostida tushuntirish: «Ketma-ket dars qoldirgan o'quvchi har kuni
    ertalab soat 07:30 da avtomatik pauzaga o'tkaziladi.»
  - `warnThreshold` — son, 1–10. Yorliq: «Ogohlantirish (necha darsdan keyin)»
  - `pauseThreshold` — son, 2–20. Yorliq: «Pauza (necha darsdan keyin)»
  - `dailyCap` — son, 1–100. Yorliq: «Bir kunda ko'pi bilan».
    Ostida: «Shunchadan ko'p nomzod topilsa, hech kim pauza qilinmaydi va
    sizga xabar keladi.»
- Klientda ham `warnThreshold < pauseThreshold` tekshiruvi: teng yoki katta
  bo'lsa Saqlash tugmasi o'chiq va qizil izoh chiqadi
  («Ogohlantirish chegarasi pauza chegarasidan kichik bo'lishi kerak»).
  Server baribir tekshiradi — bu faqat darhol javob berish uchun.
- CEO bo'lmasa (`useAuth` dan rol) — barcha maydonlar `disabled`, va
  yuqorida izoh: «Bu sozlamani faqat rahbar o'zgartira oladi.»
- «Pauzadagilarni ko'rish» havolasi → `/outreach?tab=paused`

- [ ] **Step 5: Brauzerda tekshir**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
# Dev serverlar ishlayotganini tekshir; kerak bo'lsa /restart
```

Qo'lda tekshiruv ro'yxati:
1. `/settings/absence-pause` ochiladi, sukut qiymatlar: o'chiq, 2, 3, 10.
2. Ogohlantirishni 3 ga qo'y (pauza ham 3) → Saqlash o'chib qoladi.
3. Ogohlantirishni 2 ga qaytar, yoqish tugmasini bos, saqla → «Saqlandi».
4. Sahifani yangila → qiymat saqlangan.
5. **Saqlagandan keyin yana o'chirib qo'y** — bu worktree dev bazaga
   ulangan, lekin odatni saqlaymiz: yoqish prod'da ongli qadam.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write "client/src/components/settings/absence-pause-settings-client.tsx" "client/src/app/(dashboard)/settings/absence-pause/page.tsx" client/src/lib/settings-nav.ts client/src/lib/breadcrumb-routes.ts
git add client/src
git commit -m "$(cat <<'MSG'
Sozlamalar: avtomatik pauza sahifasi

Yoqish/o'chirish, ikki chegara va kunlik chegara CEO qo'lida — 2026-07-14
da avtomatik guruh yopishni o'chirish uchun deploy kerak bo'lgan edi.

Filial direktori ko'radi, lekin saqlay olmaydi: sozlama butun
kompaniyaga taalluqli.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: Klient — «Pauzadagilar» tabi va «pauzagacha N» ustuni

**Files:**
- Create: `client/src/components/outreach/paused-tab.tsx`
- Modify: `client/src/components/outreach/outreach-page-client.tsx`
- Modify: `client/src/components/outreach/outreach-types.ts`
- Modify: `client/src/components/outreach/removal-queue-tab.tsx`

**Interfaces:**
- Consumes: `GET /outreach/auto-paused`, `GET /outreach/removal-queue` (`pauseThreshold` bilan) — Task 5
- Produces: `/outreach?tab=paused`

- [ ] **Step 1: Tiplarni qo'sh**

`client/src/components/outreach/outreach-types.ts` ga:

```typescript
export interface AutoPausedItem {
  studentId: number;
  // Qachon pauzaga o'tkazilgan (ISO).
  pausedAt: string | null;
  // "Avtomatik pauza: 3 ta ketma-ket dars qoldirildi (oxirgisi 12.09.2026)"
  reason: string | null;
  calledToday: boolean;
  student: OutreachStudentWithParent & { balance: number };
  group: OutreachGroupSummary | null;
}

export interface AutoPausedResponse {
  total: number;
  items: AutoPausedItem[];
}
```

`RemovalQueueResponse` ga qo'sh:

```typescript
export interface RemovalQueueResponse {
  total: number;
  // Sozlamadagi pauza chegarasi — "pauzagacha N dars" shu yerdan hisoblanadi.
  pauseThreshold: number;
  items: RemovalQueueItem[];
}
```

- [ ] **Step 2: «Pauzadagilar» tabini yoz**

`client/src/components/outreach/paused-tab.tsx` — `removal-queue-tab.tsx`
ni namuna qilib ol (jadval, `calledToday` belgisi, qo'ng'iroq tugmasi,
`isActive` bilan kechiktirilgan `useQuery`).

Ustunlar:

| Ustun | Mazmun |
|---|---|
| O'quvchi | rasm + ism + telefon, profilga havola |
| Guruh | guruh nomi + kurs + filial |
| Pauza sanasi | `pausedAt`, `dd.MM.yyyy` |
| Sabab | `reason` matni (necha dars qoldirgani shu yerda) |
| Balans | manfiy bo'lsa qizil |
| Amallar | **«Faollashtirish»** + «Qo'ng'iroq» |

«Faollashtirish» tugmasi:

```typescript
const reactivate = useMutation({
  mutationFn: (studentId: number) =>
    apiClient.patch(`/students/${studentId}/status`, { status: "ACTIVE" }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["outreach-auto-paused"] });
    queryClient.invalidateQueries({ queryKey: ["outreach-stats"] });
    toast.success("O'quvchi faollashtirildi");
  },
});
```

Tugma `AlertDialog` bilan tasdiqlansin. Matn:

> **{ism}ni faollashtirishni tasdiqlang**
>
> O'quvchi guruh ro'yxatiga qaytadi va darslari uchun yana hisob yozila
> boshlaydi. Ketma-ket qoldirish sanogi noldan boshlanadi.

> **Diqqat:** `PATCH /students/:id/status` ga `ACTIVE` uchun sabab
> talab qilinmaydi (`STATUS_TO_EXIT_TYPE` da `ACTIVE` yo'q), shuning uchun
> faqat `{ status: "ACTIVE" }` yuboriladi.

- [ ] **Step 3: 4-tabni ulang**

`outreach-page-client.tsx`:

```typescript
const VALID_TABS = new Set(["absentees", "removals", "paused", "history"]);
```

```tsx
          <TabsTrigger value="removals">Ko&apos;p dars qoldirganlar</TabsTrigger>
          <TabsTrigger value="paused">Pauzadagilar</TabsTrigger>
```

```tsx
        <TabsContent value="paused" className="mt-4">
          <PausedTab
            isActive={activeTab === "paused"}
            onLogCall={openLogCall}
          />
        </TabsContent>
```

- [ ] **Step 4: «Ko'p dars qoldirganlar» tabiga ustun qo'sh**

`removal-queue-tab.tsx` da, `consecutiveAbsentCount` ustuni yonida:

```tsx
<TableCell>
  {(() => {
    const left = (data?.pauseThreshold ?? 3) - item.consecutiveAbsentCount;
    if (left <= 0) {
      return (
        <Badge variant="destructive">Pauza yoqasida</Badge>
      );
    }
    return (
      <span className="text-muted-foreground text-sm">
        Pauzagacha {left} ta dars
      </span>
    );
  })()}
</TableCell>
```

Sarlavhaga «Pauzagacha» ustunini qo'sh.

Shu ustun yoniga ogohlantirish belgisi (admin takror qo'ng'iroq qilmasin):

```tsx
{item.warnedAt && (
  <Badge variant="outline" className="ml-2">
    Ogohlantirildi {format(new Date(item.warnedAt), "dd.MM")}
  </Badge>
)}
```

`RemovalQueueItem` ga tipni qo'shishni unutma:

```typescript
  // Ogohlantirish yuborilgan qoldirish sanasi (null = hali yuborilmagan).
  warnedAt: string | null;
```

- [ ] **Step 5: Brauzerda tekshir**

1. `/outreach` → «Pauzadagilar» tabi ochiladi (dev bazada bo'sh bo'lishi mumkin).
2. Dev bazada qo'lda bitta o'quvchini profil orqali muzlatib ko'r — u
   **ro'yxatda chiqmasligi** kerak (sababi prefiksga mos emas). Bu
   ajratish ishlayotganining dalili.
3. «Ko'p dars qoldirganlar» tabida «Pauzagacha N ta dars» ustuni ko'rinadi.

> Dev baza bo'sh bo'lsa natija **dalil emas** — 2-qadam (qo'lda muzlatish
> ro'yxatga tushmasligi) aynan shuning uchun bor.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
npx prettier --write "client/src/components/outreach/*.tsx" client/src/components/outreach/outreach-types.ts
git add client/src/components/outreach
git commit -m "$(cat <<'MSG'
Aloqa markazi: Pauzadagilar tabi va "pauzagacha N" ustuni

Avtomatika yoqilgach "Ko'p dars qoldirganlar" adminning qo'ng'iroq
ro'yxatiga aylanadi — chegaraga yetganlar ertalab o'zi pauzaga tushadi,
shuning uchun har qatorda qancha dars qolgani ko'rinadi.

Faollashtirish bir tugma: o'quvchi ro'yxatga qaytadi va sanoq noldan
boshlanadi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: ADR, hujjatlar va yakuniy tekshiruv

**Files:**
- Create: `docs/adr/0023-avtomatik-pauza-chiqarmaydi.md`
- Modify: `docs/adr/README.md`
- Modify: `server/CLAUDE.md`
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: hamma oldingi tasklar
- Produces: hujjatlar

> **ADR raqami 0023, 0022 EMAS.** 0022 (`0022-bir-odam-har-rolga-alohida-hisob.md`)
> 19.09.2026 da PR #503 bilan band qilingan. Yozishdan oldin
> `ls docs/adr/` bilan yana bir bor tekshir.

- [ ] **Step 1: ADR yoz**

`docs/adr/0023-avtomatik-pauza-chiqarmaydi.md` — `docs/adr/0000-shablon.md`
tuzilishida, o'zbekcha. Qamrovi:

- **Kontekst:** kelmagan dars billable; ketgan o'quvchiga qarz yozilaveradi,
  markaz ustoz oyligini qoplaydi (90 kunda 2 812 ABSENT = 43,3 mln, shundan
  7,7 mln markaz cho'ntagidan, 4,3 mln qaytmagan). Prod tahlili: 2 ta
  qoldirganlarning 66% i qaytadi, 3 tada 42%, 4 tada 23%.
- **Qaror 1 — harakat `FROZEN`, `DROPPED` emas.** 3 ta qoldirganlarning
  42% i qaytib keladi; chiqarish ularni qayta ro'yxatga olishni talab
  qiladi, muzlatish esa bir tugma bilan qaytariladi. Muzlatish pul
  oqimini xuddi shunday to'xtatadi.
- **Qaror 2 — yangi tushuncha kiritilmaydi.** Tizimda bir o'quvchi = bir
  faol yozuv (`enrollToGroup` mavjud faol yozuvni ko'chirish deb yopadi;
  prodda 449 = 449), shuning uchun mavjud o'quvchi darajasidagi muzlatish
  yetarli.
- **Qaror 3 — kunlik chegara fail-closed.** Oshsa hech kim pauza
  qilinmaydi. Sabab: noto'g'ri davomat kiritilgan kun yuzlab o'quvchini
  muzlatishi mumkin va qaytarish yuz marta tugma bosish degani.
  ADR-0002 dagi bir xil mantiq.
- **Qaror 4 — faollashtirish sanoqni noldan boshlaydi.** Aks holda cron
  faollashtirilgan o'quvchini ertasiga yana pauza qilib, admin hech qachon
  yuta olmaydigan halqa hosil bo'lardi.
- **Oqibatlar:** «faol o'quvchi» soni tushadi; «Muzlatilgan» ro'yxatida
  avtomatik va qo'lda muzlatilganlar sabab matni bilan ajraladi;
  `/outreach` ro'yxatining ta'rifi o'zgaradi (bitta funksiyadan o'qiladi);
  o'quvchi ilovasida guruh jadvaldan yo'qoladi.
- **Rad etilgan variantlar:** 2 ta chegara (66% qaytadi); avtomatik
  chiqarish; quruq rejim (CEO darrov yoqishni tanladi — o'rniga
  `enabled=false` migratsiya + kunlik chegara + o'chirish tugmasi).

`docs/adr/README.md` indeksiga qator qo'sh.

- [ ] **Step 2: `server/CLAUDE.md` ga bo'lim qo'sh**

**Inglizcha** (bu fayl faqat inglizcha), «Attendance (Davomat)» bo'limidan
keyin, `#### Automatic pause after consecutive absences` sarlavhasi bilan.
Yozilishi shart bo'lganlar:

- `AbsenceStreakService.computeStreaks` is the ONE definition; `/outreach`
  and the cron both read it. Three rules that are NOT obvious: the counting
  window (`streakWindowStart` — reactivation resets the count, without which
  the cron re-pauses a reactivated student the next morning), a planned
  `SABABSIZ` absence counts even though it lands as `EXCUSED`, and a
  cancelled lesson (`cancellationId`) is invisible to the count.
- The pause IS the existing student-level `FROZEN`, run under a `system`
  actor (`StatusChangeActor`). The system path knows **only**
  `ACTIVE → FROZEN`; it skips the branch check and the reason list, and
  writes `changedById = undefined`.
- The daily cap is **fail-closed**: over the cap, NOBODY is paused and the
  CEOs are alerted. Do not "fix" this by pausing the first N.
- `AbsenceWarningLog` unique `(enrollmentId, absenceDate)` — one absence,
  one message. A per-day marker would re-send the same warning daily.
- `AbsencePauseSetting.enabled` defaults to **false**; the migration pauses
  nobody by itself.
- The setting lives in its own module (`AbsencePauseSettingModule`) so
  `OutreachModule` and `AbsencePauseModule` do not form a cycle.

- [ ] **Step 3: `CONTEXT.md` ga atama qo'sh**

«Avtomatik pauza» atamasini, ta'rifi va uni belgilaydigan fayl bilan
(`server/src/absence-pause/absence-auto-pause.cron.service.ts`).

- [ ] **Step 4: To'liq tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza/server
npm test
npm run typecheck
npx eslint src
```

Uchalasi ham toza bo'lishi SHART. Lint'da **xatolar** (warning emas) nolga
tushsin.

```bash
cd ../client
npm run build
```

- [ ] **Step 5: Prod'da quruq tekshiruv (READ-ONLY)**

`server/scripts/_dryrun-auto-pause.ts` — cron nima qilishini **yozmasdan**
ko'rsatadi:

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AbsenceStreakService } from '../src/outreach/absence-streak.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const WARN = 2;
  const PAUSE = 3;
  const CAP = 10;

  const svc = new AbsenceStreakService(prisma as never);
  const rows = await svc.computeStreaks({ companyId: 1001, threshold: WARN });
  const toPause = rows.filter((r) => r.consecutiveAbsentCount >= PAUSE);
  const toWarn = rows.filter((r) => r.consecutiveAbsentCount < PAUSE);

  console.log(`PAUZA bo'ladi: ${toPause.length} ta (chegara ${CAP})`);
  if (toPause.length > CAP) {
    console.log('  => CHEGARA OSHDI: hech kim pauza qilinmasdi, CEO xabar olardi');
  }
  for (const r of toPause) {
    console.log(`  #${r.studentId} — ${r.consecutiveAbsentCount} dars`);
  }
  console.log(`OGOHLANTIRISH oladi: ${toWarn.length} ta`);
  for (const r of toWarn) {
    console.log(`  #${r.studentId} — ${r.consecutiveAbsentCount} dars`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
```

```bash
cd server && railway run npx ts-node --transpile-only scripts/_dryrun-auto-pause.ts
```

Kutilgan: pauza ≈5, ogohlantirish ≈21. **Agar pauza 10 dan oshsa — to'xta
va CEO ga xabar ber**, chunki birinchi yurishda fail-closed ishlab, hech
kim pauza qilinmaydi.

- [ ] **Step 6: Commit va PR**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avtomatik-pauza
git add docs server/CLAUDE.md CONTEXT.md
git commit -m "$(cat <<'MSG'
ADR-0023: avtomatik pauza o'quvchini guruhdan chiqarmaydi

3 ta ketma-ket qoldirganlarning 42% i qaytib keladi — chiqarish ularni
qayta ro'yxatga olishni talab qilardi, muzlatish esa bir tugma bilan
qaytariladi va pul oqimini xuddi shunday to'xtatadi.

Kunlik chegara fail-closed (ADR-0002 mantiqi) va faollashtirish sanoqni
noldan boshlashi ham shu yerda yozildi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
git push -u origin feat/avtomatik-pauza
```

PR tavsifi: muammo (prod raqamlari), CEO qarorlari, nima o'zgaradi,
**yoqish alohida qadam ekani** (`enabled=false` bilan chiqadi), birinchi
yurishda kutilayotgan ta'sir (≈5 pauza, ≈21 ogohlantirish), va migratsiya
tartibi. Oxirida:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Deploydan keyin (CEO bilan)

Bu **kod emas** — reja bajarilgandan keyingi operatsion qadamlar.
[Xotira: deploy qo'lda](../../../CLAUDE.md) — Railway/Vercel GitHub'ga
ulanmagan, merge o'z-o'zidan hech narsa chiqarmaydi.

1. Railway (server) va Vercel (klient) ga qo'lda deploy.
2. Prod bazaga migratsiya: `npm run db:migrate:deploy`.
3. `/settings/absence-pause` ochib, **sozlamalarni tekshir** — o'chiq,
   2 / 3 / 10 bo'lishi kerak.
4. CEO ga ko'rsatib, **u yoqsin**.
5. **Ertasi kuni 08:00 dan keyin** natijani tekshir: `/outreach?tab=paused`
   — kimlar tushgani va ular haqiqatan ketganmi.
6. Bir hafta o'tgach: `AbsenceWarningLog` bo'yicha
   «ogohlantirilganlarning nechtasi qaytdi?» ni o'lchab, chegara
   to'g'ri tanlanganini tasdiqla.
