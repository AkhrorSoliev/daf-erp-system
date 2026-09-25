# Group delete dialog: who leaves, and the reason kept — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The group delete dialog says how many students (active and frozen) the deletion takes out of the group, and the optional reason typed into it is sent and stored.

**Architecture:** One filter, `liveEnrollmentsOfGroup(groupId)`, defines what a deletion closes; `cascadeGroupDeletion` closes with it and a new read, `GET /groups/:id/delete-preview`, counts with it. `DELETE /groups/:id` accepts an optional `reason` body (`DeleteGroupDto`, the same DELETE-with-body shape as student and lead deletion); the group keeps it as its status-history reason, and every closed enrollment gets `groupDeletedReason(reason)` ("Guruh o'chirildi: <reason>"). The client moves the dialog into `group-delete-dialog.tsx`, which fetches the count on open.

**Tech Stack:** NestJS 11 (Express 5, global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`), Prisma, Jest in `server/`; Next.js 16.3.6 with React Compiler, TanStack Query (app default `staleTime` 5 min), vitest (node, `src/**/*.test.ts`), shadcn `AlertDialog` in `client/`.

**Spec:** `docs/superpowers/specs/2026-09-26-guruh-ochirish-oynasi-design.md`

**Base:** branch `claude/busy-napier-0e7e8d` = PR #561 (`fix/group-delete-closes-enrollments`, open, not merged) + latest `origin/main`.

## Global Constraints

- Deleting a group closes ACTIVE and FROZEN enrollments (PR #561). This plan does not change what closes, only who is told and what reason is written.
- Reason: optional, at most 500 characters, blank or whitespace = none. Group side default stays `"O'chirildi"`; enrollment side default stays `"Guruh o'chirildi"` (`GROUP_DELETED_REASON`, unchanged, still used by the repair script).
- The preview uses the same guard as the deletion: `@Roles('CEO', 'Branch Director', 'Administrator')` + `assertCallerMayTouchGroup`.
- UI text is Uzbek, Latin script only. New code comments, commit messages and the PR are English.
- Destructive confirm buttons use `variant="destructive"`, never color classes. Do not use `amber-*` classes (they render colorless in the admin panel).
- The GitHub repo is PUBLIC: no production ids, names or phone numbers in code, comments, docs, commits or the PR.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Baselines before this work: server `npx eslint src` 0 errors / 14347 warnings; client `npx eslint src` 0 errors / 84 warnings. Errors must stay 0.
- Do not deploy. Deploys are manual; server first, then client.

---

### Task 1: One filter and one reason for a group deletion (server)

**Files:**
- Modify: `server/src/common/status/status-cascade.service.ts` (below `GROUP_DELETED_REASON`, and `cascadeGroupDeletion`)
- Test: `server/src/common/status/status-cascade.service.spec.ts`

**Interfaces:**
- Produces: `liveEnrollmentsOfGroup(groupId: string): Prisma.EnrollmentWhereInput`, exported from `status-cascade.service.ts`, and a module-private `groupDeletedReason(note?: string): string`. `cascadeGroupDeletion(tx, { groupId, groupName, companyId?, userId, at, note? })` — `note` is the admin's reason, already trimmed, `undefined` for none. Returns `{ count }` as before.

The existing `cascadeGroupDeletion` tests keep covering the no-reason path (`"Guruh o'chirildi"` everywhere) and, with hand-built rows, which enrollments close. The new test covers the reason path. No test asserts `liveEnrollmentsOfGroup` against itself: Task 3 checks the preview's filter against a hand-written literal.

- [ ] **Step 1: Write the failing test**

Inside `describe('cascadeGroupDeletion', ...)` in `status-cascade.service.spec.ts`, after the test `'changes nothing for enrollments it already closed when run again'`, add:

```ts
    it("adds the admin's reason after the fixed words wherever the removal is recorded", async () => {
      const { tx, byId, stateLog } = groupWithEveryKindOfEnrollment();
      const why = "Guruh o'chirildi: Guruh yig'ilmadi";

      await service.cascadeGroupDeletion(tx as any, {
        ...params,
        note: "Guruh yig'ilmadi",
      });

      expect(byId('enr-active').statusChangeReason).toBe(why);
      expect(byId('enr-frozen').statusChangeReason).toBe(why);
      expect(stateLog.map((r) => r.reason)).toEqual([why, why]);
      const sabab = entityHistoryService.recordDelete.mock.calls.map(
        ([p]: [{ oldValues: { sabab: string } }]) => p.oldValues.sabab,
      );
      expect(sabab).toEqual([why, why, why, why]);
      const refundReasons =
        enrollmentBillingService.refundPrepaidToBalance.mock.calls.map(
          ([, p]: [unknown, { reason?: string }]) => p.reason,
        );
      expect(refundReasons).toEqual([
        `Qoldiq oldindan to'langan darslar balansga qaytarildi (${why})`,
        `Qoldiq oldindan to'langan darslar balansga qaytarildi (${why})`,
      ]);
      const departureReasons =
        monthlyChargeService.reverseChargeForDeparture.mock.calls.map(
          ([, p]: [unknown, { reason: string }]) => p.reason,
        );
      expect(departureReasons).toEqual([why, why]);
    });
```

Break it catches: the note dropped on any one of the five places the removal is recorded.

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `npx jest src/common/status/status-cascade.service.spec.ts`
Expected: FAIL — the new test sees `"Guruh o'chirildi"` without the note (the `note` param is ignored).

- [ ] **Step 3: Implement**

In `status-cascade.service.ts`, directly below `export const GROUP_DELETED_REASON = "Guruh o'chirildi";` add:

```ts
/**
 * The reason an enrolment closed by a group deletion carries: the fixed
 * words, then what the admin typed in the delete dialog, if anything. It is
 * what the student's closed-groups list, their history, the departed-students
 * report and the refund's ledger row show.
 */
function groupDeletedReason(note?: string): string {
  return note ? `${GROUP_DELETED_REASON}: ${note}` : GROUP_DELETED_REASON;
}

/**
 * The enrolments deleting a group closes: its live ones, ACTIVE and FROZEN.
 * The delete dialog counts with this same filter
 * (`GroupsReadService.getDeletePreview`), so the number the admin confirms
 * is the number that closes.
 */
export function liveEnrollmentsOfGroup(
  groupId: string,
): Prisma.EnrollmentWhereInput {
  return {
    groupId,
    deletedAt: null,
    status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN] },
  };
}
```

In `cascadeGroupDeletion`:
- add to the `params` type, after `at: Date;`:

```ts
      /** What the admin typed in the delete dialog, trimmed; none if absent. */
      note?: string;
```

- replace the `const filter: Prisma.EnrollmentWhereInput = { ... };` block with:

```ts
    const filter = liveEnrollmentsOfGroup(params.groupId);
    const reason = groupDeletedReason(params.note);
```

- replace each of the four remaining uses of `GROUP_DELETED_REASON` inside the method (two `sabab:` values, the third argument of `cascadeEnrollmentStatus`, and `statusChangeReason:`) with `reason`.
- in the method's doc comment, after "and the removal is written to each student's history and to the group's.", add: "The admin's reason, if any, follows the fixed words (`groupDeletedReason`)."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/common/status/status-cascade.service.spec.ts scripts/lib/deleted-group-enrollment-repair.spec.ts`
Expected: PASS (the repair script still imports `GROUP_DELETED_REASON` and is unaffected).

- [ ] **Step 5: Commit**

```bash
git add server/src/common/status/status-cascade.service.ts server/src/common/status/status-cascade.service.spec.ts
git commit -m "Give a group deletion one filter and a reason that can carry the admin's words" -m "liveEnrollmentsOfGroup is what cascadeGroupDeletion closes, exported so the delete dialog can count with the same filter. groupDeletedReason appends the admin's reason to \"Guruh o'chirildi\" on every enrollment the deletion closes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `DELETE /groups/:id` keeps the admin's reason (server)

**Files:**
- Create: `server/src/groups/dto/delete-group.dto.ts`
- Create: `server/src/groups/dto/delete-group.dto.spec.ts`
- Modify: `server/src/groups/groups-write.service.ts` (`delete`)
- Modify: `server/src/groups/groups.service.ts` (`delete`)
- Modify: `server/src/groups/groups.controller.ts` (`delete`, imports)
- Test: `server/src/groups/groups.service.spec.ts` (`describe('delete')`), `server/src/groups/groups.controller.spec.ts` (`describe('delete()')`)

**Interfaces:**
- Consumes: `cascadeGroupDeletion(tx, { ..., note })` from Task 1.
- Produces: `DeleteGroupDto { reason?: string }`; `GroupsService.delete(id, userId, companyId, reason?)` and `GroupsWriteService.delete(id, userId, companyId, reason?)`; response `{ message }` where message is `"Guruh o'chirildi, N ta o'quvchi guruhdan chiqarildi"` when N > 0, else `"Guruh muvaffaqiyatli o'chirildi"`.

- [ ] **Step 1: Write the failing tests**

Create `server/src/groups/dto/delete-group.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteGroupDto } from './delete-group.dto';

// Same options as the global ValidationPipe in main.ts.
async function rejected(body: object) {
  const dto = plainToInstance(DeleteGroupDto, body);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('DeleteGroupDto', () => {
  // The dialog sends no body when the reason is left empty, and a client
  // from before the reason existed never sends one.
  it('accepts a deletion without a reason', async () => {
    expect(await rejected({})).toEqual([]);
  });

  it('accepts a reason of up to 500 characters', async () => {
    expect(await rejected({ reason: "Guruh yig'ilmadi" })).toEqual([]);
    expect(await rejected({ reason: 'x'.repeat(500) })).toEqual([]);
  });

  it('refuses a longer reason, a non-string one and unknown fields', async () => {
    expect(await rejected({ reason: 'x'.repeat(501) })).toEqual(['reason']);
    expect(await rejected({ reason: 42 })).toEqual(['reason']);
    expect(await rejected({ sabab: 'x' })).toEqual(['sabab']);
  });
});
```

In `groups.service.spec.ts`, inside `describe('delete', ...)`, after the test `'throws NotFoundException for a missing group and changes nothing'`, add:

```ts
    it("writes the admin's reason on the group and hands it to the cascade", async () => {
      await service.delete('group-1', 1, 1001, "  Guruh yig'ilmadi  ");

      expect(statusCascadeService.cascadeGroupDeletion).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ note: "Guruh yig'ilmadi" }),
      );
      expect(tx.statusHistory.create.mock.calls[0][0].data.reason).toBe(
        "Guruh yig'ilmadi",
      );
      expect(tx.group.update.mock.calls[0][0].data.statusChangeReason).toBe(
        "Guruh yig'ilmadi",
      );
      expect(entityHistoryService.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          oldValues: expect.objectContaining({
            deletionReason: "Guruh yig'ilmadi",
          }),
        }),
      );
    });

    it('treats a blank reason as none', async () => {
      await service.delete('group-1', 1, 1001, '   ');

      expect(
        statusCascadeService.cascadeGroupDeletion.mock.calls[0][1].note,
      ).toBeUndefined();
      expect(tx.statusHistory.create.mock.calls[0][0].data.reason).toBe(
        "O'chirildi",
      );
      expect(tx.group.update.mock.calls[0][0].data.statusChangeReason).toBe(
        "O'chirildi",
      );
      expect(
        entityHistoryService.recordDelete.mock.calls[0][0].oldValues,
      ).not.toHaveProperty('deletionReason');
    });

    it('says how many students the deletion took out of the group', async () => {
      statusCascadeService.cascadeGroupDeletion.mockResolvedValue({ count: 3 });

      await expect(service.delete('group-1', 1, 1001)).resolves.toEqual({
        message: "Guruh o'chirildi, 3 ta o'quvchi guruhdan chiqarildi",
      });
    });

    it('keeps the old message for a group with nobody in it', async () => {
      await expect(service.delete('group-1', 1, 1001)).resolves.toEqual({
        message: "Guruh muvaffaqiyatli o'chirildi",
      });
    });
```

In `groups.controller.spec.ts`, inside `describe('delete()', ...)`, after `'should deny Teacher from deleting'`, add:

```ts
    it('hands the reason from the body to the service', async () => {
      await controller.delete('group-1', { reason: "Guruh yig'ilmadi" }, 1, 1001);
      expect(mockService.delete).toHaveBeenCalledWith(
        'group-1',
        1,
        1001,
        "Guruh yig'ilmadi",
      );
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/groups/dto/delete-group.dto.spec.ts src/groups/groups.service.spec.ts src/groups/groups.controller.spec.ts`
Expected: FAIL — `Cannot find module './delete-group.dto'`; the service tests see `"O'chirildi"` instead of the reason and the old message; the controller test sees the reason missing from the call.

- [ ] **Step 3: Implement**

Create `server/src/groups/dto/delete-group.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Why a group is being deleted. Optional, like the reason on a group status
 * change. It becomes the group's status-history reason and follows
 * "Guruh o'chirildi: " on every enrolment the deletion closes.
 */
export class DeleteGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

In `groups-write.service.ts`, replace the whole `delete` method (doc comment included) with:

```ts
  /**
   * Deleting a group archives it and closes every live enrolment in it
   * (ACTIVE and FROZEN → DROPPED, unused money back to the balance) in ONE
   * transaction. Archiving the group alone used to leave its students
   * enrolled in a group that no longer existed.
   *
   * `reason` is what the admin typed in the delete dialog; blank means none.
   * It becomes the group's status-history reason and follows
   * "Guruh o'chirildi: " on every enrolment the deletion closes.
   */
  async delete(
    id: string,
    userId: number,
    companyId: number,
    reason?: string,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }
    // Deleting a group closes every live enrolment in it and returns their
    // unused money to the balance — done to another branch's group, that is
    // their students and their ledger.
    await assertCallerMayTouchGroup(this.prisma, userId, NO_TEACHER_PATH, id);

    const note = reason?.trim() || undefined;
    // One instant for the group's deletion and its students' departure, so
    // the enrolment state log closes exactly at `group.deletedAt`.
    const deletedAt = new Date();
    const removed = await this.prisma.$transaction(
      async (tx) => {
        const { count } = await this.statusCascadeService.cascadeGroupDeletion(
          tx,
          {
            groupId: id,
            groupName: group.name,
            companyId: group.companyId ?? undefined,
            userId,
            at: deletedAt,
            note,
          },
        );

        // Archive bypasses normal status transition validation
        await tx.statusHistory.create({
          data: {
            entityType: 'Group',
            entityId: id,
            fromStatus: group.statusEnum,
            toStatus: GroupStatus.ARCHIVED,
            reason: note ?? "O'chirildi",
            changedById: userId,
            companyId: group.companyId ?? undefined,
          },
        });

        await this.entityHistoryService.recordDelete({
          entityType: 'Group',
          entityId: id,
          // `deletionReason`, as a student deletion names it.
          oldValues: note ? { ...group, deletionReason: note } : group,
          changedById: userId,
          companyId: group.companyId ?? undefined,
          tx,
        });

        await tx.group.update({
          where: { id },
          data: {
            statusEnum: GroupStatus.ARCHIVED,
            isActive: false,
            deletedAt,
            deletedById: userId,
            statusChangedAt: deletedAt,
            statusChangedById: userId,
            statusChangeReason: note ?? "O'chirildi",
          },
        });

        return count;
      },
      {
        // Same budget as saving a full roster's attendance: per student a
        // balance lock, a refund and history rows, serially, on Neon.
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15_000,
        timeout: 60_000,
      },
    );

    return {
      message:
        removed > 0
          ? `Guruh o'chirildi, ${removed} ta o'quvchi guruhdan chiqarildi`
          : "Guruh muvaffaqiyatli o'chirildi",
    };
  }
```

In `groups.service.ts`, replace the `delete` facade with:

```ts
  delete(id: string, userId: number, companyId: number, reason?: string) {
    return this.write.delete(id, userId, companyId, reason);
  }
```

In `groups.controller.ts`, add below `import { ChangeGroupStatusDto } from './dto/change-group-status.dto';`:

```ts
import { DeleteGroupDto } from './dto/delete-group.dto';
```

and replace the `delete` handler with:

```ts
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(
    @Param('id') id: string,
    // Optional. A request with no body still validates: the global
    // ValidationPipe turns a missing body into an empty DTO.
    @Body() dto: DeleteGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.delete(id, userId, companyId, dto.reason);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/groups src/common/status`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/groups/dto/delete-group.dto.ts server/src/groups/dto/delete-group.dto.spec.ts server/src/groups/groups-write.service.ts server/src/groups/groups.service.ts server/src/groups/groups.controller.ts server/src/groups/groups.service.spec.ts server/src/groups/groups.controller.spec.ts
git commit -m "Keep the reason typed into the group delete dialog" -m "DELETE /groups/:id takes an optional reason (at most 500 characters, blank = none), the same DELETE-with-body shape as student and lead deletion. The group keeps it as its status-history reason; every enrollment the deletion closes gets \"Guruh o'chirildi: <reason>\". A request without a body still works. The response says how many students left the group." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `GET /groups/:id/delete-preview` (server)

**Files:**
- Modify: `server/src/groups/groups-read.service.ts` (imports, new method after `findStudentsByGroupId`)
- Modify: `server/src/groups/groups.service.ts` (new facade method after `getStatusHistory`)
- Modify: `server/src/groups/groups.controller.ts` (new handler after `getStatusHistory`)
- Modify: `server/src/common/auth/branch-route-policy.ts` (roster/status-history entry)
- Modify: `server/CLAUDE.md` (after the "Deleting a group closes its enrollments." bullet)
- Test: `server/src/groups/groups.service.spec.ts`, `server/src/groups/groups-read.branch.spec.ts`, `server/src/groups/groups.controller.spec.ts`; existing `server/src/common/auth/branch-route-policy.spec.ts` guards the manifest.

**Interfaces:**
- Consumes: `liveEnrollmentsOfGroup` from Task 1.
- Produces: `GET /api/groups/:id/delete-preview` → `{ active: number; frozen: number }`. `GroupsReadService.getDeletePreview(groupId, companyId)`, `GroupsService.getDeletePreview(groupId, companyId, userId?, roles = [])`, `GroupsController.getDeletePreview(id, companyId, userId, roles)`.

- [ ] **Step 1: Write the failing tests**

In `groups.service.spec.ts`:
- in the `beforeEach` prisma mock, replace `enrollment: { findMany: jest.fn().mockResolvedValue([]) },` with:

```ts
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
```

- after the closing `});` of `describe('delete', ...)`, add:

```ts
  describe('getDeletePreview', () => {
    it('counts the live enrollments by status, active and frozen alike', async () => {
      prisma.enrollment.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: { _all: 5 } },
        { status: 'FROZEN', _count: { _all: 2 } },
      ]);

      await expect(
        service.getDeletePreview('group-1', 1001, 1, ['CEO']),
      ).resolves.toEqual({ active: 5, frozen: 2 });
      // What the deletion closes (see cascadeGroupDeletion): the group's
      // unarchived ACTIVE and FROZEN enrollments. Counting ACTIVE alone is
      // the list's studentCount, the number that hid the frozen students.
      expect(prisma.enrollment.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: {
          groupId: 'group-1',
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        _count: { _all: true },
      });
    });

    it('reports zeros for a group with nobody in it', async () => {
      await expect(
        service.getDeletePreview('group-1', 1001, 1, ['CEO']),
      ).resolves.toEqual({ active: 0, frozen: 0 });
    });

    it('404s a missing or already deleted group', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getDeletePreview('missing', 1001, 1, ['CEO']),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.enrollment.groupBy).not.toHaveBeenCalled();
    });
  });
```

In `groups-read.branch.spec.ts`:
- in the `read` mock, add `getDeletePreview: jest.fn().mockResolvedValue({ active: 0, frozen: 0 }),`;
- after the closing `});` of `describe('the status trail', ...)`, add:

```ts
  describe('the delete preview', () => {
    it('refuses a director of another branch', async () => {
      await expect(
        service.getDeletePreview(GROUP, 1001, 7, ['Branch Director']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(read.getDeletePreview).not.toHaveBeenCalled();
    });

    it('lets an admin of the group branch through', async () => {
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Administrator' } }],
      });
      await service.getDeletePreview(GROUP, 1001, 8, ['Administrator']);
      expect(read.getDeletePreview).toHaveBeenCalledWith(GROUP, 1001);
    });
  });
```

In `groups.controller.spec.ts`:
- in `mockService`, add `getDeletePreview: jest.fn().mockResolvedValue({ active: 0, frozen: 0 }),`;
- after the closing `});` of `describe('delete()', ...)`, add:

```ts
  describe('getDeletePreview()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getDeletePreview,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow Administrator to preview a deletion', () => {
      const ctx = mockExecutionContext(controller.getDeletePreview, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from previewing a deletion', () => {
      const ctx = mockExecutionContext(controller.getDeletePreview, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from previewing a deletion', () => {
      const ctx = mockExecutionContext(controller.getDeletePreview, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/groups src/common/auth/branch-route-policy.spec.ts`
Expected: FAIL — `service.getDeletePreview is not a function`, `controller.getDeletePreview` undefined.

- [ ] **Step 3: Implement**

In `groups-read.service.ts`:
- change `import { Prisma } from '@prisma/client';` to `import { EnrollmentStatus, Prisma } from '@prisma/client';`
- add below the imports: `import { liveEnrollmentsOfGroup } from '../common/status/status-cascade.service';`
- add after `findStudentsByGroupId`:

```ts
  /**
   * What deleting this group would do to its students: how many live
   * enrolments the deletion closes, by status. Counted with the deletion's
   * own filter, so the dialog's number is the deletion's. The list's
   * `studentCount` counts ACTIVE only and cannot answer this — the students
   * left behind by earlier deletions were all FROZEN.
   */
  async getDeletePreview(groupId: string, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, companyId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException(`Guruh #${groupId} topilmadi`);
    }

    const byStatus = await this.prisma.enrollment.groupBy({
      by: ['status'],
      where: liveEnrollmentsOfGroup(groupId),
      _count: { _all: true },
    });
    const count = (status: EnrollmentStatus) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      active: count(EnrollmentStatus.ACTIVE),
      frozen: count(EnrollmentStatus.FROZEN),
    };
  }
```

In `groups.service.ts`, add after `getStatusHistory`:

```ts
  /**
   * How many students deleting the group would take out of it, asked by the
   * delete dialog before the admin confirms. Behind the same branch check as
   * the deletion itself.
   */
  async getDeletePreview(
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
      "Bu guruh boshqa filialga tegishli — uni o'chirish huquqingiz yo'q",
    );
    return this.read.getDeletePreview(groupId, companyId);
  }
```

In `groups.controller.ts`, add after the `getStatusHistory` handler:

```ts
  @Get(':id/delete-preview')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getDeletePreview(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.groupsService.getDeletePreview(id, companyId, userId, roles);
  }
```

In `branch-route-policy.ts`, in the entry whose routes end with `'GET /groups/:id/students'` and `'GET /groups/:id/status-history'`:
- replace the reason's last line `'teacher, branch for everyone else.',` with:

```ts
      'teacher, branch for everyone else. `GET /groups/:id/delete-preview` ' +
      'counts the students deleting a group would take out of it, behind ' +
      'the same check as `DELETE /groups/:id`.',
```

- add `'GET /groups/:id/delete-preview',` after `'GET /groups/:id/status-history',`.

In `server/CLAUDE.md`, directly after the bullet that starts with `- **Deleting a group closes its enrollments.**`, add:

```markdown
- **The delete dialog shows what a deletion takes with it.** `GET /groups/:id/delete-preview` returns `{ active, frozen }`, counted with `liveEnrollmentsOfGroup` (`common/status/status-cascade.service.ts`), the filter `cascadeGroupDeletion` closes with, so the number the admin confirms is the number that closes. The groups list's `studentCount` counts ACTIVE only and cannot answer it: the students stranded by earlier deletions were all FROZEN. `DELETE /groups/:id` takes an optional `reason` (`DeleteGroupDto`, at most 500 characters, blank = none): the group's `StatusHistory.reason` and `statusChangeReason` (default "O'chirildi") and its DELETE history row's `deletionReason`; every enrollment the deletion closes carries `groupDeletedReason(reason)` ("Guruh o'chirildi: <reason>") in its `statusChangeReason`, state-log row, history `sabab` and refund reasons. The response message says how many students left the group.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/groups src/common/status src/common/auth/branch-route-policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/groups/groups-read.service.ts server/src/groups/groups.service.ts server/src/groups/groups.controller.ts server/src/common/auth/branch-route-policy.ts server/CLAUDE.md server/src/groups/groups.service.spec.ts server/src/groups/groups-read.branch.spec.ts server/src/groups/groups.controller.spec.ts
git commit -m "Count the students a group deletion would take out of the group" -m "GET /groups/:id/delete-preview returns the live enrollments by status (ACTIVE, FROZEN), counted with liveEnrollmentsOfGroup, the filter the deletion closes with. The list's studentCount counts ACTIVE only, and the students stranded by earlier deletions were all frozen. Same roles and branch check as DELETE /groups/:id." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The count line (client)

**Files:**
- Create: `client/src/components/groups/group-delete-copy.ts`
- Test: `client/src/components/groups/group-delete-copy.test.ts`

**Interfaces:**
- Consumes: the response shape of `GET /groups/:id/delete-preview` from Task 3.
- Produces: `interface GroupDeletePreview { active: number; frozen: number }` and `liveStudentsLine(preview: GroupDeletePreview): string | null`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/groups/group-delete-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { liveStudentsLine } from "./group-delete-copy";

describe("group delete dialog count line", () => {
  it("counts active students", () => {
    expect(liveStudentsLine({ active: 5, frozen: 0 })).toBe(
      "Guruhda hali 5 ta o'quvchi bor.",
    );
  });

  it("counts frozen students too, and says how many are frozen", () => {
    expect(liveStudentsLine({ active: 5, frozen: 2 })).toBe(
      "Guruhda hali 7 ta o'quvchi bor (2 tasi muzlatilgan).",
    );
  });

  it("names a group that holds only frozen students", () => {
    // The groups table shows 0 students for this group.
    expect(liveStudentsLine({ active: 0, frozen: 3 })).toBe(
      "Guruhda hali 3 ta muzlatilgan o'quvchi bor.",
    );
  });

  it("has no count line for an empty group", () => {
    expect(liveStudentsLine({ active: 0, frozen: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `client/`): `npx vitest run src/components/groups/group-delete-copy.test.ts`
Expected: FAIL — cannot resolve `./group-delete-copy`.

- [ ] **Step 3: Implement**

Create `client/src/components/groups/group-delete-copy.ts`:

```ts
/**
 * What deleting a group would do to its students, as
 * `GET /groups/:id/delete-preview` reports it: live enrollments by status.
 */
export interface GroupDeletePreview {
  active: number;
  frozen: number;
}

/**
 * The delete dialog's count line, or null for a group with nobody in it.
 *
 * Frozen students are named because the groups table counts ACTIVE students
 * only, and a deletion takes the frozen ones out too — the students left
 * behind by earlier deletions were all frozen.
 */
export function liveStudentsLine({
  active,
  frozen,
}: GroupDeletePreview): string | null {
  const total = active + frozen;
  if (total === 0) return null;
  if (active === 0) return `Guruhda hali ${frozen} ta muzlatilgan o'quvchi bor.`;
  if (frozen === 0) return `Guruhda hali ${total} ta o'quvchi bor.`;
  return `Guruhda hali ${total} ta o'quvchi bor (${frozen} tasi muzlatilgan).`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/groups/group-delete-copy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/groups/group-delete-copy.ts client/src/components/groups/group-delete-copy.test.ts
git commit -m "Word the group delete dialog's count of students" -m "Frozen students are named: the groups table counts active students only, and a deletion takes the frozen ones out too." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The dialog (client)

**Files:**
- Create: `client/src/components/groups/group-delete-dialog.tsx`
- Modify: `client/src/components/groups/group-row-actions.tsx` (whole file)
- Modify: `client/CLAUDE.md` ("Confirmation Dialogs (Destructive Actions)" section, after its "Reference implementations" bullet)

**Interfaces:**
- Consumes: `GroupDeletePreview`, `liveStudentsLine` (Task 4); `GET /groups/:id/delete-preview` (Task 3); `DELETE /groups/:id` with optional body `{ reason }` returning `{ message }` (Task 2).
- Produces: `GroupDeleteDialog({ group: { id: string; name: string }, open: boolean, onOpenChange: (open: boolean) => void, onDeleted?: (id: string) => void })`.

This task is UI; its automated check is lint, types, the vitest suite and the build. The rendered result is checked in Task 6.

- [ ] **Step 1: Create the dialog**

Create `client/src/components/groups/group-delete-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { liveStudentsLine, type GroupDeletePreview } from "./group-delete-copy";

interface GroupDeleteDialogProps {
  group: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (id: string) => void;
}

const WARNING_BOX =
  "space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200";

/**
 * Deleting a group takes its students out of it: every active and frozen
 * enrollment closes, unused lessons go back to the balance, and restoring the
 * group from the archive brings it back empty. The dialog says so, with the
 * number of students, before the admin confirms.
 */
export function GroupDeleteDialog({
  group,
  open,
  onOpenChange,
  onDeleted,
}: GroupDeleteDialogProps) {
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Asked on every open (staleTime 0 overrides the app's 5-minute default):
  // the admin decides on this number, and the row it would otherwise come
  // from counts active students only.
  const preview = useQuery<GroupDeletePreview>({
    queryKey: ["group-delete-preview", group.id],
    queryFn: () =>
      api
        .get<GroupDeletePreview>(`/groups/${group.id}/delete-preview`)
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const counting = preview.isFetching;
  // Unknown after a failed request: the warning then goes without a number.
  const counts = preview.isError ? undefined : preview.data;
  const line = counts ? liveStudentsLine(counts) : null;
  const empty = !counting && counts !== undefined && line === null;

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    if (!next) setReason("");
    onOpenChange(next);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const note = reason.trim();
    try {
      const { data } = await api.delete<{ message?: string }>(
        `/groups/${group.id}`,
        note ? { data: { reason: note } } : undefined,
      );
      setDeleting(false);
      setReason("");
      onOpenChange(false);
      toast.success(data?.message ?? "Guruh o'chirildi");
      onDeleted?.(group.id);
    } catch (error) {
      setDeleting(false);
      toast.error(getErrorMessage(error, "O'chirishda xatolik yuz berdi"));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            «{group.name}» guruhini o&apos;chirasizmi?
          </AlertDialogTitle>
          {empty && (
            <AlertDialogDescription>
              Guruhda o&apos;quvchi yo&apos;q. Guruh arxivga o&apos;tkaziladi.
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {counting && (
          <div className="space-y-2" aria-busy="true">
            <AlertDialogDescription className="sr-only">
              Guruhdagi o&apos;quvchilar soni yuklanmoqda
            </AlertDialogDescription>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {!counting && !empty && (
          <div className="space-y-3">
            <div className={WARNING_BOX}>
              <AlertDialogDescription className="font-medium text-red-900 dark:text-red-200">
                {line ??
                  "Guruhdagi barcha o'quvchilar, muzlatilganlar ham, guruhdan chiqariladi."}
              </AlertDialogDescription>
              <p>
                {line
                  ? "Ular guruhdan chiqariladi, ishlatilmagan darslari puli balansiga qaytadi."
                  : "Ishlatilmagan darslari puli balansiga qaytadi."}
              </p>
              <p>Guruhni arxivdan tiklasangiz ham o&apos;quvchilar qaytmaydi.</p>
            </div>
            <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                O&apos;quvchilar boshqa guruhda davom etishi kerak bo&apos;lsa,
                avval ularni o&apos;quvchi sahifasidan boshqa guruhga
                o&apos;tkazing.
              </span>
            </p>
          </div>
        )}

        <Textarea
          placeholder="Sabab yozing (ixtiyoriy)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          className="resize-none"
          disabled={deleting}
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting || counting}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            {deleting ? "O'chirilmoqda..." : "O'chirish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Use it from the row actions**

Replace `client/src/components/groups/group-row-actions.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { StatusHistoryDialog } from "@/components/shared/status-history-dialog";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { GroupDeleteDialog } from "./group-delete-dialog";

interface GroupRowActionsProps {
  group: GroupData;
  onDeleted?: (id: string) => void;
  onStatusChanged?: (id: string, newStatus: string) => void;
}

export function GroupRowActions({ group, onDeleted, onStatusChanged }: GroupRowActionsProps) {
  const { openDrawer } = useEditGroup();
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Amallar</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Amallar</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => openDrawer(group)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowStatus(true)}>
            <RefreshCw className="mr-2 size-4" />
            Status o&apos;zgartirish
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowHistory(true)}>
            <History className="mr-2 size-4" />
            Status tarixi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="mr-2 size-4" />
            O&apos;chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GroupDeleteDialog
        group={group}
        open={showDelete}
        onOpenChange={setShowDelete}
        onDeleted={onDeleted}
      />

      <ChangeStatusDialog
        open={showStatus}
        onOpenChange={setShowStatus}
        entityType="groups"
        entityId={group.id}
        entityName={group.name}
        currentStatus={group.statusEnum || "FORMING"}
        onStatusChanged={(newStatus) => onStatusChanged?.(group.id, newStatus)}
      />

      <StatusHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        entityType="groups"
        entityId={group.id}
        entityName={group.name}
      />
    </>
  );
}
```

- [ ] **Step 3: Document the pattern**

In `client/CLAUDE.md`, section "Confirmation Dialogs (Destructive Actions)", after the bullet that starts with `- Reference implementations:`, add:

```markdown
- **A confirmation for an action that cascades states its size.** When confirming takes other records with it, the dialog asks the server how many when it opens, counted with the same filter the action uses, and names them; it does not reuse a count the page already shows. Keep a skeleton and a disabled confirm button until the count arrives; if it cannot be fetched, show the consequence without a number and leave the action available. Reference: `src/components/groups/group-delete-dialog.tsx` (`GET /groups/:id/delete-preview`).
```

- [ ] **Step 4: Verify**

Run (from `client/`):
- `npx vitest run` — Expected: all pass.
- `npx tsc --noEmit` — Expected: no output.
- `npx eslint src` — Expected: 0 errors. Warnings: compare the set against the 84-warning baseline; `group-row-actions.tsx` lost its `try/finally`, so the React Compiler now compiles it, and new warnings there would be pre-existing ones made visible — list them in the PR, do not hide them.
- `npm run build` — Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/groups/group-delete-dialog.tsx client/src/components/groups/group-row-actions.tsx client/CLAUDE.md
git commit -m "Tell the admin who leaves before a group is deleted" -m "The delete dialog asks the server how many students (active and frozen) the deletion takes out of the group, says their unused lessons go back to the balance and that restoring the group will not bring them back, and suggests moving them first. The reason field is now sent. If the count cannot be fetched, the warning shows without a number and deletion stays available." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification and a look at the real dialog

**Files:** none changed unless a check fails.

- [ ] **Step 1: Server, whole suite**

Run (from `server/`): `npm test`, then `npm run typecheck`, then `npx eslint src`.
Expected: all suites pass; typecheck prints nothing; eslint `0 errors`.

- [ ] **Step 2: Client, whole suite**

Run (from `client/`): `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npm run build`.
Expected: pass, no type errors, `0 errors`, build succeeds.

- [ ] **Step 3: Render the dialog in a browser**

Start the client (`npm run dev` from `client/`) against a mock API (see memory `reference_mock_api_browser_check`) that answers `GET /api/groups` with one group and `GET /api/groups/:id/delete-preview` with `{ "active": 5, "frozen": 2 }`, then `{ "active": 0, "frozen": 3 }`, then `{ "active": 0, "frozen": 0 }`, and one failing (500) response. Open `/groups`, open the row menu → "O'chirish", and screenshot each state, light and dark. Check: the count line, the skeleton while loading, the confirm button disabled while counting, the fallback warning on failure, the reason sent in the DELETE body.

- [ ] **Step 4: Show the screenshots to the user and wait for their OK before any PR.**
