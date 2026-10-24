# Lidlar arxivi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/leads/archive` follow the project rules (server-side pagination, capability-gated restore, honest error state, local updates after restore) and add search/filters, tabs, a date column and a smarter restore dialog.

**Architecture:** The unbounded `GET /leads/archive` is replaced by three routes (`summary`, `leads`, `sections`) served by a new `LeadsArchiveReadService` built on two pure modules (`archive-filter.ts`, `restore-notes.ts`). The client rewrites `leads-archive.tsx` as a thin shell over React Query hooks, two paginated tables and a URL-persisted filter bar; the shared `RestoreLeadDialog` gains optional props so the forms page keeps working.

**Tech Stack:** NestJS + Prisma 7 + Jest (server); Next.js 16 + React Query + Vitest + shadcn/ui (client).

Spec: `docs/superpowers/specs/2026-10-18-lidlar-arxivi-design.md`.

## Global Constraints

- Work only in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/leads-arxiv-yaxshilash`, branch `worktree-leads-arxiv-yaxshilash`. Never `cd` outside it. Use `cd server && …` / `cd client && …` from the worktree root.
- Restore rules (`restoreLead`, `restoreSection`) do NOT change. No migration, no script, no new permission key, no ADR.
- Server routes: `@Can('leads.view')` + `@BranchScope()`; scope stays `companyId` + `leadBranchWhere(scope)` (leads) / `column: branchIdWhere(scope)` (sections). An empty scope returns nothing.
- Order: `deletedAt desc, id desc`. Page size 10–50, default 10 (client offers 10, 20, 30, 40, 50; DTO inherits `PaginationDto`, max 100).
- Date filter: `YYYY-MM-DD` Toshkent days on `deletedAt` through `tashkentRangeFilter` (upper bound exclusive). An impossible day (`2026-02-31`) is a 400 «Sana noto'g'ri — kalendarda bunday kun yo'q».
- Search: trimmed, at most 100 characters, at most 5 whitespace-separated words, ALL words must match (AND); each word matches any of firstName, lastName, lostReason, and — when it looks like a phone (`/^\+?\d{3,}$/`) — phone / extraPhone. Sections: `name`.
- Restore notes (server text, exact): LOST and not converted → «Yo'qotilgan lid «Yangi» bosqichiga qaytadi, yo'qotilish sababi o'chadi.»; owner set and not converted → «Lidning mas'uli bo'shaydi: u umumiy havzaga qaytadi.»; converted → no notes.
- URL keys (`LEADS_ARCHIVE_SCHEMA`): `tab` (`lidlar` default / `bolimlar`), `q`, `kim` (comma list of user ids), `dan`, `gacha`, `sahifa`, `soni`. They must not collide with `type` (settings/archive) — they do not.
- Client: all text Uzbek Latin, no English words from `ENGLISH` in `client/src/lib/uzbek-only-texts.test.ts`; a table has a `#` column (`(page-1)*pageSize+i+1`, `border-r`), row actions in a `⋯` dropdown, skeleton rows while loading, hidden (not disabled) restore for users without `leads.manage` (`useCan("leads.manage")`). The client computes no number: counts, `notes`, `leadCount` come from the server.
- **Never run `prettier` in `client/`.** Run `npx prettier --write <files>` on every touched `server/**/*.ts` before committing, except `server/src/common/permissions/*` (edit the snapshot JSON by hand).
- New files stay under 500 lines; `leads-archive.tsx` ends under 250.
- Commit messages are English and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Setup (once, before Task 1)

The worktree has no `node_modules`.

- [ ] `cd server && npm install && ln -s /Users/a1111/Desktop/daf-erp-system/server/.env .env && npx prisma generate` (skip the symlink if `.env` exists)
- [ ] `cd client && npm install`
- [ ] Sanity: `cd server && npx jest src/leads/leads-archive.service.spec.ts` → PASS (baseline).

## File Structure

Server (`server/src/leads/`):
- Create `archive/restore-notes.ts` (+ `.spec.ts`) — pure `restoreNotes`.
- Create `archive/archive-filter.ts` (+ `.spec.ts`) — pure `searchTokens`, `phoneNeedle`, `assertArchiveDays`, `archivedLeadFilter`, `archivedSectionFilter`.
- Create `archive/leads-archive-read.service.ts` (+ `.spec.ts`) — `LeadsArchiveReadService`.
- Create `dto/leads-archive-query.dto.ts`.
- Modify `leads-archive.service.ts` (remove `getArchive`, `archivedLeadCountsForSections`, `DELETED_BY_SELECT`), `leads-archive.service.spec.ts` (remove the `getArchive` test), `leads.controller.ts`, `leads.controller.spec.ts`, `leads.module.ts`.
- Modify `server/src/common/permissions/route-access.snapshot.json`.

Client (`client/src/components/leads/`):
- Create `archive/archive-url.ts`, `archive-format.ts`, `archive-cache.ts`, `restore-lead-model.ts` (each + `.test.ts`).
- Create `archive/archive-types.ts`, `archive-queries.ts`, `archive-filter-bar.tsx`, `archive-table-parts.tsx`, `archived-leads-table.tsx`, `archived-sections-table.tsx`, `restore-section-dialog.tsx`.
- Rewrite `leads-archive.tsx` (shell). Modify `restore-lead-dialog.tsx`.
- Modify `client/src/qollanma/yangiliklar.ts`.

---

### Task 1: Server pure modules (`restore-notes`, `archive-filter`)

**Files:**
- Create: `server/src/leads/archive/restore-notes.ts`, `server/src/leads/archive/restore-notes.spec.ts`
- Create: `server/src/leads/archive/archive-filter.ts`, `server/src/leads/archive/archive-filter.spec.ts`

**Interfaces:**
- Produces: `restoreNotes(lead: { statusEnum: LeadStatus; convertedStudentId: number | null; ownerId: number | null }): string[]`
- Produces: `interface ArchiveFilterInput { search?: string; deletedById?: number[]; startDate?: string; endDate?: string }`, `searchTokens(search?: string): string[]`, `phoneNeedle(token: string): string | null`, `assertArchiveDays(q: ArchiveFilterInput): void`, `archivedLeadFilter(q): Prisma.LeadWhereInput`, `archivedSectionFilter(q): Prisma.LeadSectionWhereInput`.

- [ ] **Step 1: Write the failing tests**

`server/src/leads/archive/restore-notes.spec.ts`:

```ts
import { LeadStatus } from '@prisma/client';
import { restoreNotes } from './restore-notes';

const plain = {
  statusEnum: LeadStatus.NEW,
  convertedStudentId: null,
  ownerId: null,
};

describe('restoreNotes', () => {
  it('says nothing for a plain lead', () => {
    expect(restoreNotes(plain)).toEqual([]);
  });

  it('tells that a lost lead returns to NEW and loses its reason', () => {
    expect(restoreNotes({ ...plain, statusEnum: LeadStatus.LOST })).toEqual([
      "Yo'qotilgan lid «Yangi» bosqichiga qaytadi, yo'qotilish sababi o'chadi.",
    ]);
  });

  it('tells that the owner is released', () => {
    expect(restoreNotes({ ...plain, ownerId: 7 })).toEqual([
      "Lidning mas'uli bo'shaydi: u umumiy havzaga qaytadi.",
    ]);
  });

  it('lists both notes, the lost one first', () => {
    expect(
      restoreNotes({ ...plain, statusEnum: LeadStatus.LOST, ownerId: 7 }),
    ).toHaveLength(2);
  });

  it('keeps a converted lead as it is: no notes', () => {
    expect(
      restoreNotes({
        statusEnum: LeadStatus.CONVERTED,
        convertedStudentId: 10001,
        ownerId: 7,
      }),
    ).toEqual([]);
  });
});
```

`server/src/leads/archive/archive-filter.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import {
  archivedLeadFilter,
  archivedSectionFilter,
  assertArchiveDays,
  phoneNeedle,
  searchTokens,
} from './archive-filter';

describe('searchTokens', () => {
  it('trims, splits on spaces and keeps at most 5 words', () => {
    expect(searchTokens('  aziz   karimov ')).toEqual(['aziz', 'karimov']);
    expect(searchTokens('a b c d e f g')).toHaveLength(5);
  });
  it('cuts the input at 100 characters', () => {
    expect(searchTokens('x'.repeat(300))[0]).toHaveLength(100);
  });
  it('returns nothing for empty input', () => {
    expect(searchTokens(undefined)).toEqual([]);
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('phoneNeedle', () => {
  it('ignores words that are not phone-like', () => {
    expect(phoneNeedle('aziz')).toBeNull();
    expect(phoneNeedle('90')).toBeNull();
  });
  it('keeps digits and strips +998 down to the 9 stored digits', () => {
    expect(phoneNeedle('901234')).toBe('901234');
    expect(phoneNeedle('+998901234567')).toBe('901234567');
    expect(phoneNeedle('998901234567')).toBe('901234567');
  });
});

describe('assertArchiveDays', () => {
  it('accepts real days and missing days', () => {
    expect(() =>
      assertArchiveDays({ startDate: '2026-10-01', endDate: '2026-10-31' }),
    ).not.toThrow();
    expect(() => assertArchiveDays({})).not.toThrow();
  });
  it('rejects a day the calendar does not have', () => {
    expect(() => assertArchiveDays({ startDate: '2026-02-31' })).toThrow(
      BadRequestException,
    );
  });
});

describe('archivedLeadFilter', () => {
  it('always asks for archived rows', () => {
    expect(archivedLeadFilter({}).deletedAt).toEqual({ not: null });
  });

  it('turns Toshkent days into an exclusive UTC range', () => {
    expect(
      archivedLeadFilter({ startDate: '2026-10-01', endDate: '2026-10-02' })
        .deletedAt,
    ).toEqual({
      not: null,
      gte: new Date('2026-09-30T19:00:00.000Z'),
      lt: new Date('2026-10-02T19:00:00.000Z'),
    });
  });

  it('filters by who archived', () => {
    expect(archivedLeadFilter({ deletedById: [5, 9] }).deletedById).toEqual({
      in: [5, 9],
    });
  });

  it('ANDs the words; a phone-like word also tries both phone columns', () => {
    const where = archivedLeadFilter({ search: 'aziz 90123' });
    const and = where.AND as any[];
    expect(and).toHaveLength(2);
    expect(and[0].OR).toHaveLength(3); // firstName, lastName, lostReason
    expect(and[1].OR).toHaveLength(5); // + phone, extraPhone
    expect(and[1].OR).toContainEqual({ phone: { contains: '90123' } });
    expect(and[1].OR).toContainEqual({ extraPhone: { contains: '90123' } });
  });
});

describe('archivedSectionFilter', () => {
  it('matches every word against the name', () => {
    const where = archivedSectionFilter({ search: 'eski reklama' });
    expect(where.AND).toEqual([
      { name: { contains: 'eski', mode: 'insensitive' } },
      { name: { contains: 'reklama', mode: 'insensitive' } },
    ]);
    expect(where.deletedAt).toEqual({ not: null });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npx jest src/leads/archive`
Expected: FAIL — "Cannot find module './restore-notes'" / "'./archive-filter'".

- [ ] **Step 3: Implement**

`server/src/leads/archive/restore-notes.ts`:

```ts
import { LeadStatus } from '@prisma/client';

/**
 * What restoring an archived lead will change, in words for the restore
 * dialog. It mirrors `LeadsArchiveService.restoredStatus` (a lost lead returns
 * as NEW, lostReason cleared) and `restoreRelease` (an unconverted owned lead
 * goes back to the common pool, ADR-0093); a converted lead keeps both.
 */
export function restoreNotes(lead: {
  statusEnum: LeadStatus;
  convertedStudentId: number | null;
  ownerId: number | null;
}): string[] {
  if (lead.convertedStudentId) return [];
  const notes: string[] = [];
  if (lead.statusEnum === LeadStatus.LOST) {
    notes.push(
      "Yo'qotilgan lid «Yangi» bosqichiga qaytadi, yo'qotilish sababi o'chadi.",
    );
  }
  if (lead.ownerId !== null) {
    notes.push("Lidning mas'uli bo'shaydi: u umumiy havzaga qaytadi.");
  }
  return notes;
}
```

`server/src/leads/archive/archive-filter.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isCalendarDateStr,
  tashkentRangeFilter,
} from '../../common/date/tashkent';

export interface ArchiveFilterInput {
  search?: string;
  deletedById?: number[];
  startDate?: string;
  endDate?: string;
}

/** At most 5 words, 100 characters in all; every word must match (AND). */
export function searchTokens(search?: string): string[] {
  return (search ?? '')
    .trim()
    .slice(0, 100)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/** Phones are stored as 9 digits, so a typed +998… is cut down to them. */
export function phoneNeedle(token: string): string | null {
  if (!/^\+?\d{3,}$/.test(token)) return null;
  const digits = token.replace('+', '');
  return digits.length > 9 && digits.startsWith('998')
    ? digits.slice(3)
    : digits;
}

export function assertArchiveDays(q: ArchiveFilterInput): void {
  for (const day of [q.startDate, q.endDate]) {
    if (day !== undefined && !isCalendarDateStr(day)) {
      throw new BadRequestException(
        "Sana noto'g'ri — kalendarda bunday kun yo'q",
      );
    }
  }
}

function archivedAt(q: ArchiveFilterInput) {
  return {
    deletedAt: { not: null, ...tashkentRangeFilter(q.startDate, q.endDate) },
  };
}

function archivedBy(q: ArchiveFilterInput) {
  return q.deletedById?.length ? { deletedById: { in: q.deletedById } } : {};
}

function leadWord(token: string): Prisma.LeadWhereInput {
  const text = { contains: token, mode: 'insensitive' as const };
  const phone = phoneNeedle(token);
  return {
    OR: [
      { firstName: text },
      { lastName: text },
      { lostReason: text },
      ...(phone
        ? [
            { phone: { contains: phone } },
            { extraPhone: { contains: phone } },
          ]
        : []),
    ],
  };
}

/** Archive filters only; the caller adds company and branch scope. */
export function archivedLeadFilter(
  q: ArchiveFilterInput,
): Prisma.LeadWhereInput {
  const words = searchTokens(q.search);
  return {
    ...archivedAt(q),
    ...archivedBy(q),
    ...(words.length ? { AND: words.map(leadWord) } : {}),
  };
}

export function archivedSectionFilter(
  q: ArchiveFilterInput,
): Prisma.LeadSectionWhereInput {
  const words = searchTokens(q.search);
  return {
    ...archivedAt(q),
    ...archivedBy(q),
    ...(words.length
      ? {
          AND: words.map((w) => ({
            name: { contains: w, mode: 'insensitive' as const },
          })),
        }
      : {}),
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd server && npx jest src/leads/archive`
Expected: PASS (all tests above).

- [ ] **Step 5: Format and commit**

```bash
cd server && npx prettier --write src/leads/archive/*.ts && cd ..
git add server/src/leads/archive
git commit -m "feat(leads): pure archive filter and restore-notes modules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server read service, DTO, routes

**Files:**
- Create: `server/src/leads/dto/leads-archive-query.dto.ts`
- Create: `server/src/leads/archive/leads-archive-read.service.ts`, `server/src/leads/archive/leads-archive-read.service.spec.ts`
- Modify: `server/src/leads/leads-archive.service.ts`, `server/src/leads/leads-archive.service.spec.ts`, `server/src/leads/leads.controller.ts`, `server/src/leads/leads.controller.spec.ts`, `server/src/leads/leads.module.ts`
- Modify: `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: Task 1 exports (`restoreNotes`, `archivedLeadFilter`, `archivedSectionFilter`, `assertArchiveDays`).
- Produces: `class LeadsArchiveReadService { getSummary(companyId: number, scope: ReportBranchIds); listLeads(companyId, scope, q: LeadsArchiveQueryDto); listSections(companyId, scope, q: LeadsArchiveQueryDto) }`. Shapes exactly as in the spec §4 table. `Paged = { data: T[]; total: number; page: number; pageSize: number }`.
- Produces routes `GET /leads/archive/summary|leads|sections`.

- [ ] **Step 1: Write the DTO**

`server/src/leads/dto/leads-archive-query.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toNumberArray } from '../../common/dto/to-array';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";

export class LeadsArchiveQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Comma-separated user ids ("Kim tomonidan"); the column is an int4. */
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  @Max(2147483647, { each: true })
  deletedById?: number[];

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  startDate?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  endDate?: string;
}
```

- [ ] **Step 2: Write the failing service spec**

`server/src/leads/archive/leads-archive-read.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { LeadsArchiveReadService } from './leads-archive-read.service';

describe('LeadsArchiveReadService', () => {
  let service: LeadsArchiveReadService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      lead: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      leadSection: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new LeadsArchiveReadService(prisma);
  });

  describe('listLeads', () => {
    it('pages the list, orders it steadily and reports the total', async () => {
      prisma.lead.count.mockResolvedValue(23);
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'l1',
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          lostReason: 'Qimmat',
          deletedAt: new Date('2026-10-01T10:00:00Z'),
          deletedBy: { id: 5, firstName: 'Ali', lastName: 'Valiyev' },
          section: null,
          statusEnum: LeadStatus.LOST,
          convertedStudentId: null,
          ownerId: 8,
        },
      ]);

      const res = await service.listLeads(1001, null, {
        page: 3,
        pageSize: 10,
      });

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(res).toMatchObject({ total: 23, page: 3, pageSize: 10 });
      expect(res.data[0]).toMatchObject({ id: 'l1', lostReason: 'Qimmat' });
      expect(res.data[0].notes).toHaveLength(2);
      // the raw owner / status columns are not leaked
      expect(res.data[0]).not.toHaveProperty('ownerId');
      expect(res.data[0]).not.toHaveProperty('statusEnum');
    });

    it('scopes by company and applies the archive filter', async () => {
      await service.listLeads(1001, null, { search: 'aziz', deletedById: [5] });
      const where = prisma.lead.count.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual(expect.objectContaining({ companyId: 1001 }));
      expect(where.AND[1]).toEqual(
        expect.objectContaining({
          deletedAt: { not: null },
          deletedById: { in: [5] },
        }),
      );
    });

    it('refuses an impossible day before touching the database', async () => {
      await expect(
        service.listLeads(1001, null, { startDate: '2026-02-31' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.lead.count).not.toHaveBeenCalled();
    });
  });

  describe('listSections', () => {
    it('counts the leads each section would bring back', async () => {
      prisma.leadSection.count.mockResolvedValue(2);
      prisma.leadSection.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'Reklama',
          deletedAt: new Date(),
          deletionBatchId: 'b1',
          deletedBy: null,
          column: { id: 'c1', name: 'Yangi', branchId: 1, branch: null },
        },
        {
          id: 's2',
          name: 'Eski',
          deletedAt: new Date(),
          deletionBatchId: null,
          deletedBy: null,
          column: null,
        },
      ]);
      prisma.lead.groupBy
        .mockResolvedValueOnce([
          { deletionBatchId: 'b1', _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([{ sectionId: 's2', _count: { _all: 5 } }]);

      const res = await service.listSections(1001, null, {});

      expect(res.total).toBe(2);
      expect(res.data).toEqual([
        expect.objectContaining({ id: 's1', leadCount: 2 }),
        expect.objectContaining({ id: 's2', leadCount: 5 }),
      ]);
      expect(res.data[0]).not.toHaveProperty('deletionBatchId');
      expect(res.data[0].column).toEqual({ id: 'c1', name: 'Yangi' });
    });
  });

  describe('getSummary', () => {
    it('returns unfiltered counts and the people who archived, once each, by name', async () => {
      prisma.lead.count.mockResolvedValue(12);
      prisma.leadSection.count.mockResolvedValue(3);
      prisma.lead.groupBy.mockResolvedValue([
        { deletedById: 9 },
        { deletedById: 5 },
        { deletedById: null },
      ]);
      prisma.leadSection.groupBy.mockResolvedValue([{ deletedById: 5 }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 9, firstName: 'Zafar', lastName: 'Aliyev' },
        { id: 5, firstName: 'Ali', lastName: 'Valiyev' },
      ]);

      const res = await service.getSummary(1001, null);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [9, 5] } } }),
      );
      expect(res).toEqual({
        leads: 12,
        sections: 3,
        archivers: [
          { id: 5, name: 'Ali Valiyev' },
          { id: 9, name: 'Zafar Aliyev' },
        ],
      });
    });

    it('does not ask for users when nobody is recorded', async () => {
      const res = await service.getSummary(1001, null);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(res.archivers).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx jest src/leads/archive/leads-archive-read`
Expected: FAIL — "Cannot find module './leads-archive-read.service'".

- [ ] **Step 4: Implement the service**

`server/src/leads/archive/leads-archive-read.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../../common/finance/report-branch-scope';
import { leadBranchWhere } from '../shared/lead-scope';
import { LeadsArchiveQueryDto } from '../dto/leads-archive-query.dto';
import {
  archivedLeadFilter,
  archivedSectionFilter,
  assertArchiveDays,
} from './archive-filter';
import { restoreNotes } from './restore-notes';

const DELETED_BY_SELECT = {
  select: { id: true, firstName: true, lastName: true },
};

/**
 * Read side of the leads archive: counts, and the two paged lists. Restores
 * stay in `LeadsArchiveService`. Scope is the caller's: company + branch, and
 * an empty branch scope reads nothing.
 */
@Injectable()
export class LeadsArchiveReadService {
  constructor(private prisma: PrismaService) {}

  private leadBase(companyId: number, scope: ReportBranchIds) {
    return { companyId, ...leadBranchWhere(scope) };
  }

  // An archived section keeps pointing at its column even when that column is
  // itself archived, so the branch is still resolvable.
  private sectionBase(companyId: number, scope: ReportBranchIds) {
    return { companyId, column: { ...branchIdWhere(scope) } };
  }

  /** Tab counts (unfiltered) and the people who archived something. */
  async getSummary(companyId: number, scope: ReportBranchIds) {
    const leadWhere: Prisma.LeadWhereInput = {
      ...this.leadBase(companyId, scope),
      deletedAt: { not: null },
    };
    const sectionWhere: Prisma.LeadSectionWhereInput = {
      ...this.sectionBase(companyId, scope),
      deletedAt: { not: null },
    };
    const [leads, sections, leadBy, sectionBy] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.leadSection.count({ where: sectionWhere }),
      this.prisma.lead.groupBy({ by: ['deletedById'], where: leadWhere }),
      this.prisma.leadSection.groupBy({
        by: ['deletedById'],
        where: sectionWhere,
      }),
    ]);
    const ids = [
      ...new Set(
        [...leadBy, ...sectionBy]
          .map((r) => r.deletedById)
          .filter((id): id is number => id !== null),
      ),
    ];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const archivers = users
      .map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uz'));
    return { leads, sections, archivers };
  }

  async listLeads(
    companyId: number,
    scope: ReportBranchIds,
    q: LeadsArchiveQueryDto,
  ) {
    assertArchiveDays(q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 10;
    const where: Prisma.LeadWhereInput = {
      AND: [this.leadBase(companyId, scope), archivedLeadFilter(q)],
    };
    const [total, rows] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          lostReason: true,
          deletedAt: true,
          deletedBy: DELETED_BY_SELECT,
          statusEnum: true,
          convertedStudentId: true,
          ownerId: true,
          // Origin label — the section/column may themselves be archived, so
          // they are intentionally NOT filtered by deletedAt.
          section: {
            select: {
              id: true,
              name: true,
              column: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map(({ statusEnum, convertedStudentId, ownerId, ...lead }) => ({
        ...lead,
        notes: restoreNotes({ statusEnum, convertedStudentId, ownerId }),
      })),
      total,
      page,
      pageSize,
    };
  }

  async listSections(
    companyId: number,
    scope: ReportBranchIds,
    q: LeadsArchiveQueryDto,
  ) {
    assertArchiveDays(q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 10;
    const where: Prisma.LeadSectionWhereInput = {
      AND: [this.sectionBase(companyId, scope), archivedSectionFilter(q)],
    };
    const [total, rows] = await Promise.all([
      this.prisma.leadSection.count({ where }),
      this.prisma.leadSection.findMany({
        where,
        orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          deletedAt: true,
          deletionBatchId: true,
          deletedBy: DELETED_BY_SELECT,
          column: { select: { id: true, name: true } },
        },
      }),
    ]);
    const leadCounts = await this.archivedLeadCountsForSections(rows);
    return {
      data: rows.map((s) => ({
        id: s.id,
        name: s.name,
        deletedAt: s.deletedAt,
        deletedBy: s.deletedBy,
        column: s.column ? { id: s.column.id, name: s.column.name } : null,
        leadCount: leadCounts.get(s.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * For each archived section, how many archived leads "restore with leads"
   * would bring back: those sharing the section's deletionBatchId, or (legacy
   * sections deleted before cascade existed) those still pointing at it.
   */
  private async archivedLeadCountsForSections(
    sections: { id: string; deletionBatchId: string | null }[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (sections.length === 0) return result;

    const batchIds = sections
      .map((s) => s.deletionBatchId)
      .filter((b): b is string => !!b);
    const legacyIds = sections
      .filter((s) => !s.deletionBatchId)
      .map((s) => s.id);

    const [byBatch, bySection] = await Promise.all([
      batchIds.length
        ? this.prisma.lead.groupBy({
            by: ['deletionBatchId'],
            where: {
              deletedAt: { not: null },
              deletionBatchId: { in: batchIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve(
            [] as {
              deletionBatchId: string | null;
              _count: { _all: number };
            }[],
          ),
      legacyIds.length
        ? this.prisma.lead.groupBy({
            by: ['sectionId'],
            where: { deletedAt: { not: null }, sectionId: { in: legacyIds } },
            _count: { _all: true },
          })
        : Promise.resolve(
            [] as { sectionId: string | null; _count: { _all: number } }[],
          ),
    ]);

    const countByBatch = new Map(
      byBatch.map((b) => [b.deletionBatchId, b._count._all]),
    );
    const countBySectionId = new Map(
      bySection.map((b) => [b.sectionId, b._count._all]),
    );
    for (const s of sections) {
      result.set(
        s.id,
        s.deletionBatchId
          ? (countByBatch.get(s.deletionBatchId) ?? 0)
          : (countBySectionId.get(s.id) ?? 0),
      );
    }
    return result;
  }
}
```

- [ ] **Step 5: Run the service spec**

Run: `cd server && npx jest src/leads/archive`
Expected: PASS. If `leadBranchWhere(null)` returns something that changes the `where.AND[0]` assertion, adjust only the assertion (`objectContaining({ companyId: 1001 })` must still hold).

- [ ] **Step 6: Remove the old read from `LeadsArchiveService`**

In `server/src/leads/leads-archive.service.ts` delete `DELETED_BY_SELECT`, `getArchive` and `archivedLeadCountsForSections` (everything from the "Archived leads (column 1)…" doc comment through the end of `archivedLeadCountsForSections`). Keep `restoredStatus`, `restoreLead`, `restoreSection` untouched. Fix imports that become unused (run eslint in Step 9). In `leads-archive.service.spec.ts` delete the `describe('getArchive', …)` block (lines ~59–85) and any import it alone used.

- [ ] **Step 7: Controller and module**

`server/src/leads/leads.module.ts`: add `LeadsArchiveReadService` (import from `./archive/leads-archive-read.service`) to `providers` next to `LeadsArchiveService`.

`server/src/leads/leads.controller.ts`: import `LeadsArchiveReadService` and `LeadsArchiveQueryDto`; inject `private readonly archiveReadService: LeadsArchiveReadService` after `archiveService`; replace the `getArchive` handler (`@Get('archive')`, lines ~74–83) with:

```ts
  // Archived leads / sections, paged (the leads archive page). Declared before
  // ':id' so "/leads/archive/..." is not captured as an id.
  @Get('archive/summary')
  @Can('leads.view')
  getArchiveSummary(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.archiveReadService.getSummary(companyId, scope);
  }

  @Get('archive/leads')
  @Can('leads.view')
  listArchivedLeads(
    @Query() query: LeadsArchiveQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.archiveReadService.listLeads(companyId, scope, query);
  }

  @Get('archive/sections')
  @Can('leads.view')
  listArchivedSections(
    @Query() query: LeadsArchiveQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.archiveReadService.listSections(companyId, scope, query);
  }
```

`server/src/leads/leads.controller.spec.ts`: it lists controller methods (line ~12 holds `'getArchive'`) — replace that entry with `'getArchiveSummary', 'listArchivedLeads', 'listArchivedSections'` and, following the file's existing `routeAccess()` / `defaultRolesOf()` pattern for `getArchive`, assert the same for the three new handlers (marker `leads.view`, default roles CEO / Branch Director / Administrator). Also provide a mock for `LeadsArchiveReadService` wherever the spec builds the testing module (copy how `LeadsArchiveService` is provided). `grep -n "getArchive\|archiveService" server/src/leads/*.spec.ts` — fix every hit (e.g. `leads.branch-isolation.spec.ts`).

- [ ] **Step 8: Route snapshot**

In `server/src/common/permissions/route-access.snapshot.json` replace the `"GET /leads/archive": [...]` entry with three entries in this order (alphabetical, access identical to the old one):

```json
  "GET /leads/archive/leads": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /leads/archive/sections": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /leads/archive/summary": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
```

Do not run prettier on this directory.

- [ ] **Step 9: Verify the whole server side**

Run, in order (one run each, re-run only after a code change):
- `cd server && npx jest src/leads src/common/permissions src/common/auth` → PASS. If a branch-route manifest spec (`branch-route-policy`) complains about the three new routes, classify them exactly like the old `GET /leads/archive` / `GET /leads/board` (they take `@BranchScope()`).
- `npx eslint src/leads src/common --quiet` → no errors (remove unused imports left in `leads-archive.service.ts`).
- `npm run typecheck && npm run build` → no errors.

- [ ] **Step 10: Format and commit**

```bash
cd server && npx prettier --write src/leads/archive/*.ts src/leads/dto/leads-archive-query.dto.ts src/leads/leads-archive.service.ts src/leads/leads-archive.service.spec.ts src/leads/leads.controller.ts src/leads/leads.controller.spec.ts src/leads/leads.module.ts && cd ..
git add server/src
git commit -m "feat(leads): paged archive routes with search and filters

Replaces the unbounded GET /leads/archive with summary, leads and sections.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client pure modules

**Files:**
- Create: `client/src/components/leads/archive/archive-url.ts`, `archive-url.test.ts`
- Create: `client/src/components/leads/archive/archive-format.ts`, `archive-format.test.ts`
- Create: `client/src/components/leads/archive/archive-cache.ts`, `archive-cache.test.ts`
- Create: `client/src/components/leads/archive/restore-lead-model.ts`, `restore-lead-model.test.ts`

**Interfaces (all later client tasks depend on these exact names):**
- `archive-url.ts`: `LEADS_ARCHIVE_SCHEMA`, `type ArchiveFilters`, `type ArchiveTab = "lidlar" | "bolimlar"`, `ARCHIVE_PAGE_SIZES: number[]`, `archiveTab(raw: string): ArchiveTab`, `archivePageSize(n: number): number`, `archiveParams(f: ArchiveFilters): ArchiveParams`, `hasArchiveFilter(f): boolean`, `dayToDate(s: string): Date | undefined`, `dateToDay(d: Date | undefined): string`.
- `archive-format.ts`: `archiveDate(iso: string | null): string`.
- `archive-cache.ts`: `interface Paged<T>`, `interface ArchiveSummary`, `withoutRow<T extends { id: string }>(page: Paged<T> | undefined, id: string): Paged<T> | undefined`, `minusCounts(summary: ArchiveSummary | undefined, drop: { leads?: number; sections?: number }): ArchiveSummary | undefined`.
- `restore-lead-model.ts`: `interface RestoreColumn { id: string; name: string; sections: { id: string; name: string }[] }`, `interface LeadOrigin { columnId: string; sectionId: string; label: string }`, `originOf(lead: { section: { id: string; name: string; column: { id: string; name: string } | null } | null }): LeadOrigin | null`, `initialPlace(origin: LeadOrigin | null | undefined, columns: RestoreColumn[], loaded: boolean): { columnId: string; sectionId: string; missingLabel: string | null }`.

- [ ] **Step 1: Write the failing tests**

`archive-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  archivePageSize,
  archiveParams,
  archiveTab,
  dateToDay,
  dayToDate,
  hasArchiveFilter,
  type ArchiveFilters,
} from "./archive-url";

const empty: ArchiveFilters = {
  tab: "lidlar",
  q: "",
  kim: [],
  dan: "",
  gacha: "",
  sahifa: 1,
  soni: 10,
};

describe("archiveParams", () => {
  it("sends only paging when nothing is filtered", () => {
    expect(archiveParams(empty)).toEqual({
      page: 1,
      pageSize: 10,
      search: undefined,
      deletedById: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("sends filters under the server's names; the user list is comma-joined", () => {
    expect(
      archiveParams({
        ...empty,
        q: " aziz ",
        kim: ["5", "9"],
        dan: "2026-10-01",
        gacha: "2026-10-31",
        sahifa: 3,
        soni: 20,
      }),
    ).toEqual({
      page: 3,
      pageSize: 20,
      search: "aziz",
      deletedById: "5,9",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
  });

  it("falls back to 10 for a page size the page does not offer", () => {
    expect(archivePageSize(99)).toBe(10);
    expect(archivePageSize(50)).toBe(50);
  });
});

describe("archiveTab", () => {
  it("knows two tabs and defaults to leads", () => {
    expect(archiveTab("bolimlar")).toBe("bolimlar");
    expect(archiveTab("lidlar")).toBe("lidlar");
    expect(archiveTab("zzz")).toBe("lidlar");
  });
});

describe("hasArchiveFilter", () => {
  it("is false for paging and tab alone", () => {
    expect(hasArchiveFilter({ ...empty, tab: "bolimlar", sahifa: 4 })).toBe(false);
    expect(hasArchiveFilter({ ...empty, q: "  " })).toBe(false);
  });
  it("is true for search, people or a date", () => {
    expect(hasArchiveFilter({ ...empty, q: "a" })).toBe(true);
    expect(hasArchiveFilter({ ...empty, kim: ["5"] })).toBe(true);
    expect(hasArchiveFilter({ ...empty, dan: "2026-10-01" })).toBe(true);
    expect(hasArchiveFilter({ ...empty, gacha: "2026-10-01" })).toBe(true);
  });
});

describe("day <-> date", () => {
  it("round-trips a day and tolerates junk", () => {
    expect(dateToDay(dayToDate("2026-10-18"))).toBe("2026-10-18");
    expect(dayToDate("")).toBeUndefined();
    expect(dayToDate("garbage")).toBeUndefined();
    expect(dateToDay(undefined)).toBe("");
  });
});
```

`archive-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { archiveDate } from "./archive-format";

describe("archiveDate", () => {
  it("prints the Toshkent wall clock, not the browser's", () => {
    expect(archiveDate("2026-10-17T19:30:00.000Z")).toBe("18.10.2026, 00:30");
    expect(archiveDate("2026-10-18T05:07:00.000Z")).toBe("18.10.2026, 10:07");
  });
  it("prints a dash for a missing date", () => {
    expect(archiveDate(null)).toBe("—");
  });
});
```

`archive-cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { minusCounts, withoutRow, type Paged } from "./archive-cache";

const page: Paged<{ id: string }> = {
  data: [{ id: "a" }, { id: "b" }],
  total: 12,
  page: 1,
  pageSize: 10,
};

describe("withoutRow", () => {
  it("drops the row and one from the total", () => {
    expect(withoutRow(page, "a")).toEqual({
      data: [{ id: "b" }],
      total: 11,
      page: 1,
      pageSize: 10,
    });
  });
  it("leaves a page without that row alone", () => {
    expect(withoutRow(page, "zzz")).toBe(page);
    expect(withoutRow(undefined, "a")).toBeUndefined();
  });
});

describe("minusCounts", () => {
  const summary = { leads: 5, sections: 2, archivers: [] };
  it("subtracts and never goes below zero", () => {
    expect(minusCounts(summary, { leads: 1 })).toEqual({ ...summary, leads: 4 });
    expect(minusCounts(summary, { sections: 1, leads: 9 })).toEqual({
      ...summary,
      sections: 1,
      leads: 0,
    });
  });
  it("passes an unloaded summary through", () => {
    expect(minusCounts(undefined, { leads: 1 })).toBeUndefined();
  });
});
```

`restore-lead-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialPlace, originOf, type RestoreColumn } from "./restore-lead-model";

const columns: RestoreColumn[] = [
  { id: "c1", name: "Yangi Lidlar", sections: [{ id: "s1", name: "Reklama" }] },
];
const origin = { columnId: "c1", sectionId: "s1", label: "Yangi Lidlar · Reklama" };

describe("originOf", () => {
  it("labels the lead's old place", () => {
    expect(
      originOf({
        section: { id: "s1", name: "Reklama", column: { id: "c1", name: "Yangi Lidlar" } },
      }),
    ).toEqual(origin);
  });
  it("has none for a lead without a section or column", () => {
    expect(originOf({ section: null })).toBeNull();
    expect(originOf({ section: { id: "s", name: "x", column: null } })).toBeNull();
  });
});

describe("initialPlace", () => {
  it("preselects the old place when it is still on the board", () => {
    expect(initialPlace(origin, columns, true)).toEqual({
      columnId: "c1",
      sectionId: "s1",
      missingLabel: null,
    });
  });
  it("asks for a new place and names the old one when it is gone", () => {
    expect(initialPlace({ ...origin, sectionId: "gone" }, columns, true)).toEqual({
      columnId: "",
      sectionId: "",
      missingLabel: "Yangi Lidlar · Reklama",
    });
  });
  it("says nothing while the board is still loading", () => {
    expect(initialPlace(origin, [], false)).toEqual({
      columnId: "",
      sectionId: "",
      missingLabel: null,
    });
  });
  it("starts empty without an origin (the forms page)", () => {
    expect(initialPlace(null, columns, true)).toEqual({
      columnId: "",
      sectionId: "",
      missingLabel: null,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/leads/archive`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`archive-url.ts`:

```ts
import { format, isValid, parse } from "date-fns";
import { listParam } from "@/lib/url-filter-params";

export const LEADS_ARCHIVE_SCHEMA = {
  tab: { type: "string" as const, defaultValue: "lidlar" },
  q: { type: "string" as const, defaultValue: "" },
  kim: { type: "array" as const, defaultValue: [] as string[] },
  dan: { type: "string" as const, defaultValue: "" },
  gacha: { type: "string" as const, defaultValue: "" },
  sahifa: { type: "number" as const, defaultValue: 1 },
  soni: { type: "number" as const, defaultValue: 10 },
};

export interface ArchiveFilters {
  tab: string;
  q: string;
  kim: string[];
  dan: string;
  gacha: string;
  sahifa: number;
  soni: number;
}

export type ArchiveTab = "lidlar" | "bolimlar";

export const ARCHIVE_PAGE_SIZES = [10, 20, 30, 40, 50];

export const archiveTab = (raw: string): ArchiveTab =>
  raw === "bolimlar" ? "bolimlar" : "lidlar";

export const archivePageSize = (n: number): number =>
  ARCHIVE_PAGE_SIZES.includes(n) ? n : 10;

export interface ArchiveParams {
  page: number;
  pageSize: number;
  search: string | undefined;
  deletedById: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
}

/** The server's query for the open tab; empty filters are left out. */
export function archiveParams(f: ArchiveFilters): ArchiveParams {
  return {
    page: Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1,
    pageSize: archivePageSize(f.soni),
    search: f.q.trim() || undefined,
    deletedById: listParam(f.kim),
    startDate: f.dan || undefined,
    endDate: f.gacha || undefined,
  };
}

/** Paging and the tab are not filters. */
export function hasArchiveFilter(f: ArchiveFilters): boolean {
  return f.q.trim() !== "" || f.kim.length > 0 || f.dan !== "" || f.gacha !== "";
}

export function dayToDate(day: string): Date | undefined {
  if (!day) return undefined;
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

export const dateToDay = (d: Date | undefined): string =>
  d ? format(d, "yyyy-MM-dd") : "";
```

`archive-format.ts`:

```ts
const TASHKENT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «dd.MM.yyyy, HH:mm» on the Toshkent clock. */
export function archiveDate(iso: string | null): string {
  if (!iso) return "—";
  const p = Object.fromEntries(
    TASHKENT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`;
}
```

`archive-cache.ts`:

```ts
export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ArchiveSummary {
  leads: number;
  sections: number;
  archivers: { id: number; name: string }[];
}

/** After a restore: the row leaves the page it was on and the total drops by one. */
export function withoutRow<T extends { id: string }>(
  page: Paged<T> | undefined,
  id: string,
): Paged<T> | undefined {
  if (!page || !page.data.some((r) => r.id === id)) return page;
  return {
    ...page,
    data: page.data.filter((r) => r.id !== id),
    total: Math.max(0, page.total - 1),
  };
}

export function minusCounts(
  summary: ArchiveSummary | undefined,
  drop: { leads?: number; sections?: number },
): ArchiveSummary | undefined {
  if (!summary) return summary;
  return {
    ...summary,
    leads: Math.max(0, summary.leads - (drop.leads ?? 0)),
    sections: Math.max(0, summary.sections - (drop.sections ?? 0)),
  };
}
```

`restore-lead-model.ts`:

```ts
export interface RestoreColumn {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

export interface LeadOrigin {
  columnId: string;
  sectionId: string;
  /** «Ustun · Bo'lim», for the dialog's hint. */
  label: string;
}

export function originOf(lead: {
  section: {
    id: string;
    name: string;
    column: { id: string; name: string } | null;
  } | null;
}): LeadOrigin | null {
  const s = lead.section;
  if (!s?.column) return null;
  return {
    columnId: s.column.id,
    sectionId: s.id,
    label: `${s.column.name} · ${s.name}`,
  };
}

/**
 * Where the restore dialog starts: the old place when it is still on the
 * board, otherwise empty with the old place named. While the board is loading
 * nothing is claimed either way.
 */
export function initialPlace(
  origin: LeadOrigin | null | undefined,
  columns: RestoreColumn[],
  loaded: boolean,
): { columnId: string; sectionId: string; missingLabel: string | null } {
  const empty = { columnId: "", sectionId: "", missingLabel: null };
  if (!origin || !loaded) return empty;
  const column = columns.find((c) => c.id === origin.columnId);
  const section = column?.sections.find((s) => s.id === origin.sectionId);
  if (column && section) {
    return { columnId: column.id, sectionId: section.id, missingLabel: null };
  }
  return { ...empty, missingLabel: origin.label };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd client && npx vitest run src/components/leads/archive`
Expected: PASS.

- [ ] **Step 5: Commit** (no prettier in `client/`)

```bash
git add client/src/components/leads/archive
git commit -m "feat(leads): archive url, date, cache and restore-place helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `RestoreLeadDialog` — preselected place and notes

**Files:**
- Modify: `client/src/components/leads/restore-lead-dialog.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `initialPlace`, `LeadOrigin`, `RestoreColumn` from `./archive/restore-lead-model`.
- Produces: `RestoreLeadTarget { id; firstName; lastName; origin?: LeadOrigin | null; notes?: string[] }`; props `{ target, columns, columnsLoading?: boolean, columnsFailed?: boolean, onClose, onRestored }`. `RestoreColumn` stays exported from this file (re-export) — `form-responses-client.tsx` imports from here and must keep compiling unchanged.

- [ ] **Step 1: Rewrite the dialog**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  initialPlace,
  type LeadOrigin,
  type RestoreColumn,
} from "./archive/restore-lead-model";

export type { RestoreColumn };

export interface RestoreLeadTarget {
  id: string;
  firstName: string;
  lastName: string;
  /** Where the lead was; the archive page passes it, the forms page does not. */
  origin?: LeadOrigin | null;
  /** What the restore will change, in the server's words. */
  notes?: string[];
}

/**
 * Arxivdagi lidni tanlangan ustun va bo'limga qaytaradi. Lidlar arxivi ham,
 * forma javoblari sahifasi ham shu dialogni ishlatadi. Asl joyi hali bor
 * bo'lsa, u oldindan tanlanadi.
 */
export function RestoreLeadDialog({
  target,
  columns,
  columnsLoading = false,
  columnsFailed = false,
  onClose,
  onRestored,
}: {
  target: RestoreLeadTarget | null;
  columns: RestoreColumn[];
  columnsLoading?: boolean;
  columnsFailed?: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  // What the user picked; null = still the suggested place.
  const [picked, setPicked] = useState<{
    columnId: string;
    sectionId: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;

  useEffect(() => {
    if (open) {
      setPicked(null);
      setSubmitting(false);
    }
  }, [open]);

  const place = useMemo(
    () => initialPlace(target?.origin, columns, !columnsLoading),
    [target, columns, columnsLoading],
  );
  const columnId = picked?.columnId ?? place.columnId;
  const sectionId = picked?.sectionId ?? place.sectionId;

  const sections = useMemo(
    () => columns.find((c) => c.id === columnId)?.sections ?? [],
    [columns, columnId],
  );

  async function handleConfirm() {
    if (!target) return;
    if (!columnId || !sectionId) {
      toast.error("Ustun va bo'limni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/leads/${target.id}/restore`, { columnId, sectionId });
      toast.success("Lid tiklandi");
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, "Tiklashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lidni tiklash</DialogTitle>
          <DialogDescription>
            &laquo;{target?.firstName} {target?.lastName}&raquo; lidi
            qaytariladigan ustun va bo&apos;limni tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {columnsFailed && (
            <p className="text-xs text-destructive">
              Ustunlarni yuklab bo&apos;lmadi. Oynani yopib, qayta oching.
            </p>
          )}

          {place.missingLabel && (
            <p className="rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">
              Asl joyi &laquo;{place.missingLabel}&raquo; arxivda yoki
              o&apos;chirilgan &mdash; yangi joy tanlang.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Ustun</Label>
            <Select
              value={columnId}
              onValueChange={(v) => setPicked({ columnId: v, sectionId: "" })}
              disabled={columnsLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnsLoading ? "Yuklanmoqda..." : "Ustunni tanlang"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Bo&apos;lim</Label>
            <Select
              value={sectionId}
              onValueChange={(v) => setPicked({ columnId, sectionId: v })}
              disabled={!columnId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnId
                      ? sections.length
                        ? "Bo'limni tanlang"
                        : "Bu ustunda bo'lim yo'q"
                      : "Avval ustunni tanlang"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sections.map((sec) => (
                  <SelectItem key={sec.id} value={sec.id}>
                    {sec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target?.notes && target.notes.length > 0 && (
            <ul className="space-y-1 rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {target.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || columnsLoading}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Tiklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck the forms page still compiles**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors in `components/forms/responses/form-responses-client.tsx` (it passes `target`, `columns`, `onClose`, `onRestored` only).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/leads/restore-lead-dialog.tsx
git commit -m "feat(leads): restore dialog preselects the old place and lists what changes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Archive page — queries, tables, filter bar, shell

**Files:**
- Create: `client/src/components/leads/archive/archive-types.ts`, `archive-queries.ts`, `archive-filter-bar.tsx`, `archive-table-parts.tsx`, `archived-leads-table.tsx`, `archived-sections-table.tsx`, `restore-section-dialog.tsx`
- Rewrite: `client/src/components/leads/leads-archive.tsx`

**Interfaces:**
- Consumes: Task 3 exports; `RestoreLeadDialog` from Task 4; `PaymentsPager` (`@/components/payments/list/payments-table`, props `{ page, pageSize, total, onPage, onPageSize, sizes?, sizeLabel? }`; `onPageSize` must also reset the page — the shell does it); `UrlSearchBox` (`@/components/payments/debt/debt-filter-bar`, props `{ value, onSearch, label, placeholder?, className? }`, wants a stable `onSearch`); `useCan` (`@/hooks/use-permissions`); `useUrlFilters` (`@/hooks/use-url-filters`); `MultiSelectCombobox`; `DatePicker`.
- Produces: `LeadsArchive({ onBack?: () => void })` (same export and path as before — `app/(dashboard)/leads/archive/page.tsx` and `settings/archive-settings-client.tsx` stay untouched).

- [ ] **Step 1: Types and queries**

`archive-types.ts`:

```ts
export type { ArchiveSummary, Paged } from "./archive-cache";
export type { RestoreColumn as BoardColumn } from "./restore-lead-model";

export interface DeletedBy {
  id: number;
  firstName: string;
  lastName: string;
}

export interface ArchivedLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Why the lead was lost — set when it was deleted directly (delete = LOST). */
  lostReason: string | null;
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string } | null;
  } | null;
  /** What restoring will change (the server's words). */
  notes: string[];
}

export interface ArchivedSection {
  id: string;
  name: string;
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  column: { id: string; name: string } | null;
  leadCount: number;
}
```

`archive-queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ArchiveParams } from "./archive-url";
import type {
  ArchiveSummary,
  ArchivedLead,
  ArchivedSection,
  BoardColumn,
  Paged,
} from "./archive-types";

const ROOT = ["leads-archive"] as const;

export const archiveKeys = {
  summary: [...ROOT, "summary"] as const,
  leads: [...ROOT, "leads"] as const,
  sections: [...ROOT, "sections"] as const,
  board: [...ROOT, "board-columns"] as const,
};

export function useArchiveSummary() {
  return useQuery({
    queryKey: archiveKeys.summary,
    queryFn: async () =>
      (await api.get<ArchiveSummary>("/leads/archive/summary")).data,
  });
}

/** `enabled` is the open tab: only that tab asks the server. */
export function useArchivedLeads(params: ArchiveParams, enabled: boolean) {
  return useQuery({
    queryKey: [...archiveKeys.leads, params],
    queryFn: async () =>
      (await api.get<Paged<ArchivedLead>>("/leads/archive/leads", { params }))
        .data,
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useArchivedSections(params: ArchiveParams, enabled: boolean) {
  return useQuery({
    queryKey: [...archiveKeys.sections, params],
    queryFn: async () =>
      (
        await api.get<Paged<ArchivedSection>>("/leads/archive/sections", {
          params,
        })
      ).data,
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** The live board, read only when a restore dialog opens. */
export function useBoardColumns(enabled: boolean) {
  return useQuery({
    queryKey: archiveKeys.board,
    queryFn: async () => (await api.get<BoardColumn[]>("/leads/board")).data,
    enabled,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Filter bar**

`archive-filter-bar.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import {
  dateToDay,
  dayToDate,
  hasArchiveFilter,
  type ArchiveFilters,
} from "./archive-url";

/**
 * Qidiruv, «Kim tomonidan» va sana oralig'i. Hammasi URL'da; `onChange` sahifani
 * 1 ga qaytarishni o'zi hal qiladi (shell'dagi `patch`). `onChange` barqaror
 * bo'lmasa qidiruv oynasi yozilayotgan matnni yo'qotmaydi, lekin keraksiz
 * qayta ishga tushadi.
 */
export function ArchiveFilterBar({
  filters,
  archivers,
  onChange,
  onClear,
}: {
  filters: ArchiveFilters;
  archivers: { id: number; name: string }[];
  onChange: (update: Partial<ArchiveFilters>) => void;
  onClear: () => void;
}) {
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  const from = dayToDate(filters.dan);
  const to = dayToDate(filters.gacha);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <UrlSearchBox
        value={filters.q}
        onSearch={onSearch}
        label="Arxivdan qidirish"
        placeholder="Ism, telefon yoki sabab bo'yicha..."
      />
      <MultiSelectCombobox
        className="w-full sm:w-56"
        options={archivers.map((a) => ({ value: String(a.id), label: a.name }))}
        selected={filters.kim}
        onChange={(kim) => onChange({ kim })}
        placeholder="Barcha xodimlar"
        searchPlaceholder="Xodim qidirish..."
      />
      <DatePicker
        className="w-full sm:w-40"
        value={from}
        onChange={(d) => onChange({ dan: dateToDay(d) })}
        placeholder="Dan"
        maxDate={to}
        defaultMonth={to}
      />
      <DatePicker
        className="w-full sm:w-40"
        value={to}
        onChange={(d) => onChange({ gacha: dateToDay(d) })}
        placeholder="Gacha"
        minDate={from}
        defaultMonth={from}
      />
      {hasArchiveFilter(filters) && (
        <Button variant="ghost" onClick={onClear}>
          <X className="size-4" />
          Tozalash
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Shared table parts**

`archive-table-parts.tsx`:

```tsx
"use client";

import { Archive, MoreHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import type { DeletedBy } from "./archive-types";

export function deletedByName(by: DeletedBy | null): string {
  if (!by) return "—";
  return [by.firstName, by.lastName].filter(Boolean).join(" ").trim() || "—";
}

/** The «⋯» menu with the one action an archived row has. */
export function RestoreMenu({ onRestore }: { onRestore: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Amallar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRestore}>
          <RotateCcw className="mr-2 size-4" />
          Tiklash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What the table body shows when there are no rows to draw: a skeleton while
 * the first answer is on its way, a retry when it failed (never the empty
 * state), and an empty state that says what to do next.
 */
export function ArchiveEmptyStates({
  span,
  isPending,
  isError,
  isEmpty,
  filtered,
  noun,
  onRetry,
  onClear,
}: {
  span: number;
  isPending: boolean;
  isError: boolean;
  isEmpty: boolean;
  filtered: boolean;
  /** «lid» or «bo'lim». */
  noun: string;
  onRetry: () => void;
  onClear: () => void;
}) {
  if (isPending) {
    return (
      <>
        {Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell colSpan={span}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }
  if (isError) {
    return (
      <TableRow>
        <TableCell colSpan={span} className="h-24 text-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            Arxivni yuklab bo&apos;lmadi
            <Button variant="outline" size="sm" onClick={onRetry}>
              Qayta urinish
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }
  if (isEmpty) {
    return (
      <TableRow>
        <TableCell colSpan={span} className="h-24 text-center text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <Archive className="size-7 text-muted-foreground/50" />
            {filtered
              ? `Filtrga mos ${noun} topilmadi — filtrni tozalab ko'ring`
              : `Arxivda ${noun} yo'q — o'chirilgan ${noun}lar shu yerda saqlanadi`}
            {filtered && (
              <Button variant="outline" size="sm" onClick={onClear}>
                Filtrni tozalash
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }
  return null;
}
```

- [ ] **Step 4: The two tables**

`archived-leads-table.tsx`:

```tsx
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { archiveDate } from "./archive-format";
import {
  ArchiveEmptyStates,
  RestoreMenu,
  deletedByName,
} from "./archive-table-parts";
import type { ArchivedLead, Paged } from "./archive-types";
import { ARCHIVE_PAGE_SIZES } from "./archive-url";

export function ArchivedLeadsTable({
  query,
  page,
  pageSize,
  filtered,
  canRestore,
  onRestore,
  onPage,
  onPageSize,
  onClear,
}: {
  query: UseQueryResult<Paged<ArchivedLead>>;
  page: number;
  pageSize: number;
  filtered: boolean;
  canRestore: boolean;
  onRestore: (lead: ArchivedLead) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onClear: () => void;
}) {
  const rows = query.data?.data ?? [];
  const span = canRestore ? 7 : 6;
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-md border",
          query.isFetching && !query.isPending && "opacity-70",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism</TableHead>
              <TableHead>Bo&apos;lim</TableHead>
              <TableHead>Yo&apos;qotilish sababi</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead>Kim tomonidan</TableHead>
              {canRestore && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            <ArchiveEmptyStates
              span={span}
              isPending={query.isPending}
              isError={query.isError && !query.data}
              isEmpty={!!query.data && rows.length === 0}
              filtered={filtered}
              noun="lid"
              onRetry={() => query.refetch()}
              onClear={onClear}
            />
            {rows.map((lead, index) => (
              <TableRow key={lead.id}>
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <p className="font-medium">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(lead.phone)}
                  </p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {lead.section
                    ? `${lead.section.column?.name ?? "—"} · ${lead.section.name}`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {lead.lostReason ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block max-w-[14rem] truncate">
                          {lead.lostReason}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {lead.lostReason}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {archiveDate(lead.deletedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {deletedByName(lead.deletedBy)}
                </TableCell>
                {canRestore && (
                  <TableCell>
                    <RestoreMenu onRestore={() => onRestore(lead)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {query.data && query.data.total > 0 && (
        <PaymentsPager
          page={page}
          pageSize={pageSize}
          total={query.data.total}
          onPage={onPage}
          onPageSize={onPageSize}
          sizes={ARCHIVE_PAGE_SIZES}
          sizeLabel="Sahifadagi qatorlar soni"
        />
      )}
    </div>
  );
}
```

`archived-sections-table.tsx`:

```tsx
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { archiveDate } from "./archive-format";
import {
  ArchiveEmptyStates,
  RestoreMenu,
  deletedByName,
} from "./archive-table-parts";
import type { ArchivedSection, Paged } from "./archive-types";
import { ARCHIVE_PAGE_SIZES } from "./archive-url";

export function ArchivedSectionsTable({
  query,
  page,
  pageSize,
  filtered,
  canRestore,
  onRestore,
  onPage,
  onPageSize,
  onClear,
}: {
  query: UseQueryResult<Paged<ArchivedSection>>;
  page: number;
  pageSize: number;
  filtered: boolean;
  canRestore: boolean;
  onRestore: (section: ArchivedSection) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onClear: () => void;
}) {
  const rows = query.data?.data ?? [];
  const span = canRestore ? 6 : 5;
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-md border",
          query.isFetching && !query.isPending && "opacity-70",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Bo&apos;lim</TableHead>
              <TableHead>Lidlar</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead>Kim tomonidan</TableHead>
              {canRestore && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            <ArchiveEmptyStates
              span={span}
              isPending={query.isPending}
              isError={query.isError && !query.data}
              isEmpty={!!query.data && rows.length === 0}
              filtered={filtered}
              noun="bo'lim"
              onRetry={() => query.refetch()}
              onClear={onClear}
            />
            {rows.map((section, index) => (
              <TableRow key={section.id}>
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{section.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {section.column?.name ?? "—"}
                  </p>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {section.leadCount}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {archiveDate(section.deletedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {deletedByName(section.deletedBy)}
                </TableCell>
                {canRestore && (
                  <TableCell>
                    <RestoreMenu onRestore={() => onRestore(section)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {query.data && query.data.total > 0 && (
        <PaymentsPager
          page={page}
          pageSize={pageSize}
          total={query.data.total}
          onPage={onPage}
          onPageSize={onPageSize}
          sizes={ARCHIVE_PAGE_SIZES}
          sizeLabel="Sahifadagi qatorlar soni"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Move the section dialog out**

Create `restore-section-dialog.tsx` by moving `RestoreSectionDialog` and its imports from the old `leads-archive.tsx` (the `// Restore a section` block, old lines ~437–570) unchanged, with two edits: export it, take `BoardColumn` from `./archive-types`, and report the result —

```tsx
onRestored: (result: { restoredLeadCount: number }) => void;
...
const { data } = await api.post<{ restoredLeadCount: number }>(
  `/lead-sections/${target.id}/restore`,
  { targetColumnId: columnId, withLeads: hasLeads ? withLeads : false },
);
toast.success("Bo'lim tiklandi");
onRestored({ restoredLeadCount: data.restoredLeadCount ?? 0 });
```

Add `columnsLoading?: boolean` to its props: the column `Select` gets `disabled={columnsLoading}` and the confirm button `disabled={submitting || columnsLoading}`.

- [ ] **Step 6: Rewrite the shell**

`client/src/components/leads/leads-archive.tsx` (replace the whole file):

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCan } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ArchiveFilterBar } from "./archive/archive-filter-bar";
import { minusCounts, withoutRow } from "./archive/archive-cache";
import {
  archiveKeys,
  useArchiveSummary,
  useArchivedLeads,
  useArchivedSections,
  useBoardColumns,
} from "./archive/archive-queries";
import type {
  ArchiveSummary,
  ArchivedLead,
  ArchivedSection,
  Paged,
} from "./archive/archive-types";
import { ArchivedLeadsTable } from "./archive/archived-leads-table";
import { ArchivedSectionsTable } from "./archive/archived-sections-table";
import { RestoreSectionDialog } from "./archive/restore-section-dialog";
import {
  LEADS_ARCHIVE_SCHEMA,
  archiveParams,
  archivePageSize,
  archiveTab,
  hasArchiveFilter,
  type ArchiveFilters,
} from "./archive/archive-url";
import { originOf } from "./archive/restore-lead-model";
import { RestoreLeadDialog } from "./restore-lead-dialog";

interface LeadsArchiveProps {
  /** When rendered inside /settings/archive, returns to the category grid. */
  onBack?: () => void;
}

const countLabel = (n: number | undefined) => (n === undefined ? "" : ` (${n})`);

export function LeadsArchive({ onBack }: LeadsArchiveProps) {
  const queryClient = useQueryClient();
  const { filters, setFilters } = useUrlFilters(LEADS_ARCHIVE_SCHEMA);
  const canRestore = useCan("leads.manage");

  const tab = archiveTab(filters.tab);
  const pageSize = archivePageSize(filters.soni);
  const params = useMemo(() => archiveParams(filters), [filters]);

  const summary = useArchiveSummary();
  const leads = useArchivedLeads(params, tab === "lidlar");
  const sections = useArchivedSections(params, tab === "bolimlar");

  const [leadTarget, setLeadTarget] = useState<ArchivedLead | null>(null);
  const [sectionTarget, setSectionTarget] = useState<ArchivedSection | null>(
    null,
  );
  const board = useBoardColumns(!!leadTarget || !!sectionTarget);

  // A filter change always puts the list back on page 1.
  const patch = useCallback(
    (update: Partial<ArchiveFilters>) => setFilters({ ...update, sahifa: 1 }),
    [setFilters],
  );
  const clear = () =>
    setFilters({ q: "", kim: [], dan: "", gacha: "", sahifa: 1 });
  const onPage = (sahifa: number) => setFilters({ sahifa });
  const onPageSize = (soni: number) => setFilters({ soni, sahifa: 1 });

  /** The page that just lost its last row steps back one page. */
  function stepBackIfEmpty(rowsOnPage: number) {
    if (rowsOnPage <= 1 && filters.sahifa > 1) {
      setFilters({ sahifa: filters.sahifa - 1 });
    }
  }

  function leadRestored(lead: ArchivedLead) {
    queryClient.setQueriesData<Paged<ArchivedLead>>(
      { queryKey: archiveKeys.leads },
      (old) => withoutRow(old, lead.id),
    );
    queryClient.setQueryData<ArchiveSummary>(archiveKeys.summary, (old) =>
      minusCounts(old, { leads: 1 }),
    );
    // Other pages and filters are stale now; the open one was updated above.
    queryClient.invalidateQueries({
      queryKey: archiveKeys.leads,
      refetchType: "none",
    });
    stepBackIfEmpty(leads.data?.data.length ?? 0);
    setLeadTarget(null);
  }

  function sectionRestored(section: ArchivedSection, restoredLeadCount: number) {
    queryClient.setQueriesData<Paged<ArchivedSection>>(
      { queryKey: archiveKeys.sections },
      (old) => withoutRow(old, section.id),
    );
    queryClient.setQueryData<ArchiveSummary>(archiveKeys.summary, (old) =>
      minusCounts(old, { sections: 1, leads: restoredLeadCount }),
    );
    // Restored leads leave the leads list: refetch it when it is on screen,
    // otherwise on its next visit.
    queryClient.invalidateQueries({ queryKey: archiveKeys.leads });
    stepBackIfEmpty(sections.data?.data.length ?? 0);
    setSectionTarget(null);
  }

  const filtered = hasArchiveFilter(filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {onBack ? (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="size-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" asChild>
                <Link href="/leads">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            )}
          </TooltipTrigger>
          <TooltipContent>
            {onBack ? "Arxivga qaytish" : "Lidlarga qaytish"}
          </TooltipContent>
        </Tooltip>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Lidlar arxivi</h2>
          <p className="text-xs text-muted-foreground">
            O&apos;chirilgan lidlar va bo&apos;limlar — tiklash mumkin
          </p>
        </div>
      </div>

      <ArchiveFilterBar
        filters={filters}
        archivers={summary.data?.archivers ?? []}
        onChange={patch}
        onClear={clear}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setFilters({ tab: value, sahifa: 1 })}
      >
        <TabsList>
          <TabsTrigger value="lidlar">
            Lidlar{countLabel(summary.data?.leads)}
          </TabsTrigger>
          <TabsTrigger value="bolimlar">
            Bo&apos;limlar{countLabel(summary.data?.sections)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lidlar" className="mt-3">
          <ArchivedLeadsTable
            query={leads}
            page={params.page}
            pageSize={pageSize}
            filtered={filtered}
            canRestore={canRestore}
            onRestore={setLeadTarget}
            onPage={onPage}
            onPageSize={onPageSize}
            onClear={clear}
          />
        </TabsContent>
        <TabsContent value="bolimlar" className="mt-3">
          <ArchivedSectionsTable
            query={sections}
            page={params.page}
            pageSize={pageSize}
            filtered={filtered}
            canRestore={canRestore}
            onRestore={setSectionTarget}
            onPage={onPage}
            onPageSize={onPageSize}
            onClear={clear}
          />
        </TabsContent>
      </Tabs>

      <RestoreLeadDialog
        target={
          leadTarget && {
            id: leadTarget.id,
            firstName: leadTarget.firstName,
            lastName: leadTarget.lastName,
            origin: originOf(leadTarget),
            notes: leadTarget.notes,
          }
        }
        columns={board.data ?? []}
        columnsLoading={board.isPending}
        columnsFailed={board.isError}
        onClose={() => setLeadTarget(null)}
        onRestored={() => leadTarget && leadRestored(leadTarget)}
      />
      <RestoreSectionDialog
        target={sectionTarget}
        columns={board.data ?? []}
        columnsLoading={board.isPending}
        onClose={() => setSectionTarget(null)}
        onRestored={({ restoredLeadCount }) =>
          sectionTarget && sectionRestored(sectionTarget, restoredLeadCount)
        }
      />
    </div>
  );
}
```

Notes for the implementer: `Tabs` may be Base UI-based (check `components/ui/tabs.tsx` — `onValueChange` then receives `(value, event)`; the arrow above works with both). If `TabsContent` keeps inactive panels mounted in this build, the `enabled` flags on the queries still keep the closed tab from fetching.

- [ ] **Step 7: Verify**

Run (re-run only after a code change):
- `cd client && npx tsc --noEmit -p .` → no errors.
- `npx vitest run src/components/leads src/lib/uzbek-only-texts.test.ts` → PASS.
- `npm run lint 2>&1 | tail -15` → the `✖ N problems (X errors, …)` line shows 0 errors for the touched files.

- [ ] **Step 8: Browser check** (dev server + local DB with archived leads/sections, or the repo's mock-API setup)

Check each: `/leads/archive` opens on «Lidlar» with `#`, Sana, Kim tomonidan; tab switch writes `?tab=bolimlar` and reload keeps it; search / «Kim tomonidan» / dates narrow both tabs, page returns to 1, «Tozalash» resets; page size 10→20; restoring a lead drops the row at once with no skeleton flash and the tab count falls by 1; the dialog opens with the old place chosen (or the «arxivda yoki o'chirilgan» hint) and shows the notes for a lost / owned lead; restoring a section with leads lowers both counts; stop the API → «Arxivni yuklab bo'lmadi» + «Qayta urinish» (not «Arxivda lid yo'q»); a role without `leads.manage` sees no `⋯`; `/settings/archive?type=leads` works and «Arxivga qaytish» goes back; the lead restore on the forms-responses page still opens empty and restores.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/leads
git commit -m "feat(leads): paged, filterable archive with tabs and local restore updates

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: News entry and full verification

**Files:**
- Modify: `client/src/qollanma/yangiliklar.ts` (add one entry at the top of the array)

- [ ] **Step 1: Add the entry**

```ts
  {
    sana: "2026-10-18",
    sarlavha: "Lidlar arxivi yangilandi",
    matn: "Lidlar arxivida endi «Lidlar» va «Bo'limlar» yorliqlari bor, jadvallar sahifalarga bo'lingan (10 dan 50 tagacha). Ism, telefon yoki sabab bo'yicha qidirish, «Kim tomonidan» va sana oralig'i bo'yicha filtr qo'shildi; filtrlar havolada saqlanadi. Har qatorda arxivlangan sana ko'rinadi. Lidni tiklash oynasi lidning eski joyini oldindan tanlaydi va tiklash nimani o'zgartirishini (bosqich, mas'ul) yozib turadi. Tiklash tugmasi faqat lidlarni boshqarish huquqi borlarga ko'rinadi. Tiklangan qator darrov ro'yxatdan yo'qoladi.",
    rollar: [1, 2, 3],
  },
```

- [ ] **Step 2: Full verification** (one run each; re-run only after a fix)

Server: `cd server && npm test` → all pass; `npm run typecheck`; `npm run build`; `npx eslint src --quiet`.
Client: `cd client && npx tsc --noEmit -p .`; `npm test` (vitest); `npm run lint 2>&1 | tail -5` (0 errors); `npm run build`.

Note from `CLAUDE.local.md`: do not run `npm run build` and the server tests in parallel against the same generated Prisma client.

- [ ] **Step 3: Commit**

```bash
git add client/src/qollanma/yangiliklar.ts
git commit -m "docs(guide): news entry for the leads archive update

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand over** — report to the CEO what changed in plain words, show a screenshot of the new page; PR and deploy only on their word (merge/deploy are manual, see memory `project_railway_manual_deploy`).

---

## Self-review (done)

- **Spec coverage:** 3.1.1 → Tasks 1–2 (server paging) + 5 (pager); 3.1.2 → Task 5 (`useCan`, hidden actions column); 3.1.3 → `ArchiveEmptyStates`; 3.1.4 → `leadRestored` / `sectionRestored`, lazy `useBoardColumns`; 3.2.5 → Tasks 1–2 + `ArchiveFilterBar`; 3.2.6 → tabs + `enabled`; 3.2.7 → Sana column + `archiveDate`; 3.3.8 → Tasks 3–4 (`initialPlace`); 3.3.9 → `restoreNotes` + dialog notes; server routes, snapshot, guide → Tasks 2, 6.
- **Placeholders:** none; both tables are given in full.
- **Names:** `archiveKeys`, `withoutRow`, `minusCounts`, `initialPlace`, `originOf`, `archiveParams`, `ARCHIVE_PAGE_SIZES`, `RestoreMenu`, `ArchiveEmptyStates` are defined in earlier tasks than their use.
