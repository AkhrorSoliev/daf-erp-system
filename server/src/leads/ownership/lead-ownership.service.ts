import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { leadStatsRange } from '../leads-stats.service';
import type { LeadStatsPeriod } from '../dto/lead-stats-query.dto';
import {
  LEAD_OWNER_CHANGED,
  type LeadOwnerChangedPayload,
} from '../lead-events';
import { buildHolidayDateSetsByBranch } from '../../holidays/holiday-date-set';
import { ownershipDueAt, type OwnershipRules } from './ownership-deadline';
import { ownerHistoryValues } from './ownership-history';

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

const DAY_MS = 86_400_000;
// No branch has id 0, so a lead with no branch reads the company-wide holidays alone.
const NO_BRANCH = 0;

const RULE_KEYS = {
  maxUntouched: 'leads.maxUntouched',
  firstActionHours: 'leads.firstActionHours',
  followUpDays: 'leads.followUpDays',
} as const;

export type OwnedLeadFields = {
  ownerId: number | null;
  ownedAt: Date | null;
  ownerActedAt: Date | null;
  branchId: number | null;
  statusEnum: LeadStatus;
};

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

export interface OwnerSummaryRow {
  userId: number;
  name: string;
  /** Leads held now (not converted, not archived). */
  held: number;
  /** Of them, with no action yet. */
  untouched: number;
  /** Claimed or given in the period. */
  taken: number;
  /** Taken back by the system in the period. */
  expired: number;
}

const STAFF_ROLE_NAMES = ['CEO', 'Branch Director', 'Administrator', 'Cashier'];

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
  private readonly logger = new Logger(LeadOwnershipService.name);

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

  /**
   * The deadline of each owned lead, for the board and the expiry run: one
   * settings read and one holiday read per call. Holidays are read for 30
   * days back and 70 ahead: an older deadline has passed anyway, and the
   * longest wait (3 working days over a 60-day holiday) fits ahead.
   */
  async dueResolver(
    companyId: number,
    now: Date = new Date(),
  ): Promise<(lead: OwnedLeadFields) => Date | null> {
    const rules = await this.rules(companyId);
    const holidays = await buildHolidayDateSetsByBranch(
      this.prisma,
      new Date(now.getTime() - 30 * DAY_MS),
      new Date(now.getTime() + 70 * DAY_MS),
    );
    return (lead) => {
      if (
        lead.ownerId == null ||
        lead.ownedAt == null ||
        lead.statusEnum === LeadStatus.CONVERTED
      ) {
        return null;
      }
      const days = holidays(lead.branchId ?? NO_BRANCH);
      return ownershipDueAt(
        { ownedAt: lead.ownedAt, ownerActedAt: lead.ownerActedAt },
        rules,
        (day) => days.has(day),
      );
    };
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

  /** «Kimda nechta lid» (ADR-0092): live holdings plus the period's log. */
  async summary(
    companyId: number,
    scope: ReportBranchIds,
    period: LeadStatsPeriod,
  ): Promise<{ period: LeadStatsPeriod; rows: OwnerSummaryRow[] }> {
    const range = leadStatsRange(period, new Date());
    const live: Prisma.LeadWhereInput = {
      companyId,
      deletedAt: null,
      ownerId: { not: null },
      statusEnum: { not: LeadStatus.CONVERTED },
      AND: [leadBranchWhere(scope)],
    };
    const logBranch: Prisma.LeadOwnershipLogWhereInput =
      scope == null
        ? {}
        : { OR: [{ branchId: { in: scope } }, { branchId: null }] };
    const [held, untouched, taken, expired] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: live,
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: { ...live, ownerActedAt: null },
        _count: { _all: true },
      }),
      this.prisma.leadOwnershipLog.groupBy({
        by: ['toUserId'],
        where: {
          companyId,
          kind: { in: ['CLAIM', 'ASSIGN'] },
          createdAt: range,
          ...logBranch,
        },
        _count: { _all: true },
      }),
      this.prisma.leadOwnershipLog.groupBy({
        by: ['fromUserId'],
        where: { companyId, kind: 'EXPIRE', createdAt: range, ...logBranch },
        _count: { _all: true },
      }),
    ]);

    const rows = new Map<number, OwnerSummaryRow>();
    const row = (userId: number) => {
      let r = rows.get(userId);
      if (!r) {
        r = { userId, name: '', held: 0, untouched: 0, taken: 0, expired: 0 };
        rows.set(userId, r);
      }
      return r;
    };
    for (const g of held) {
      if (g.ownerId != null) row(g.ownerId).held = g._count._all;
    }
    for (const g of untouched) {
      if (g.ownerId != null) row(g.ownerId).untouched = g._count._all;
    }
    for (const g of taken) {
      if (g.toUserId != null) row(g.toUserId).taken = g._count._all;
    }
    for (const g of expired) {
      if (g.fromUserId != null) row(g.fromUserId).expired = g._count._all;
    }
    if (rows.size) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...rows.keys()] } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) row(u.id).name = fullName(u);
    }
    return {
      period,
      rows: [...rows.values()].sort(
        (a, b) =>
          b.held - a.held || b.taken - a.taken || a.name.localeCompare(b.name),
      ),
    };
  }

  /** Whom a manager may give the lead to: active staff of its branch who may claim. */
  async assignable(
    leadId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<
    { id: number; firstName: string; lastName: string; photo: string | null }[]
  > {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        companyId,
        deletedAt: null,
        ...leadBranchWhere(scope),
      },
      select: { branchId: true },
    });
    if (!lead) throw new NotFoundException('Lid topilmadi');
    const staff = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: { in: STAFF_ROLE_NAMES } } } },
        ...(lead.branchId != null
          ? {
              OR: [
                { mainBranch: lead.branchId },
                { branches: { some: { branchId: lead.branchId } } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, photo: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const allowed = await Promise.all(
      staff.map((u) => this.permissions.has(u.id, 'leads.claim')),
    );
    return staff.filter((_, i) => allowed[i]);
  }

  /** Takes back every owned lead whose deadline has passed (the 15-minute run). */
  async expireOverdue(now: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of companies) {
      try {
        expired += await this.expireCompany(id, now);
      } catch (err) {
        this.logger.error(
          `lead ownership expiry of company ${id} failed: ${(err as Error).message}`,
        );
      }
    }
    return expired;
  }

  private async expireCompany(companyId: number, now: Date): Promise<number> {
    const due = await this.dueResolver(companyId, now);
    const owned = await this.prisma.lead.findMany({
      where: {
        companyId,
        ownerId: { not: null },
        deletedAt: null,
        statusEnum: { not: LeadStatus.CONVERTED },
      },
      select: { ...LEAD_FOR_OWNERSHIP, ownedAt: true, ownerActedAt: true },
    });
    let expired = 0;
    for (const lead of owned) {
      const dueAt = due(lead);
      if (!dueAt || dueAt > now) continue;
      const change = this.changeOf(
        lead,
        'EXPIRE',
        null,
        null,
        "Muddatida harakat bo'lmadi",
        companyId,
      );
      const done = await this.prisma.$transaction(async (tx) => {
        // Only if nothing moved since the read: an action or a new owner wins.
        const { count } = await tx.lead.updateMany({
          where: {
            id: lead.id,
            ownerId: lead.ownerId,
            ownedAt: lead.ownedAt,
            ownerActedAt: lead.ownerActedAt,
            // Converted or archived since the read: its owner stays frozen.
            deletedAt: null,
            statusEnum: { not: LeadStatus.CONVERTED },
          },
          data: { ownerId: null, ownedAt: null, ownerActedAt: null },
        });
        if (count === 0) return false;
        await this.recordChange(tx, change);
        return true;
      });
      if (done) {
        expired++;
        this.emit(change);
      }
    }
    return expired;
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
