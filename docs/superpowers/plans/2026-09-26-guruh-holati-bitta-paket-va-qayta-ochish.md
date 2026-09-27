# Group status change in one transaction, and reopening a closed group — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A group's status change commits everything it touches in one Serializable transaction or nothing; a COMPLETED or CANCELLED group can go back to ACTIVE with the students it had when it closed.

**Architecture:** `GroupsStatusService.changeStatus` opens one Serializable transaction (maxWait 15 s, timeout 60 s) and runs, in order: re-read of the group, transition check + StatusHistory, the group's EntityHistory, the enrollment side (closing: `StatusCascadeService.cascadeGroupStatusChange`; reopening, Part 2: `GroupReopenService.reopen`), then the group row. `entity.status.changed` events are collected in a `deferredEvents` sink and emitted after the commit. Reopening finds the students by the closing's own mark (`statusChangeReason = groupClosingReason(...)` and `statusChangedAt >= group.statusChangedAt`), classifies them in one query (`planGroupReopen`) and charges MONTHLY returns through `MonthlyChargeService.chargeForReturn`. `GET /groups/:id/reopen-preview` counts with the same plan for the dialog.

**Tech Stack:** NestJS 11, Prisma 7.5 with `@prisma/adapter-pg` (Postgres 40001 → `P2034`), Jest in `server/`; Next.js 16.3.6 + TanStack Query + vitest in `client/`.

**Spec:** `docs/superpowers/specs/2026-09-26-guruh-holati-bitta-paket-va-qayta-ochish-design.md`

**Base:** branch `feat/group-status-one-transaction` from `origin/main` `dfb9562e` (PRs #561, #566, #568, #558, #569 merged). **PR 1 = Tasks 1–5** on this branch. **PR 2 = Tasks 6–13** on `feat/group-reopen`, branched from PR 1's branch after Task 5 and opened against `main` with "merge PR 1 first".

## Global Constraints

- Error text when the transaction did not commit (verbatim): `Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib ko'ring.` — `409` for Prisma `P2034`/`P2028`, `500` for anything else that is not an `HttpException`; an `HttpException` passes through unchanged.
- Transaction options (verbatim, the group-deletion budget): `isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 60_000`.
- Enrollment reason written by a group's own closing stays exactly `Cascade: Group #<groupId> → <CANCELLED|COMPLETED>`; only `groupClosingReason()` builds it.
- Reopening reason (verbatim): `Guruh qayta ochildi`. Graduation-revert reason (verbatim): `Avtomatik: guruh qayta ochildi`. Auto-graduation reason stays `Avtomatik: guruh tugallanganligi sababli`.
- Branch, course and student cascades keep their per-enrollment transactions and logged failures. `cascade()` no longer accepts `'Group'`.
- UI text is Uzbek, Latin script only. New code comments, commit messages and PR text are English. ADRs are Uzbek.
- The GitHub repo is PUBLIC: no production ids, names or phone numbers in code, comments, docs, commits or PR text. Counts only.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- File size (server/CLAUDE.md): no NEW file over 500 lines; `status-cascade.service.ts` (909 lines at base) must not grow; `change-status-dialog.tsx` (531) grows by at most ~10 lines.
- Lint gates: `cd server && npx eslint src` and `cd client && npx eslint src` must stay at 0 errors. Run `npx prettier --write` on touched files.
- No migration. No deploy (deploys are manual; server first, then client).
- Final test evidence runs with `npx jest --runInBand` (parallel workers SIGSEGV on this machine).

---

## Part 1 — one transaction (PR 1)

### Task 1: StatusHistoryService writes on the caller's transaction

**Files:**
- Modify: `server/src/common/status/status-history.service.ts`
- Test: `server/src/common/status/status-history.service.spec.ts`

**Interfaces:**
- Produces: `StatusHistoryService.changeStatus(params)` where `params` gains `tx?: Prisma.TransactionClient`. Return value unchanged.

- [ ] **Step 1: Write the failing test** — add inside `describe('changeStatus', …)` after `'handles undefined optional fields'`:

```ts
    it("writes the record on the caller's transaction when given one", async () => {
      const tx = {
        statusHistory: { create: jest.fn().mockResolvedValue({ id: 'tx-row' }) },
      };

      await service.changeStatus({ ...validParams, tx: tx as any });

      expect(tx.statusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'Student',
          fromStatus: 'ACTIVE',
          toStatus: 'FROZEN',
        }),
      });
      expect(prisma.statusHistory.create).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd server && npx jest src/common/status/status-history.service.spec.ts`
Expected: FAIL — `tx.statusHistory.create` was not called (the service wrote on `prisma`).

- [ ] **Step 3: Implement** — in `status-history.service.ts`:

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidTransition, getAllowedTransitions } from './status-transitions';

interface ChangeStatusParams {
  entityType: string;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
  changedById?: number;
  companyId?: number;
  /**
   * The caller's transaction, when the status change is one step of it: the
   * record then commits or rolls back with the change it describes.
   */
  tx?: Prisma.TransactionClient;
}
```

and in `changeStatus` destructure `tx` and write through it:

```ts
    const {
      entityType,
      entityId,
      fromStatus,
      toStatus,
      reason,
      changedById,
      companyId,
      tx,
    } = params;
    // … validation unchanged …
    await (tx ?? this.prisma).statusHistory.create({
      data: {
        entityType,
        entityId: String(entityId),
        fromStatus,
        toStatus,
        reason,
        changedById,
        companyId,
      },
    });
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd server && npx jest src/common/status/status-history.service.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/common/status/status-history.service.ts server/src/common/status/status-history.service.spec.ts
git commit -m "StatusHistory: write on the caller's transaction when given one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: EntityHistoryService can hold a status event back until the commit

**Files:**
- Modify: `server/src/common/entity-history/entity-history.service.ts`
- Modify: `server/src/common/entity-history/index.ts`
- Test: `server/src/common/entity-history/entity-history.service.spec.ts`

**Interfaces:**
- Produces:
  - `export interface EntityStatusChangedEvent { entityType: string; entityId: string; oldStatus?: string; newStatus?: string; reason?: string; changedById?: number; companyId?: number }` (re-exported as a type from `common/entity-history`).
  - `recordStatusChange(params)` gains `deferredEvents?: EntityStatusChangedEvent[]`: when given, the event is pushed there instead of emitted.
  - `emitStatusChanged(events: EntityStatusChangedEvent[]): void` — emits `'entity.status.changed'` once per event.

- [ ] **Step 1: Write the failing test** — add inside `describe('tx-awareness', …)` after `'recordStatusChange always emits entity.status.changed (outside tx)'`, and add `import type { EntityStatusChangedEvent } from './entity-history.service';` to the imports:

```ts
    it('holds the event back when the caller defers it, and emits it on request', async () => {
      const deferredEvents: EntityStatusChangedEvent[] = [];

      await service.recordStatusChange({
        entityType: 'Group',
        entityId: 'group-1',
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'COMPLETED', reason: 'tugadi' },
        changedById: 1,
        companyId: 1,
        deferredEvents,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(deferredEvents).toEqual([
        {
          entityType: 'Group',
          entityId: 'group-1',
          oldStatus: 'ACTIVE',
          newStatus: 'COMPLETED',
          reason: 'tugadi',
          changedById: 1,
          companyId: 1,
        },
      ]);

      service.emitStatusChanged(deferredEvents);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'entity.status.changed',
        deferredEvents[0],
      );
    });
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd server && npx jest src/common/entity-history/entity-history.service.spec.ts`
Expected: FAIL — `emit` was called (no deferral) / `emitStatusChanged is not a function`.

- [ ] **Step 3: Implement** — in `entity-history.service.ts`, above the class:

```ts
/** What 'entity.status.changed' carries to its listeners. */
export interface EntityStatusChangedEvent {
  entityType: string;
  entityId: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  changedById?: number;
  companyId?: number;
}
```

replace `recordStatusChange` with:

```ts
  async recordStatusChange(
    params: BaseHistoryParams & {
      oldValues: Record<string, any>;
      newValues: Record<string, any>;
      /**
       * Collects the event instead of emitting it. A caller inside a
       * transaction passes this and calls `emitStatusChanged` after the
       * commit, so a rolled-back change never posts a system comment or a
       * Telegram digest line.
       */
      deferredEvents?: EntityStatusChangedEvent[];
    },
  ) {
    await this.client(params.tx).entityHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        action: EntityAction.STATUS_CHANGE,
        oldValues: params.oldValues,
        newValues: params.newValues,
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });

    const event: EntityStatusChangedEvent = {
      entityType: params.entityType,
      entityId: String(params.entityId),
      oldStatus: params.oldValues?.status,
      newStatus: params.newValues?.status,
      reason: params.newValues?.reason,
      changedById: params.changedById,
      companyId: params.companyId,
    };
    // Without `deferredEvents` the event goes out at once, even from inside
    // a transaction, and its listeners must tolerate the rare rollback.
    if (params.deferredEvents) params.deferredEvents.push(event);
    else this.emitStatusChanged([event]);
  }

  /** Emits status-change events a caller held back until its commit. */
  emitStatusChanged(events: EntityStatusChangedEvent[]): void {
    for (const event of events) {
      this.eventEmitter.emit('entity.status.changed', event);
    }
  }
```

and in `server/src/common/entity-history/index.ts` add:

```ts
export type { EntityStatusChangedEvent } from './entity-history.service';
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd server && npx jest src/common/entity-history`
Expected: PASS (the old "always emits" test still passes: it passes no `deferredEvents`).

- [ ] **Step 5: Commit**

```bash
git add server/src/common/entity-history/
git commit -m "EntityHistory: let a transaction hold its status events until commit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A group's own closing runs on the caller's transaction

**Files:**
- Create: `server/src/common/status/group-graduation.ts`
- Modify: `server/src/common/status/status-cascade.service.ts`
- Test: `server/src/common/status/status-cascade.service.spec.ts`

**Interfaces:**
- Consumes: `EntityStatusChangedEvent`, `recordStatusChange({ …, tx, deferredEvents })` (Task 2).
- Produces:
  - `group-graduation.ts`: `export const AUTO_GRADUATION_REASON = 'Avtomatik: guruh tugallanganligi sababli';` and `export async function graduateStudentsOfCompletedGroup(tx: Prisma.TransactionClient, history: EntityHistoryService, params: { groupId: string; userId: number | undefined; at: Date; deferredEvents: EntityStatusChangedEvent[] }): Promise<number[]>` (returns graduated student ids).
  - `status-cascade.service.ts`: `export function groupClosingReason(groupId: string, status: GroupStatus): string` → `` `Cascade: Group #${groupId} → ${status}` ``; `export type CascadeEntityType = 'Branch' | 'Course' | 'Student';`; `StatusCascadeService.cascadeGroupStatusChange(tx: Prisma.TransactionClient, params: { groupId: string; status: GroupStatus; userId: number; at: Date; deferredEvents: EntityStatusChangedEvent[] }): Promise<CascadeResult[]>`; `cascade(entityType: CascadeEntityType, …)`.

- [ ] **Step 1: Write the failing tests** — in `status-cascade.service.spec.ts`:

1. Add imports: `import { GroupStatus } from '@prisma/client';`, `import type { EntityStatusChangedEvent } from '../entity-history';`, and change the service import to `import { StatusCascadeService, type CascadeEntityType } from './status-cascade.service';`.
2. Add this block right after the `describe('cascadeGroupDeletion', …)` block:

```ts
  // ─── A group's own status change ───────────────────
  describe('cascadeGroupStatusChange', () => {
    // 10:00 UTC is 15:00 in Tashkent — the same calendar day, 2026-09-25.
    const AT = new Date('2026-09-25T10:00:00.000Z');
    const CANCEL_REASON = 'Cascade: Group #group-1 → CANCELLED';
    const COMPLETE_REASON = 'Cascade: Group #group-1 → COMPLETED';

    /** The fake tx plus the student and StatusHistory tables graduation touches. */
    const groupTx = (
      rows: ReturnType<typeof row>[],
      students: { id: number; status: string; companyId: number }[] = [],
    ) => {
      const store = makeTx(rows);
      const tx = {
        ...store.tx,
        student: {
          findFirst: jest.fn(
            ({ where }: { where: { id: number; status: string } }) =>
              Promise.resolve(
                students.find(
                  (s) => s.id === where.id && s.status === where.status,
                ) ?? null,
              ),
          ),
          update: jest.fn().mockResolvedValue({}),
        },
        statusHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      return { ...store, tx };
    };

    const params = (
      status: GroupStatus,
      deferredEvents: EntityStatusChangedEvent[] = [],
    ) => ({ groupId: 'group-1', status, userId: 7, at: AT, deferredEvents });

    it("CANCELLED drops the group's ACTIVE and FROZEN enrollments on the caller's transaction, and no one else's", async () => {
      const { tx, byId, stateLog } = groupTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
        row('enr-dropped', 103, 'DROPPED'),
        row('enr-archived', 106, 'FROZEN', { deletedAt: EARLIER }),
        otherGroupRow('enr-other-active', 107, 'ACTIVE'),
      ]);

      await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.CANCELLED),
      );

      for (const id of ['enr-active', 'enr-frozen']) {
        expect(byId(id)).toMatchObject({
          status: 'DROPPED',
          statusChangedAt: AT,
          statusChangedById: 7,
          statusChangeReason: CANCEL_REASON,
        });
      }
      expect(byId('enr-dropped')).toMatchObject({
        status: 'DROPPED',
        statusChangedAt: EARLIER,
      });
      expect(byId('enr-archived').status).toBe('FROZEN');
      expect(byId('enr-other-active').status).toBe('ACTIVE');
      expect(stateLog).toHaveLength(2);
      expect(stateLog).toEqual(
        expect.arrayContaining(
          ['enr-active', 'enr-frozen'].map((enrollmentId) => ({
            enrollmentId,
            status: 'DROPPED',
            transitionAt: AT,
            reason: CANCEL_REASON,
            changedById: 7,
          })),
        ),
      );
      // Nothing reached the service's own client.
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(prisma.enrollmentStateLog.createMany).not.toHaveBeenCalled();
    });

    it('COMPLETED completes the ACTIVE enrollments and drops the FROZEN ones (ADR-0036)', async () => {
      const { tx, byId, stateLog } = groupTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
      ]);

      await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.COMPLETED),
      );

      expect(byId('enr-active')).toMatchObject({
        status: 'COMPLETED',
        statusChangedAt: AT,
        statusChangeReason: COMPLETE_REASON,
      });
      expect(byId('enr-frozen')).toMatchObject({
        status: 'DROPPED',
        statusChangedAt: AT,
        statusChangeReason: COMPLETE_REASON,
      });
      expect(
        stateLog.map((l) => [l.enrollmentId, l.status]).sort(),
      ).toEqual([
        ['enr-active', 'COMPLETED'],
        ['enr-frozen', 'DROPPED'],
      ]);
    });

    it("gives each closed enrollment's unused money back on the caller's transaction", async () => {
      const { tx } = groupTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
      ]);

      await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.CANCELLED),
      );

      // No transaction of its own: a refund that commits while the status
      // change rolls back is the half-done state this path exists to prevent.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const refunds = enrollmentBillingService.refundPrepaidToBalance.mock
        .calls as [unknown, { enrollmentId: string }][];
      expect(refunds.map(([client]) => client === tx)).toEqual([true, true]);
      const departures = monthlyChargeService.reverseChargeForDeparture.mock
        .calls as [unknown, { departureDate: Date; today: string }][];
      expect(
        departures.map(([client, p]) => [client === tx, p.departureDate, p.today]),
      ).toEqual([
        [true, AT, '2026-09-25'],
        [true, AT, '2026-09-25'],
      ]);
    });

    it('lets a failed refund abort the status change instead of logging and moving on', async () => {
      const { tx } = groupTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
      ]);
      enrollmentBillingService.refundPrepaidToBalance
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('lock timeout'));

      await expect(
        service.cascadeGroupStatusChange(tx as any, params(GroupStatus.COMPLETED)),
      ).rejects.toThrow('lock timeout');
    });

    it('writes each removal to the student and the group, on the transaction', async () => {
      const { tx } = groupTx([row('enr-active', 101, 'ACTIVE')]);

      await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.CANCELLED),
      );

      expect(entityHistoryService.recordDelete.mock.calls.map(([p]: any) => p)).toEqual([
        {
          entityType: 'Student',
          entityId: 101,
          oldValues: {
            guruh: '#014',
            guruhId: 'group-1',
            action: 'GURUHDAN_CHIQARILDI',
            sabab: "Guruh to'xtatildi",
          },
          changedById: 7,
          companyId: 1001,
          tx,
        },
        {
          entityType: 'Group',
          entityId: 'group-1',
          oldValues: {
            action: 'OQUVCHI_CHIQARILDI',
            oquvchi: 'Ism101 Familiya101',
            oquvchiId: 101,
            sabab: "Guruh to'xtatildi",
          },
          changedById: 7,
          companyId: 1001,
          tx,
        },
      ]);
    });

    it('writes each completion to the student alone, keyed statusEnum, on the transaction', async () => {
      const deferredEvents: EntityStatusChangedEvent[] = [];
      const { tx } = groupTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
      ]);

      await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.COMPLETED, deferredEvents),
      );

      // No `status` key: the 'entity.status.changed' listeners read it as the
      // student's own status and would post a system comment and a Telegram
      // digest line for a change the student never had.
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith({
        entityType: 'Student',
        entityId: 101,
        oldValues: { statusEnum: 'ACTIVE' },
        newValues: {
          statusEnum: 'COMPLETED',
          guruhId: 'group-1',
          action: 'GURUH_TUGALLANDI',
          sabab: '«#014» guruhi tugallandi',
        },
        changedById: 7,
        companyId: 1001,
        tx,
        deferredEvents,
      });
      expect(
        entityHistoryService.recordDelete.mock.calls.map(([p]: any) => [
          p.entityType,
          p.entityId,
          p.oldValues.sabab,
          p.tx === tx,
        ]),
      ).toEqual([
        ['Student', 102, "Guruh tugallandi, o'quvchi muzlatilgan edi", true],
        ['Group', 'group-1', "Guruh tugallandi, o'quvchi muzlatilgan edi", true],
      ]);
    });

    it('graduates, on the transaction, the students the completion leaves without an ACTIVE enrollment', async () => {
      const deferredEvents: EntityStatusChangedEvent[] = [];
      const { tx } = groupTx(
        [
          row('enr-a', 101, 'ACTIVE'),
          row('enr-b', 102, 'ACTIVE'),
          // 102 still studies in group-2.
          otherGroupRow('enr-b-other', 102, 'ACTIVE'),
        ],
        [
          { id: 101, status: 'ACTIVE', companyId: 1001 },
          { id: 102, status: 'ACTIVE', companyId: 1001 },
        ],
      );

      const results = await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.COMPLETED, deferredEvents),
      );

      const why = 'Avtomatik: guruh tugallanganligi sababli';
      expect(tx.student.update).toHaveBeenCalledTimes(1);
      expect(tx.student.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: 'GRADUATED',
          isActive: false,
          statusChangedAt: AT,
          statusChangedById: 7,
          statusChangeReason: why,
        },
      });
      expect(tx.statusHistory.create).toHaveBeenCalledWith({
        data: {
          entityType: 'Student',
          entityId: '101',
          fromStatus: 'ACTIVE',
          toStatus: 'GRADUATED',
          reason: why,
          changedById: 7,
          companyId: 1001,
        },
      });
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith({
        entityType: 'Student',
        entityId: 101,
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'GRADUATED', reason: why },
        changedById: 7,
        companyId: 1001,
        tx,
        deferredEvents,
      });
      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(prisma.statusHistory.create).not.toHaveBeenCalled();
      expect(results).toContainEqual({
        entity: 'Student',
        count: 1,
        toStatus: 'GRADUATED',
      });
    });

    it('never graduates a student whose enrollment was frozen', async () => {
      // An ACTIVE student with a FROZEN enrollment: they came back while the
      // group was paused. The enrollment is DROPPED, not COMPLETED.
      const { tx } = groupTx(
        [row('enr-frozen', 102, 'FROZEN')],
        [{ id: 102, status: 'ACTIVE', companyId: 1001 }],
      );

      await service.cascadeGroupStatusChange(
        tx as any,
        params(GroupStatus.COMPLETED),
      );

      expect(tx.student.update).not.toHaveBeenCalled();
    });

    it.each([GroupStatus.ACTIVE, GroupStatus.PAUSED, GroupStatus.FORMING])(
      'closes nothing for %s',
      async (status) => {
        const { tx, byId } = groupTx([row('enr-active', 101, 'ACTIVE')]);

        await expect(
          service.cascadeGroupStatusChange(tx as any, params(status)),
        ).resolves.toEqual([]);
        expect(tx.enrollment.findMany).not.toHaveBeenCalled();
        expect(byId('enr-active').status).toBe('ACTIVE');
      },
    );
  });
```

3. Delete the tests that drove the old untransacted `cascade('Group', …)` path (they are replaced above): the whole `describe('Group cascades', …)` block; in `describe('closing a group, branch or course', …)` the three tests `"Group CANCELLED drops the group's ACTIVE and FROZEN enrollments, and no one else's"`, `'Group COMPLETED completes its ACTIVE enrollments and drops its FROZEN ones'`, `'Group COMPLETED never graduates a student whose enrollment was frozen'` and `'Group COMPLETED writes each completion to the student alone, and each frozen removal to the student and the group'`; in `describe('prepaid refund on enrollment close', …)` the tests `'Group CANCELLED: refunds unused prepaid'`, `'Group COMPLETED: refunds unused prepaid'` and `'Group CANCELLED: also reverses the MONTHLY-model departure charge'`.
4. In the remaining `it.each` tables of `describe('closing a group, branch or course', …)`, delete the `['Group', …]` rows and type the tables so `cascade()`'s narrowed parameter type-checks:

```ts
    it.each<[CascadeEntityType, string, string]>([
      ['Branch', '1', 'CLOSED'],
      ['Branch', '1', 'ARCHIVED'],
      ['Course', 'course-1', 'ARCHIVED'],
    ])(
```

```ts
    it.each<[CascadeEntityType, string, string, string]>([
      ['Branch', '1', 'CLOSED', 'Filial yopildi'],
      ['Branch', '1', 'ARCHIVED', 'Filial arxivlandi'],
      ['Course', 'course-1', 'ARCHIVED', 'Kurs arxivlandi'],
    ])(
```

```ts
    it.each<[CascadeEntityType, string, string]>([
      ['Branch', '1', 'CLOSED'],
      ['Course', 'course-1', 'ARCHIVED'],
    ])(
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/common/status/status-cascade.service.spec.ts`
Expected: FAIL — `service.cascadeGroupStatusChange is not a function` (the typed `it.each` tables still pass at runtime).

- [ ] **Step 3: Create `server/src/common/status/group-graduation.ts`**

```ts
import { EnrollmentStatus, Prisma, StudentStatus } from '@prisma/client';
import type {
  EntityHistoryService,
  EntityStatusChangedEvent,
} from '../entity-history';

/** Why a student became GRADUATED when their last group completed. */
export const AUTO_GRADUATION_REASON =
  'Avtomatik: guruh tugallanganligi sababli';

/**
 * Graduates every ACTIVE student the completion of `groupId` left without an
 * ACTIVE enrollment: StatusHistory, the student's own history and the student
 * row, all on the caller's transaction. The history's 'entity.status.changed'
 * event goes to `deferredEvents`, so a rollback never announces a graduation
 * that did not happen. Call it AFTER the group's ACTIVE enrollments became
 * COMPLETED. Returns the graduated student ids.
 */
export async function graduateStudentsOfCompletedGroup(
  tx: Prisma.TransactionClient,
  history: EntityHistoryService,
  params: {
    groupId: string;
    userId: number | undefined;
    at: Date;
    deferredEvents: EntityStatusChangedEvent[];
  },
): Promise<number[]> {
  const completed = await tx.enrollment.findMany({
    where: {
      groupId: params.groupId,
      deletedAt: null,
      status: EnrollmentStatus.COMPLETED,
    },
    select: { studentId: true },
  });

  const graduated: number[] = [];
  for (const studentId of [...new Set(completed.map((e) => e.studentId))]) {
    const stillStudying = await tx.enrollment.count({
      where: { studentId, deletedAt: null, status: EnrollmentStatus.ACTIVE },
    });
    if (stillStudying > 0) continue;

    const student = await tx.student.findFirst({
      where: { id: studentId, deletedAt: null, status: StudentStatus.ACTIVE },
      select: { companyId: true },
    });
    if (!student) continue;

    await tx.statusHistory.create({
      data: {
        entityType: 'Student',
        entityId: String(studentId),
        fromStatus: 'ACTIVE',
        toStatus: 'GRADUATED',
        reason: AUTO_GRADUATION_REASON,
        changedById: params.userId,
        companyId: student.companyId,
      },
    });
    await history.recordStatusChange({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { status: 'ACTIVE' },
      newValues: { status: 'GRADUATED', reason: AUTO_GRADUATION_REASON },
      changedById: params.userId,
      companyId: student.companyId,
      tx,
      deferredEvents: params.deferredEvents,
    });
    await tx.student.update({
      where: { id: studentId },
      data: {
        status: StudentStatus.GRADUATED,
        isActive: false,
        statusChangedAt: params.at,
        statusChangedById: params.userId,
        statusChangeReason: AUTO_GRADUATION_REASON,
      },
    });
    graduated.push(studentId);
  }
  return graduated;
}
```

- [ ] **Step 4: Edit `status-cascade.service.ts`**

1. Imports: change `import { EntityHistoryService } from '../entity-history';` to `import { EntityHistoryService, type EntityStatusChangedEvent } from '../entity-history';` and add `import { graduateStudentsOfCompletedGroup } from './group-graduation';`.
2. After `liveEnrollmentsOfGroup`, add:

```ts
/**
 * The reason every enrolment a group's own CANCELLED/COMPLETED closed
 * carries, in its `statusChangeReason` and its state-log row. Written only
 * here: the one-off repair of closed groups writes the same words, and the
 * closing's enrolments are found again by them.
 */
export function groupClosingReason(
  groupId: string,
  status: GroupStatus,
): string {
  return `Cascade: Group #${groupId} → ${status}`;
}

/**
 * What `cascade()` handles. A group's own status change is not among them:
 * it closes its enrolments on the caller's transaction
 * (`cascadeGroupStatusChange`, ADR-0039).
 */
export type CascadeEntityType = 'Branch' | 'Course' | 'Student';
```

3. Add the method after `cascadeGroupDeletion`:

```ts
  /**
   * Closes a group's enrolments when the group itself goes CANCELLED or
   * COMPLETED, on the CALLER's transaction, so the status change and its
   * students' closing commit together or not at all (ADR-0039).
   *
   * CANCELLED drops every ACTIVE and FROZEN enrolment. COMPLETED completes
   * the ACTIVE ones, drops the FROZEN ones (ADR-0036) and graduates the
   * students it leaves without an ACTIVE enrolment. Any other status closes
   * nothing. Money steps run on `tx`, so one failed refund rolls the whole
   * change back. Status-change events land in `deferredEvents`, for the
   * caller to emit after the commit.
   */
  async cascadeGroupStatusChange(
    tx: Prisma.TransactionClient,
    params: {
      groupId: string;
      status: GroupStatus;
      userId: number;
      at: Date;
      deferredEvents: EntityStatusChangedEvent[];
    },
  ): Promise<CascadeResult[]> {
    const { groupId, status, userId, at, deferredEvents } = params;
    if (status !== GroupStatus.CANCELLED && status !== GroupStatus.COMPLETED) {
      return [];
    }
    const reason = groupClosingReason(groupId, status);
    const auditFields = {
      statusChangedAt: at,
      statusChangedById: userId,
      statusChangeReason: reason,
    };
    const ofGroup = (
      enrollmentStatus: Prisma.EnrollmentWhereInput['status'],
    ): Prisma.EnrollmentWhereInput => ({
      groupId,
      deletedAt: null,
      status: enrollmentStatus,
    });
    const results: CascadeResult[] = [];

    if (status === GroupStatus.CANCELLED) {
      const open = ofGroup(OPEN_ENROLLMENT);
      await this.recordRemovals(open, GROUP_CANCELLED_REASON, userId, tx);
      const dropped = await this.cascadeEnrollmentStatus(
        open,
        EnrollmentStatus.DROPPED,
        reason,
        userId,
        auditFields,
        tx,
      );
      results.push({ entity: 'Enrollment', count: dropped.count, toStatus: 'DROPPED' });
      return results.filter((r) => r.count > 0);
    }

    const active = ofGroup(EnrollmentStatus.ACTIVE);
    await this.recordCompletions(active, userId, tx, deferredEvents);
    const completed = await this.cascadeEnrollmentStatus(
      active,
      EnrollmentStatus.COMPLETED,
      reason,
      userId,
      auditFields,
      tx,
    );
    results.push({ entity: 'Enrollment', count: completed.count, toStatus: 'COMPLETED' });

    // FROZEN → DROPPED, not COMPLETED: the student was frozen when the group
    // ended, so they did not finish it (ADR-0036). Graduation reads
    // COMPLETED rows only and never picks them.
    const frozen = ofGroup(EnrollmentStatus.FROZEN);
    await this.recordRemovals(frozen, GROUP_COMPLETED_WHILE_FROZEN_REASON, userId, tx);
    const dropped = await this.cascadeEnrollmentStatus(
      frozen,
      EnrollmentStatus.DROPPED,
      reason,
      userId,
      auditFields,
      tx,
    );
    results.push({ entity: 'Enrollment', count: dropped.count, toStatus: 'DROPPED' });

    const graduated = await graduateStudentsOfCompletedGroup(
      tx,
      this.entityHistoryService,
      { groupId, userId, at, deferredEvents },
    );
    results.push({ entity: 'Student', count: graduated.length, toStatus: 'GRADUATED' });

    return results.filter((r) => r.count > 0);
  }
```

4. Replace `recordCompletions` with the transactional version:

```ts
  /**
   * Writes each enrolment matching `filter` into its student's history as
   * completing the group, on `tx`. The group's own history already says it
   * ended, so nothing is written there. Call it BEFORE the flip to COMPLETED.
   */
  private async recordCompletions(
    filter: Prisma.EnrollmentWhereInput,
    userId: number | undefined,
    tx: Prisma.TransactionClient,
    deferredEvents: EntityStatusChangedEvent[],
  ): Promise<void> {
    const completing = await tx.enrollment.findMany({
      where: filter,
      select: {
        studentId: true,
        groupId: true,
        group: { select: { name: true, companyId: true } },
      },
    });
    for (const e of completing) {
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Student',
        entityId: e.studentId,
        // `statusEnum`, not `status`: listeners of 'entity.status.changed'
        // read `status` as the student's own status and would post a system
        // comment and a Telegram digest line for a change the student never
        // had. The history tab labels both keys "Holat".
        oldValues: { statusEnum: EnrollmentStatus.ACTIVE },
        newValues: {
          statusEnum: EnrollmentStatus.COMPLETED,
          guruhId: e.groupId,
          action: 'GURUH_TUGALLANDI',
          sabab: `«${e.group.name}» guruhi tugallandi`,
        },
        changedById: userId,
        companyId: e.group.companyId,
        tx,
        deferredEvents,
      });
    }
  }
```

5. In `cascade()`, change the first parameter to `entityType: CascadeEntityType,` and delete the whole `if (entityType === 'Group') { … }` block (the `// No status change leads to ARCHIVED …` comment through the end of the auto-graduation loop).

- [ ] **Step 5: Run the cascade spec and see it pass**

Run: `cd server && npx jest src/common/status`
Expected: PASS.

- [ ] **Step 6: Type-check and confirm the file shrank**

Run: `cd server && npm run typecheck && wc -l src/common/status/status-cascade.service.ts src/common/status/group-graduation.ts`
Expected: typecheck clean; `status-cascade.service.ts` below 909 lines (it lost the graduation loop).

- [ ] **Step 7: Commit**

```bash
git add server/src/common/status/
git commit -m "Status cascade: close a group's enrollments on the caller's transaction" -m "cascadeGroupStatusChange runs CANCELLED/COMPLETED closing, refunds and auto-graduation on the transaction it is given and defers the status events. cascade() no longer handles Group, so no path closes a group's enrollments outside that transaction. Auto-graduation moves to group-graduation.ts." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: GroupsStatusService runs the whole change in one transaction

**Files:**
- Modify: `server/src/groups/groups-status.service.ts`
- Test: `server/src/groups/groups.service.spec.ts`

**Interfaces:**
- Consumes: `StatusHistoryService.changeStatus({ …, tx })` (Task 1); `recordStatusChange({ …, tx, deferredEvents })`, `emitStatusChanged(events)` (Task 2); `cascadeGroupStatusChange(tx, { groupId, status, userId, at, deferredEvents })` (Task 3).
- Produces: `GroupsStatusService.changeStatus(id, dto, userId, companyId)` — same signature and return shape (`formatGroup(row)`).

- [ ] **Step 1: Write the failing tests** — in `groups.service.spec.ts`:

1. Imports: add `ConflictException, InternalServerErrorException, Logger` to the `@nestjs/common` import and `import { Prisma } from '@prisma/client';`.
2. In the top-level `beforeEach`, add `cascadeGroupStatusChange: jest.fn().mockResolvedValue([]),` to `statusCascadeService` and `emitStatusChanged: jest.fn(),` to the `EntityHistoryService` mock object.
3. Replace the whole `describe('changeStatus', …)` block with:

```ts
  describe('changeStatus', () => {
    const NOT_CHANGED =
      "Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib ko'ring.";
    let tx: any;

    beforeEach(() => {
      // A client distinct from `prisma`: a write that escapes the
      // transaction lands on the wrong object and shows up below.
      tx = {
        group: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...mockGroup, statusEnum: 'ACTIVE' }),
          update: jest.fn().mockResolvedValue({
            ...mockGroup,
            course: { id: 'c1', name: 'Test' },
            room: null,
            branch: { id: 1, name: 'Branch' },
            teachers: [],
            _count: { enrollments: 0 },
          }),
        },
      };
      prisma.$transaction.mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(tx) : Promise.all(arg),
      );
    });

    it('runs the change in one Serializable transaction with the group-deletion budget', async () => {
      await service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
        maxWait: 15_000,
        timeout: 60_000,
      });
    });

    it('writes the history, the enrollment side and the group on the transaction, and nothing outside it', async () => {
      await service.changeStatus(
        'group-1',
        { status: 'CANCELLED' as any, reason: "yig'ilmadi" },
        1,
        1001,
      );

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
          fromStatus: 'ACTIVE',
          toStatus: 'CANCELLED',
          tx,
        }),
      );
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
          oldValues: { status: 'ACTIVE' },
          newValues: { status: 'CANCELLED', reason: "yig'ilmadi" },
          tx,
          deferredEvents: expect.any(Array),
        }),
      );
      expect(statusCascadeService.cascadeGroupStatusChange).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ groupId: 'group-1', status: 'CANCELLED', userId: 1 }),
      );
      expect(tx.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-1' },
          data: expect.objectContaining({ statusEnum: 'CANCELLED', isActive: false }),
        }),
      );
      expect(prisma.group.update).not.toHaveBeenCalled();
      expect(statusCascadeService.cascade).not.toHaveBeenCalled();
    });

    it('checks the transition against the status read inside the transaction', async () => {
      // Outside the transaction the group still looked ACTIVE; inside it,
      // another admin had already cancelled it.
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, statusEnum: 'ACTIVE' });
      tx.group.findFirst.mockResolvedValue({ ...mockGroup, statusEnum: 'CANCELLED' });

      await service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001);

      expect(tx.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-1', deletedAt: null, companyId: 1001 },
        }),
      );
      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ fromStatus: 'CANCELLED', toStatus: 'COMPLETED' }),
      );
    });

    it("updates the group row after its students, so the response counts them as they end up", async () => {
      await service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001);

      const cascadeOrder =
        statusCascadeService.cascadeGroupStatusChange.mock.invocationCallOrder[0];
      const updateOrder = tx.group.update.mock.invocationCallOrder[0];
      expect(cascadeOrder).toBeLessThan(updateOrder);
    });

    it("dates the group's change and its students' at one instant", async () => {
      await service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001);

      const { at } = statusCascadeService.cascadeGroupStatusChange.mock.calls[0][1];
      expect(at).toBeInstanceOf(Date);
      expect(tx.group.update.mock.calls[0][0].data.statusChangedAt).toBe(at);
    });

    it('sets isActive for ACTIVE and clears it for PAUSED', async () => {
      tx.group.findFirst.mockResolvedValue({ ...mockGroup, statusEnum: 'FORMING' });
      await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001);
      expect(tx.group.update.mock.calls[0][0].data).toMatchObject({
        statusEnum: 'ACTIVE',
        isActive: true,
      });

      tx.group.findFirst.mockResolvedValue({ ...mockGroup, statusEnum: 'ACTIVE' });
      await service.changeStatus('group-1', { status: 'PAUSED' as any }, 1, 1001);
      expect(tx.group.update.mock.calls[1][0].data).toMatchObject({
        statusEnum: 'PAUSED',
        isActive: false,
      });
    });

    it('emits the status events only after the transaction commits', async () => {
      const event = { entityType: 'Group', entityId: 'group-1', oldStatus: 'ACTIVE', newStatus: 'COMPLETED' };
      entityHistoryService.recordStatusChange.mockImplementation(
        async ({ deferredEvents }: any) => {
          deferredEvents.push(event);
        },
      );
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const result = await fn(tx);
        expect(entityHistoryService.emitStatusChanged).not.toHaveBeenCalled();
        return result;
      });

      await service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001);

      expect(entityHistoryService.emitStatusChanged).toHaveBeenCalledWith([event]);
    });

    it('emits nothing and says nothing was saved when the enrollment side fails', async () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      statusCascadeService.cascadeGroupStatusChange.mockRejectedValue(new Error('lock timeout'));

      const attempt = service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001);

      await expect(attempt).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(attempt).rejects.toThrow(NOT_CHANGED);
      expect(entityHistoryService.emitStatusChanged).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalled();
      errorLog.mockRestore();
    });

    it.each(['P2034', 'P2028'])(
      'answers %s (write conflict, expired transaction) with 409 and the same sentence',
      async (code) => {
        const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        prisma.$transaction.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('transaction failed', {
            code,
            clientVersion: '7.5.0',
          }),
        );

        const attempt = service.changeStatus('group-1', { status: 'CANCELLED' as any }, 1, 1001);

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow(NOT_CHANGED);
        errorLog.mockRestore();
      },
    );

    it('passes a refused transition through unchanged', async () => {
      statusHistoryService.changeStatus.mockRejectedValue(
        new BadRequestException(`"CANCELLED" dan "COMPLETED" ga o'tish mumkin emas`),
      );

      await expect(
        service.changeStatus('group-1', { status: 'COMPLETED' as any }, 1, 1001),
      ).rejects.toThrow(`"CANCELLED" dan "COMPLETED" ga o'tish mumkin emas`);
    });

    it('throws NotFoundException for a missing group and opens no transaction', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus('missing', { status: 'ACTIVE' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s a group deleted between the check and the transaction', async () => {
      tx.group.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus('group-1', { status: 'CANCELLED' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/groups/groups.service.spec.ts -t changeStatus`
Expected: FAIL — no `$transaction` call; `cascade` called instead of `cascadeGroupStatusChange`.

- [ ] **Step 3: Implement** — replace `server/src/groups/groups-status.service.ts` with:

```ts
import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import {
  EntityHistoryService,
  type EntityStatusChangedEvent,
} from '../common/entity-history';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import {
  groupInclude,
  formatGroup,
  GROUP_STATUS_TO_INT,
} from './shared/group-include';

/**
 * Group CRUD is `@Roles('CEO', 'Branch Director', 'Administrator')` — a Teacher
 * cannot reach it at all, so the "pure teacher → check by assignment" half of
 * `assertCallerMayTouchGroup` is unreachable here. An empty roles list takes
 * the BRANCH path, which is the answer for every caller who can actually get
 * this far; naming the constant says that on purpose rather than leaving a
 * bare `[]` for the next reader to wonder about.
 */
const NO_TEACHER_PATH: string[] = [];

/** What the admin reads when a status change rolled back as a whole. */
const STATUS_NOT_CHANGED =
  "Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib ko'ring.";

/**
 * A transaction that failed on its own terms and may pass on a second try:
 * a write conflict or deadlock (P2034, Postgres 40001 under Serializable)
 * and an expired or closed transaction (P2028).
 */
const RETRYABLE_TRANSACTION_CODES = new Set(['P2034', 'P2028']);

@Injectable()
export class GroupsStatusService {
  private readonly logger = new Logger(GroupsStatusService.name);

  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * A group's status change commits everything it touches or nothing
   * (ADR-0039): the transition check and StatusHistory, the group's history,
   * closing its enrolments with their refunds and auto-graduation, and the
   * group row, in one Serializable transaction with the budget of a group
   * deletion. The 'entity.status.changed' events (system comment, Telegram
   * digest line) go out only after the commit.
   */
  async changeStatus(
    id: string,
    dto: ChangeGroupStatusDto,
    userId: number,
    companyId: number,
  ) {
    const found = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
      select: { id: true },
    });
    // A group status change CASCADES: CANCELLED/COMPLETED flips every open
    // enrolment. Done to another branch's group that is their students and
    // their teacher's accruals.
    await assertCallerMayTouchGroup(this.prisma, userId, NO_TEACHER_PATH, id);
    if (!found) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    // One instant for the group's change and its students', so the enrolment
    // state log closes exactly at the group's `statusChangedAt`.
    const at = new Date();
    const deferredEvents: EntityStatusChangedEvent[] = [];

    const updated = await this.prisma
      .$transaction(
        async (tx) => {
          // Read again inside the transaction: the transition is checked
          // against the status this transaction overwrites, so two admins
          // changing one group at once cannot both pass the check.
          const group = await tx.group.findFirst({
            where: { id, deletedAt: null, companyId },
          });
          if (!group) {
            throw new NotFoundException(`Guruh #${id} topilmadi`);
          }

          const auditData = await this.statusHistoryService.changeStatus({
            entityType: 'Group',
            entityId: id,
            fromStatus: group.statusEnum,
            toStatus: dto.status,
            reason: dto.reason,
            changedById: userId,
            companyId: group.companyId,
            tx,
          });

          await this.entityHistoryService.recordStatusChange({
            entityType: 'Group',
            entityId: id,
            oldValues: { status: group.statusEnum },
            newValues: { status: dto.status, reason: dto.reason },
            changedById: userId,
            companyId: group.companyId,
            tx,
            deferredEvents,
          });

          await this.statusCascadeService.cascadeGroupStatusChange(tx, {
            groupId: id,
            status: dto.status,
            userId,
            at,
            deferredEvents,
          });

          // The group row last: its student count in the response then
          // counts the enrolments as they end up.
          return tx.group.update({
            where: { id },
            data: {
              statusEnum: dto.status,
              status: GROUP_STATUS_TO_INT[dto.status] ?? group.status,
              isActive:
                dto.status === GroupStatus.ACTIVE ||
                dto.status === GroupStatus.FORMING,
              ...auditData,
              statusChangedAt: at,
            },
            include: groupInclude,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 15_000,
          timeout: 60_000,
        },
      )
      .catch((err: unknown) => {
        throw this.failure(err, id);
      });

    this.entityHistoryService.emitStatusChanged(deferredEvents);
    return formatGroup(updated);
  }

  /**
   * What the admin is told when the change did not commit. An HttpException
   * (a refused transition, a missing group) is already written for them. Any
   * other failure rolled the whole change back: a write conflict or an
   * expired transaction is worth retrying (409), anything else is a fault
   * (500) and is logged. Both say that nothing was saved.
   */
  private failure(err: unknown, groupId: string): HttpException {
    if (err instanceof HttpException) return err;
    this.logger.error(
      `Group ${groupId}: status change rolled back`,
      err instanceof Error ? err.stack : String(err),
    );
    const retryable =
      err instanceof Prisma.PrismaClientKnownRequestError &&
      RETRYABLE_TRANSACTION_CODES.has(err.code);
    return retryable
      ? new ConflictException(STATUS_NOT_CHANGED)
      : new InternalServerErrorException(STATUS_NOT_CHANGED);
  }
}
```

- [ ] **Step 4: Run the group specs and see them pass**

Run: `cd server && npx jest src/groups`
Expected: PASS, including `'multi-tenant filter (companyId)'` (the outer read still filters on `companyId`).

- [ ] **Step 5: Type-check and lint**

Run: `cd server && npm run typecheck && npx eslint src/groups src/common/status src/common/entity-history`
Expected: typecheck clean; eslint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/groups/groups-status.service.ts server/src/groups/groups.service.spec.ts
git commit -m "Groups: change a group's status in one transaction" -m "Re-read, transition check, StatusHistory, EntityHistory, enrollment closing with refunds and auto-graduation, and the group row now share one Serializable transaction (maxWait 15s, timeout 60s). Status events go out after the commit. A rollback answers 409 (write conflict, expired transaction) or 500 with one sentence saying nothing was saved." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ADR-0039, server/CLAUDE.md, full verification, PR 1

**Files:**
- Create: `docs/adr/0039-guruh-holati-bitta-tranzaksiyada-ozgaradi.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md`

- [ ] **Step 1: Confirm the ADR number is free**

Run: `git fetch origin && git ls-tree --name-only origin/main docs/adr/ | tail -3 && gh pr list --repo AkhrorSoliev/daf-erp-system --state open --json number,files --jq '.[] | select(.files[].path | startswith("docs/adr/0039")) | .number'`
Expected: highest on main is 0038; no open PR adds 0039. If taken, use the next free number here and in every reference below.

- [ ] **Step 2: Write the ADR** — `docs/adr/0039-guruh-holati-bitta-tranzaksiyada-ozgaradi.md`:

```markdown
# ADR-0039 — Guruh holati bitta tranzaksiyada o'zgaradi: yo hammasi, yo hech narsa

**Holati:** Qabul qilindi
**Sana:** 2026-09-26
**Bog'liq:** ADR-0036, `server/src/groups/groups-status.service.ts`, `server/src/common/status/status-cascade.service.ts` (`cascadeGroupStatusChange`), `server/src/common/entity-history/entity-history.service.ts` (`deferredEvents`), guruhni o'chirish tranzaksiyasi (`GroupsWriteService.delete`)

## Kontekst

`GroupsStatusService.changeStatus` guruhni `CANCELLED` yoki `COMPLETED` qilganda
avval `StatusHistory` ni yozar, guruhni yangilar, `EntityHistory` ni yozar va
shundan keyingina, tranzaksiyasiz, `StatusCascadeService.cascade('Group', ...)`
ni chaqirardi. Kaskad o'rtasida xato bo'lsa (baza uzilishi, deploy qayta ishga
tushishi) guruh yopiq, yozilishlar ochiq qolardi. Bitta yozilishning pul
qaytarishi yiqilsa, u faqat logga yozilardi va admin «muvaffaqiyatli» ko'rardi.

Yana ikki nuqson bor edi. O'tish tranzaksiyadan tashqarida o'qilgan holat
bo'yicha tekshirilardi: ikki admin bir vaqtda bossa, ruxsat etilmagan o'tish
yozilib qolishi mumkin edi. `recordStatusChange` esa `entity.status.changed`
ni darhol chiqarardi: tizim izohi va Telegram hisobotidagi qator bekor
bo'lgan o'zgarish uchun ham yozilardi.

Guruhni o'chirish allaqachon bitta Serializable tranzaksiya edi (maxWait 15 s,
timeout 60 s). Prod (2026-09-26, faqat o'qildi): 47 ta ishlayotgan guruh, bitta
guruhda ochiq yozilishlar eng ko'pi 23 (95% guruhda 20 tagacha); oxirgi 90
kunda guruh 18 marta yopilgan.

## Qaror

1. Guruh holatini o'zgartirish bitta Serializable tranzaksiya: guruh qayta
   o'qiladi va o'tish shu holat bo'yicha tekshiriladi, `StatusHistory`,
   guruhning `EntityHistory` si, yozilishlarni yopish (pul qaytarish, holat
   jurnali, tarix yozuvlari), avtomatik bitiruv va guruh qatori. maxWait 15 s,
   timeout 60 s — guruhni o'chirish bilan bir xil.
2. Tranzaksiya ichidagi `recordStatusChange` hodisasini `deferredEvents` ga
   qo'yadi; hodisalar faqat tranzaksiya tasdiqlangandan keyin chiqadi.
3. Yiqilsa, admin «Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib
   ko'ring.» ko'radi: `P2034` (yozuv to'qnashuvi) va `P2028` (tranzaksiya vaqti
   tugagan) — 409, qolgan xato — 500 va logga yoziladi. `HttpException` o'z
   matni bilan o'tadi.
4. Filial, kurs va o'quvchi kaskadlari o'zgarmaydi: har yozilishning pul qadami
   o'z tranzaksiyasida, xatosi logga yoziladi. `cascade()` endi `'Group'` ni
   qabul qilmaydi.

**Taqiqlanadi:**
- guruh yozilishlarini guruh holati o'zgarishidan alohida, tranzaksiyasiz
  yopish;
- tranzaksiya ichida `recordStatusChange` ni `deferredEvents` siz chaqirish:
  hodisa tranzaksiya bekor bo'lishidan oldin chiqib ketadi.

## Ko'rib chiqilgan muqobillar

- **Kaskadni tashqarida qoldirib, yiqilganda qayta urinish yoki tuzatuvchi
  cron.** Oraliq holat baribir hisobotlar va oyliklarga ko'rinadi, qaysi qadam
  o'tgani esa har safar alohida aniqlanishi kerak.
- **Filial va kurs kaskadlarini ham bitta tranzaksiyaga o'tkazish.** Filial
  yopilishi yuzlab yozilishni qamraydi: 60 s ga sig'masligi mumkin, bitta
  yomon yozilish butun filialni yopishni to'xtatadi. Guruh — 23 tagacha.
- **Hodisani darhol chiqarib, tinglovchilarni rollback'ga chidamli qilish.**
  Har tinglovchi buni o'zi eslashi kerak edi; bittasi unutsa, soxta izoh.
- **P2034 da avtomatik qayta urinish.** Guruh holati oyiga ~6 marta
  o'zgaradi, to'qnashuv ehtimoli juda kichik; admin qayta bosadi.

## Oqibatlari

**Yutuq:** yopilgan guruhda ochiq yozilish qolmaydi; bekor bo'lgan o'zgarish
uchun izoh ham, Telegram qatori ham yozilmaydi; bir vaqtdagi ikki o'zgarishdan
ikkinchisi to'g'ri xato oladi. Javobdagi o'quvchilar soni yopilgandan keyingi
holatni ko'rsatadi.

**Narx:**
- Bitta yozilishning pul qaytarishi yiqilsa, guruh holati umuman o'zgarmaydi.
  Admin qayta urinadi; xato takrorlansa, sababi logda.
- Tranzaksiya guruh o'quvchilarining balans qatorlarini 60 s gacha ushlab
  turishi mumkin: shu paytdagi davomat yoki to'lov kutadi yoki to'qnashuv
  bilan qaytadi.
```

- [ ] **Step 3: Add the index row** — in `docs/adr/README.md`, after the 0038 row:

```markdown
| [0039](0039-guruh-holati-bitta-tranzaksiyada-ozgaradi.md) | Guruh holati bitta tranzaksiyada o'zgaradi: yo hammasi, yo hech narsa | Qabul qilindi | 2026-09-26 |
```

- [ ] **Step 4: Update `server/CLAUDE.md`**

1. In "Soft Delete & Archive", after the bullet starting `- **Closing a group closes its FROZEN enrollments too (ADR-0036).**`, add:

```markdown
- **A group status change is all or nothing (ADR-0039).** `GroupsStatusService.changeStatus` re-reads the group inside ONE Serializable transaction (maxWait 15 s, timeout 60 s, the group-deletion budget) and runs the transition check and StatusHistory, the group's EntityHistory, the enrollment side (`StatusCascadeService.cascadeGroupStatusChange`: closing with refunds, state log, removal/completion history and auto-graduation, all on `tx`) and the group row there. A failure rolls everything back and the admin reads «Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib ko'ring.» (409 for Prisma `P2034`/`P2028`, 500 otherwise; an `HttpException` passes through). `cascade()` takes `'Branch' | 'Course' | 'Student'` only; those cascades keep per-enrollment transactions.
```

2. In "Entity History (Audit Log)", after the bullet `- Methods: \`recordCreate()\`, …`, add:

```markdown
- **Status events wait for the commit.** `recordStatusChange` emits `entity.status.changed` at once unless the caller passes `deferredEvents`. A caller inside a transaction must pass it and call `emitStatusChanged(deferredEvents)` after the commit; otherwise a rollback leaves a system comment and a Telegram digest line for a change that never happened.
```

3. In "Write Hooks (mandatory)", replace the `StatusCascadeService.cascadeEnrollmentStatus()` bullet with:

```markdown
- `StatusCascadeService.cascadeEnrollmentStatus()` — helper used by all cascade transitions (Branch/Course/Student status changes that flip enrollments), by group deletion (`GroupsWriteService.delete()` → `cascadeGroupDeletion()`) and by a group's own status change (`GroupsStatusService.changeStatus()` → `cascadeGroupStatusChange()`); the last two pass their own transaction so the log rows commit with the change
```

4. In "Enrollment Lifecycle Prepaid Refund", replace the `- Group deletion: …` bullet with:

```markdown
- Group deletion and a group's own CANCELLED/COMPLETED: the same refund for every enrollment they close, inside that operation's transaction — one failed refund rolls the whole operation back (ADR-0039). The branch, course and student cascades instead refund each enrollment in its own transaction and log a failure, so one bad enrollment does not hold up a batch of hundreds.
```

- [ ] **Step 5: Full server verification**

Run: `cd server && npx prettier --write src/common/status src/common/entity-history src/groups/groups-status.service.ts src/groups/groups.service.spec.ts && npm run typecheck && npx eslint src 2>&1 | tail -2 && npx jest --runInBand 2>&1 | grep -E "^FAIL|Tests:|Test Suites:"`
Expected: typecheck clean; eslint `0 errors`; all suites pass (6384 before this work plus the new tests, minus the deleted ones).

- [ ] **Step 6: Commit and open PR 1**

```bash
git add docs/adr/0039-guruh-holati-bitta-tranzaksiyada-ozgaradi.md docs/adr/README.md server/CLAUDE.md docs/superpowers/plans/2026-09-26-guruh-holati-bitta-paket-va-qayta-ochish.md
git commit -m "ADR-0039: a group status change is all or nothing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/group-status-one-transaction
gh pr create --repo AkhrorSoliev/daf-erp-system --base main --head feat/group-status-one-transaction --title "Change a group's status in one transaction" --body-file <scratchpad>/pr1-body.md
```

The PR body (English, no production ids) states: what was wrong (untransacted cascade, logged refunds, stale-status check, events before commit), what changed (Tasks 1–4), the error sentence and codes, that branch/course/student cascades are unchanged, the production counts from the spec, the verification numbers, "no migration, not deployed", and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. After creating it, call the ccd_pr `get_status` tool; bind the PR with `bind_pr` if it is not reported.

---

## Part 2 — reopening a closed group (PR 2)

Start: `git switch -c feat/group-reopen` from `feat/group-status-one-transaction` after Task 5.

### Task 6: MonthlyChargeService charges a return for the rest of the month

**Files:**
- Modify: `server/src/billing/monthly-charge.service.ts`
- Test: `server/src/billing/monthly-charge.service.spec.ts`

**Interfaces:**
- Produces:
  - `createChargeForEnrollment(tx, params)` gains `fromDate?: string` (Tashkent `YYYY-MM-DD`; used only when later than `chargeStartDate(enrollment)`).
  - `chargeForReturn(tx: Prisma.TransactionClient, params: { enrollment: ChargeableEnrollment; returnDate: Date; today: string; companyId: number; reason: string; performedById?: number; discountPercent?: number }): Promise<{ charged: number } | null>`.

- [ ] **Step 1: Write the failing tests** — add after `describe('createChargeForEnrollment — chegirma', …)`:

```ts
  describe('createChargeForEnrollment — fromDate', () => {
    it("starts the charge at fromDate when it is later than the enrollment's own start", async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
        fromDate: '2026-09-17',
      });

      expect(charge?.plannedLessons).toBe(13);
      expect(charge?.coveredLessons).toBe(6); // 17, 19, 22, 24, 26, 29
      expect(charge?.chargedAmount).toBe(207_692);
    });

    it("keeps the enrollment's own start when fromDate is earlier", async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({ startDate: new Date('2026-09-17T00:00:00Z') }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
        fromDate: '2026-09-01',
      });

      expect(charge?.coveredLessons).toBe(6);
    });
  });

  describe('chargeForReturn', () => {
    // 10:00 UTC on 16.09 is 15:00 in Tashkent, the same day.
    const RETURN = new Date('2026-09-16T10:00:00Z');
    const params = () => ({
      enrollment: enrollment(),
      returnDate: RETURN,
      today: '2026-09-16',
      companyId: 1,
      reason: 'Guruh qayta ochildi',
      performedById: 7,
    });

    it("charges again the lessons this month's departure froze out", async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-9',
        status: 'CHARGED',
      });
      const restore = jest
        .spyOn(service, 'restoreChargeForReturn')
        .mockResolvedValue({ charged: 69_230, lessons: 2 });
      const create = jest.spyOn(service, 'createChargeForEnrollment');

      await expect(service.chargeForReturn(tx, params())).resolves.toEqual({
        charged: 69_230,
      });
      expect(restore).toHaveBeenCalledWith(tx, {
        enrollmentId: 'enr-1',
        returnDate: RETURN,
        today: '2026-09-16',
        companyId: 1,
        reason: 'Guruh qayta ochildi',
        performedById: 7,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it("bills this month from the day after the return when it left in an earlier month", async () => {
      const result = await service.chargeForReturn(tx, params());

      // 17, 19, 22, 24, 26, 29: not from the 1st, and not the return day.
      expect(result).toEqual({ charged: 207_692 });
      expect(lastChargeRow).toMatchObject({
        periodYear: 2026,
        periodMonth: 9,
        coveredLessons: 6,
      });
    });

    it('recreates a reversed month from the day after the return', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-9',
        status: 'REVERSED',
      });
      const restore = jest.spyOn(service, 'restoreChargeForReturn');
      const create = jest.spyOn(service, 'createChargeForEnrollment');

      await service.chargeForReturn(tx, params());

      expect(restore).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          periodYear: 2026,
          periodMonth: 9,
          fromDate: '2026-09-17',
        }),
      );
    });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/billing/monthly-charge.service.spec.ts -t "fromDate|chargeForReturn"`
Expected: FAIL — coveredLessons 13 (fromDate ignored); `chargeForReturn is not a function`.

- [ ] **Step 3: Implement** — in `monthly-charge.service.ts`:

1. Add `import { addDaysToDateStr } from '../common/date/tashkent';`.
2. In `createChargeForEnrollment`'s params, after `excusedCredit`, add:

```ts
      /**
       * First Tashkent day ('YYYY-MM-DD') this charge may cover, when later
       * than the enrollment's own start (`chargeStartDate`). A return to
       * ACTIVE in a later month than the departure passes the day after the
       * return, so the lessons held while the enrollment was closed are not
       * billed (`chargeForReturn`).
       */
      fromDate?: string;
```

3. Replace `const fromDate = chargeStartDate(enr);` with:

```ts
    const ownStart = chargeStartDate(enr);
    const fromDate =
      params.fromDate && params.fromDate > ownStart ? params.fromDate : ownStart;
```

4. Add the method after `restoreChargeForReturn`:

```ts
  /**
   * Charges an enrollment that came back to ACTIVE for the lessons strictly
   * after the return day, for the rest of that month.
   *
   * If the month's charge exists (the enrollment left this month), the
   * lessons its departure froze out are charged again
   * (`restoreChargeForReturn`). If not, or it was reversed (the enrollment
   * left in an earlier month), the month's charge is created from the day
   * after the return: the daily watchdog would otherwise bill the whole
   * month from the 1st, lessons held while the enrollment was closed
   * included.
   *
   * The caller checks the student is ACTIVE and not deleted, as for
   * `createChargeForEnrollment`, and runs this inside its Serializable
   * transaction.
   */
  async chargeForReturn(
    tx: Prisma.TransactionClient,
    params: {
      enrollment: ChargeableEnrollment;
      returnDate: Date;
      /** The batch's one "today" — see `restoreChargeForReturn`. */
      today: string;
      companyId: number;
      reason: string;
      performedById?: number;
      discountPercent?: number;
    },
  ): Promise<{ charged: number } | null> {
    const day = tashkentDateStr(params.returnDate);
    const periodYear = Number(day.slice(0, 4));
    const periodMonth = Number(day.slice(5, 7));

    const existing = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: params.enrollment.id,
          periodYear,
          periodMonth,
        },
      },
      select: { status: true },
    });
    if (existing?.status === MonthlyChargeStatus.CHARGED) {
      const restored = await this.restoreChargeForReturn(tx, {
        enrollmentId: params.enrollment.id,
        returnDate: params.returnDate,
        today: params.today,
        companyId: params.companyId,
        reason: params.reason,
        performedById: params.performedById,
      });
      return restored ? { charged: restored.charged } : null;
    }

    const created = await this.createChargeForEnrollment(tx, {
      enrollment: params.enrollment,
      periodYear,
      periodMonth,
      companyId: params.companyId,
      performedById: params.performedById,
      discountPercent: params.discountPercent,
      fromDate: addDaysToDateStr(day, 1),
    });
    return created ? { charged: created.chargedAmount } : null;
  }
```

- [ ] **Step 4: Run the billing specs and see them pass**

Run: `cd server && npx jest src/billing/monthly-charge.service.spec.ts`
Expected: PASS (all existing tests unchanged: no caller passes `fromDate`).

- [ ] **Step 5: Commit**

```bash
git add server/src/billing/monthly-charge.service.ts server/src/billing/monthly-charge.service.spec.ts
git commit -m "Monthly charge: bill a return from the day after it" -m "chargeForReturn re-charges the lessons this month's departure froze out, or, when the enrollment left in an earlier month, creates the month's charge from the day after the return instead of the 1st." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Undoing the graduation a completion made

**Files:**
- Modify: `server/src/common/status/group-graduation.ts`
- Create: `server/src/common/status/group-graduation.spec.ts`

**Interfaces:**
- Produces:
  - `export const GRADUATION_REVERTED_REASON = 'Avtomatik: guruh qayta ochildi';`
  - `export function graduatedByClosing(student: { status: StudentStatus | string; statusChangeReason: string | null; statusChangedAt: Date | null }, closedAt: Date | null): boolean`
  - `export async function revertAutoGraduation(tx: Prisma.TransactionClient, history: EntityHistoryService, params: { studentId: number; companyId: number; userId: number; at: Date; deferredEvents: EntityStatusChangedEvent[] }): Promise<void>`

- [ ] **Step 1: Write the failing tests** — `server/src/common/status/group-graduation.spec.ts`:

```ts
import {
  graduatedByClosing,
  revertAutoGraduation,
} from './group-graduation';
import type { EntityStatusChangedEvent } from '../entity-history';

const CLOSED_AT = new Date('2026-09-20T10:00:00.000Z');
const LATER = new Date('2026-09-20T10:00:00.050Z');
const EARLIER = new Date('2026-09-01T10:00:00.000Z');
const AUTO = 'Avtomatik: guruh tugallanganligi sababli';

describe('graduatedByClosing', () => {
  it.each([
    ['the completion graduated them', { status: 'GRADUATED', statusChangeReason: AUTO, statusChangedAt: LATER }, CLOSED_AT, true],
    ['the graduation was stamped at the closing instant', { status: 'GRADUATED', statusChangeReason: AUTO, statusChangedAt: CLOSED_AT }, CLOSED_AT, true],
    ['an admin graduated them by hand', { status: 'GRADUATED', statusChangeReason: 'Kursni tugatdi', statusChangedAt: LATER }, CLOSED_AT, false],
    ['an earlier completion graduated them', { status: 'GRADUATED', statusChangeReason: AUTO, statusChangedAt: EARLIER }, CLOSED_AT, false],
    ['they are no longer graduated', { status: 'ACTIVE', statusChangeReason: AUTO, statusChangedAt: LATER }, CLOSED_AT, false],
    ['the group has no close time on record', { status: 'GRADUATED', statusChangeReason: AUTO, statusChangedAt: EARLIER }, null, true],
  ])('%s', (_label, student, closedAt, expected) => {
    expect(graduatedByClosing(student, closedAt)).toBe(expected);
  });
});

describe('revertAutoGraduation', () => {
  it('makes the student ACTIVE again on the transaction and defers the event', async () => {
    const at = new Date('2026-09-26T09:00:00.000Z');
    const deferredEvents: EntityStatusChangedEvent[] = [];
    const tx = {
      statusHistory: { create: jest.fn().mockResolvedValue({}) },
      student: { update: jest.fn().mockResolvedValue({}) },
    };
    const history = { recordStatusChange: jest.fn().mockResolvedValue(undefined) };

    await revertAutoGraduation(tx as any, history as any, {
      studentId: 101,
      companyId: 1001,
      userId: 7,
      at,
      deferredEvents,
    });

    const why = 'Avtomatik: guruh qayta ochildi';
    expect(tx.statusHistory.create).toHaveBeenCalledWith({
      data: {
        entityType: 'Student',
        entityId: '101',
        fromStatus: 'GRADUATED',
        toStatus: 'ACTIVE',
        reason: why,
        changedById: 7,
        companyId: 1001,
      },
    });
    expect(history.recordStatusChange).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 101,
      oldValues: { status: 'GRADUATED' },
      newValues: { status: 'ACTIVE', reason: why },
      changedById: 7,
      companyId: 1001,
      tx,
      deferredEvents,
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: {
        status: 'ACTIVE',
        isActive: true,
        statusChangedAt: at,
        statusChangedById: 7,
        statusChangeReason: why,
      },
    });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/common/status/group-graduation.spec.ts`
Expected: FAIL — `graduatedByClosing` / `revertAutoGraduation` are not exported.

- [ ] **Step 3: Implement** — append to `group-graduation.ts`:

```ts
/** Why a student became ACTIVE again when their completed group reopened. */
export const GRADUATION_REVERTED_REASON = 'Avtomatik: guruh qayta ochildi';

/**
 * Did the closing at `closedAt` graduate this student? Only the automatic
 * graduation of that completion counts: it carries AUTO_GRADUATION_REASON and
 * is stamped at or after the group's close. A graduation an admin set by
 * hand, or one from an earlier completion, is the admin's decision and is
 * left alone. With no close time on record the reason alone decides.
 */
export function graduatedByClosing(
  student: {
    status: StudentStatus | string;
    statusChangeReason: string | null;
    statusChangedAt: Date | null;
  },
  closedAt: Date | null,
): boolean {
  if (student.status !== StudentStatus.GRADUATED) return false;
  if (student.statusChangeReason !== AUTO_GRADUATION_REASON) return false;
  if (closedAt === null) return true;
  return (
    student.statusChangedAt !== null &&
    student.statusChangedAt.getTime() >= closedAt.getTime()
  );
}

/**
 * Makes a student the completion graduated ACTIVE again when their group
 * reopens: StatusHistory, the student's own history and the student row, on
 * the caller's transaction, the event deferred like the graduation's.
 */
export async function revertAutoGraduation(
  tx: Prisma.TransactionClient,
  history: EntityHistoryService,
  params: {
    studentId: number;
    companyId: number;
    userId: number;
    at: Date;
    deferredEvents: EntityStatusChangedEvent[];
  },
): Promise<void> {
  await tx.statusHistory.create({
    data: {
      entityType: 'Student',
      entityId: String(params.studentId),
      fromStatus: 'GRADUATED',
      toStatus: 'ACTIVE',
      reason: GRADUATION_REVERTED_REASON,
      changedById: params.userId,
      companyId: params.companyId,
    },
  });
  await history.recordStatusChange({
    entityType: 'Student',
    entityId: params.studentId,
    oldValues: { status: 'GRADUATED' },
    newValues: { status: 'ACTIVE', reason: GRADUATION_REVERTED_REASON },
    changedById: params.userId,
    companyId: params.companyId,
    tx,
    deferredEvents: params.deferredEvents,
  });
  await tx.student.update({
    where: { id: params.studentId },
    data: {
      status: StudentStatus.ACTIVE,
      isActive: true,
      statusChangedAt: params.at,
      statusChangedById: params.userId,
      statusChangeReason: GRADUATION_REVERTED_REASON,
    },
  });
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `cd server && npx jest src/common/status/group-graduation.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/common/status/group-graduation.ts server/src/common/status/group-graduation.spec.ts
git commit -m "Group graduation: tell and undo the graduation a completion made" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Who a reopening brings back — `planGroupReopen`

**Files:**
- Create: `server/src/common/status/group-reopen-plan.ts`
- Create: `server/src/common/status/group-reopen-plan.spec.ts`

**Interfaces:**
- Consumes: `groupClosingReason` (Task 3), `graduatedByClosing` (Task 7).
- Produces:

```ts
export type ReopenOutcome = 'ACTIVE' | 'FROZEN' | 'IN_OTHER_GROUP' | 'LEFT';
export interface ReopenCandidate {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  outcome: ReopenOutcome;
  revertGraduation: boolean;
  discountPercent: number;
  startDate: Date | null;
  createdAt: Date;
}
export interface GroupReopenPlan {
  group: {
    id: string;
    name: string;
    branchId: number;
    startDate: Date | null;
    exactDays: string[];
    course: { price: number; paymentModel: PaymentModel };
  };
  candidates: ReopenCandidate[];
}
export function classifyReopenCandidate(student: ReopenStudent, closedAt: Date | null): { outcome: ReopenOutcome; revertGraduation: boolean };
export async function planGroupReopen(db: PrismaService | Prisma.TransactionClient, groupId: string, companyId: number): Promise<GroupReopenPlan | null>;
```

- [ ] **Step 1: Write the failing tests** — `server/src/common/status/group-reopen-plan.spec.ts`:

```ts
import {
  classifyReopenCandidate,
  planGroupReopen,
} from './group-reopen-plan';

const CLOSED_AT = new Date('2026-09-20T10:00:00.000Z');
const AUTO = 'Avtomatik: guruh tugallanganligi sababli';

const student = (over: Record<string, unknown> = {}) => ({
  firstName: 'Ism',
  lastName: 'Familiya',
  status: 'ACTIVE',
  deletedAt: null as Date | null,
  statusChangeReason: null as string | null,
  statusChangedAt: null as Date | null,
  discountPercent: 0,
  enrollments: [] as { id: string }[],
  ...over,
});

describe('classifyReopenCandidate', () => {
  it.each([
    ['an ACTIVE student comes back ACTIVE', student(), 'ACTIVE', false],
    ['a FROZEN student comes back FROZEN', student({ status: 'FROZEN' }), 'FROZEN', false],
    ['a student the completion graduated comes back ACTIVE', student({ status: 'GRADUATED', statusChangeReason: AUTO, statusChangedAt: CLOSED_AT }), 'ACTIVE', true],
    ['a student graduated by hand does not', student({ status: 'GRADUATED', statusChangeReason: 'Kursni tugatdi', statusChangedAt: CLOSED_AT }), 'LEFT', false],
    ['an expelled student does not', student({ status: 'EXPELLED' }), 'LEFT', false],
    ['an archived student does not', student({ status: 'ARCHIVED' }), 'LEFT', false],
    ['a legacy INACTIVE student does not', student({ status: 'INACTIVE' }), 'LEFT', false],
    ['a deleted card does not', student({ deletedAt: CLOSED_AT }), 'LEFT', false],
    ['a student in another group does not', student({ enrollments: [{ id: 'enr-other' }] }), 'IN_OTHER_GROUP', false],
    ['a frozen student in another group does not', student({ status: 'FROZEN', enrollments: [{ id: 'enr-other' }] }), 'IN_OTHER_GROUP', false],
  ])('%s', (_label, s, outcome, revertGraduation) => {
    expect(classifyReopenCandidate(s as any, CLOSED_AT)).toEqual({
      outcome,
      revertGraduation,
    });
  });
});

describe('planGroupReopen', () => {
  const group = (over: Record<string, unknown> = {}) => ({
    id: 'group-1',
    name: '#014',
    branchId: 1,
    statusEnum: 'COMPLETED',
    statusChangedAt: CLOSED_AT,
    startDate: null,
    exactDays: ['tuesday'],
    course: { price: 450_000, paymentModel: 'MONTHLY' },
    ...over,
  });
  const db = (g: unknown, rows: unknown[] = []) => ({
    group: { findFirst: jest.fn().mockResolvedValue(g) },
    enrollment: { findMany: jest.fn().mockResolvedValue(rows) },
  });

  it("selects the enrollments the group's own closing closed, and nothing older", async () => {
    const fake = db(group());

    await planGroupReopen(fake as any, 'group-1', 1001);

    expect(fake.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'group-1', deletedAt: null, companyId: 1001 },
      }),
    );
    expect(fake.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'group-1',
          deletedAt: null,
          status: { in: ['COMPLETED', 'DROPPED'] },
          statusChangeReason: 'Cascade: Group #group-1 → COMPLETED',
          statusChangedAt: { gte: CLOSED_AT },
        },
      }),
    );
  });

  it('drops the time bound for a group with no close time on record', async () => {
    const fake = db(group({ statusEnum: 'CANCELLED', statusChangedAt: null }));

    await planGroupReopen(fake as any, 'group-1', 1001);

    expect(fake.enrollment.findMany.mock.calls[0][0].where).toEqual({
      groupId: 'group-1',
      deletedAt: null,
      status: { in: ['COMPLETED', 'DROPPED'] },
      statusChangeReason: 'Cascade: Group #group-1 → CANCELLED',
    });
  });

  it('classifies each closed enrollment and keeps what the money step needs', async () => {
    const created = new Date('2026-05-02T06:00:00Z');
    const fake = db(group(), [
      { id: 'enr-a', studentId: 101, startDate: null, createdAt: created, student: student({ discountPercent: 20 }) },
      { id: 'enr-b', studentId: 102, startDate: null, createdAt: created, student: student({ enrollments: [{ id: 'x' }] }) },
    ]);

    const plan = await planGroupReopen(fake as any, 'group-1', 1001);

    expect(plan).toEqual({
      group: {
        id: 'group-1',
        name: '#014',
        branchId: 1,
        startDate: null,
        exactDays: ['tuesday'],
        course: { price: 450_000, paymentModel: 'MONTHLY' },
      },
      candidates: [
        { enrollmentId: 'enr-a', studentId: 101, studentName: 'Ism Familiya', outcome: 'ACTIVE', revertGraduation: false, discountPercent: 20, startDate: null, createdAt: created },
        { enrollmentId: 'enr-b', studentId: 102, studentName: 'Ism Familiya', outcome: 'IN_OTHER_GROUP', revertGraduation: false, discountPercent: 0, startDate: null, createdAt: created },
      ],
    });
  });

  it('brings a student back once when the closing closed several of their rows', async () => {
    // Production has no one-row-per-student-per-group index: a student
    // re-added to a group keeps the old row. Only the newest comes back.
    const fake = db(group(), [
      { id: 'enr-new', studentId: 101, startDate: null, createdAt: new Date('2026-09-10T06:00:00Z'), student: student() },
      { id: 'enr-old', studentId: 101, startDate: null, createdAt: new Date('2026-05-02T06:00:00Z'), student: student() },
    ]);

    const plan = await planGroupReopen(fake as any, 'group-1', 1001);

    expect(plan?.candidates.map((c) => c.enrollmentId)).toEqual(['enr-new']);
    expect(fake.enrollment.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('brings back nobody for a group that is not closed', async () => {
    const fake = db(group({ statusEnum: 'ACTIVE' }));

    const plan = await planGroupReopen(fake as any, 'group-1', 1001);

    expect(plan?.candidates).toEqual([]);
    expect(fake.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('returns null for a missing or deleted group', async () => {
    await expect(
      planGroupReopen(db(null) as any, 'group-1', 1001),
    ).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/common/status/group-reopen-plan.spec.ts`
Expected: FAIL — `Cannot find module './group-reopen-plan'`.

- [ ] **Step 3: Implement** — `server/src/common/status/group-reopen-plan.ts`:

```ts
import {
  EnrollmentStatus,
  GroupStatus,
  PaymentModel,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { groupClosingReason } from './status-cascade.service';
import { graduatedByClosing } from './group-graduation';

/**
 * What reopening does with one enrolment its group's closing closed: back as
 * ACTIVE or FROZEN, or not back — the student studies in another group now
 * (IN_OTHER_GROUP) or has left the centre (LEFT: expelled, archived, legacy
 * INACTIVE, graduated by hand, or the card was deleted).
 */
export type ReopenOutcome = 'ACTIVE' | 'FROZEN' | 'IN_OTHER_GROUP' | 'LEFT';

export interface ReopenCandidate {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  outcome: ReopenOutcome;
  /** The completion graduated this student: reopening makes them ACTIVE again. */
  revertGraduation: boolean;
  discountPercent: number;
  startDate: Date | null;
  createdAt: Date;
}

export interface GroupReopenPlan {
  group: {
    id: string;
    name: string;
    branchId: number;
    startDate: Date | null;
    exactDays: string[];
    course: { price: number; paymentModel: PaymentModel };
  };
  candidates: ReopenCandidate[];
}

/** The student fields `classifyReopenCandidate` reads. */
export interface ReopenStudent {
  status: StudentStatus | string;
  deletedAt: Date | null;
  statusChangeReason: string | null;
  statusChangedAt: Date | null;
  /** Their open (ACTIVE or FROZEN) enrolments in OTHER groups. */
  enrollments: { id: string }[];
}

/**
 * Decides one student's outcome. Someone studying elsewhere is never pulled
 * back, whatever their status. Otherwise the enrolment follows the student:
 * FROZEN stays FROZEN, ACTIVE comes back ACTIVE, and a student this group's
 * completion graduated becomes ACTIVE again with it.
 */
export function classifyReopenCandidate(
  student: ReopenStudent,
  closedAt: Date | null,
): { outcome: ReopenOutcome; revertGraduation: boolean } {
  const stay = (outcome: ReopenOutcome) => ({ outcome, revertGraduation: false });
  if (student.deletedAt) return stay('LEFT');
  if (student.enrollments.length > 0) return stay('IN_OTHER_GROUP');
  if (student.status === StudentStatus.ACTIVE) return stay('ACTIVE');
  if (student.status === StudentStatus.FROZEN) return stay('FROZEN');
  if (graduatedByClosing(student, closedAt)) {
    return { outcome: 'ACTIVE', revertGraduation: true };
  }
  return stay('LEFT');
}

/**
 * Who reopening a closed group brings back (ADR-0040). The ONE source for
 * the reopening itself and for its preview.
 *
 * The group's closing marked every enrolment it closed: the reason
 * `groupClosingReason(group, status)`, stamped at or after the group's
 * `statusChangedAt`. That holds for closings before and after ADR-0039 and
 * for the rows the closed-group repair closed, and the time bound leaves out
 * enrolments an EARLIER closing of the same group left behind. `null` for a
 * missing or deleted group; no candidates for a group that is not closed.
 */
export async function planGroupReopen(
  db: PrismaService | Prisma.TransactionClient,
  groupId: string,
  companyId: number,
): Promise<GroupReopenPlan | null> {
  const group = await db.group.findFirst({
    where: { id: groupId, deletedAt: null, companyId },
    select: {
      id: true,
      name: true,
      branchId: true,
      statusEnum: true,
      statusChangedAt: true,
      startDate: true,
      exactDays: true,
      course: { select: { price: true, paymentModel: true } },
    },
  });
  if (!group) return null;

  const plan: GroupReopenPlan = {
    group: {
      id: group.id,
      name: group.name,
      branchId: group.branchId,
      startDate: group.startDate,
      exactDays: group.exactDays,
      course: group.course,
    },
    candidates: [],
  };
  if (
    group.statusEnum !== GroupStatus.CANCELLED &&
    group.statusEnum !== GroupStatus.COMPLETED
  ) {
    return plan;
  }

  const closed = await db.enrollment.findMany({
    where: {
      groupId,
      deletedAt: null,
      status: { in: [EnrollmentStatus.COMPLETED, EnrollmentStatus.DROPPED] },
      statusChangeReason: groupClosingReason(groupId, group.statusEnum),
      ...(group.statusChangedAt
        ? { statusChangedAt: { gte: group.statusChangedAt } }
        : {}),
    },
    select: {
      id: true,
      studentId: true,
      startDate: true,
      createdAt: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          status: true,
          deletedAt: true,
          statusChangeReason: true,
          statusChangedAt: true,
          discountPercent: true,
          enrollments: {
            where: {
              groupId: { not: groupId },
              deletedAt: null,
              status: {
                in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN],
              },
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
    // Newest first: a student re-added to the group keeps the old row
    // (production has no one-row-per-student-per-group index), and only
    // the newest closed row comes back.
    orderBy: { createdAt: 'desc' },
  });

  const seen = new Set<number>();
  const newestPerStudent = closed.filter((e) => {
    if (seen.has(e.studentId)) return false;
    seen.add(e.studentId);
    return true;
  });

  plan.candidates = newestPerStudent.map((e) => ({
    enrollmentId: e.id,
    studentId: e.studentId,
    studentName: `${e.student.firstName} ${e.student.lastName}`.trim(),
    ...classifyReopenCandidate(e.student, group.statusChangedAt),
    discountPercent: e.student.discountPercent,
    startDate: e.startDate,
    createdAt: e.createdAt,
  }));
  return plan;
}
```

- [ ] **Step 4: Run them and see them pass, then type-check**

Run: `cd server && npx jest src/common/status/group-reopen-plan.spec.ts && npm run typecheck`
Expected: PASS; typecheck clean (if it flags an import cycle between `status-cascade.service.ts` and `group-reopen-plan.ts`, there is none: the plan imports the cascade, not the other way round).

- [ ] **Step 5: Commit**

```bash
git add server/src/common/status/group-reopen-plan.ts server/src/common/status/group-reopen-plan.spec.ts
git commit -m "Group reopen: find who the closing closed and who comes back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `GroupReopenService` brings them back on the caller's transaction

**Files:**
- Create: `server/src/common/status/group-reopen.service.ts`
- Create: `server/src/common/status/group-reopen.service.spec.ts`
- Modify: `server/src/common/status/status-history.module.ts`, `server/src/common/status/index.ts`

**Interfaces:**
- Consumes: `planGroupReopen` (Task 8), `revertAutoGraduation` (Task 7), `MonthlyChargeService.chargeForReturn` (Task 6), `EntityHistoryService.recordCreate({ …, tx })`.
- Produces: `export const GROUP_REOPENED_REASON = 'Guruh qayta ochildi';` and `GroupReopenService.reopen(tx: Prisma.TransactionClient, params: { groupId: string; companyId: number; userId: number; at: Date; deferredEvents: EntityStatusChangedEvent[] }): Promise<{ returned: number; notReturned: number }>`; `GroupReopenService` exported from `common/status`.

- [ ] **Step 1: Write the failing tests** — `server/src/common/status/group-reopen.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { GroupReopenService } from './group-reopen.service';
import { planGroupReopen, type GroupReopenPlan } from './group-reopen-plan';
import { EntityHistoryService } from '../entity-history';
import type { EntityStatusChangedEvent } from '../entity-history';
import { MonthlyChargeService } from '../../billing/monthly-charge.service';

jest.mock('./group-reopen-plan', () => ({
  ...jest.requireActual('./group-reopen-plan'),
  planGroupReopen: jest.fn(),
}));

const AT = new Date('2026-09-26T09:00:00.000Z');
const CREATED = new Date('2026-05-02T06:00:00Z');

const candidate = (
  enrollmentId: string,
  studentId: number,
  outcome: string,
  revertGraduation = false,
) => ({
  enrollmentId,
  studentId,
  studentName: `Ism${studentId} Familiya${studentId}`,
  outcome,
  revertGraduation,
  discountPercent: 10,
  startDate: null,
  createdAt: CREATED,
});

const plan = (
  paymentModel: 'MONTHLY' | 'LESSON_PACK',
  candidates: ReturnType<typeof candidate>[],
) =>
  ({
    group: {
      id: 'group-1',
      name: '#014',
      branchId: 1,
      startDate: null,
      exactDays: ['tuesday'],
      course: { price: 450_000, paymentModel },
    },
    candidates,
  }) as unknown as GroupReopenPlan;

describe('GroupReopenService', () => {
  let service: GroupReopenService;
  let history: { recordCreate: jest.Mock; recordStatusChange: jest.Mock };
  let monthly: { chargeForReturn: jest.Mock };
  let tx: any;
  let deferredEvents: EntityStatusChangedEvent[];

  const reopen = () =>
    service.reopen(tx, {
      groupId: 'group-1',
      companyId: 1001,
      userId: 7,
      at: AT,
      deferredEvents,
    });

  beforeEach(async () => {
    history = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
    };
    monthly = { chargeForReturn: jest.fn().mockResolvedValue(null) };
    tx = {
      enrollment: { update: jest.fn().mockResolvedValue({}) },
      enrollmentStateLog: { create: jest.fn().mockResolvedValue({}) },
      statusHistory: { create: jest.fn().mockResolvedValue({}) },
      student: { update: jest.fn().mockResolvedValue({}) },
    };
    deferredEvents = [];
    const module = await Test.createTestingModule({
      providers: [
        GroupReopenService,
        { provide: EntityHistoryService, useValue: history },
        { provide: MonthlyChargeService, useValue: monthly },
      ],
    }).compile();
    service = module.get(GroupReopenService);
  });

  it('brings the ACTIVE and FROZEN outcomes back on the transaction and leaves the rest', async () => {
    (planGroupReopen as jest.Mock).mockResolvedValue(
      plan('LESSON_PACK', [
        candidate('enr-a', 101, 'ACTIVE'),
        candidate('enr-f', 102, 'FROZEN'),
        candidate('enr-o', 103, 'IN_OTHER_GROUP'),
        candidate('enr-l', 104, 'LEFT'),
      ]),
    );

    await expect(reopen()).resolves.toEqual({ returned: 2, notReturned: 2 });

    expect(planGroupReopen).toHaveBeenCalledWith(tx, 'group-1', 1001);
    const why = 'Guruh qayta ochildi';
    expect(tx.enrollment.update.mock.calls.map(([a]: any) => a)).toEqual([
      { where: { id: 'enr-a' }, data: { status: 'ACTIVE', statusChangedAt: AT, statusChangedById: 7, statusChangeReason: why } },
      { where: { id: 'enr-f' }, data: { status: 'FROZEN', statusChangedAt: AT, statusChangedById: 7, statusChangeReason: why } },
    ]);
    expect(tx.enrollmentStateLog.create.mock.calls.map(([a]: any) => a.data)).toEqual([
      { enrollmentId: 'enr-a', status: 'ACTIVE', transitionAt: AT, reason: why, changedById: 7 },
      { enrollmentId: 'enr-f', status: 'FROZEN', transitionAt: AT, reason: why, changedById: 7 },
    ]);
  });

  it('writes each return to the student and the group, on the transaction', async () => {
    (planGroupReopen as jest.Mock).mockResolvedValue(
      plan('LESSON_PACK', [candidate('enr-a', 101, 'ACTIVE')]),
    );

    await reopen();

    expect(history.recordCreate.mock.calls.map(([p]: any) => p)).toEqual([
      {
        entityType: 'Student',
        entityId: 101,
        newValues: { guruh: '#014', guruhId: 'group-1', action: 'GURUHGA_QOSHILDI', sabab: 'Guruh qayta ochildi' },
        changedById: 7,
        companyId: 1001,
        tx,
      },
      {
        entityType: 'Group',
        entityId: 'group-1',
        newValues: { action: 'OQUVCHI_QOSHILDI', oquvchi: 'Ism101 Familiya101', oquvchiId: 101, sabab: 'Guruh qayta ochildi' },
        changedById: 7,
        companyId: 1001,
        tx,
      },
    ]);
  });

  it('undoes the graduation the completion made, before the enrollment comes back', async () => {
    (planGroupReopen as jest.Mock).mockResolvedValue(
      plan('LESSON_PACK', [candidate('enr-a', 101, 'ACTIVE', true)]),
    );

    await reopen();

    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 101 },
        data: expect.objectContaining({ status: 'ACTIVE', isActive: true }),
      }),
    );
    expect(history.recordStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 101, tx, deferredEvents }),
    );
    expect(tx.student.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.enrollment.update.mock.invocationCallOrder[0],
    );
  });

  it('charges a MONTHLY student who comes back ACTIVE for the rest of the month, and no one else', async () => {
    (planGroupReopen as jest.Mock).mockResolvedValue(
      plan('MONTHLY', [
        candidate('enr-a', 101, 'ACTIVE'),
        candidate('enr-f', 102, 'FROZEN'),
      ]),
    );

    await reopen();

    expect(monthly.chargeForReturn).toHaveBeenCalledTimes(1);
    expect(monthly.chargeForReturn).toHaveBeenCalledWith(tx, {
      enrollment: {
        id: 'enr-a',
        studentId: 101,
        groupId: 'group-1',
        status: 'ACTIVE',
        startDate: null,
        createdAt: CREATED,
        group: {
          id: 'group-1',
          branchId: 1,
          companyId: 1001,
          statusEnum: 'ACTIVE',
          startDate: null,
          exactDays: ['tuesday'],
          course: { price: 450_000, paymentModel: 'MONTHLY' },
        },
      },
      returnDate: AT,
      today: '2026-09-26',
      companyId: 1001,
      reason: 'Guruh qayta ochildi',
      performedById: 7,
      discountPercent: 10,
    });
  });

  it('charges nothing for a LESSON_PACK course', async () => {
    (planGroupReopen as jest.Mock).mockResolvedValue(
      plan('LESSON_PACK', [candidate('enr-a', 101, 'ACTIVE')]),
    );

    await reopen();

    expect(monthly.chargeForReturn).not.toHaveBeenCalled();
  });

  it('does nothing for a missing group', async () => {
    (planGroupReopen as jest.Mock).mockResolvedValue(null);

    await expect(reopen()).resolves.toEqual({ returned: 0, notReturned: 0 });
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/common/status/group-reopen.service.spec.ts`
Expected: FAIL — `Cannot find module './group-reopen.service'`.

- [ ] **Step 3: Implement** — `server/src/common/status/group-reopen.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  GroupStatus,
  PaymentModel,
  Prisma,
} from '@prisma/client';
import {
  EntityHistoryService,
  type EntityStatusChangedEvent,
} from '../entity-history';
import { MonthlyChargeService } from '../../billing/monthly-charge.service';
import { tashkentDateStr } from '../date/tashkent';
import {
  planGroupReopen,
  type GroupReopenPlan,
  type ReopenCandidate,
} from './group-reopen-plan';
import { revertAutoGraduation } from './group-graduation';

/** Why an enrolment reopened with its group, wherever that is recorded. */
export const GROUP_REOPENED_REASON = 'Guruh qayta ochildi';

/**
 * Reopens a CANCELLED or COMPLETED group's enrolments when the group goes
 * back to ACTIVE (ADR-0040), on the CALLER's transaction — the same one
 * `GroupsStatusService.changeStatus` checks the transition in (ADR-0039).
 */
@Injectable()
export class GroupReopenService {
  constructor(
    private entityHistoryService: EntityHistoryService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  /**
   * Brings back every student `planGroupReopen` says comes back: the
   * newest closed row per student, a state-log row, the
   * return in the student's and the group's history, the graduation the
   * completion made undone, and — MONTHLY course, back as ACTIVE — the rest
   * of the month charged from the day after today. Call it BEFORE the group
   * row is updated: the plan reads the closing's marks from it.
   */
  async reopen(
    tx: Prisma.TransactionClient,
    params: {
      groupId: string;
      companyId: number;
      userId: number;
      at: Date;
      deferredEvents: EntityStatusChangedEvent[];
    },
  ): Promise<{ returned: number; notReturned: number }> {
    const plan = await planGroupReopen(tx, params.groupId, params.companyId);
    if (!plan) return { returned: 0, notReturned: 0 };

    // One "today" for the whole group, as the closing cascades do.
    const today = tashkentDateStr(params.at);
    let returned = 0;
    for (const c of plan.candidates) {
      if (c.outcome !== 'ACTIVE' && c.outcome !== 'FROZEN') continue;
      const status =
        c.outcome === 'ACTIVE' ? EnrollmentStatus.ACTIVE : EnrollmentStatus.FROZEN;

      if (c.revertGraduation) {
        await revertAutoGraduation(tx, this.entityHistoryService, {
          studentId: c.studentId,
          companyId: params.companyId,
          userId: params.userId,
          at: params.at,
          deferredEvents: params.deferredEvents,
        });
      }

      await tx.enrollment.update({
        where: { id: c.enrollmentId },
        data: {
          status,
          statusChangedAt: params.at,
          statusChangedById: params.userId,
          statusChangeReason: GROUP_REOPENED_REASON,
        },
      });
      await tx.enrollmentStateLog.create({
        data: {
          enrollmentId: c.enrollmentId,
          status,
          transitionAt: params.at,
          reason: GROUP_REOPENED_REASON,
          changedById: params.userId,
        },
      });
      await this.recordReturn(tx, plan, c, params.userId, params.companyId);

      if (
        status === EnrollmentStatus.ACTIVE &&
        plan.group.course.paymentModel === PaymentModel.MONTHLY
      ) {
        await this.monthlyChargeService.chargeForReturn(tx, {
          enrollment: {
            id: c.enrollmentId,
            studentId: c.studentId,
            groupId: plan.group.id,
            status: EnrollmentStatus.ACTIVE,
            startDate: c.startDate,
            createdAt: c.createdAt,
            group: {
              id: plan.group.id,
              branchId: plan.group.branchId,
              companyId: params.companyId,
              // Becomes ACTIVE in this same transaction.
              statusEnum: GroupStatus.ACTIVE,
              startDate: plan.group.startDate,
              exactDays: plan.group.exactDays,
              course: plan.group.course,
            },
          },
          returnDate: params.at,
          today,
          companyId: params.companyId,
          reason: GROUP_REOPENED_REASON,
          performedById: params.userId,
          discountPercent: c.discountPercent,
        });
      }
      returned++;
    }
    return { returned, notReturned: plan.candidates.length - returned };
  }

  /**
   * The records adding a student to a group writes (`GURUHGA_QOSHILDI`,
   * `OQUVCHI_QOSHILDI`), with the reason — the history tab already knows
   * both codes.
   */
  private async recordReturn(
    tx: Prisma.TransactionClient,
    plan: GroupReopenPlan,
    c: ReopenCandidate,
    userId: number,
    companyId: number,
  ): Promise<void> {
    const by = { changedById: userId, companyId, tx };
    await this.entityHistoryService.recordCreate({
      entityType: 'Student',
      entityId: c.studentId,
      newValues: {
        guruh: plan.group.name,
        guruhId: plan.group.id,
        action: 'GURUHGA_QOSHILDI',
        sabab: GROUP_REOPENED_REASON,
      },
      ...by,
    });
    await this.entityHistoryService.recordCreate({
      entityType: 'Group',
      entityId: plan.group.id,
      newValues: {
        action: 'OQUVCHI_QOSHILDI',
        oquvchi: c.studentName,
        oquvchiId: c.studentId,
        sabab: GROUP_REOPENED_REASON,
      },
      ...by,
    });
  }
}
```

- [ ] **Step 4: Register and export it** — in `status-history.module.ts` add `GroupReopenService` to `providers` and `exports` (import from `./group-reopen.service`); in `server/src/common/status/index.ts` add `export { GroupReopenService, GROUP_REOPENED_REASON } from './group-reopen.service';`.

- [ ] **Step 5: Run the status specs and type-check**

Run: `cd server && npx jest src/common/status && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/common/status/
git commit -m "Group reopen: bring the closing's students back on the caller's transaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The status change reopens a closed group

**Files:**
- Modify: `server/src/common/status/status-transitions.ts`
- Modify: `server/src/groups/groups-status.service.ts`
- Test: `server/src/common/status/status-transitions.spec.ts`, `server/src/groups/groups.service.spec.ts`

**Interfaces:**
- Consumes: `GroupReopenService.reopen` (Task 9).
- Produces: `Group` transitions `COMPLETED → ACTIVE`, `CANCELLED → ACTIVE`; `changeStatus` reopening path.

- [ ] **Step 1: Write the failing tests**

1. `status-transitions.spec.ts` — add:

```ts
  describe('a closed group can reopen (ADR-0040)', () => {
    it.each([
      ['COMPLETED', 'ACTIVE', true],
      ['CANCELLED', 'ACTIVE', true],
      ['COMPLETED', 'PAUSED', false],
      ['CANCELLED', 'COMPLETED', false],
      ['COMPLETED', 'CANCELLED', false],
    ])('Group %s → %s is %s', (from, to, allowed) => {
      expect(isValidTransition('Group', from, to)).toBe(allowed);
    });
  });
```

(import `isValidTransition` from `./status-transitions` if the spec does not already.)

2. `groups.service.spec.ts` — in the top-level `beforeEach` create `groupReopenService = { reopen: jest.fn().mockResolvedValue({ returned: 0, notReturned: 0 }) };` (declare `let groupReopenService: any;` with the other mocks), import `GroupReopenService` from `'../common/status'` and add `{ provide: GroupReopenService, useValue: groupReopenService },` to the providers. In `describe('changeStatus', …)`'s `beforeEach`, make the in-transaction read carry the branch and course: `findFirst: jest.fn().mockResolvedValue({ ...mockGroup, statusEnum: 'ACTIVE', branch: { status: 'ACTIVE' }, course: { status: 'ACTIVE' } })`. Then add:

```ts
    describe('reopening a closed group', () => {
      const closed = (statusEnum: string, over: Record<string, unknown> = {}) => ({
        ...mockGroup,
        statusEnum,
        branch: { status: 'ACTIVE' },
        course: { status: 'ACTIVE' },
        ...over,
      });

      it.each(['COMPLETED', 'CANCELLED'])(
        'brings a %s group back with its students, before the group row is overwritten',
        async (statusEnum) => {
          tx.group.findFirst.mockResolvedValue(closed(statusEnum));

          await service.changeStatus('group-1', { status: 'ACTIVE' as any, reason: 'adashib yopilgan' }, 1, 1001);

          expect(groupReopenService.reopen).toHaveBeenCalledWith(tx, {
            groupId: 'group-1',
            companyId: 1001,
            userId: 1,
            at: expect.any(Date),
            deferredEvents: expect.any(Array),
          });
          expect(statusCascadeService.cascadeGroupStatusChange).not.toHaveBeenCalled();
          expect(groupReopenService.reopen.mock.invocationCallOrder[0]).toBeLessThan(
            tx.group.update.mock.invocationCallOrder[0],
          );
          expect(tx.group.update.mock.calls[0][0].data).toMatchObject({
            statusEnum: 'ACTIVE',
            isActive: true,
          });
        },
      );

      it('does not reopen anything when a paused group goes back to ACTIVE', async () => {
        tx.group.findFirst.mockResolvedValue(closed('PAUSED'));

        await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001);

        expect(groupReopenService.reopen).not.toHaveBeenCalled();
        expect(statusCascadeService.cascadeGroupStatusChange).toHaveBeenCalled();
      });

      it('refuses a group whose branch is not ACTIVE', async () => {
        tx.group.findFirst.mockResolvedValue(closed('COMPLETED', { branch: { status: 'CLOSED' } }));

        await expect(
          service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001),
        ).rejects.toThrow(BadRequestException);
        expect(groupReopenService.reopen).not.toHaveBeenCalled();
      });

      it('refuses a group whose course is archived', async () => {
        tx.group.findFirst.mockResolvedValue(closed('CANCELLED', { course: { status: 'ARCHIVED' } }));

        await expect(
          service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001),
        ).rejects.toThrow(BadRequestException);
        expect(groupReopenService.reopen).not.toHaveBeenCalled();
      });
    });
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/common/status/status-transitions.spec.ts src/groups/groups.service.spec.ts`
Expected: FAIL — `COMPLETED → ACTIVE` not allowed; `reopen` never called.

- [ ] **Step 3: Implement**

1. `status-transitions.ts`, in `Group`:

```ts
    // A closed group reopens with the students it had when it closed
    // (ADR-0040): `GroupReopenService`, inside the status change's transaction.
    COMPLETED: ['ACTIVE'],
    CANCELLED: ['ACTIVE'],
```

2. `groups-status.service.ts`:
   - imports: add `BadRequestException` to `@nestjs/common`, `BranchStatus, CourseStatus` to `@prisma/client`, and `GroupReopenService` to the `'../common/status'` import; inject `private groupReopenService: GroupReopenService` as the last constructor parameter.
   - the in-transaction read becomes:

```ts
          const group = await tx.group.findFirst({
            where: { id, deletedAt: null, companyId },
            include: {
              branch: { select: { status: true } },
              course: { select: { status: true } },
            },
          });
```

   - after `recordStatusChange`, replace the single `cascadeGroupStatusChange` call with:

```ts
          const reopening =
            dto.status === GroupStatus.ACTIVE &&
            (group.statusEnum === GroupStatus.COMPLETED ||
              group.statusEnum === GroupStatus.CANCELLED);
          if (reopening) {
            assertMayReopen(group);
            // Before the group row: the plan reads the closing's marks on it.
            await this.groupReopenService.reopen(tx, {
              groupId: id,
              companyId,
              userId,
              at,
              deferredEvents,
            });
          } else {
            await this.statusCascadeService.cascadeGroupStatusChange(tx, {
              groupId: id,
              status: dto.status,
              userId,
              at,
              deferredEvents,
            });
          }
```

   - below `RETRYABLE_TRANSACTION_CODES`, add:

```ts
/**
 * A group comes back only into a branch and a course that are still open:
 * an ACTIVE group in a closed branch or under an archived course is a state
 * nothing else in the system produces.
 */
function assertMayReopen(group: {
  branch: { status: BranchStatus };
  course: { status: CourseStatus };
}): void {
  if (group.branch.status !== BranchStatus.ACTIVE) {
    throw new BadRequestException(
      'Guruh filiali faol emas — avval filialni faollashtiring',
    );
  }
  if (group.course.status === CourseStatus.ARCHIVED) {
    throw new BadRequestException(
      'Guruh kursi arxivlangan — avval kursni arxivdan chiqaring',
    );
  }
}
```

- [ ] **Step 4: Run them and see them pass, then type-check**

Run: `cd server && npx jest src/common/status src/groups && npm run typecheck`
Expected: PASS; typecheck clean. (Any other spec that builds `GroupsStatusService` with real providers must now provide `GroupReopenService`; `groups-read.branch.spec.ts` uses `{}` for the whole service and needs nothing.)

- [ ] **Step 5: Commit**

```bash
git add server/src/common/status/status-transitions.ts server/src/common/status/status-transitions.spec.ts server/src/groups/groups-status.service.ts server/src/groups/groups.service.spec.ts
git commit -m "Groups: reopen a completed or cancelled group with its students" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `GET /groups/:id/reopen-preview`

**Files:**
- Modify: `server/src/groups/groups-read.service.ts`, `server/src/groups/groups.service.ts`, `server/src/groups/groups.controller.ts`, `server/src/common/auth/branch-route-policy.ts`
- Test: `server/src/groups/groups.service.spec.ts`, `server/src/groups/groups-read.branch.spec.ts`, `server/src/groups/groups.controller.spec.ts`

**Interfaces:**
- Consumes: `planGroupReopen` (Task 8).
- Produces: `export interface GroupReopenPreview { returning: { active: number; frozen: number }; notReturning: { inOtherGroup: number; left: number } }` (in `groups-read.service.ts`); `GroupsReadService.getReopenPreview(groupId, companyId)`; `GroupsService.getReopenPreview(groupId, companyId, userId?, roles?)`; controller `getReopenPreview`.

- [ ] **Step 1: Write the failing tests**

1. `groups.service.spec.ts`, after `describe('getDeletePreview', …)`:

```ts
  describe('getReopenPreview', () => {
    const closedAt = new Date('2026-09-20T10:00:00.000Z');
    const enrollment = (id: string, student: Record<string, unknown>) => ({
      id,
      studentId: 1,
      startDate: null,
      createdAt: closedAt,
      student: {
        firstName: 'Ism',
        lastName: 'Familiya',
        status: 'ACTIVE',
        deletedAt: null,
        statusChangeReason: null,
        statusChangedAt: null,
        discountPercent: 0,
        enrollments: [],
        ...student,
      },
    });

    it('counts who reopening would bring back and who stays out', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: '#014',
        branchId: 1,
        statusEnum: 'COMPLETED',
        statusChangedAt: closedAt,
        startDate: null,
        exactDays: [],
        course: { price: 1, paymentModel: 'LESSON_PACK' },
      });
      prisma.enrollment.findMany.mockResolvedValue([
        enrollment('a', {}),
        enrollment('b', {}),
        enrollment('f', { status: 'FROZEN' }),
        enrollment('o', { enrollments: [{ id: 'elsewhere' }] }),
        enrollment('x', { status: 'EXPELLED' }),
      ]);

      await expect(
        service.getReopenPreview('group-1', 1001, 1, ['CEO']),
      ).resolves.toEqual({
        returning: { active: 2, frozen: 1 },
        notReturning: { inOtherGroup: 1, left: 1 },
      });
    });

    it('404s a missing or deleted group', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getReopenPreview('missing', 1001, 1, ['CEO']),
      ).rejects.toThrow(NotFoundException);
    });
  });
```

2. `groups-read.branch.spec.ts`: add `getReopenPreview: jest.fn().mockResolvedValue({ returning: { active: 0, frozen: 0 }, notReturning: { inOtherGroup: 0, left: 0 } }),` to `read`, and after `describe('the delete preview', …)`:

```ts
  describe('the reopen preview', () => {
    it('refuses a director of another branch', async () => {
      await expect(
        service.getReopenPreview(GROUP, 1001, 7, ['Branch Director']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(read.getReopenPreview).not.toHaveBeenCalled();
    });

    it('lets an admin of the group branch through', async () => {
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Administrator' } }],
      });
      await service.getReopenPreview(GROUP, 1001, 8, ['Administrator']);
      expect(read.getReopenPreview).toHaveBeenCalledWith(GROUP, 1001);
    });
  });
```

3. `groups.controller.spec.ts`: add `getReopenPreview: jest.fn().mockResolvedValue({}),` to `mockService` and, after `describe('getDeletePreview()', …)`:

```ts
  describe('getReopenPreview()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getReopenPreview);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow Administrator to preview a reopening', () => {
      const ctx = mockExecutionContext(controller.getReopenPreview, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from previewing a reopening', () => {
      const ctx = mockExecutionContext(controller.getReopenPreview, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/groups src/common/auth/branch-route-policy.spec.ts`
Expected: FAIL — `getReopenPreview` does not exist.

- [ ] **Step 3: Implement**

1. `groups-read.service.ts` — imports `planGroupReopen, type ReopenOutcome` from `'../common/status/group-reopen-plan'`; add above the class:

```ts
/** What `GET /groups/:id/reopen-preview` answers. */
export interface GroupReopenPreview {
  returning: { active: number; frozen: number };
  notReturning: { inOtherGroup: number; left: number };
}
```

and after `getDeletePreview`:

```ts
  /**
   * Who reopening a closed group would bring back, counted with the plan the
   * reopening itself follows (`planGroupReopen`), so the number the admin
   * confirms is the number that comes back.
   */
  async getReopenPreview(
    groupId: string,
    companyId: number,
  ): Promise<GroupReopenPreview> {
    const plan = await planGroupReopen(this.prisma, groupId, companyId);
    if (!plan) {
      throw new NotFoundException(`Guruh #${groupId} topilmadi`);
    }
    const count = (outcome: ReopenOutcome) =>
      plan.candidates.filter((c) => c.outcome === outcome).length;
    return {
      returning: { active: count('ACTIVE'), frozen: count('FROZEN') },
      notReturning: { inOtherGroup: count('IN_OTHER_GROUP'), left: count('LEFT') },
    };
  }
```

2. `groups.service.ts`, after `getDeletePreview`:

```ts
  /**
   * Who reopening a completed or cancelled group would bring back, asked by
   * the status dialog before the admin confirms. Behind the same branch
   * check as the status change itself.
   */
  async getReopenPreview(
    groupId: string,
    companyId: number,
    userId?: number,
    roles: string[] = [],
  ) {
    await assertCallerMayTouchGroup(
      this.prisma,
      userId as number,
      roles,
      groupId,
      "Bu guruh boshqa filialga tegishli — uni qayta ochish huquqingiz yo'q",
    );
    return this.read.getReopenPreview(groupId, companyId);
  }
```

3. `groups.controller.ts`, after `getDeletePreview`:

```ts
  @Get(':id/reopen-preview')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getReopenPreview(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.groupsService.getReopenPreview(id, companyId, userId, roles);
  }
```

4. `branch-route-policy.ts`: in the block whose routes end with `'GET /groups/:id/delete-preview',`, add `'GET /groups/:id/reopen-preview',` after it, and extend that block's `reason` string: after `'the same check as \`DELETE /groups/:id\`.'` append `' ' + '\`GET /groups/:id/reopen-preview\` counts who reopening a closed group would bring back, behind the same check as \`PATCH /groups/:id/status\`.'` (keep the string concatenation style of the surrounding lines).

- [ ] **Step 4: Run them and see them pass**

Run: `cd server && npx jest src/groups src/common/auth/branch-route-policy.spec.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/groups/ server/src/common/auth/branch-route-policy.ts
git commit -m "Groups: preview who reopening a closed group brings back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The status dialog offers reopening and says who comes back (client)

**Files:**
- Modify: `client/src/lib/status-config.ts`
- Create: `client/src/components/groups/group-reopen-copy.ts`, `client/src/components/groups/group-reopen-copy.test.ts`, `client/src/components/groups/group-reopen-preview.tsx`
- Modify: `client/src/components/shared/change-status-dialog.tsx`

**Interfaces:**
- Consumes: `GET /groups/:id/reopen-preview` → `{ returning: { active, frozen }, notReturning: { inOtherGroup, left } }` (Task 11).
- Produces: `GroupReopenCounts` type, `returningLine(counts): string`, `notReturningLine(counts): string | null`, `<GroupReopenPreview groupId open />`.

- [ ] **Step 1: Write the failing tests** — `client/src/components/groups/group-reopen-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { notReturningLine, returningLine } from "./group-reopen-copy";

const counts = (active: number, frozen: number, inOtherGroup = 0, left = 0) => ({
  returning: { active, frozen },
  notReturning: { inOtherGroup, left },
});

describe("group reopen copy", () => {
  it("counts who comes back", () => {
    expect(returningLine(counts(18, 0))).toBe("18 ta o'quvchi qaytadi.");
  });

  it("says how many of them are frozen", () => {
    expect(returningLine(counts(16, 2))).toBe(
      "18 ta o'quvchi qaytadi (2 tasi muzlatilgan).",
    );
  });

  it("names a return of frozen students only", () => {
    expect(returningLine(counts(0, 3))).toBe(
      "3 ta muzlatilgan o'quvchi qaytadi.",
    );
  });

  it("says when nobody comes back", () => {
    expect(returningLine(counts(0, 0))).toBe("Guruhga hech kim qaytmaydi.");
  });

  it("names who stays out and why", () => {
    expect(notReturningLine(counts(18, 0, 2, 1))).toBe(
      "Qaytmaydi: 2 tasi boshqa guruhda o'qiyapti, 1 tasi o'qishni to'xtatgan.",
    );
    expect(notReturningLine(counts(18, 0, 2, 0))).toBe(
      "Qaytmaydi: 2 tasi boshqa guruhda o'qiyapti.",
    );
  });

  it("has no line when everyone comes back", () => {
    expect(notReturningLine(counts(18, 0))).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd client && npx vitest run src/components/groups/group-reopen-copy.test.ts`
Expected: FAIL — cannot find module `./group-reopen-copy`.

- [ ] **Step 3: Implement the copy** — `client/src/components/groups/group-reopen-copy.ts`:

```ts
/** What `GET /groups/:id/reopen-preview` reports. */
export interface GroupReopenCounts {
  returning: { active: number; frozen: number };
  notReturning: { inOtherGroup: number; left: number };
}

/** Who comes back when a completed or cancelled group reopens. */
export function returningLine({
  returning: { active, frozen },
}: GroupReopenCounts): string {
  const total = active + frozen;
  if (total === 0) return "Guruhga hech kim qaytmaydi.";
  if (active === 0) return `${frozen} ta muzlatilgan o'quvchi qaytadi.`;
  if (frozen === 0) return `${total} ta o'quvchi qaytadi.`;
  return `${total} ta o'quvchi qaytadi (${frozen} tasi muzlatilgan).`;
}

/** Who does not come back, and why; null when everyone does. */
export function notReturningLine({
  notReturning: { inOtherGroup, left },
}: GroupReopenCounts): string | null {
  const parts: string[] = [];
  if (inOtherGroup > 0) parts.push(`${inOtherGroup} tasi boshqa guruhda o'qiyapti`);
  if (left > 0) parts.push(`${left} tasi o'qishni to'xtatgan`);
  return parts.length > 0 ? `Qaytmaydi: ${parts.join(", ")}.` : null;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `cd client && npx vitest run src/components/groups/group-reopen-copy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: The preview component** — `client/src/components/groups/group-reopen-preview.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import {
  notReturningLine,
  returningLine,
  type GroupReopenCounts,
} from "./group-reopen-copy";

interface GroupReopenPreviewProps {
  groupId: string;
  open: boolean;
}

/**
 * Shown in the status dialog when a completed or cancelled group is set back
 * to "Faol": who comes back with it. Asked on every open (staleTime 0) — the
 * admin decides on these numbers.
 */
export function GroupReopenPreview({ groupId, open }: GroupReopenPreviewProps) {
  const preview = useQuery<GroupReopenCounts>({
    queryKey: ["group-reopen-preview", groupId],
    queryFn: () =>
      api
        .get<GroupReopenCounts>(`/groups/${groupId}/reopen-preview`)
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const counts = preview.isError ? undefined : preview.data;
  const stayOut = counts ? notReturningLine(counts) : null;

  return (
    <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
      <p className="font-medium">
        {"Guruh o'quvchilari bilan qayta ochiladi"}
      </p>
      {preview.isFetching ? (
        <div className="space-y-1.5" aria-busy="true">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : counts ? (
        <>
          <p>{returningLine(counts)}</p>
          {stayOut ? <p className="text-muted-foreground">{stayOut}</p> : null}
        </>
      ) : (
        <p className="text-muted-foreground">
          {
            "Guruh yopilganda unda bo'lgan o'quvchilar qaytadi; boshqa guruhda o'qiyotganlar qaytmaydi."
          }
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire it in**

1. `client/src/lib/status-config.ts`, in `groups`:

```ts
  groups: {
    FORMING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
    PAUSED: ["ACTIVE", "CANCELLED"],
    // A closed group reopens with the students it had when it closed (ADR-0040).
    COMPLETED: ["ACTIVE"],
    CANCELLED: ["ACTIVE"],
  },
```

2. `client/src/components/shared/change-status-dialog.tsx`: add `import { GroupReopenPreview } from "@/components/groups/group-reopen-preview";`; next to `const isFreezingStudent = …` add

```ts
  // A completed or cancelled group set back to "Faol" brings its students back.
  const isReopeningGroup =
    entityType === "groups" &&
    (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") &&
    selectedStatus === "ACTIVE";
```

and right before the `{/* Sabab */}` comment:

```tsx
              {isReopeningGroup && (
                <GroupReopenPreview groupId={String(entityId)} open={open} />
              )}
```

- [ ] **Step 7: Client verification**

Run: `cd client && npx prettier --write src/lib/status-config.ts src/components/groups/group-reopen-copy.ts src/components/groups/group-reopen-copy.test.ts src/components/groups/group-reopen-preview.tsx src/components/shared/change-status-dialog.tsx && npx tsc --noEmit && npx eslint src 2>&1 | tail -2 && npx vitest run 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | tail -3`
Expected: tsc clean; eslint 0 errors; all vitest files pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/status-config.ts client/src/components/groups/group-reopen-copy.ts client/src/components/groups/group-reopen-copy.test.ts client/src/components/groups/group-reopen-preview.tsx client/src/components/shared/change-status-dialog.tsx
git commit -m "Status dialog: reopen a closed group and say who comes back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ADR-0040, server/CLAUDE.md, full verification, PR 2

**Files:**
- Create: `docs/adr/0040-yopilgan-guruh-oquvchilari-bilan-qayta-ochiladi.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md`

- [ ] **Step 1: Confirm the number** — same check as Task 5 Step 1 for `0040`.

- [ ] **Step 2: Write the ADR** — `docs/adr/0040-yopilgan-guruh-oquvchilari-bilan-qayta-ochiladi.md`:

```markdown
# ADR-0040 — Yopilgan guruh o'quvchilari bilan qayta ochiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-26
**Bog'liq:** ADR-0036, ADR-0039, `server/src/common/status/group-reopen-plan.ts`, `server/src/common/status/group-reopen.service.ts`, `server/src/billing/monthly-charge.service.ts` (`chargeForReturn`)

## Kontekst

`COMPLETED` va `CANCELLED` guruh uchun oxirgi holat edi. Admin guruhni adashib
tugallasa yoki bekor qilsa, uni qaytarib bo'lmasdi: yangi guruh ochib,
o'quvchilarni qo'lda qo'shish, «Bitirgan» bo'lganlarni birma-bir qaytarish
kerak edi. CEO qarori (2026-09-26): ikkalasi ham o'quvchilari bilan qayta
ochilsin; shu orada boshqa guruhga o'tganlar qaytmasin.

O'chirilgan guruh esa arxivdan bo'sh tiklanadi (guruhni o'chirish tuzatishi).
Farqi: holat o'zgarishi yozilishlarni o'z belgisi bilan yopadi — sabab
`Cascade: Group #<id> → <holat>` va guruhning `statusChangedAt` idan keyingi
vaqt. Shu belgi bo'yicha kim yopilishda guruhda bo'lganini aniq topish mumkin.

## Qaror

1. Guruh `COMPLETED → ACTIVE` va `CANCELLED → ACTIVE` o'tadi, ADR-0039
   tranzaksiyasi ichida.
2. Qaytadiganlar — guruhning joriy yopilishi yopgan yozilishlar: o'chirilmagan,
   holati `COMPLETED` yoki `DROPPED`, sababi `groupClosingReason(guruh, holat)`,
   `statusChangedAt >= group.statusChangedAt` (guruhniki bo'sh bo'lsa, sabab
   yetarli). Sxema o'zgarmaydi.
3. O'quvchi bo'yicha: karta o'chirilgan, `EXPELLED`, `ARCHIVED`, `INACTIVE` yoki
   qo'lda «Bitirgan» — qaytmaydi; boshqa guruhda ochiq (ACTIVE/FROZEN)
   yozilishi bor — qaytmaydi; `FROZEN` — `FROZEN` bo'lib qaytadi; `ACTIVE` —
   `ACTIVE`; shu tugallash avtomatik bitirgan o'quvchi — `ACTIVE`, o'quvchi
   holati ham `ACTIVE` ga qaytadi.
4. Pul: kursi `MONTHLY`, `ACTIVE` bo'lib qaytgan yozilish — shu oy hisobi bor
   bo'lsa, ketishda muzlatib chiqarilgan darslar qayta yechiladi; yo'q yoki
   bekor qilingan bo'lsa, joriy oy hisobi qayta ochilgan kunning ertasidan
   yoziladi (`chargeForReturn`). `LESSON_PACK` va `FROZEN` — hech narsa:
   yopilishda qaytarilgan pul balansda turadi.
5. Filiali `ACTIVE` bo'lmagan yoki kursi `ARCHIVED` guruh qayta ochilmaydi.
6. Oyna oldindan ko'rsatadi (`GET /groups/:id/reopen-preview`) — xuddi shu reja
   (`planGroupReopen`) bilan sanaladi.

**Taqiqlanadi:**
- yopilish sababini `groupClosingReason` dan boshqa joyda yasash yoki uning
  matnini o'zgartirish: qayta ochish aynan shu matn bo'yicha qidiradi;
- yozilish o'tishlari xaritasini qayta ochish uchun kengaytirish: bu boshqa
  eshiklarni ham ochadi, qayta ochish esa yozilishni to'g'ridan-to'g'ri yozadi.

## Ko'rib chiqilgan muqobillar

- **Sxemaga yopilish havolasi (`closedByGroupStatusChangeId` yoki alohida
  jadval).** Aniqroq, lekin migratsiya va eski yopilishlar uchun to'ldirish
  kerak; belgi (sabab + vaqt) eski va yangi yopilishlarni bir xil qamraydi.
- **`EntityHistory` JSON ini o'qish.** Tarix — ko'rsatish uchun; uning
  kalitlariga mantiq bog'lash mo'rt.
- **Guruhning barcha `DROPPED`/`COMPLETED` yozilishlarini qaytarish.** Yopilishdan
  oldin chiqib ketganlar ham qaytib qolardi.
- **Yozilishni holat jurnalidagi avvalgi holatiga qaytarish.** O'quvchi holati
  yopilgandan keyin o'zgargan bo'lsa (muzlatildi, qaytdi), yozilish unga zid
  qolardi; o'quvchining hozirgi holati bilan qaytarish ziddiyatsiz.

## Oqibatlari

**Yutuq:** adashib yopilgan guruh bir bosishda, o'quvchilari va puli bilan
tiklanadi; kim qaytmasligi oldindan ko'rinadi.

**Narx:**
- Filial yopilishi yoki kurs arxivlanishi yopgan guruh qayta ochilsa, hech kim
  qaytmaydi (sabab boshqa); oldindan ko'rish «hech kim qaytmaydi» deydi.
- Telegram hisobotida qayta ochish qatori yo'q. Shu kuni tugallanib qayta
  ochilgan guruhning «bitirdi» qatorlari 20:00 hisobotida qolishi mumkin.
- Guruhning tugash sanasi o'zgarmaydi: o'tib ketgan bo'lsa, davomat uchun uni
  tahrirlash kerak.
- Ketganlar hisobotida (ADR-0035) 21 kun ichida qaytgan o'quvchi ketgan
  hisoblanmaydi; kechroq qaytgan esa ketib qaytgan sifatida ko'rinadi.
```

- [ ] **Step 3: Index row** — after the 0039 row in `docs/adr/README.md`:

```markdown
| [0040](0040-yopilgan-guruh-oquvchilari-bilan-qayta-ochiladi.md) | Yopilgan guruh o'quvchilari bilan qayta ochiladi | Qabul qilindi | 2026-09-26 |
```

- [ ] **Step 4: `server/CLAUDE.md`**

1. After the ADR-0039 bullet in "Soft Delete & Archive" add:

```markdown
- **A closed group reopens with its students (ADR-0040).** `COMPLETED → ACTIVE` and `CANCELLED → ACTIVE` run `GroupReopenService.reopen` inside the status change's transaction, BEFORE the group row is updated. `planGroupReopen` (`common/status/group-reopen-plan.ts`, also behind `GET /groups/:id/reopen-preview`) finds the enrollments the group's current closing closed by their mark — `statusChangeReason = groupClosingReason(group, status)` and `statusChangedAt >= group.statusChangedAt` — and brings each back as the student is now: FROZEN as FROZEN, ACTIVE as ACTIVE, a student this completion auto-graduated as ACTIVE (the graduation is undone). A deleted card, EXPELLED/ARCHIVED/INACTIVE, a hand-set GRADUATED or an open enrollment in another group keeps the student out. A MONTHLY return is charged by `MonthlyChargeService.chargeForReturn` (lessons after the reopening day). A group in a non-ACTIVE branch or under an ARCHIVED course cannot reopen. Never build the closing reason outside `groupClosingReason`.
```

2. In "Write Hooks (mandatory)" add after the cascade bullet:

```markdown
- `GroupReopenService.reopen()` — one ACTIVE or FROZEN state-log row per enrollment a reopening brings back, on the status change's transaction
```

3. In "Entity History" cross-entity examples, add after the `Group CANCELLED/COMPLETED, …` example:

```markdown
  - Group reopened → each returning enrollment gets `GURUHGA_QOSHILDI` in the **Student**'s history and `OQUVCHI_QOSHILDI` in the **Group**'s, both with `sabab: "Guruh qayta ochildi"`; an undone auto-graduation is a Student STATUS_CHANGE `GRADUATED → ACTIVE`
```

- [ ] **Step 5: Full verification**

Run: `cd server && npx prettier --write src/common/status src/billing/monthly-charge.service.ts src/billing/monthly-charge.service.spec.ts src/groups src/common/auth/branch-route-policy.ts && npm run typecheck && npx eslint src 2>&1 | tail -2 && npx jest --runInBand 2>&1 | grep -E "^FAIL|Tests:|Test Suites:"`
Then: `cd client && npx tsc --noEmit && npx eslint src 2>&1 | tail -2 && npx vitest run 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | tail -3`
Expected: all clean and green.

- [ ] **Step 6: Commit and open PR 2**

```bash
git add docs/adr/0040-yopilgan-guruh-oquvchilari-bilan-qayta-ochiladi.md docs/adr/README.md server/CLAUDE.md
git commit -m "ADR-0040: a closed group reopens with its students" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/group-reopen
gh pr create --repo AkhrorSoliev/daf-erp-system --base main --head feat/group-reopen --title "Reopen a completed or cancelled group with its students" --body-file <scratchpad>/pr2-body.md
```

The PR body (English, no production ids) opens with **"Depends on PR 1 (link) — merge it first; until then this diff also shows its commits."**, then: the rule (who comes back, who does not), the money rule, the guard, the preview and dialog, the limits from ADR-0040, verification numbers, deploy order (server, then client; no migration; not deployed), and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. After creating it, call the ccd_pr `get_status` tool and bind the PR if needed.
