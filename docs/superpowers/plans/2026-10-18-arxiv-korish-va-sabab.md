# Arxiv: ko'rish va sabab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/settings/archive` da arxivdagi o'quvchi va guruhga bosib kirib ko'rish (faqat o'qish uchun yon oyna) va ro'yxatda «Sabab» ustuni.

**Architecture:** Server yangi endpoint qo'shmaydi: mavjud `GET /archive/:entityType/:id` javobiga o'quvchi yozilishlari / guruh ustozlari va o'quvchilari qo'shiladi (`getDetailInclude`). Arxivdagi guruhning tarixi 404 bermasligi uchun `assertCallerMayTouchGroup` ga `includeArchived` opsiyasi beriladi. Client: yangi `archive-detail-sheet.tsx` (yon oyna), sof qoidalar `archive-detail-rules.ts`, `ArchiveList` ga ustun + bosiladigan qator + URL (`?id=&atab=`).

**Tech Stack:** NestJS + Prisma + Jest (server), Next.js + shadcn/ui + vitest (client).

## Global Constraints

Spec: `docs/superpowers/specs/2026-10-18-arxiv-korish-va-sabab-design.md`.

- Faqat `students` va `groups` turlari. Boshqa arxiv turlari o'zgarmaydi.
- Barcha ekran matni o'zbekcha (lotin). Inglizcha so'z yo'q.
- Yon oyna hech narsa yozmaydi; faqat mavjud `POST /archive/:type/:id/restore` chaqiriladi.
- Yangi endpoint yo'q, yangi ruxsat yo'q (`settings.archive` qoladi).
- Sana formati `dd.MM.yyyy, HH:mm` (`date-fns`), narx/balans `formatBalance`, telefon `formatPhone` (`@/lib/format-utils`).
- Client'da Prettier ISHLATILMAYDI. Server fayllariga `npx prettier --write`.
- Yangi fayl 500 qatordan oshmasin. `archive-settings-client.tsx` allaqachon uzun: unga yangi mantiq qo'shma, yangi fayllarga ajrat.
- Commit xabarlari inglizcha, oxirida: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/arxiv-korish-sabab` (branch `worktree-arxiv-korish-sabab`). Hamma buyruq shu papkadan.

## File Structure

| Fayl | Vazifa |
| --- | --- |
| `server/src/archive/shared/archive-meta.ts` (o'zgaradi) | `getDetailInclude` — bitta yozuv uchun kengaytirilgan include |
| `server/src/archive/archive-read.service.ts` (o'zgaradi) | `findOne` `getDetailInclude` ishlatadi |
| `server/src/archive/archive-detail.spec.ts` (yangi) | `findOne` include/scope testi |
| `server/src/common/auth/group-branch-scope.ts` (o'zgaradi) | `includeArchived` opsiyasi |
| `server/src/common/auth/entity-history-scope.ts` (o'zgaradi) | `Group` / `GroupAttendance` tarixi arxivdagi guruh uchun ochiladi |
| `server/src/common/auth/group-branch-scope.spec.ts` (o'zgaradi) | opsiya testi |
| `client/src/components/settings/archive-detail-rules.ts` (yangi) | sof qoidalar: sabab matni, ro'yxatni qisqartirish, ism |
| `client/src/components/settings/archive-detail-rules.test.ts` (yangi) | vitest |
| `client/src/components/settings/archive-detail-sheet.tsx` (yangi) | yon oyna |
| `client/src/components/settings/archive-settings-client.tsx` (o'zgaradi) | Sabab ustuni, bosiladigan qator, bitta tiklash dialogi, URL |
| `client/src/qollanma/...` (o'zgaradi) | qo'llanma matni + yangilik |

---

### Task 0: Muhit

**Files:** yo'q (faqat o'rnatish).

- [ ] **Step 1: Paketlarni o'rnat**

Run:
```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/arxiv-korish-sabab/server && npm install && npx prisma generate
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/arxiv-korish-sabab/client && npm install
```
Expected: ikkalasi xatosiz tugaydi. (Worktree'da `node_modules` yo'q, bu qadamsiz jest/vitest ishlamaydi.)

---

### Task 1: Server — arxivdagi yozuvning batafsil include'i

**Files:**
- Modify: `server/src/archive/shared/archive-meta.ts` (`getInclude` dan keyin)
- Modify: `server/src/archive/archive-read.service.ts:99-122` (`findOne`)
- Create: `server/src/archive/archive-detail.spec.ts`

**Interfaces:**
- Produces: `getDetailInclude(entityType: ArchiveEntityType)` (`archive-meta.ts`). Javobda:
  - `students` → mavjud maydonlar + `deletedBy`, `branches[{ branch: {id,name} }]`, `enrollments[{ ...enrollment, group: {id,name} }]` (oxirgi 50), `_count.enrollments`.
  - `groups` → mavjud maydonlar (`course`, `branch`, `deletedBy`) + `teachers[{ teacher: {id,firstName,lastName} }]`, `enrollments[{ ...enrollment, student: {id,firstName,lastName} }]` (oxirgi 50), `_count.enrollments`.
  - boshqa turlar → `getInclude` bilan bir xil.

- [ ] **Step 1: Failing test yoz**

`server/src/archive/archive-detail.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveEntityType } from './dto/archive-query.dto';

describe('ArchiveReadService.findOne — batafsil include', () => {
  let prisma: any;
  let read: ArchiveReadService;

  beforeEach(() => {
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10482 }) },
      group: { findFirst: jest.fn().mockResolvedValue({ id: 'g1' }) },
      course: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    read = new ArchiveReadService(prisma);
  });

  it("o'quvchi: yozilishlar va filiallarni so'raydi, arxiv va kompaniya filtri qoladi", async () => {
    await read.findOne(ArchiveEntityType.STUDENTS, '10482', 1001);
    const arg = prisma.student.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      id: 10482,
      deletedAt: { not: null },
      companyId: 1001,
    });
    expect(arg.include.enrollments).toMatchObject({
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    expect(arg.include.branches).toBeDefined();
    expect(arg.include.deletedBy).toBeDefined();
    expect(arg.include._count).toEqual({ select: { enrollments: true } });
  });

  it("guruh: ustozlar va o'quvchilarni so'raydi", async () => {
    await read.findOne(ArchiveEntityType.GROUPS, 'g1', 1001);
    const arg = prisma.group.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'g1', deletedAt: { not: null } });
    expect(arg.include.teachers).toBeDefined();
    expect(arg.include.enrollments).toMatchObject({ take: 50 });
    expect(arg.include.course).toBeDefined();
  });

  it("boshqa tur (kurs): eski include o'zgarmaydi", async () => {
    await read.findOne(ArchiveEntityType.COURSES, 'c1', 1001);
    const arg = prisma.course.findFirst.mock.calls[0][0];
    expect(arg.include.enrollments).toBeUndefined();
    expect(arg.include.deletedBy).toBeDefined();
  });

  it('topilmasa 404', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(
      read.findOne(ArchiveEntityType.STUDENTS, '10482', 1001),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshir**

Run: `cd server && npx jest src/archive/archive-detail.spec.ts`
Expected: FAIL (`enrollments` include yo'q).

- [ ] **Step 3: `getDetailInclude` yoz**

`archive-meta.ts` da `getInclude` funksiyasidan keyin qo'sh:
```ts
/** Yon oynadagi ro'yxat uzunligi: ko'proq bo'lsa `_count` jami sonni aytadi. */
export const ARCHIVE_DETAIL_ROWS = 50;

/**
 * Bitta arxivlangan yozuvni ochish uchun (yon oyna). Ro'yxat (`findAll`)
 * `getInclude` da qoladi: har qator uchun yozilishlarni o'qish ortiqcha.
 */
export function getDetailInclude(entityType: ArchiveEntityType) {
  const person = { select: { id: true, firstName: true, lastName: true } };
  const base = getInclude(entityType) ?? {};
  switch (entityType) {
    case ArchiveEntityType.STUDENTS:
      return {
        ...base,
        branches: { include: { branch: { select: { id: true, name: true } } } },
        enrollments: {
          orderBy: { createdAt: 'desc' as const },
          take: ARCHIVE_DETAIL_ROWS,
          include: { group: { select: { id: true, name: true } } },
        },
        _count: { select: { enrollments: true } },
      };
    case ArchiveEntityType.GROUPS:
      return {
        ...base,
        teachers: { include: { teacher: person } },
        enrollments: {
          orderBy: { createdAt: 'desc' as const },
          take: ARCHIVE_DETAIL_ROWS,
          include: { student: person },
        },
        _count: { select: { enrollments: true } },
      };
    default:
      return getInclude(entityType);
  }
}
```

`archive-read.service.ts`: import ro'yxatiga `getDetailInclude` qo'sh, `findOne` ichida `const include = getInclude(entityType);` ni `const include = getDetailInclude(entityType);` ga almashtir. `findAll` o'zgarmaydi.

- [ ] **Step 4: Test o'tishini tekshir**

Run: `cd server && npx jest src/archive`
Expected: PASS (yangi spec + mavjud arxiv speclari).

- [ ] **Step 5: Format, typecheck, commit**

```bash
cd server && npx prettier --write src/archive/shared/archive-meta.ts src/archive/archive-read.service.ts src/archive/archive-detail.spec.ts && npm run typecheck
cd .. && git add server/src/archive && git commit -m "feat(archive): detail include for archived students and groups

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: typecheck xatosiz.

---

### Task 2: Server — arxivdagi guruhning tarixi ochiladi

Sabab: `assertCallerMayTouchGroup` `deletedAt: null` bilan qidiradi, shuning uchun `GET /entity-history/Group/<arxivdagi id>` 404 beradi (o'quvchi tarixi bunday emas: `assertCallerMayTouchStudent` `deletedAt` ga qaramaydi).

**Files:**
- Modify: `server/src/common/auth/group-branch-scope.ts:35-42, 84-87`
- Modify: `server/src/common/auth/entity-history-scope.ts:115-124` (`Group` / `GroupAttendance`)
- Modify: `server/src/common/auth/group-branch-scope.spec.ts` (`describe('fails closed')` oldidan)

**Interfaces:**
- Produces: `assertCallerMayTouchGroup(..., options: { lessonDate?: Date; includeArchived?: boolean })`. Standart xatti-harakat o'zgarmaydi.

- [ ] **Step 1: Failing test yoz**

`group-branch-scope.spec.ts`, `describe('fails closed')` blokidan oldin qo'sh:
```ts
  describe('arxivdagi guruh', () => {
    it('standart: arxivdagi guruhni qidirmaydi (deletedAt: null)', async () => {
      const prisma = prismaFor({
        groupBranch: 1,
        caller: { mainBranch: 1, branches: [{ branchId: 1 }], role: 'Administrator' },
      });
      await assertCallerMayTouchGroup(prisma, 7, ['Administrator'], GROUP);
      expect((prisma as any).group.findFirst.mock.calls[0][0].where).toEqual({
        id: GROUP,
        deletedAt: null,
      });
    });

    it('includeArchived: deletedAt filtri yo\'q, filial tekshiruvi qoladi', async () => {
      const prisma = prismaFor({
        groupBranch: 2,
        caller: { mainBranch: 1, branches: [{ branchId: 1 }], role: 'Administrator' },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, 7, ['Administrator'], GROUP, undefined, {
          includeArchived: true,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((prisma as any).group.findFirst.mock.calls[0][0].where).toEqual({
        id: GROUP,
      });
    });
  });
```

- [ ] **Step 2: Yiqilishini tekshir**

Run: `cd server && npx jest src/common/auth/group-branch-scope.spec.ts`
Expected: FAIL (TS: `includeArchived` yo'q yoki `where` tengsiz).

- [ ] **Step 3: Implementatsiya**

`group-branch-scope.ts`: `options` tipini `{ lessonDate?: Date; includeArchived?: boolean } = {}` ga o'zgartir. Pastdagi so'rovni:
```ts
  const group = await prisma.group.findFirst({
    where: { id: groupId, ...(options.includeArchived ? {} : { deletedAt: null }) },
    select: { branchId: true },
  });
```
Funksiya hujjat-izohiga bir qator qo'sh: `includeArchived` faqat o'qish (tarix) uchun, yozuvchi yo'llar uni berma.

`entity-history-scope.ts` da `case 'Group': case 'GroupAttendance':` chaqiruvini o'zgartir:
```ts
      await assertCallerMayTouchGroup(prisma, userId as number, roles, entityId, msg, {
        includeArchived: true,
      });
```
(Faqat tarix o'qish yo'li; `Attendance` bo'limi tegilmaydi.)

- [ ] **Step 4: Test o'tishini tekshir**

Run: `cd server && npx jest src/common/auth src/common/entity-history`
Expected: PASS. Agar `entity-history-scope.spec.ts` `assertCallerMayTouchGroup` chaqiruv argumentlarini aniq tekshirsa, o'sha speclarni yangi 6-argumentga moslab yangila.

- [ ] **Step 5: Format, typecheck, commit**

```bash
cd server && npx prettier --write src/common/auth/group-branch-scope.ts src/common/auth/group-branch-scope.spec.ts src/common/auth/entity-history-scope.ts && npm run typecheck
cd .. && git add server/src/common/auth && git commit -m "fix(history): archived group history readable through the shared branch guard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — sof qoidalar

**Files:**
- Create: `client/src/components/settings/archive-detail-rules.ts`
- Create: `client/src/components/settings/archive-detail-rules.test.ts`

**Interfaces:**
- Produces:
  - `type DetailType = "students" | "groups"`
  - `isDetailType(t: string): t is DetailType`
  - `archiveReason(item: { statusChangeReason?: string | null }): string | null` — bo'sh yoki aynan «O'chirildi» bo'lsa `null`
  - `personName(p?: { firstName?: string | null; lastName?: string | null } | null): string` — bo'lmasa `"Noma'lum"`
  - `capRows<T>(rows: T[], total: number, cap?: number): { shown: T[]; hidden: number }` — `cap` standart 10; `hidden = max(0, total - shown.length)`

- [ ] **Step 1: Failing test yoz**

`archive-detail-rules.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { archiveReason, capRows, isDetailType, personName } from "./archive-detail-rules";

describe("isDetailType", () => {
  it("faqat o'quvchi va guruh", () => {
    expect(isDetailType("students")).toBe(true);
    expect(isDetailType("groups")).toBe(true);
    expect(isDetailType("users")).toBe(false);
    expect(isDetailType("")).toBe(false);
  });
});

describe("archiveReason", () => {
  it("haqiqiy sababni qaytaradi (bo'shliqsiz)", () => {
    expect(archiveReason({ statusChangeReason: "  Boshqa markazga o'tdi " })).toBe(
      "Boshqa markazga o'tdi",
    );
  });
  it("bo'sh, null va standart «O'chirildi» — sabab yozilmagan", () => {
    expect(archiveReason({ statusChangeReason: "" })).toBeNull();
    expect(archiveReason({ statusChangeReason: "   " })).toBeNull();
    expect(archiveReason({ statusChangeReason: null })).toBeNull();
    expect(archiveReason({})).toBeNull();
    expect(archiveReason({ statusChangeReason: "O'chirildi" })).toBeNull();
  });
});

describe("personName", () => {
  it("ism va familiyani birlashtiradi", () => {
    expect(personName({ firstName: "Madina", lastName: "Karimova" })).toBe("Madina Karimova");
  });
  it("bo'sh bo'lsa Noma'lum", () => {
    expect(personName(null)).toBe("Noma'lum");
    expect(personName({ firstName: "", lastName: null })).toBe("Noma'lum");
  });
});

describe("capRows", () => {
  it("cap dan kam bo'lsa hammasini ko'rsatadi", () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });
  it("ortig'ini 'yana N ta' deb sanaydi (jami serverdan)", () => {
    const rows = Array.from({ length: 50 }, (_, i) => i);
    const r = capRows(rows, 63, 10);
    expect(r.shown).toHaveLength(10);
    expect(r.hidden).toBe(53);
  });
  it("jami ro'yxatdan kichik bo'lsa manfiy bermaydi", () => {
    expect(capRows([1, 2], 0, 10).hidden).toBe(0);
  });
});
```

- [ ] **Step 2: Yiqilishini tekshir**

Run: `cd client && npx vitest --config vitest.config.ts run src/components/settings/archive-detail-rules.test.ts`
Expected: FAIL (modul yo'q).

- [ ] **Step 3: Implementatsiya**

`archive-detail-rules.ts`:
```ts
/**
 * Arxiv yon oynasi va «Sabab» ustuni uchun sof qoidalar (DOM yo'q, vitest bilan
 * sinaladi). Hech qanday hisob-kitob serverniki; bu yerda faqat matn tanlanadi.
 */

export type DetailType = "students" | "groups";

export function isDetailType(t: string): t is DetailType {
  return t === "students" || t === "groups";
}

/** Server guruhni sababsiz o'chirsa «O'chirildi» deb yozadi: bu sabab emas. */
const DEFAULT_REASON = "O'chirildi";

export function archiveReason(item: {
  statusChangeReason?: string | null;
}): string | null {
  const text = item.statusChangeReason?.trim();
  if (!text || text === DEFAULT_REASON) return null;
  return text;
}

export function personName(
  p?: { firstName?: string | null; lastName?: string | null } | null,
): string {
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(" ").trim();
  return name || "Noma'lum";
}

/** Yon oynada ro'yxat qisqa turadi; `total` serverning `_count` jami soni. */
export function capRows<T>(
  rows: T[],
  total: number,
  cap = 10,
): { shown: T[]; hidden: number } {
  const shown = rows.slice(0, cap);
  return { shown, hidden: Math.max(0, total - shown.length) };
}
```

- [ ] **Step 4: O'tishini tekshir**

Run: `cd client && npx vitest --config vitest.config.ts run src/components/settings/archive-detail-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/settings/archive-detail-rules.ts client/src/components/settings/archive-detail-rules.test.ts
git commit -m "feat(archive): pure rules for archive reason and detail rows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — yon oyna komponenti

**Files:**
- Create: `client/src/components/settings/archive-detail-sheet.tsx`

**Interfaces:**
- Consumes: `archive-detail-rules.ts` (Task 3); server javobi (Task 1); `EntityHistoryTable` (`@/components/shared/entity-history-table`, props `entityType`, `entityId`); `getStatusConfig("enrollments", status)` (`@/lib/status-config`) → `{ label, variant }`; `Badge` (`@/components/ui/badge`).
- Produces:
```ts
export interface ArchiveDetailSheetProps {
  entityType: DetailType;
  id: string;
  tab: "malumot" | "tarix";
  onTabChange: (tab: "malumot" | "tarix") => void;
  onClose: () => void;
  /** Tiklash tugmasi: ro'yxatdagi bitta tiklash dialogini ochadi */
  onRestore: (item: any) => void;
}
export function ArchiveDetailSheet(props: ArchiveDetailSheetProps): JSX.Element;
```

- [ ] **Step 1: Komponentni yoz**

`archive-detail-sheet.tsx` (qoidalar: `SheetContent p-0 flex flex-col`, sarlavha `border-b`, yagona skroll qismi, skeleton, xato + «Qayta urinish»):
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { formatBalance, formatPhone } from "@/lib/format-utils";
import { getStatusConfig } from "@/lib/status-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import {
  archiveReason,
  capRows,
  personName,
  type DetailType,
} from "./archive-detail-rules";

type TabKey = "malumot" | "tarix";

export interface ArchiveDetailSheetProps {
  entityType: DetailType;
  id: string;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onClose: () => void;
  onRestore: (item: any) => void;
}

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd.MM.yyyy, HH:mm") : "—";

function deletedByName(item: any): string {
  const by = item.deletedBy;
  if (!by) return "—";
  return [by.firstName, by.lastName].filter(Boolean).join(" ").trim() || "—";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ArchiveDetailSheet({
  entityType,
  id,
  tab,
  onTabChange,
  onClose,
  onRestore,
}: ArchiveDetailSheetProps) {
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.get(`/archive/${entityType}/${id}`);
      setItem(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [entityType, id]);

  useEffect(() => {
    load();
  }, [load]);

  const isStudent = entityType === "students";
  const title = !item
    ? "Arxivdagi yozuv"
    : isStudent
      ? personName(item)
      : item.name || "Noma'lum";
  const subtitle = isStudent
    ? `O'quvchi · ID ${id} · Arxivda`
    : "Guruh · Arxivda";
  const reason = item ? archiveReason(item) : null;
  const rows = item
    ? capRows(item.enrollments ?? [], item._count?.enrollments ?? 0)
    : { shown: [], hidden: 0 };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : failed || !item ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
              <Button variant="outline" size="sm" onClick={load}>
                Qayta urinish
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950/30">
                <Row label="Arxivlangan" value={fmt(item.deletedAt)} />
                <Row label="Kim tomonidan" value={deletedByName(item)} />
                <Row
                  label="Sabab"
                  value={
                    reason ? (
                      <span className="font-medium">{reason}</span>
                    ) : (
                      <span className="text-muted-foreground">Sabab yozilmagan</span>
                    )
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => onRestore(item)}
                >
                  <RotateCcw className="mr-2 size-4" />
                  Qayta tiklash
                </Button>
              </div>

              <Tabs value={tab} onValueChange={(v) => onTabChange(v as TabKey)}>
                <TabsList>
                  <TabsTrigger value="malumot">Ma&apos;lumot</TabsTrigger>
                  <TabsTrigger value="tarix">Tarix</TabsTrigger>
                </TabsList>

                <TabsContent value="malumot" className="space-y-4 pt-2">
                  {isStudent ? (
                    <div className="divide-y">
                      <Row label="Telefon" value={formatPhone(item.phone)} />
                      <Row
                        label="Filial"
                        value={
                          (item.branches ?? [])
                            .map((b: any) => b.branch?.name)
                            .filter(Boolean)
                            .join(", ") || "—"
                        }
                      />
                      <Row label="Balans" value={formatBalance(item.balance ?? 0)} />
                    </div>
                  ) : (
                    <div className="divide-y">
                      <Row label="Kurs" value={item.course?.name ?? "—"} />
                      <Row label="Filial" value={item.branch?.name ?? "—"} />
                      <Row
                        label="Ustoz"
                        value={
                          (item.teachers ?? [])
                            .map((t: any) => personName(t.teacher))
                            .join(", ") || "—"
                        }
                      />
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-sm font-medium">
                      {isStudent
                        ? "Guruhlari"
                        : `O'quvchilari (${item._count?.enrollments ?? rows.shown.length})`}
                    </p>
                    {rows.shown.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Yozilish yo&apos;q</p>
                    ) : (
                      <div className="divide-y text-sm">
                        {rows.shown.map((e: any) => {
                          const st = getStatusConfig("enrollments", e.status);
                          return (
                            <div key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                              <span>{isStudent ? e.group?.name ?? "—" : personName(e.student)}</span>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </div>
                          );
                        })}
                        {rows.hidden > 0 && (
                          <p className="py-1.5 text-muted-foreground">yana {rows.hidden} ta</p>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="tarix" className="pt-2">
                  {tab === "tarix" && (
                    <EntityHistoryTable
                      entityType={isStudent ? "Student" : "Group"}
                      entityId={id}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
Eslatma: `getStatusConfig` qaytaradigan `variant` qiymatlari `Badge` ning `variant` tipiga mos kelishi kerak (`status-config.ts` shu uchun yozilgan). Tip xatosi chiqsa, `Badge` ning qabul qiladigan variantlariga qarab faqat shu faylda `as` bilan moslang.

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: xatosiz. (Mavjud bog'liq bo'lmagan xatolar bo'lsa, faqat yangi faylga tegishlilarini tuzat.)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/settings/archive-detail-sheet.tsx
git commit -m "feat(archive): read-only side sheet for archived students and groups

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — ro'yxatga ulash (Sabab ustuni, bosiladigan qator, URL, bitta tiklash dialogi)

**Files:**
- Modify: `client/src/components/settings/archive-settings-client.tsx` (`ArchiveList` va importlar)

**Interfaces:**
- Consumes: Task 3 va Task 4 chiqishlari.

Maqsad: (a) har qatordagi alohida `AlertDialog` o'rniga bitta boshqariladigan dialog (qator tugmasi ham, yon oyna tugmasi ham shuni ochadi); (b) «Sabab» ustuni; (c) qator bosilsa `?id=` URLga yoziladi va yon oyna ochiladi.

- [ ] **Step 1: Importlar**

`AlertDialogTrigger` importini olib tashla (endi ishlatilmaydi). Qo'sh:
```tsx
import { ArchiveDetailSheet } from "./archive-detail-sheet";
import { archiveReason, isDetailType } from "./archive-detail-rules";
```

- [ ] **Step 2: URL sxemasi**

`archiveListSchema` ga ikki kalit qo'sh:
```tsx
const archiveListSchema = {
  type: { type: "string" as const, defaultValue: "" },
  search: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  id: { type: "string" as const, defaultValue: "" },
  atab: { type: "string" as const, defaultValue: "" },
};
```

- [ ] **Step 3: `ArchiveList` ichida holat va yordamchilar**

`const perPage = 10;` dan keyin:
```tsx
  const canOpen = isDetailType(entityType);
  const showReason = canOpen;
  const colCount = showReason ? 6 : 5;
  const openId = canOpen ? filters.id : "";
  const sheetTab = filters.atab === "tarix" ? "tarix" : "malumot";
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const closeSheet = () => setUrlFilters({ id: "", atab: "" });
```
`handleRestore` ichida muvaffaqiyat satrlaridan keyin (`setTotal(...)` dan so'ng) qo'sh:
```tsx
      if (filters.id === String(id)) closeSheet();
      setRestoreTarget(null);
```
(`finally` dagi `setActionId(null)` qoladi.)

- [ ] **Step 4: Jadval sarlavhasi va qatorlar**

Sarlavhada «Nomi» dan keyin:
```tsx
              {showReason && <TableHead>Sabab</TableHead>}
```
Skeleton va bo'sh holatdagi `colSpan={5}` ni `colSpan={colCount}` ga o'zgartir (ikki joy).

Har bir qatorni (`items.map`) shunday qil: `<TableRow key={item.id}>` ni
```tsx
                <TableRow
                  key={item.id}
                  className={canOpen ? "cursor-pointer hover:bg-muted/50" : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  onClick={canOpen ? () => setUrlFilters({ id: String(item.id) }) : undefined}
                  onKeyDown={
                    canOpen
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setUrlFilters({ id: String(item.id) });
                          }
                        }
                      : undefined
                  }
                >
```
«Nomi» katagidan keyin sabab katagini qo'sh:
```tsx
                  {showReason && (
                    <TableCell>
                      {archiveReason(item) ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
```
Amallar katagidagi butun `<AlertDialog>...</AlertDialog>` bloki o'rniga faqat tooltipli tugma:
```tsx
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={actionId === item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRestoreTarget(item);
                            }}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Qayta tiklash</TooltipContent>
                      </Tooltip>
```
Yonidagi o'chirish (`Trash2`, disabled) tugmasi o'zgarmaydi.

- [ ] **Step 5: Bitta dialog va yon oyna**

`return (...)` ning oxirgi `</div>` idan oldin (sahifalash blokidan keyin) qo'sh:
```tsx
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qayta tiklash</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{restoreTarget ? getDisplayName(entityType, restoreTarget) : ""}&quot;
              arxivdan tiklanadi va faol holatga qaytadi. Davom etasizmi?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && handleRestore(restoreTarget.id)}
            >
              Tiklash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {openId && isDetailType(entityType) && (
        <ArchiveDetailSheet
          key={openId}
          entityType={entityType}
          id={openId}
          tab={sheetTab}
          onTabChange={(t) => setUrlFilters({ atab: t === "tarix" ? "tarix" : "" })}
          onClose={closeSheet}
          onRestore={(it) => setRestoreTarget(it)}
        />
      )}
```

- [ ] **Step 6: Typecheck + lint**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/settings/archive-settings-client.tsx src/components/settings/archive-detail-sheet.tsx src/components/settings/archive-detail-rules.ts`
Expected: xatosiz (`✖ N problems (0 errors ...)` qatorini o'qi).

- [ ] **Step 7: Brauzerda tekshir va skrinshot yubor**

Local dev (`/restart` buyrug'i yoki `client`/`server` `npm run dev`) da CEO bilan `/settings/archive` ga kir. Arxivda o'quvchi/guruh bo'lmasa, test o'quvchi va guruhni o'zing arxivla (sabab bilan). Tekshir:
1. «O'quvchilar» va «Guruhlar» ro'yxatida «Sabab» ustuni bor, boshqa turlarda yo'q.
2. Qatorni bosish yon oynani ochadi; URLda `?type=students&id=...`; sahifani yangilash oynani qayta ochadi.
3. «Ma'lumot» va «Tarix» tablari ishlaydi (guruh tarixi 404 bermaydi); `?atab=tarix` yangilashda saqlanadi.
4. «Qayta tiklash» (qator tugmasi ham, oynadagi ham) bitta dialogni ochadi; tiklangach oyna yopiladi, qator yo'qoladi.
5. Tiklash tugmasini bosish yon oynani ochmaydi.
6. Qorong'i rejim va telefon kengligida o'qiladi.
Skrinshot(lar)ni foydalanuvchiga yubor (`SendUserFile`).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/settings/archive-settings-client.tsx
git commit -m "feat(archive): reason column and clickable rows for students and groups

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Qo'llanma va yakuniy tekshiruv

**Files:**
- Modify: `client/src/qollanma/kontent/oquvchilar/chetlatish-va-arxiv.mdx` (oxiriga bo'lim)
- Modify: `client/src/qollanma/sahifalar/oquvchilar.ts` (`chetlatish-va-arxiv` yozuvi: `yollar`, `qisqacha`, `yangilangan`)
- Modify: `client/src/qollanma/yangiliklar.ts` (tepaga yozuv)

- [ ] **Step 1: MDX bo'limi**

`chetlatish-va-arxiv.mdx` oxiriga (matnda `{`, `}`, `<` ishlatma):
```mdx
## Arxivni ko'rish

Sozlamalar → «Arxiv» → «O'quvchilar» yoki «Guruhlar». Ro'yxatda «Sabab» ustuni bor: o'quvchi yoki guruh nima sababdan arxivga tushgani. Sabab yozilmagan eski yozuvlarda «—» turadi.

Qatorni bossangiz o'ng tomondan oyna ochiladi. U faqat ko'rish uchun:

- tepada arxivlangan sana, kim arxivlagani va sabab;
- «Ma'lumot» tabida o'quvchining telefoni, filiali, balansi va guruhlari (guruh uchun kurs, ustoz va o'quvchilari);
- «Tarix» tabida shu yozuvning butun tarixi.

Oynadagi «Qayta tiklash» ro'yxatdagi tugma bilan bir xil ishlaydi. Arxivni faqat CEO ochadi.
```

- [ ] **Step 2: Registr**

`sahifalar/oquvchilar.ts` dagi `chetlatish-va-arxiv` yozuvida: `yollar` ga `"/settings/archive"` qo'sh; `qisqacha` oxiriga «Sozlamalar → Arxivda arxivdagi o'quvchi va guruhni ochib ko'rish, arxivga tushish sababini ko'rish mumkin.» qo'sh; shu yozuvdagi `yangilangan` (bor bo'lsa) ni `2026-10-18` ga o'zgartir. Maydon nomini yozuvdan o'qib tekshir.

- [ ] **Step 3: Yangilik**

`yangiliklar.ts` massivining boshiga:
```ts
  {
    sana: "2026-10-18",
    sarlavha: "Arxivdagi o'quvchi va guruhni ko'rish, arxivga tushish sababi",
    matn: "Sozlamalar → Arxiv → «O'quvchilar» va «Guruhlar» ro'yxatida endi «Sabab» ustuni bor. Qatorni bossangiz o'ng tomondan oyna ochiladi: arxivlangan sana, kim arxivlagani, sabab, o'quvchining guruhlari (yoki guruhning ustozi va o'quvchilari) va tarixi. Oyna faqat ko'rish uchun; «Qayta tiklash» tugmasi ro'yxatdagi bilan bir xil. Sabab yozilmagan eski yozuvlarda «—» turadi.",
    rollar: [1],
    sahifa: { bolim: "oquvchilar", sahifa: "chetlatish-va-arxiv" },
  },
```

- [ ] **Step 4: To'liq tekshiruv**

```bash
cd client && npm test && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build
cd ../server && npm run typecheck && npx jest src/archive src/common/auth src/common/entity-history && npx eslint src/archive src/common/auth --quiet
```
Expected: hammasi yashil. `npm test` (client) qo'llanma registr testlarini (`reyestr.test.ts`: `yollar` haqiqiy marshrutga mos, `rollar`, sana) ham ishga tushiradi. Server `npm test` to'liq to'plamini ham bir marta ishga tushir (`cd server && npm test`).

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/arxiv-korish-sabab
git add client/src/qollanma docs/superpowers/plans/2026-10-18-arxiv-korish-va-sabab.md
git commit -m "docs(guide): archive view and reason

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (reja yozuvchi tomonidan)

- **Spec qoplami:** Sabab ustuni → Task 3+5; bosiladigan qator/URL → Task 5; yon oyna (blok, Ma'lumot, Tarix, skeleton/xato) → Task 4; server include → Task 1; ochiq savol (tarix) → Task 2 (o'quvchi tarixi allaqachon ochiq, faqat guruh tuzatildi); testlar → Task 1,2,3; qo'llanma → Task 6; ruxsat o'zgarmaydi → hech qanday controller o'zgarishi yo'q. ADR kerak emas (spec bilan mos).
- **Placeholder:** yo'q; `Badge` variant tipi eslatmasi aniq amal bilan.
- **Tur nomlari:** `DetailType`, `isDetailType`, `archiveReason`, `personName`, `capRows`, `ArchiveDetailSheetProps` hamma tasklarda bir xil; `_count.enrollments` Task 1 da yaratilib Task 4 da o'qiladi; `ARCHIVE_DETAIL_ROWS=50` testda `take: 50`.
- **Ma'lum cheklov:** yon oyna ro'yxati 10 tadan keyin «yana N ta» deb sanaydi (spec bilan mos, sahifalamaydi).
