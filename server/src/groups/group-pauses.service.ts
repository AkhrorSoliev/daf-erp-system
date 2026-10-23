import { Injectable } from '@nestjs/common';
import { GroupPauseSource, Prisma } from '@prisma/client';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { EntityHistoryService } from '../common/entity-history';

/**
 * The only writer of `GroupPause` (ADR-0119). Every method takes the caller's
 * transaction: a pause opens and closes together with the group's status.
 */
@Injectable()
export class GroupPausesService {
  constructor(private entityHistory: EntityHistoryService) {}

  /** The pause the group is in now, or null. */
  findOpen(tx: Prisma.TransactionClient, groupId: string) {
    return tx.groupPause.findFirst({ where: { groupId, endedAt: null } });
  }

  /** Opens a pause. A group that is already paused keeps its open one. */
  async open(
    tx: Prisma.TransactionClient,
    p: {
      groupId: string;
      companyId: number;
      at: Date;
      plannedResumeOn: string | null;
      reason?: string | null;
      source?: GroupPauseSource;
      userId?: number | null;
    },
  ) {
    const existing = await this.findOpen(tx, p.groupId);
    if (existing) return existing;
    return tx.groupPause.create({
      data: {
        groupId: p.groupId,
        companyId: p.companyId,
        startedAt: p.at,
        plannedResumeOn: p.plannedResumeOn
          ? utcMidnightFromDateStr(p.plannedResumeOn)
          : null,
        reason: p.reason ?? null,
        source: p.source ?? GroupPauseSource.MANUAL,
        startedById: p.userId ?? null,
      },
    });
  }

  /**
   * Changes the planned restart day of the open pause (`null` = unknown) and
   * writes it to the group's history. Returns the old and new day so the
   * caller can tell the students.
   */
  async setPlanned(
    tx: Prisma.TransactionClient,
    p: {
      groupId: string;
      companyId: number;
      plannedResumeOn: string | null;
      userId: number;
    },
  ): Promise<{ before: Date | null; after: Date | null } | null> {
    const open = await this.findOpen(tx, p.groupId);
    if (!open) return null;
    const after = p.plannedResumeOn
      ? utcMidnightFromDateStr(p.plannedResumeOn)
      : null;
    await tx.groupPause.update({
      where: { id: open.id },
      data: { plannedResumeOn: after, resumeOn: null },
    });
    await this.recordDay(tx, p, open.plannedResumeOn, after);
    return { before: open.plannedResumeOn, after };
  }

  /**
   * The group is resumed for a day still ahead: it stays PAUSED until that
   * morning, and the day is kept on the open pause.
   */
  async scheduleResume(
    tx: Prisma.TransactionClient,
    p: {
      groupId: string;
      companyId: number;
      resumeOn: string;
      userId: number;
    },
  ) {
    const open = await this.findOpen(tx, p.groupId);
    if (!open) return null;
    const after = utcMidnightFromDateStr(p.resumeOn);
    await tx.groupPause.update({
      where: { id: open.id },
      data: { resumeOn: after },
    });
    await this.recordDay(tx, p, open.resumeOn ?? open.plannedResumeOn, after);
    return after;
  }

  /**
   * Closes the open pause. With `resumeOn` the group is coming back that day,
   * which `Group.lastResumedOn` keeps for the monthly charge
   * (`chargeStartDate`); without it the group is ending (CANCELLED,
   * COMPLETED). A group paused before pauses were recorded has no open row, so
   * a closed one is written from its status change.
   */
  async close(
    tx: Prisma.TransactionClient,
    p: {
      groupId: string;
      companyId: number;
      at: Date;
      resumeOn: string | null;
      userId?: number | null;
    },
  ) {
    const resumeOn = p.resumeOn ? utcMidnightFromDateStr(p.resumeOn) : null;
    const open = await this.findOpen(tx, p.groupId);
    if (open) {
      await tx.groupPause.update({
        where: { id: open.id },
        data: { endedAt: p.at, resumeOn, endedById: p.userId ?? null },
      });
    } else {
      const group = await tx.group.findUnique({
        where: { id: p.groupId },
        select: { statusChangedAt: true, statusChangeReason: true },
      });
      await tx.groupPause.create({
        data: {
          groupId: p.groupId,
          companyId: p.companyId,
          startedAt: group?.statusChangedAt ?? p.at,
          reason: group?.statusChangeReason ?? null,
          endedAt: p.at,
          resumeOn,
          endedById: p.userId ?? null,
        },
      });
    }
    if (resumeOn) {
      await tx.group.update({
        where: { id: p.groupId },
        data: { lastResumedOn: resumeOn },
      });
    }
  }

  private async recordDay(
    tx: Prisma.TransactionClient,
    p: { groupId: string; companyId: number; userId: number },
    before: Date | null,
    after: Date | null,
  ) {
    const fmt = (d: Date | null) =>
      d ? d.toISOString().slice(0, 10) : "noma'lum";
    await this.entityHistory.recordUpdate({
      entityType: 'Group',
      entityId: p.groupId,
      oldValues: { qaytishSanasi: fmt(before) },
      newValues: { qaytishSanasi: fmt(after) },
      changedById: p.userId,
      companyId: p.companyId,
      tx,
    });
  }
}
