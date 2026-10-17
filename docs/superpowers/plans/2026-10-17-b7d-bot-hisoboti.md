# B7d «Bot hisoboti» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the «Bot hisoboti» page (`/reports/bot`) on one cohort — the people the bot stopped in the chosen Tashkent month — so the three figures can never exceed 100% and the list agrees with the cards.

**Architecture:** A pure module `server/src/telegram/gate-cohort.ts` classifies each `TelegramChannelGateEvent` row (`waiting | joined | left`) and sums a cohort; `TelegramChannelGateStatsService.getSummary/getList` read the rows and hand them to it; the controller validates `month`. The client replaces its two files with a month-stepper page, one cards component and a paginated table, all reading the server's numbers and `state`.

**Tech Stack:** NestJS + Prisma 7 + Jest (server); Next.js 16 + React Query + Vitest (client).

Spec: `docs/superpowers/specs/2026-10-17-b7d-bot-hisoboti-design.md`. Maket: https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL (`v-bot`).

## Global Constraints

- Work only in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b7b-markaz`, branch `feat/b7d-bot-hisoboti`. Never `cd` outside it.
- **Cohort** = rows whose `blockedAt` falls in the chosen Tashkent month: `tashkentMonthRangeUtc(month)` → `blockedAt >= gte` and `< lt` (upper bound exclusive). Rows with `blockedAt = null` never enter it.
- **`classifyGateRow`** (a row that has `blockedAt`): no `joinedAt` → `waiting`; `joinedAt` and `leftAt` → `left` if `joinedAt >= blockedAt`, else `waiting`; `joinedAt` and no `leftAt` → `joined`.
- **Figures:** `blocked` = cohort size; `joined` = `joined` + `left` rows; `left` = `left` rows; `conversionRate` = `blocked > 0 ? Math.round(joined / blocked * 100) : 0`; `waiting` (today, all blocked rows, not tied to the month) = rows classified `waiting`.
- **Month rule:** `?month=YYYY-MM`; empty = current Tashkent month; unreadable → 400 «Oy YYYY-MM ko'rinishida bo'lishi kerak»; before 2026-05 → 400 «Bot hisoboti may 2026 dan boshlanadi»; after the current month → 400 «Kelajak oyni tanlab bo'lmaydi».
- The route paths `GET /telegram/channel-report/summary|list`, the capability `reports.students` and `branch-route-policy.ts` stay as they are. No migration, no script.
- Response keys of `summary`: `blocked, joined, left, conversionRate, waiting, channelMembers, gateEnabled, channel, month`. `organicJoins`, `stillMemberViaGate`, `joinedViaGate`, `leftAfterJoin` are gone.
- Client: all on-screen text is Uzbek Latin and contains none of the English words in `ENGLISH` of `client/src/lib/uzbek-only-texts.test.ts`. URL key `oy` (empty = current month), `page`, `pageSize` (10–50, default 10). The client computes no figure.
- Server files: run `npx prettier --write <files>` on every touched `.ts` before committing. **Never run prettier in `client/`.** Never run prettier on `server/src/common/permissions/`.
- Commit messages are English and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- New files stay under 500 lines.

## File Structure

Server (`server/src/telegram/`):
- Create `gate-cohort.ts` — pure: `GATE_FIRST_MONTH`, `parseGateMonth`, `GateState`, `GateRowTimes`, `classifyGateRow`, `withBlocked`, `CohortFigures`, `cohortFigures`, `waitingNow`.
- Create `gate-cohort.spec.ts`.
- Modify `telegram-channel-gate-stats.service.ts` — `getSummary(month)`, `getList({ month, page, pageSize })`.
- Modify `telegram-channel-gate-stats.service.spec.ts` — add `getSummary` and `getList` cases.
- Modify `telegram-channel-report.controller.ts` and `telegram-channel-report.controller.spec.ts`.

Client (`client/src/components/reports/bot/`):
- Create `bot-report-types.ts`, `bot-report-url.ts` (+ `.test.ts`), `bot-report-format.ts` (+ `.test.ts`), `bot-report-queries.ts`.
- Rewrite `bot-report-client.tsx` (page), `bot-report-table.tsx`; create `bot-report-cards.tsx`.
- Modify `client/src/lib/uzbek-only-texts.test.ts` (add the bot folder).

Docs: `docs/adr/0105-bot-hisoboti-oy-kohorti.md`, `docs/adr/README.md`, `client/src/qollanma/kontent/hisobotlar/bot-hisoboti.mdx`, `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`, `CONTEXT.md`, `server/CLAUDE.md`, `client/CLAUDE.md`.

---

### Task 1: Pure cohort module (server)

**Files:**
- Create: `server/src/telegram/gate-cohort.ts`
- Test: `server/src/telegram/gate-cohort.spec.ts`

**Interfaces:**
- Produces (used by Task 2):
  - `GATE_FIRST_MONTH = '2026-05'`
  - `parseGateMonth(month: string | undefined, now: Date): string`
  - `type GateState = 'waiting' | 'joined' | 'left'`
  - `interface GateRowTimes { blockedAt: Date; joinedAt: Date | null; leftAt: Date | null }`
  - `classifyGateRow(row: GateRowTimes): GateState`
  - `withBlocked<T extends { blockedAt: Date | null }>(rows: readonly T[]): (T & { blockedAt: Date })[]`
  - `interface CohortFigures { blocked: number; joined: number; left: number; conversionRate: number }`
  - `cohortFigures(rows: readonly GateRowTimes[]): CohortFigures`
  - `waitingNow(rows: readonly GateRowTimes[]): number`

- [ ] **Step 1: Write the failing test**

Create `server/src/telegram/gate-cohort.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import {
  classifyGateRow,
  cohortFigures,
  parseGateMonth,
  waitingNow,
  withBlocked,
  type GateRowTimes,
} from './gate-cohort';

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 10, 0, 0));
const row = (over: Partial<GateRowTimes> = {}): GateRowTimes => ({
  blockedAt: at(10),
  joinedAt: null,
  leftAt: null,
  ...over,
});

describe('parseGateMonth', () => {
  // 30.09 20:00 UTC is 01.10 01:00 in Tashkent: the month has already turned.
  const now = new Date('2026-09-30T20:00:00Z');

  it('an empty month is the current Tashkent month', () => {
    expect(parseGateMonth(undefined, now)).toBe('2026-10');
    expect(parseGateMonth('', now)).toBe('2026-10');
  });

  it('accepts the floor and the current month', () => {
    expect(parseGateMonth('2026-05', now)).toBe('2026-05');
    expect(parseGateMonth('2026-10', now)).toBe('2026-10');
  });

  it('refuses an unreadable month', () => {
    expect(() => parseGateMonth('salom', now)).toThrow(BadRequestException);
    expect(() => parseGateMonth('2026-13', now)).toThrow(
      "Oy YYYY-MM ko'rinishida bo'lishi kerak",
    );
  });

  it('refuses a month before the reporting base', () => {
    expect(() => parseGateMonth('2026-04', now)).toThrow(
      'Bot hisoboti may 2026 dan boshlanadi',
    );
  });

  it('refuses a future month', () => {
    expect(() => parseGateMonth('2026-11', now)).toThrow(
      "Kelajak oyni tanlab bo'lmaydi",
    );
  });
});

describe('classifyGateRow', () => {
  it('never joined → waiting', () => {
    expect(classifyGateRow(row())).toBe('waiting');
  });

  it('joined after the block and still a member → joined', () => {
    expect(classifyGateRow(row({ joinedAt: at(12) }))).toBe('joined');
  });

  it('joined after the block and left later → left', () => {
    expect(classifyGateRow(row({ joinedAt: at(12), leftAt: at(20) }))).toBe(
      'left',
    );
  });

  it('a member before the block who left, then was blocked → waiting', () => {
    expect(classifyGateRow(row({ joinedAt: at(2), leftAt: at(5) }))).toBe(
      'waiting',
    );
  });

  it('a member before the block who left, was blocked and came back → joined', () => {
    // recordJoined keeps the first joinedAt and only clears leftAt.
    expect(classifyGateRow(row({ joinedAt: at(2), leftAt: null }))).toBe(
      'joined',
    );
  });

  it('joining at the very instant of the block counts as after it', () => {
    expect(
      classifyGateRow(row({ joinedAt: at(10), leftAt: at(11) })),
    ).toBe('left');
  });
});

describe('cohortFigures', () => {
  it('an empty cohort is all zeros and 0%', () => {
    expect(cohortFigures([])).toEqual({
      blocked: 0,
      joined: 0,
      left: 0,
      conversionRate: 0,
    });
  });

  it('counts stopped, joined (left ones too) and left', () => {
    const rows = [
      row(), // waiting
      row({ joinedAt: at(12) }), // joined
      row({ joinedAt: at(12), leftAt: at(20) }), // left
    ];
    expect(cohortFigures(rows)).toEqual({
      blocked: 3,
      joined: 2,
      left: 1,
      conversionRate: 67,
    });
  });

  it('never exceeds 100% and joined never exceeds blocked, for every shape of row', () => {
    const joinedOptions = [null, at(2), at(12)];
    const leftOptions = [null, at(5), at(20)];
    const rows: GateRowTimes[] = [];
    for (const joinedAt of joinedOptions) {
      for (const leftAt of leftOptions) rows.push(row({ joinedAt, leftAt }));
    }
    for (let n = 1; n <= rows.length; n++) {
      const f = cohortFigures(rows.slice(0, n));
      expect(f.joined).toBeLessThanOrEqual(f.blocked);
      expect(f.left).toBeLessThanOrEqual(f.joined);
      expect(f.conversionRate).toBeLessThanOrEqual(100);
    }
  });
});

describe('waitingNow', () => {
  it('counts the rows still outside the channel', () => {
    const rows = [
      row(),
      row({ joinedAt: at(12) }),
      row({ joinedAt: at(2), leftAt: at(5) }),
    ];
    expect(waitingNow(rows)).toBe(2);
  });
});

describe('withBlocked', () => {
  it('drops rows the gate never stopped and narrows the type', () => {
    const kept = withBlocked([
      { blockedAt: null, joinedAt: at(3), leftAt: null },
      { blockedAt: at(4), joinedAt: null, leftAt: null },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].blockedAt).toEqual(at(4));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx jest src/telegram/gate-cohort.spec.ts`
Expected: FAIL — `Cannot find module './gate-cohort'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/telegram/gate-cohort.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { tashkentMonthKey } from '../common/date/tashkent';

/** The report starts with the reporting base (ADR-0067): no month before it. */
export const GATE_FIRST_MONTH = '2026-05';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?month=` → a month key inside [2026-05, the current Tashkent month]. Empty is the current month. */
export function parseGateMonth(month: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!month) return current;
  if (!MONTH.test(month)) {
    throw new BadRequestException("Oy YYYY-MM ko'rinishida bo'lishi kerak");
  }
  if (month < GATE_FIRST_MONTH) {
    throw new BadRequestException('Bot hisoboti may 2026 dan boshlanadi');
  }
  if (month > current) {
    throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  }
  return month;
}

/** Where a person the bot stopped stands now (ADR-0105). */
export type GateState = 'waiting' | 'joined' | 'left';

export interface GateRowTimes {
  blockedAt: Date;
  joinedAt: Date | null;
  leftAt: Date | null;
}

/**
 * The ONE reading of a gate row. `joinedAt` is the FIRST join and
 * `recordJoined` only clears `leftAt` on a return, so a member who left,
 * was blocked and came back has `joinedAt < blockedAt` and no `leftAt`.
 */
export function classifyGateRow(row: GateRowTimes): GateState {
  if (!row.joinedAt) return 'waiting';
  if (row.leftAt) return row.joinedAt >= row.blockedAt ? 'left' : 'waiting';
  return 'joined';
}

/** Rows the gate actually stopped (`blockedAt` set), with the type narrowed. */
export function withBlocked<T extends { blockedAt: Date | null }>(
  rows: readonly T[],
): (T & { blockedAt: Date })[] {
  return rows.filter((r): r is T & { blockedAt: Date } => r.blockedAt !== null);
}

export interface CohortFigures {
  blocked: number;
  joined: number;
  left: number;
  conversionRate: number;
}

/** The three cards of one month's cohort. `joined` includes the ones who left later, so `joined <= blocked`. */
export function cohortFigures(rows: readonly GateRowTimes[]): CohortFigures {
  let joined = 0;
  let left = 0;
  for (const r of rows) {
    const state = classifyGateRow(r);
    if (state === 'left') {
      left++;
      joined++;
    } else if (state === 'joined') {
      joined++;
    }
  }
  const blocked = rows.length;
  return {
    blocked,
    joined,
    left,
    conversionRate: blocked > 0 ? Math.round((joined / blocked) * 100) : 0,
  };
}

/** «Hali a'zo bo'lmagan»: stopped and not in the channel now. */
export function waitingNow(rows: readonly GateRowTimes[]): number {
  return rows.filter((r) => classifyGateRow(r) === 'waiting').length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx jest src/telegram/gate-cohort.spec.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Format and commit**

```bash
cd server && npx prettier --write src/telegram/gate-cohort.ts src/telegram/gate-cohort.spec.ts && npx eslint src/telegram/gate-cohort.ts src/telegram/gate-cohort.spec.ts --quiet
cd .. && git add server/src/telegram/gate-cohort.ts server/src/telegram/gate-cohort.spec.ts
git commit -m "feat(bot-report): pure cohort module for the gate report

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Service and controller read the cohort (server)

**Files:**
- Modify: `server/src/telegram/telegram-channel-gate-stats.service.ts:161-253` (`getSummary`, `getList`) and its imports
- Modify: `server/src/telegram/telegram-channel-gate-stats.service.spec.ts` (add cases; extend the `prisma` mock)
- Modify: `server/src/telegram/telegram-channel-report.controller.ts` (whole file)
- Modify: `server/src/telegram/telegram-channel-report.controller.spec.ts` (whole file)

**Interfaces:**
- Consumes from Task 1: `cohortFigures`, `waitingNow`, `withBlocked`, `classifyGateRow`, `parseGateMonth`.
- Produces (Task 3 and 4 read this over HTTP):
  - `GET /telegram/channel-report/summary?month=YYYY-MM` → `{ blocked, joined, left, conversionRate, waiting, channelMembers: number | null, gateEnabled: boolean, channel: string | null, month: string }`
  - `GET /telegram/channel-report/list?month=&page=&pageSize=` → `{ data: { id: number; telegramUserId: string; username: string | null; firstName: string | null; blockedAt: string; joinedAt: string | null; leftAt: string | null; state: 'waiting' | 'joined' | 'left' }[]; total: number; page: number; pageSize: number }` (dates are ISO strings on the wire).
  - Service: `getSummary(month: string)`, `getList({ month: string; page: number; pageSize: number })`.

- [ ] **Step 1: Write the failing service tests**

In `telegram-channel-gate-stats.service.spec.ts` change the `prisma` type and mock so they include `findMany` and `count` (the object under `let prisma: { telegramChannelGateEvent: { findUnique, create, update, updateMany } }` and the one in `beforeEach`):

```ts
  let prisma: {
    telegramChannelGateEvent: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
```

and in `beforeEach` add `findMany: jest.fn(), count: jest.fn(),` to the mock. Then add these two `describe` blocks before the `xatolarga chidamlilik` block:

```ts
  describe('getSummary', () => {
    const rows = [
      // Stopped in August, joined in September: belongs to AUGUST's cohort only.
      {
        blockedAt: new Date('2026-08-20T10:00:00Z'),
        joinedAt: new Date('2026-09-02T10:00:00Z'),
        leftAt: null,
      },
      // September's cohort.
      {
        blockedAt: new Date('2026-09-03T10:00:00Z'),
        joinedAt: new Date('2026-09-04T10:00:00Z'),
        leftAt: null,
      },
      {
        blockedAt: new Date('2026-09-05T10:00:00Z'),
        joinedAt: new Date('2026-09-06T10:00:00Z'),
        leftAt: new Date('2026-09-20T10:00:00Z'),
      },
      {
        blockedAt: new Date('2026-09-07T10:00:00Z'),
        joinedAt: null,
        leftAt: null,
      },
    ];

    it("counts only the month's cohort and the standing waiting list", async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue(rows);

      const res = await service.getSummary('2026-09');

      expect(res).toEqual({
        blocked: 3,
        joined: 2,
        left: 1,
        conversionRate: 67,
        waiting: 1,
      });
    });

    it("a stranger who joined on their own is never in a cohort", async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([]);

      await service.getSummary('2026-09');

      expect(prisma.telegramChannelGateEvent.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.telegramChannelGateEvent.findMany).toHaveBeenCalledWith({
        where: { companyId: DEFAULT_COMPANY_ID, blockedAt: { not: null } },
        select: { blockedAt: true, joinedAt: true, leftAt: true },
      });
    });

    it('the month edge is Tashkent midnight, the upper bound excluded', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([
        // 30.09 18:59:59Z = 30.09 23:59:59 Tashkent → September.
        { blockedAt: new Date('2026-09-30T18:59:59Z'), joinedAt: null, leftAt: null },
        // 30.09 19:00:00Z = 01.10 00:00 Tashkent → October.
        { blockedAt: new Date('2026-09-30T19:00:00Z'), joinedAt: null, leftAt: null },
      ]);

      expect((await service.getSummary('2026-09')).blocked).toBe(1);
      expect((await service.getSummary('2026-10')).blocked).toBe(1);
    });

    it('an empty month is zeros', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([]);
      expect(await service.getSummary('2026-09')).toEqual({
        blocked: 0,
        joined: 0,
        left: 0,
        conversionRate: 0,
        waiting: 0,
      });
    });
  });

  describe('getList', () => {
    it("lists the month's cohort with the server's state, newest first", async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([
        {
          id: 3,
          telegramUserId: '30',
          username: 'c',
          firstName: 'C',
          blockedAt: new Date('2026-09-07T10:00:00Z'),
          joinedAt: null,
          leftAt: null,
        },
        {
          id: 2,
          telegramUserId: '20',
          username: null,
          firstName: 'B',
          blockedAt: new Date('2026-09-05T10:00:00Z'),
          joinedAt: new Date('2026-09-06T10:00:00Z'),
          leftAt: new Date('2026-09-20T10:00:00Z'),
        },
      ]);
      prisma.telegramChannelGateEvent.count.mockResolvedValue(2);

      const res = await service.getList({
        month: '2026-09',
        page: 2,
        pageSize: 10,
      });

      expect(prisma.telegramChannelGateEvent.findMany).toHaveBeenCalledWith({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          blockedAt: {
            gte: new Date('2026-08-31T19:00:00Z'),
            lt: new Date('2026-09-30T19:00:00Z'),
          },
        },
        orderBy: [{ blockedAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
        select: {
          id: true,
          telegramUserId: true,
          username: true,
          firstName: true,
          blockedAt: true,
          joinedAt: true,
          leftAt: true,
        },
      });
      expect(res.total).toBe(2);
      expect(res.page).toBe(2);
      expect(res.data.map((r) => [r.id, r.state])).toEqual([
        [3, 'waiting'],
        [2, 'left'],
      ]);
    });

    it('counts the same cohort the rows come from', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([]);
      prisma.telegramChannelGateEvent.count.mockResolvedValue(0);

      await service.getList({ month: '2026-09', page: 1, pageSize: 10 });

      expect(prisma.telegramChannelGateEvent.count).toHaveBeenCalledWith({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          blockedAt: {
            gte: new Date('2026-08-31T19:00:00Z'),
            lt: new Date('2026-09-30T19:00:00Z'),
          },
        },
      });
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest src/telegram/telegram-channel-gate-stats.service.spec.ts`
Expected: FAIL — the new cases fail (`getSummary` still takes a range, `getList` has no `month`).

- [ ] **Step 3: Rewrite `getSummary` and `getList`**

In `telegram-channel-gate-stats.service.ts` add to the imports:

```ts
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import {
  classifyGateRow,
  cohortFigures,
  waitingNow,
  withBlocked,
} from './gate-cohort';
```

Replace the whole `getSummary` method (with its doc comment, currently lines 161–237) by:

```ts
  /**
   * Hisobot uchun jamlanma (ADR-0105). Kohort — tanlangan oyda bot to'xtatgan
   * odamlar (`blockedAt` shu Toshkent oyida); uch raqam faqat shu odamlar
   * bo'yicha, shuning uchun `joined <= blocked` va foiz 100% dan oshmaydi.
   * `waiting` ATAYLAB oyga bog'liq emas — bugungi holat: to'xtatilgan va hali
   * kanalda emas.
   */
  async getSummary(month: string) {
    const { gte, lt } = tashkentMonthRangeUtc(month);
    // ponytail: reads every stopped row once (a few thousand at most) and counts
    // in memory; move to a SQL groupBy when the table outgrows that.
    const rows = withBlocked(
      await this.prisma.telegramChannelGateEvent.findMany({
        where: { companyId: DEFAULT_COMPANY_ID, blockedAt: { not: null } },
        select: { blockedAt: true, joinedAt: true, leftAt: true },
      }),
    );
    const cohort = rows.filter((r) => r.blockedAt >= gte && r.blockedAt < lt);
    return { ...cohortFigures(cohort), waiting: waitingNow(rows) };
  }
```

Replace the whole `getList` method (currently lines 239–253) by:

```ts
  /** Hisobot jadvali: tanlangan oy kohorti, eng yangisi birinchi; `state` serverdan. */
  async getList(params: { month: string; page: number; pageSize: number }) {
    const { month, page, pageSize } = params;
    const { gte, lt } = tashkentMonthRangeUtc(month);
    const where = {
      companyId: DEFAULT_COMPANY_ID,
      blockedAt: { gte, lt },
    };
    const [rows, total] = await Promise.all([
      this.prisma.telegramChannelGateEvent.findMany({
        where,
        orderBy: [{ blockedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          telegramUserId: true,
          username: true,
          firstName: true,
          blockedAt: true,
          joinedAt: true,
          leftAt: true,
        },
      }),
      this.prisma.telegramChannelGateEvent.count({ where }),
    ]);
    const data = withBlocked(rows).map((r) => ({
      ...r,
      state: classifyGateRow(r),
    }));
    return { data, total, page, pageSize };
  }
```

Also update the class doc comment of `recordBlocked`'s file header is untouched. Do not change `recordBlocked`, `recordJoined`, `recordLeft`.

- [ ] **Step 4: Rewrite the controller**

Replace `telegram-channel-report.controller.ts` with (keep the two long doc comments exactly as they are today; only the imports, the two methods and the removal of `parseMonth` change):

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { parseGateMonth } from './gate-cohort';

/**
 * "Bot hisoboti" sahifasining ma'lumot manbai (`/reports/bot` frontendda).
 *
 * NEGA ReportsModule'da EMAS: `TelegramGroupsModule` allaqachon `ReportsModule`
 * ni import qiladi, shuning uchun `ReportsModule` → `TelegramModule` bog'lanishi
 * aylanma qaramlik hosil qilardi. Endpoint shu sababli TelegramModule ichida.
 * Frontenddagi URL (/reports/bot) bunga bog'liq emas.
 */
/**
 * IMKONIYAT: `reports.students` (odatda faqat CEO + Branch Director). Bu
 * ATAYLAB `/reports` bo'limining mavjud darajasiga moslashtirilgan —
 * `ReportsLayoutShell` o'sha bo'limni CEO va Branch Director'ga cheklaydi,
 * ya'ni Administrator sahifaga umuman kira olmaydi. Backendga Administrator
 * qo'shilsa, frontend bilan zid bo'lardi (CLAUDE.md: ikkala qatlam doim bir
 * xil bo'lishi shart).
 */
@Controller('telegram/channel-report')
@Can('reports.students')
export class TelegramChannelReportController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly gateStats: TelegramChannelGateStatsService,
  ) {}

  /**
   * Jamlanma (ADR-0105). `month` — "YYYY-MM"; berilmasa joriy Toshkent oyi.
   * Noto'g'ri, 2026-05 dan oldingi yoki kelajak oy — 400.
   */
  @Get('summary')
  async summary(@Query('month') month?: string) {
    const key = parseGateMonth(month, new Date());
    const [stats, channelMembers] = await Promise.all([
      this.gateStats.getSummary(key),
      this.telegram.getChannelMemberCount(),
    ]);

    return {
      ...stats,
      channelMembers,
      gateEnabled: this.telegram.isChannelGateEnabled(),
      channel: this.telegram.getRequiredChannel(),
      month: key,
    };
  }

  @Get('list')
  async list(
    @Query('month') month?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.gateStats.getList({
      month: parseGateMonth(month, new Date()),
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 10)),
    });
  }
}
```

- [ ] **Step 5: Rewrite the controller spec**

Replace `telegram-channel-report.controller.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TelegramChannelReportController } from './telegram-channel-report.controller';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('TelegramChannelReportController', () => {
  let controller: TelegramChannelReportController;

  const gateStats = {
    getSummary: jest.fn().mockResolvedValue({
      blocked: 120,
      joined: 84,
      left: 9,
      conversionRate: 70,
      waiting: 36,
    }),
    getList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const telegram = {
    getChannelMemberCount: jest.fn().mockResolvedValue(2614),
    isChannelGateEnabled: jest.fn().mockReturnValue(true),
    getRequiredChannel: jest.fn().mockReturnValue('@daffergana'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T10:00:00Z'));
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TelegramChannelReportController],
      providers: [
        { provide: TelegramService, useValue: telegram },
        { provide: TelegramChannelGateStatsService, useValue: gateStats },
      ],
    }).compile();

    controller = moduleRef.get(TelegramChannelReportController);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('route access', () => {
    it.each(['summary', 'list'] as const)(
      '%s is gated by the student reports capability',
      (method) => {
        expect(routeAccess(TelegramChannelReportController, method)).toEqual({
          kind: 'can',
          keys: ['reports.students'],
        });
      },
    );

    // The Administrator is refused ON PURPOSE: the /reports section is closed
    // to them in the menu too.
    it.each(['summary', 'list'] as const)(
      '%s admits the CEO and the Branch Director by default, nobody else',
      (method) => {
        expect(defaultRolesOf(TelegramChannelReportController, method)).toEqual(
          ['Branch Director', 'CEO'],
        );
      },
    );
  });

  describe('summary', () => {
    it("adds the channel member count and the gate state to the cohort figures", async () => {
      const res = await controller.summary('2026-07');

      expect(res).toEqual({
        blocked: 120,
        joined: 84,
        left: 9,
        conversionRate: 70,
        waiting: 36,
        channelMembers: 2614,
        gateEnabled: true,
        channel: '@daffergana',
        month: '2026-07',
      });
      expect(gateStats.getSummary).toHaveBeenCalledWith('2026-07');
    });

    it('no month means the current Tashkent month', async () => {
      const res = await controller.summary();

      expect(gateStats.getSummary).toHaveBeenCalledWith('2026-09');
      expect(res.month).toBe('2026-09');
    });

    it('answers even when the channel count is unavailable', async () => {
      telegram.getChannelMemberCount.mockResolvedValueOnce(null);
      const res = await controller.summary('2026-07');
      expect(res.channelMembers).toBeNull();
    });

    it.each([
      ['salom', "Oy YYYY-MM ko'rinishida bo'lishi kerak"],
      ['2026-04', 'Bot hisoboti may 2026 dan boshlanadi'],
      ['2026-10', "Kelajak oyni tanlab bo'lmaydi"],
    ])('refuses month %s', async (month, message) => {
      await expect(controller.summary(month)).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(gateStats.getSummary).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it("passes the month, page and size to the service", async () => {
      await controller.list('2026-07', '2', '20');
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-07',
        page: 2,
        pageSize: 20,
      });
    });

    it('no month means the current Tashkent month', async () => {
      await controller.list();
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-09',
        page: 1,
        pageSize: 10,
      });
    });

    it('caps pageSize at 50', async () => {
      await controller.list('2026-07', '1', '999');
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-07',
        page: 1,
        pageSize: 50,
      });
    });

    it('falls back to the defaults on unreadable numbers', async () => {
      await controller.list('2026-07', 'abc', 'xyz');
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-07',
        page: 1,
        pageSize: 10,
      });
    });

    it('refuses a bad month before reading anything', async () => {
      await expect(controller.list('2026-04')).rejects.toThrow(
        BadRequestException,
      );
      expect(gateStats.getList).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 6: Run the tests, typecheck and lint**

Run:
```bash
cd server && npx jest src/telegram/telegram-channel-gate-stats.service.spec.ts src/telegram/telegram-channel-report.controller.spec.ts src/telegram/gate-cohort.spec.ts
npx prettier --write src/telegram/telegram-channel-gate-stats.service.ts src/telegram/telegram-channel-gate-stats.service.spec.ts src/telegram/telegram-channel-report.controller.ts src/telegram/telegram-channel-report.controller.spec.ts
npx eslint src/telegram --quiet
npm run typecheck
```
Expected: all three suites PASS; eslint and typecheck print no errors. Also run `npx jest src/common/auth/branch-route-policy src/common/permissions` (the route manifest and snapshot specs): they must stay green because the routes did not move.

- [ ] **Step 7: Commit**

```bash
cd .. && git add server/src/telegram
git commit -m "feat(bot-report): summary and list read the month's cohort

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client logic — types, URL, format, queries

**Files:**
- Create: `client/src/components/reports/bot/bot-report-types.ts`
- Create: `client/src/components/reports/bot/bot-report-url.ts`, `bot-report-url.test.ts`
- Create: `client/src/components/reports/bot/bot-report-format.ts`, `bot-report-format.test.ts`
- Create: `client/src/components/reports/bot/bot-report-queries.ts`

**Interfaces:**
- Consumes (Task 2's wire shape): `summary` and `list` responses above.
- Produces (used by Task 4):
  - types: `GateState`, `BotSummary`, `BotRow`, `BotList`
  - url: `BOT_FIRST_MONTH`, `BOT_PAGE_SIZES`, `BOT_SCHEMA`, `BotFilters`, `pageMonth(oy: string, current: string): string`, `listParams(f: BotFilters, current: string): { month: string; page: number; pageSize: number }`
  - format: `rateText(rate: number): string`, `joinedHint(blocked: number, rate: number): string`, `cohortTitle(month: string): string`, `STATE_LABEL: Record<GateState, string>`, `stateTone(state: GateState): "default" | "secondary" | "destructive"`, `dateTime(iso: string | null): string`
  - queries: `useBotSummary(month: string)`, `useBotList(params: ReturnType<typeof listParams>)`

- [ ] **Step 1: Write the failing tests**

Create `bot-report-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listParams, pageMonth } from "./bot-report-url";

describe("bot-report-url", () => {
  it("pageMonth clamps into 2026-05 .. current and falls back to current", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-03", "2026-10")).toBe("2026-05");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("abc", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-07", "2026-10")).toBe("2026-07");
  });

  it("listParams always names the month and cleans page and size", () => {
    expect(listParams({ oy: "", page: 1, pageSize: 10 }, "2026-10")).toEqual({
      month: "2026-10",
      page: 1,
      pageSize: 10,
    });
    expect(listParams({ oy: "2026-07", page: 3, pageSize: 50 }, "2026-10")).toEqual({
      month: "2026-07",
      page: 3,
      pageSize: 50,
    });
    expect(listParams({ oy: "2026-07", page: 0, pageSize: 7 }, "2026-10")).toEqual({
      month: "2026-07",
      page: 1,
      pageSize: 10,
    });
  });
});
```

Create `bot-report-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cohortTitle, dateTime, joinedHint, rateText, STATE_LABEL, stateTone } from "./bot-report-format";

describe("bot-report-format", () => {
  it("rateText prints the server's whole percent", () => {
    expect(rateText(70)).toBe("70%");
    expect(rateText(0)).toBe("0%");
  });

  it("joinedHint reads the rate against the stopped people, or says nobody was stopped", () => {
    expect(joinedHint(120, 70)).toBe("70% to'xtatilganlardan");
    expect(joinedHint(0, 0)).toBe("to'xtatilgan odam yo'q");
  });

  it("cohortTitle puts the month in the locative", () => {
    expect(cohortTitle("2026-09")).toBe("Sentabrda bot to'xtatgan odamlar");
    expect(cohortTitle("2026-05")).toBe("Mayda bot to'xtatgan odamlar");
    expect(cohortTitle("2026-12")).toBe("Dekabrda bot to'xtatgan odamlar");
  });

  it("names every state and gives each a tone", () => {
    expect(STATE_LABEL).toEqual({ waiting: "Kutilmoqda", joined: "A'zo", left: "Chiqib ketgan" });
    expect(stateTone("joined")).toBe("default");
    expect(stateTone("waiting")).toBe("secondary");
    expect(stateTone("left")).toBe("destructive");
  });

  it("dateTime reads the Tashkent clock, never the browser's, and dashes an empty value", () => {
    // 20:00 UTC on 30.09 is 01:00 on 01.10 in Tashkent.
    expect(dateTime("2026-09-30T20:00:00.000Z")).toBe("01.10.2026, 01:00");
    expect(dateTime(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/reports/bot/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write types, url, format, queries**

Create `bot-report-types.ts`:

```ts
/** Where a person the bot stopped stands now (the server decides, ADR-0105). */
export type GateState = "waiting" | "joined" | "left";

export interface BotSummary {
  blocked: number;
  joined: number;
  left: number;
  conversionRate: number;
  waiting: number;
  channelMembers: number | null;
  gateEnabled: boolean;
  channel: string | null;
  month: string;
}

export interface BotRow {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  blockedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
  state: GateState;
}

export interface BotList {
  data: BotRow[];
  total: number;
  page: number;
  pageSize: number;
}
```

Create `bot-report-url.ts`:

```ts
import { clampMonth } from "@/components/payments/overview/overview-math";

/** The report starts with the reporting base (spec B7d §2); the server answers 400 before it. */
export const BOT_FIRST_MONTH = "2026-05";
export const BOT_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys; defaults are left out of the URL by `useUrlFilters`. The old `?month=` is not read. */
export const BOT_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

export interface BotFilters {
  oy: string;
  page: number;
  pageSize: number;
}

/** The page's month: `?oy=` inside [2026-05, the current month]; empty or unreadable is the current month. `current` is the Tashkent month (`currentMonthKey`), never browser-local. */
export const pageMonth = (oy: string, current: string): string => clampMonth(oy || current, BOT_FIRST_MONTH, current);

const cleanPage = (n: number): number => (Number.isInteger(n) && n >= 1 ? n : 1);
const cleanSize = (n: number): number => (BOT_PAGE_SIZES.includes(n) ? n : 10);

/** The filters as `GET /telegram/channel-report/list` reads them; the month is always named. */
export function listParams(f: BotFilters, current: string): { month: string; page: number; pageSize: number } {
  return { month: pageMonth(f.oy, current), page: cleanPage(f.page), pageSize: cleanSize(f.pageSize) };
}
```

Create `bot-report-format.ts`:

```ts
import { monthShort } from "@/components/payments/salary-utils";
import { formatDdMmYyyy, tashkentHhmm, tashkentWallClock } from "@/lib/tashkent-time";
import type { GateState } from "./bot-report-types";

/** «70%» — the server's whole percent, never worked out here. */
export const rateText = (rate: number): string => `${rate}%`;

/** The line under «Shulardan a'zo bo'ldi». */
export const joinedHint = (blocked: number, rate: number): string =>
  blocked > 0 ? `${rateText(rate)} to'xtatilganlardan` : "to'xtatilgan odam yo'q";

/** «Sentabrda bot to'xtatgan odamlar»: every Uzbek month name takes «-da». */
export const cohortTitle = (month: string): string => `${monthShort(month)}da bot to'xtatgan odamlar`;

export const STATE_LABEL: Record<GateState, string> = {
  waiting: "Kutilmoqda",
  joined: "A'zo",
  left: "Chiqib ketgan",
};

/** The `Badge` variant of a state. */
export function stateTone(state: GateState): "default" | "secondary" | "destructive" {
  if (state === "joined") return "default";
  if (state === "left") return "destructive";
  return "secondary";
}

/** «dd.MM.yyyy, HH:mm» on the Tashkent clock; an empty instant is a dash. */
export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  const day = tashkentWallClock(iso).toISOString().slice(0, 10);
  return `${formatDdMmYyyy(day)}, ${tashkentHhmm(iso)}`;
}
```

Create `bot-report-queries.ts`:

```ts
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BotList, BotSummary } from "./bot-report-types";
import type { listParams } from "./bot-report-url";

/** Cards and the standing figures; a month change keeps the old answer on screen until the new one lands. The channel is one for the whole company, so the header branch is not in the key. */
export function useBotSummary(month: string) {
  return useQuery({
    queryKey: ["bot-report-summary", month],
    queryFn: () => api.get<BotSummary>("/telegram/channel-report/summary", { params: { month } }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** The month's cohort, one page. */
export function useBotList(params: ReturnType<typeof listParams>) {
  return useQuery({
    queryKey: ["bot-report-list", params],
    queryFn: () => api.get<BotList>("/telegram/channel-report/list", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && npx vitest run src/components/reports/bot/ && npx tsc --noEmit -p .`
Expected: the two test files PASS; `tsc` prints no errors from these files. (Other files of the folder — the old `bot-report-client.tsx` — still compile: they do not import the new modules.)

If `monthShort("2026-09")` does not return «Sentabr», read `UZ_MONTHS` in `client/src/components/payments/salary-utils.ts` and adapt `cohortTitle` so the test's expected strings hold.

- [ ] **Step 5: Commit** (no prettier in `client/`)

```bash
git add client/src/components/reports/bot
git commit -m "feat(bot-report): client types, URL, format and queries for the cohort page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client page — month stepper, cards, cohort table

**Files:**
- Rewrite: `client/src/components/reports/bot/bot-report-client.tsx`
- Create: `client/src/components/reports/bot/bot-report-cards.tsx`
- Rewrite: `client/src/components/reports/bot/bot-report-table.tsx`
- Modify: `client/src/lib/uzbek-only-texts.test.ts` (append a describe)

**Interfaces:**
- Consumes (Task 3): everything listed under Produces there, plus `MonthStepper` (`@/components/shared/month-stepper`), `currentMonthKey` (`@/components/payments/salary-utils`), `useUrlFilters` (`@/hooks/use-url-filters`), `PaymentsPager` (`@/components/payments/list/payments-table`, props `{ page, pageSize, total, onPage, onPageSize, sizes?, sizeLabel? }`).
- Produces: `BotReportClient` (still imported by `client/src/app/(dashboard)/reports/bot/page.tsx`, unchanged), `BotReportCards({ summary })`, `BotReportCardsSkeleton()`, `BotReportTable({ params, onPage, onPageSize })`.

- [ ] **Step 1: Extend the Uzbek-only guard (failing first)**

Append to `client/src/lib/uzbek-only-texts.test.ts`, after the «Davomat» describe, a describe that scans the new folder:

```ts
// «Bot hisoboti» (B7d): the page names none of the English words the old page used on screen.
describe("the «Bot hisoboti» page (B7d)", () => {
  const dir = "reports/bot";
  const files = [
    ...readdirSync(join(__dirname, "..", "components", dir))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => `${dir}/${f}`),
    `${dir}/bot-report-format.ts`,
  ];

  it("finds the new files", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)("%s carries no English jargon", (file) => {
    expect(source(file)).not.toMatch(ENGLISH);
  });
});
```

Run: `cd client && npx vitest run src/lib/uzbek-only-texts.test.ts`
Expected: PASS for the new describe already (the old files pass the regex too); it protects the new files once they exist. (The describe is a guard, not a red test.)

- [ ] **Step 2: Write the cards**

Create `bot-report-cards.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { cohortTitle, joinedHint } from "./bot-report-format";
import type { BotSummary } from "./bot-report-types";

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The cohort card (1) and the standing figures (2). Every number is the server's. */
export function BotReportCards({ summary }: { summary: BotSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <p className="font-medium">{cohortTitle(summary.month)}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              label="Bot to'xtatdi"
              value={formatNumber(summary.blocked)}
              hint="kanalga a'zo bo'lmagani uchun"
            />
            <Figure
              label="Shulardan a'zo bo'ldi"
              value={formatNumber(summary.joined)}
              hint={joinedHint(summary.blocked, summary.conversionRate)}
            />
            <Figure
              label="Keyin chiqib ketdi"
              value={formatNumber(summary.left)}
              hint="a'zo bo'lganlardan"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Hammasi shu oyda to&apos;xtatilganlar bo&apos;yicha. A&apos;zo bo&apos;lgani hozirgacha sanaladi.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          <p className="font-medium">Bugungi holat</p>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Kanal a&apos;zolari</span>
            <span className="tabular-nums">
              {summary.channelMembers === null ? "—" : formatNumber(summary.channelMembers)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Hali a&apos;zo bo&apos;lmagan (kutilmoqda)</span>
            <span className="tabular-nums">{formatNumber(summary.waiting)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function BotReportCardsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-44" />
      <Skeleton className="h-24" />
    </div>
  );
}
```

- [ ] **Step 3: Write the table**

Rewrite `bot-report-table.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { dateTime, STATE_LABEL, stateTone } from "./bot-report-format";
import { useBotList } from "./bot-report-queries";
import { BOT_PAGE_SIZES, type listParams } from "./bot-report-url";

/** The month's cohort, one page; the state of each row is the server's. */
export function BotReportTable({
  params,
  onPage,
  onPageSize,
}: {
  params: ReturnType<typeof listParams>;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const { data, isError, refetch } = useBotList(params);
  // An answer kept from another month is never drawn as this month's.
  const fresh = data && data.page === params.page ? data : undefined;
  const rows = fresh?.data ?? [];
  const total = fresh?.total ?? 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-medium">Foydalanuvchilar</p>

        {isError ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Ro&apos;yxatni yuklab bo&apos;lmadi</p>
            <button type="button" onClick={() => void refetch()} className="mt-2 underline">
              Qayta urinish
            </button>
          </div>
        ) : !fresh ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Bu oyda bot hech kimni to&apos;xtatmagan — boshqa oyni tanlab ko&apos;ring
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Bot to&apos;xtatdi</TableHead>
                  <TableHead>A&apos;zo bo&apos;ldi</TableHead>
                  <TableHead>Chiqib ketdi</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(params.page - 1) * params.pageSize + i + 1}
                    </TableCell>
                    <TableCell>
                      {row.username ? (
                        <span className="font-medium">@{row.username}</span>
                      ) : (
                        <span className="text-muted-foreground">{row.firstName ?? `ID ${row.telegramUserId}`}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{dateTime(row.blockedAt)}</TableCell>
                    <TableCell className="tabular-nums">{dateTime(row.joinedAt)}</TableCell>
                    <TableCell className="tabular-nums">{dateTime(row.leftAt)}</TableCell>
                    <TableCell>
                      <Badge variant={stateTone(row.state)}>{STATE_LABEL[row.state]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <PaymentsPager
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            onPage={onPage}
            onPageSize={onPageSize}
            sizes={BOT_PAGE_SIZES}
            sizeLabel="Sahifadagi qatorlar soni"
          />
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write the page**

Rewrite `bot-report-client.tsx`:

```tsx
"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthStepper } from "@/components/shared/month-stepper";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { BotReportCards, BotReportCardsSkeleton } from "./bot-report-cards";
import { useBotSummary } from "./bot-report-queries";
import { BotReportTable } from "./bot-report-table";
import { BOT_FIRST_MONTH, BOT_SCHEMA, listParams, pageMonth, type BotFilters } from "./bot-report-url";

/** «Bot hisoboti» (spec B7d §5). Every figure is the server's; the page only formats. */
export function BotReportClient() {
  const { filters: raw, setFilters } = useUrlFilters(BOT_SCHEMA);
  const filters = raw as BotFilters;
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const { data, isError, refetch } = useBotSummary(month);
  // An answer kept from another month is never drawn as this month's.
  const fresh = data?.month === month ? data : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper
          value={month}
          min={BOT_FIRST_MONTH}
          max={current}
          onChange={(m) => setFilters({ oy: m === current ? "" : m, page: 1 })}
        />
      </div>

      {fresh && !fresh.gateEnabled && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <Send className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Kanal a&apos;zoligi tekshiruvi hozircha o&apos;chiq</p>
              <p className="mt-0.5 text-muted-foreground">
                Bot foydalanuvchilardan kanalga a&apos;zo bo&apos;lishni so&apos;ramayapti, shuning uchun
                quyidagi raqamlar to&apos;planmaydi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isError ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              Qayta urinish
            </Button>
          </CardContent>
        </Card>
      ) : fresh ? (
        <BotReportCards summary={fresh} />
      ) : (
        <BotReportCardsSkeleton />
      )}

      <BotReportTable
        params={listParams(filters, current)}
        onPage={(page) => setFilters({ page })}
        onPageSize={(pageSize) => setFilters({ pageSize, page: 1 })}
      />
    </div>
  );
}
```

`client/src/app/(dashboard)/reports/bot/page.tsx` stays as it is (it already wraps `BotReportClient` in `Suspense`).

- [ ] **Step 5: Run the checks**

Run:
```bash
cd client && npx vitest run src/components/reports/bot src/lib/uzbek-only-texts.test.ts
npx tsc --noEmit -p .
npx eslint src/components/reports/bot src/lib/uzbek-only-texts.test.ts
```
Expected: all PASS, `tsc` and eslint clean. If `setFilters` does not accept a partial object (read `client/src/hooks/use-url-filters.ts`), follow its real signature; the intent is "change only these keys".

- [ ] **Step 6: Commit**

```bash
git add client/src/components/reports/bot client/src/lib/uzbek-only-texts.test.ts
git commit -m "feat(bot-report): month-stepper page, cohort cards and table

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ADR, guide, glossary and CLAUDE.md notes

**Files:**
- Create: `docs/adr/0105-bot-hisoboti-oy-kohorti.md`
- Modify: `docs/adr/README.md` (add a row after the 0103 row)
- Create: `client/src/qollanma/kontent/hisobotlar/bot-hisoboti.mdx`
- Modify: `client/src/qollanma/sahifalar/hisobotlar.ts` (add an entry), `client/src/qollanma/yangiliklar.ts` (add an entry on top)
- Modify: `CONTEXT.md`, `server/CLAUDE.md`, `client/CLAUDE.md`

- [ ] **Step 1: ADR-0105** (Uzbek, the repo's ADR language)

Create `docs/adr/0105-bot-hisoboti-oy-kohorti.md`:

```markdown
# ADR-0105: Bot hisoboti — tanlangan oyda to'xtatilgan odamlar kohorti

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** spec `docs/superpowers/specs/2026-10-17-b7d-bot-hisoboti-design.md`, ADR-0103 (7c, bitta ma'lumot to'plami), ADR-0067 (hisobotlar bazasi 2026-05)

## Kontekst

`/reports/bot` botning kanalga a'zolik talabi nechta odamni kanalga olib kelganini ko'rsatadi. Eski hisob (`TelegramChannelGateStatsService.getSummary`) har raqamni o'z hodisasi sanasi bo'yicha sanardi: to'xtatilganlar `blockedAt`, a'zo bo'lganlar `joinedAt`, chiqib ketganlar `leftAt` tanlangan oyda bo'lsa. Avgustda to'xtatilib sentabrda a'zo bo'lgan odam sentabrning «a'zo bo'ldi»siga qo'shilar, «to'xtatdi»siga qo'shilmasdi, shuning uchun foiz 100% dan oshishi mumkin edi. Pastdagi ro'yxat oy filtrini umuman olmasdi.

## Qaror

1. **Kohort** — `blockedAt` tanlangan Toshkent oyida (`tashkentMonthRangeUtc`, yuqori chegara eksklyuziv) bo'lgan qatorlar. `blockedAt` bo'sh qatorlar (to'siqsiz, o'zi kelganlar) kohortga kirmaydi.
2. **Uch raqam faqat kohort bo'yicha:** «Bot to'xtatdi» = kohort soni; «Shulardan a'zo bo'ldi» = kohortdan to'xtatilgandan keyin a'zo bo'lganlar (hozirgacha, oy oxirigacha emas); «Keyin chiqib ketdi» = a'zo bo'lganlardan chiqib ketganlar. Foiz = a'zo bo'ldi ÷ to'xtatdi, tuzilishi bo'yicha 100% dan oshmaydi.
3. **Qator holati bitta funksiyadan** (`classifyGateRow`, `server/src/telegram/gate-cohort.ts`): `waiting` | `joined` | `left`. `joinedAt` — birinchi a'zolik sanasi; `recordJoined` qaytib kirganda uni o'zgartirmaydi, faqat `leftAt`ni tozalaydi. Shuning uchun botga yozishdan oldin kanal a'zosi bo'lib, chiqib ketgan, keyin to'xtatilgan odam (`joinedAt < blockedAt`) `leftAt` bo'yicha hal qilinadi: `leftAt` yo'q — qaytgan (`joined`), bor — hali tashqarida (`waiting`).
4. **Bugungi holat** (`waiting`, kanal a'zolari) oyga bog'liq emas: to'xtatilgan va hozir kanalda bo'lmagan hamma qatorlar, va Telegram'dan jonli son.
5. **Ro'yxat ham kohort:** karta soni = ro'yxat `total`; har qatorning `state`i serverdan, mijoz holatni o'zi chiqarmaydi.
6. **Davr:** `?month=YYYY-MM`, bo'sh = joriy oy, 2026-05 dan oldin va kelajak 400. «Butun davr» yo'q: kohortda u ma'nosiz.
7. **Olib tashlandi:** «o'zi qo'shilgan» (`organicJoins`) va «hozir ham a'zo» (`stillMemberViaGate`). Yo'llar (`/telegram/channel-report/summary|list`), ruxsat (`reports.students`) va yozuv metodlari (`recordBlocked`, `recordJoined`, `recordLeft`) o'zgarmadi. Migratsiya va skript yo'q.

## Ko'rib chiqilgan muqobillar

- **Eski hisobni tuzatish (har raqam o'z sanasi bilan, foizni cheklash)** — raqamlar bir-biriga bog'lanmay qoladi; foizni 100 ga qirqish xatoni yashiradi. Rad.
- **«A'zo bo'ldi» faqat oy ichida** — `joinedAt` faqat birinchi sana, qayta kirishlarning sanasi saqlanmaydi; oy ichidagi a'zolikni to'g'ri sanab bo'lmaydi. Rad.
- **`joinedAt >= blockedAt`ni qat'iy shart qilish** — botga yozishdan oldin a'zo bo'lib, keyin qaytgan odamni yo'qotadi. Rad.

## Oqibatlari

- Oy raqami keyinroq o'sishi mumkin: avgustda to'xtatilgan odam sentabrda a'zo bo'lsa, avgust hisoboti o'zgaradi (kohortning hozirgacha natijasi).
- Har so'rovda `blockedAt` bor hamma qatorlar bir marta o'qiladi va xotirada sanaladi (kanalda ming-ikki ming qator). Jadval o'ssa SQL `groupBy` (`// ponytail:`).

## Ma'lum cheklovlar

- «Oy ichida nechta odam a'zo bo'ldi» degan savolga bu hisobot javob bermaydi.
- Gate yoqilishidan oldingi odamlar hisobda yo'q: ma'lumot yig'ish boshlanganidan keyingi oylar to'liq.
- Kanal a'zolari soni Telegram'dan jonli; javob bermasa «—».
```

Append to `docs/adr/README.md` right after the 0103 row (keep the same column layout):

```markdown
| [0105](0105-bot-hisoboti-oy-kohorti.md) | Bot hisoboti: tanlangan oyda to'xtatilgan odamlar kohorti, uch raqam faqat shu odamlar bo'yicha (foiz 100% dan oshmaydi), qator holati bitta funksiyadan (`classifyGateRow`), ro'yxat ham kohort, «Butun davr» yo'q | Qabul qilindi | 2026-10-17 |
```

Before committing, `ls docs/adr | tail -3`: if another `0105-*.md` already exists on `main` (fetch first: `git fetch origin && git ls-tree origin/main docs/adr/ | tail -3`), renumber this one to the next free number in the file name, the title, the README row, the spec header and every reference below.

- [ ] **Step 2: Guide page** (Uzbek; no `# h1`, avoid `{`, `}` and `<` in prose)

Create `client/src/qollanma/kontent/hisobotlar/bot-hisoboti.mdx`:

```mdx
## Sahifa nima beradi

Hisobotlar → «Bot hisoboti» bitta savolga javob beradi: botning «avval kanalga a'zo bo'ling» talabi nechta odamni kanalga olib keldi. Sahifa oy bo'yicha ishlaydi: tanlangan oyda bot to'xtatgan odamlarni sanaydi va ularning keyingi taqdirini ko'rsatadi.

Oy sarlavha ostidagi o'qlar bilan almashadi. Eng erta oy — may 2026.

## Raqamlar qanday sanaladi

- **Bot to'xtatdi** — tanlangan oyda botga yozgan, lekin kanalga a'zo bo'lmagani uchun to'xtatilgan odamlar.
- **Shulardan a'zo bo'ldi** — shu odamlardan keyinchalik kanalga a'zo bo'lganlar. A'zo bo'lgani hozirgacha sanaladi: avgustda to'xtatilgan odam sentabrda a'zo bo'lsa, u avgustning hisobiga qo'shiladi. Shuning uchun foiz hech qachon 100% dan oshmaydi.
- **Keyin chiqib ketdi** — a'zo bo'lganlardan kanaldan chiqib ketganlar.

Pastdagi «Bugungi holat» oyga bog'liq emas: kanalning hozirgi a'zolari soni va to'xtatilgan, lekin hali a'zo bo'lmaganlar («kutilmoqda»). Ular botga qaytib, keyin a'zo bo'lishi mumkin.

## Ro'yxat

Ro'yxat ham tanlangan oy bo'yicha: shu oyda to'xtatilgan odamlar, eng yangisi birinchi. Holati: «Kutilmoqda» (hali kanalda emas), «A'zo» (kanalda) yoki «Chiqib ketgan». Kartadagi «Bot to'xtatdi» soni ro'yxatdagi jami qatorlar soniga teng.

<Eslatma tur="malumot">
Botga yozmasdan oldin o'zi kanalga a'zo bo'lgan odamlar hisobga kirmaydi: ular botning natijasi emas.
</Eslatma>

<Eslatma tur="diqqat">
Kanal a'zoligi tekshiruvi o'chiq bo'lsa, sahifa yuqorida shuni yozadi va yangi raqamlar to'planmaydi.
</Eslatma>
```

Add to `client/src/qollanma/sahifalar/hisobotlar.ts`, after the `davomat-hisoboti` entry, inside the array:

```ts
  {
    bolim: "hisobotlar",
    sahifa: "bot-hisoboti",
    sarlavha: "Bot hisoboti",
    qisqacha:
      "Botning kanalga a'zolik talabi nechta odamni kanalga olib kelgani — tanlangan oyda bot to'xtatgan odamlar, ulardan nechtasi a'zo bo'lgani va keyin chiqib ketgani; foiz 100% dan oshmaydi.",
    rollar: [1, 2],
    adr: ["0105"],
    yollar: ["/reports/bot"],
    kalitSozlar: ["bot", "bot hisoboti", "kanal", "kanalga a'zo bo'ldi", "bot to'xtatdi", "kutilmoqda", "telegram kanal"],
    yangilangan: "2026-10-17",
  },
```

Add on top of the array in `client/src/qollanma/yangiliklar.ts` (above the «Davomat hisoboti yangilandi» entry):

```ts
  {
    sana: "2026-10-17",
    sarlavha: "Bot hisoboti oy bo'yicha qayta hisoblandi",
    matn: "«Bot hisoboti»da raqamlar endi tanlangan oyda bot to'xtatgan odamlar bo'yicha sanaladi: nechta odam to'xtatildi, ulardan nechtasi kanalga a'zo bo'ldi va keyin chiqib ketdi. Foiz hech qachon 100% dan oshmaydi. Sahifada oy o'qlar bilan almashadi, ro'yxat ham tanlangan oyniki. «Butun davr» tugmasi olib tashlandi.",
    rollar: [1, 2],
    sahifa: { bolim: "hisobotlar", sahifa: "bot-hisoboti" },
  },
```

Run `cd client && npx vitest run src/qollanma` — the registry tests (`reyestr.test.ts`: file exists, `yollar` matches a real route, no `# h1`, dates) must pass.

- [ ] **Step 3: CONTEXT.md and the two CLAUDE.md files**

`CONTEXT.md` — add next to the «Davomat foizi» term:

```markdown
**Bot to'xtatgan kohort** — tanlangan Toshkent oyida botning kanalga a'zolik
talabi to'xtatgan odamlar (`TelegramChannelGateEvent.blockedAt` shu oyda).
«Bot hisoboti»ning uch raqami va ro'yxati faqat shu odamlar bo'yicha; a'zo
bo'lgani hozirgacha sanaladi, shuning uchun foiz 100% dan oshmaydi (ADR-0105).
`telegram/gate-cohort.ts`
```

`server/CLAUDE.md` — in «Reports Module», directly after the «Davomat» bullet (the one starting `- **«Davomat» (`GET /reports/attendance-stats/…`), add:

```markdown
- **«Bot hisoboti» (`GET /telegram/channel-report/summary|list`, `reports.students`, ADR-0105)** — the controller lives in `TelegramModule` (see its header: `ReportsModule` would form a cycle). Both routes take `?month=YYYY-MM` (empty = the current Tashkent month; 400 before 2026-05 or in the future, `parseGateMonth`). The cohort is the rows whose `blockedAt` falls in that Tashkent month; `classifyGateRow` (`telegram/gate-cohort.ts`) is the ONE reading of a row (`waiting | joined | left`), `cohortFigures` the three cards (`blocked`, `joined` incl. the ones who left, `left`, `conversionRate`), `waitingNow` the standing «hali a'zo bo'lmagan» (all stopped rows, not tied to the month). `joinedAt` is the FIRST join: `recordJoined` only clears `leftAt` on a return, so a member who left, was blocked and came back has `joinedAt < blockedAt` and no `leftAt` and counts as `joined`. The list is the same cohort with `state` per row. `organicJoins`, `stillMemberViaGate` and the per-event-date counting are gone. No cache (`// ponytail:` in `getSummary`).
```

`client/CLAUDE.md` — after the «Attendance report» section, add:

```markdown
### Bot report (`/reports/bot`, ADR-0105)

- «Bot hisoboti» in `reports-nav.ts` (`permission: "reports.students"`: CEO and Branch Director). Files in `components/reports/bot/`: `bot-report-client.tsx` (the page: `MonthStepper`, the gate-off alert, cards, table), `bot-report-cards.tsx`, `bot-report-table.tsx`, `bot-report-url.ts`, `bot-report-format.ts` (pure, vitest), `bot-report-queries.ts`, `bot-report-types.ts`.
- URL keys (`BOT_SCHEMA`): `oy` (empty = the current Tashkent month, 2026-05 …), `page`, `pageSize` (10–50). The old `?month=` is not read and there is no «Butun davr».
- Two requests: `GET /telegram/channel-report/summary?month=` (the three cohort cards + the standing figures) and `…/list?month=&page=&pageSize=` (the cohort, `state` per row). Every number and every row state is the server's; the client only formats.
```

- [ ] **Step 4: Verify and commit**

Run: `cd client && npx vitest run src/qollanma src/lib/uzbek-only-texts.test.ts && npx tsc --noEmit -p . && npx eslint src/qollanma --quiet`
Expected: PASS and clean.

```bash
git add docs/adr/0105-bot-hisoboti-oy-kohorti.md docs/adr/README.md client/src/qollanma CONTEXT.md server/CLAUDE.md client/CLAUDE.md
git commit -m "docs(bot-report): ADR-0105, guide page, glossary and CLAUDE.md notes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## After the last task (controller, not an implementer)

1. Final whole-branch review on the most capable model, one fix wave at most.
2. Full verification in the worktree: `cd server && npx prisma generate && npm run build && npx eslint src --quiet && npx jest --runInBand`; `cd client && npx tsc --noEmit -p . && npx vitest run && npx eslint src --quiet`. Merge `origin/main` first and re-run (7c's lesson: a green run before the merge proves nothing about the merged tree).
3. Mock-API browser check (`reference_mock_api_browser_check`): cards for an empty month and a month with data, the month stepper, the list page size and page, the gate-off alert, an error state, mobile width; screenshots to the CEO.
4. PR, CI green, CEO «ha», merge, deploy server first, then Vercel; check `GET /telegram/channel-report/summary` answers 401 without a token and the old keys are gone.
