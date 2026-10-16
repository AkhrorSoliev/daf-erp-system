import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  LeadOwnershipKind,
  LeadStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { SettingsService } from '../../settings/settings.service';
import { resolveCallerBranchScope } from '../../common/auth/branch-scope';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import {
  isTransactionConflict,
  rethrowAsConflict,
} from '../../common/transaction-conflict';
import { leadBranchWhere } from '../shared/lead-scope';
import {
  LEAD_OWNER_CHANGED,
  type LeadOwnerChangedPayload,
} from '../lead-events';
import type { OwnershipRules } from './ownership-deadline';
import { ownerHistoryValues } from './ownership-history';

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

const RULE_KEYS = {
  maxUntouched: 'leads.maxUntouched',
  firstActionHours: 'leads.firstActionHours',
  followUpDays: 'leads.followUpDays',
} as const;

/** One change of a lead's owner, logged and put in the lead's history together. */
export interface OwnershipChange {
  leadId: string;
  leadName: string;
  branchId: number | null;
  kind: LeadOwnershipKind;
  fromUserId: number | null;
  toUserId: number | null;
  actorId: number | null;
  reason: string | null;
  companyId: number;
}

/** Claimed leads with no action yet: what the claim limit counts. */
export function untouchedWhere(
  userId: number,
  companyId: number,
): Prisma.LeadWhereInput {
  return {
    companyId,
    ownerId: userId,
    ownerActedAt: null,
    deletedAt: null,
    statusEnum: { not: LeadStatus.CONVERTED },
  };
}

const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

const LEAD_FOR_OWNERSHIP = {
  id: true,
  firstName: true,
  lastName: true,
  statusEnum: true,
  branchId: true,
  ownerId: true,
  owner: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LeadSelect;

type OwnershipLead = Prisma.LeadGetPayload<{
  select: typeof LEAD_FOR_OWNERSHIP;
}>;

/**
 * The one door for a lead's owner (ADR-0092): claim, give, release, and the
 * log + history row every change writes. A converted lead's owner is frozen
 * (the KPI of stage 2 is credited to it), so none of these touch one.
 */
@Injectable()
export class LeadOwnershipService {
  constructor(
    private prisma: PrismaService,
    private history: EntityHistoryService,
    private permissions: PermissionsService,
    private settings: SettingsService,
    private events: EventEmitter2,
  ) {}

  async rules(companyId: number): Promise<OwnershipRules> {
    const [maxUntouched, firstActionHours, followUpDays] = await Promise.all([
      this.settings.get(companyId, RULE_KEYS.maxUntouched),
      this.settings.get(companyId, RULE_KEYS.firstActionHours),
      this.settings.get(companyId, RULE_KEYS.followUpDays),
    ]);
    return { maxUntouched, firstActionHours, followUpDays };
  }

  async setRules(
    companyId: number,
    patch: Partial<OwnershipRules>,
    userId: number,
  ): Promise<OwnershipRules> {
    let changed = false;
    for (const field of Object.keys(RULE_KEYS) as (keyof OwnershipRules)[]) {
      const value = patch[field];
      if (value === undefined) continue;
      await this.settings.set(companyId, RULE_KEYS[field], value, userId);
      changed = true;
    }
    if (!changed) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    return this.rules(companyId);
  }

  async claim(
    leadId: string,
    userId: number,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<void> {
    const rules = await this.rules(companyId);
    const change = await this.inTx(async (tx) => {
      const lead = await this.findLead(tx, leadId, companyId, scope);
      if (lead.ownerId === userId) {
        throw new BadRequestException('Bu lid allaqachon sizda');
      }
      if (lead.ownerId !== null) {
        const who = lead.owner ? fullName(lead.owner) : 'boshqa xodim';
        throw new ConflictException(`Bu lidni ${who} band qilgan`);
      }
      const untouched = await tx.lead.count({
        where: untouchedWhere(userId, companyId),
      });
      if (untouched >= rules.maxUntouched) {
        throw new BadRequestException(
          `Sizda ${untouched} ta hali bog'lanilmagan lid bor. Avval ular bilan bog'laning: bir vaqtda ${rules.maxUntouched} tadan ortiq bunday lid olib bo'lmaydi`,
        );
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { ownerId: userId, ownedAt: new Date(), ownerActedAt: null },
      });
      const c = this.changeOf(lead, 'CLAIM', userId, userId, null, companyId);
      await this.recordChange(tx, c);
      return c;
    });
    this.emit(change);
  }

  async release(
    leadId: string,
    userId: number,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<void> {
    const mayAssign = await this.permissions.has(userId, 'leads.assign');
    const change = await this.inTx(async (tx) => {
      const lead = await this.findLead(tx, leadId, companyId, scope);
      if (lead.ownerId === null) {
        throw new BadRequestException("Lidning egasi yo'q");
      }
      if (lead.ownerId !== userId && !mayAssign) {
        throw new ForbiddenException(
          "Lidni faqat uning egasi yoki rahbar bo'shatadi",
        );
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { ownerId: null, ownedAt: null, ownerActedAt: null },
      });
      const c = this.changeOf(lead, 'RELEASE', null, userId, null, companyId);
      await this.recordChange(tx, c);
      return c;
    });
    this.emit(change);
  }

  async assign(
    leadId: string,
    targetId: number | null,
    actorId: number,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<void> {
    if (targetId === null) {
      return this.release(leadId, actorId, companyId, scope);
    }
    const target = await this.prisma.user.findFirst({
      where: {
        id: targetId,
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!target || !(await this.permissions.has(targetId, 'leads.claim'))) {
      throw new BadRequestException(
        "Bu xodimga lid berib bo'lmaydi: unda lid olish ruxsati yo'q",
      );
    }
    const targetScope = await resolveCallerBranchScope(this.prisma, targetId);
    const change = await this.inTx(async (tx) => {
      const lead = await this.findLead(tx, leadId, companyId, scope);
      if (lead.ownerId === targetId) {
        throw new BadRequestException('Lid allaqachon shu xodimda');
      }
      if (
        lead.branchId != null &&
        targetScope.kind === 'branches' &&
        !targetScope.branchIds.includes(lead.branchId)
      ) {
        throw new BadRequestException('Xodim bu lid filialida ishlamaydi');
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { ownerId: targetId, ownedAt: new Date(), ownerActedAt: null },
      });
      const c = this.changeOf(
        lead,
        'ASSIGN',
        targetId,
        actorId,
        null,
        companyId,
      );
      await this.recordChange(tx, c);
      return c;
    });
    this.emit(change);
  }

  /** Writes the log row and the lead's «Tarix» row of one change. */
  async recordChange(
    tx: Prisma.TransactionClient,
    c: OwnershipChange,
  ): Promise<void> {
    await tx.leadOwnershipLog.create({
      data: {
        leadId: c.leadId,
        kind: c.kind,
        fromUserId: c.fromUserId,
        toUserId: c.toUserId,
        actorId: c.actorId,
        reason: c.reason,
        branchId: c.branchId,
        companyId: c.companyId,
      },
    });
    const ids = [c.fromUserId, c.toUserId].filter(
      (id): id is number => id != null,
    );
    const users = ids.length
      ? await tx.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = (id: number | null) => {
      const user = users.find((u) => u.id === id);
      return user ? fullName(user) : null;
    };
    const { oldValues, newValues } = ownerHistoryValues(
      c.kind,
      nameOf(c.fromUserId),
      nameOf(c.toUserId),
      c.reason,
    );
    await this.history.recordUpdate({
      entityType: 'Lead',
      entityId: c.leadId,
      oldValues,
      newValues,
      changedById: c.actorId ?? undefined,
      companyId: c.companyId,
      tx,
    });
  }

  /** Tells listeners after the commit (notifications). */
  emit(c: OwnershipChange): void {
    this.events.emit(LEAD_OWNER_CHANGED, {
      leadId: c.leadId,
      companyId: c.companyId,
      kind: c.kind,
      fromUserId: c.fromUserId,
      toUserId: c.toUserId,
      actorId: c.actorId,
      leadName: c.leadName,
    } satisfies LeadOwnerChangedPayload);
  }

  private changeOf(
    lead: OwnershipLead,
    kind: LeadOwnershipKind,
    toUserId: number | null,
    actorId: number | null,
    reason: string | null,
    companyId: number,
  ): OwnershipChange {
    return {
      leadId: lead.id,
      leadName: `${lead.firstName} ${lead.lastName}`.trim(),
      branchId: lead.branchId,
      kind,
      fromUserId: lead.ownerId,
      toUserId,
      actorId,
      reason,
      companyId,
    };
  }

  private async findLead(
    tx: Prisma.TransactionClient,
    leadId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<OwnershipLead> {
    const lead = await tx.lead.findFirst({
      where: {
        id: leadId,
        deletedAt: null,
        companyId,
        ...leadBranchWhere(scope),
      },
      select: LEAD_FOR_OWNERSHIP,
    });
    if (!lead) throw new NotFoundException('Lid topilmadi');
    if (lead.statusEnum === LeadStatus.CONVERTED) {
      throw new BadRequestException(
        "O'quvchiga aylangan lidning egasi o'zgarmaydi",
      );
    }
    return lead;
  }

  private async inTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, SERIALIZABLE);
    } catch (err) {
      if (isTransactionConflict(err)) rethrowAsConflict(err);
      throw err;
    }
  }
}
