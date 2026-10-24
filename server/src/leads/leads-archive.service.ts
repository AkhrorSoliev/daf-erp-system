import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { RestoreLeadDto } from './dto/restore-lead.dto';
import { RestoreLeadSectionDto } from './dto/restore-lead-section.dto';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
import { leadBranchWhere } from './shared/lead-scope';
import {
  LeadOwnershipService,
  type OwnershipChange,
} from './ownership/lead-ownership.service';
import { RELEASED_OWNER, restoreRelease } from './ownership/restore-release';

/**
 * Leads-owned archive: restores archived leads + sections back onto the board
 * (the paged reads are in `LeadsArchiveReadService`). Kept separate from the generic CEO-only /archive module
 * because leads need a richer restore (pick a target column + section; restore a
 * section with or without its cascade-archived leads) and it is open to
 * CEO / Branch Director / Administrator — not CEO-only.
 */
@Injectable()
export class LeadsArchiveService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private ownership: LeadOwnershipService,
  ) {}

  /**
   * The funnel stage a restored lead should land on: a converted lead keeps
   * CONVERTED (its convertedStudentId must stay coherent); otherwise NEW for the
   * fixed NEW column and the lead's existing stage for any custom column —
   * mirroring LeadsService.move().
   */
  private restoredStatus(
    lead: { statusEnum: LeadStatus; convertedStudentId: number | null },
    systemKey: string | null,
  ): LeadStatus {
    if (lead.convertedStudentId) return LeadStatus.CONVERTED;
    // A lost lead (deleted with a reason) is "back in play" once restored — it
    // returns to NEW and its lostReason is cleared in the restore update below.
    if (lead.statusEnum === LeadStatus.LOST) return LeadStatus.NEW;
    return systemKey === 'NEW' ? LeadStatus.NEW : lead.statusEnum;
  }

  /** Restores one archived lead into a chosen (live) column + section. */
  async restoreLead(
    id: string,
    dto: RestoreLeadDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        deletedAt: { not: null },
        companyId,
        ...leadBranchWhere(scope),
      },
      select: {
        id: true,
        statusEnum: true,
        convertedStudentId: true,
        firstName: true,
        lastName: true,
        ownerId: true,
      },
    });
    if (!lead) {
      throw new NotFoundException('Arxivda lid topilmadi');
    }

    const section = await this.prisma.leadSection.findFirst({
      where: {
        id: dto.sectionId,
        columnId: dto.columnId,
        deletedAt: null,
        companyId,
        column: { ...branchIdWhere(scope) },
      },
      select: {
        id: true,
        column: { select: { systemKey: true, branchId: true } },
      },
    });
    if (!section) {
      throw new NotFoundException("Tanlangan bo'lim topilmadi");
    }

    // Restoring places the lead on a specific branch's board, so its own branch
    // must be re-stamped to match. An archived lead can outlive the section it
    // came from, and it is restored into whatever column the admin picks — the
    // two are not necessarily the same branch any more.
    const branchId = section.column.branchId;

    const status = this.restoredStatus(lead, section.column?.systemKey ?? null);

    // ADR-0093: a lead back from the archive returns to the common pool.
    const released = restoreRelease(lead, status, {
      branchId,
      companyId,
      actorId: userId,
    });

    const maxOrder = await this.prisma.lead.aggregate({
      where: { sectionId: dto.sectionId, deletedAt: null },
      _max: { order: true },
    });

    const restored = await this.prisma.$transaction(async (tx) => {
      const r = await tx.lead.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
          deletionBatchId: null,
          lostReason: null,
          sectionId: dto.sectionId,
          order: (maxOrder._max.order ?? -1) + 1,
          statusEnum: status,
          status: status.toLowerCase(),
          branchId,
          ...(released ? RELEASED_OWNER : {}),
        },
        select: { id: true, sectionId: true },
      });
      await this.entityHistoryService.recordRestore({
        entityType: 'Lead',
        entityId: id,
        newValues: { sectionId: dto.sectionId, statusEnum: status, branchId },
        changedById: userId,
        companyId,
        tx,
      });
      if (released) await this.ownership.recordChange(tx, released);
      return r;
    });
    if (released) this.ownership.emit(released);

    return {
      message: 'Lid tiklandi',
      id: restored.id,
      sectionId: restored.sectionId,
    };
  }

  /**
   * Restores an archived section into a chosen (live) column. When `withLeads`
   * is true, the leads cascade-archived alongside it (same deletionBatchId, or
   * legacy: same sectionId) are restored into it as well.
   */
  async restoreSection(
    id: string,
    dto: RestoreLeadSectionDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    // An archived section is gated on its ORIGINAL column, which is where it
    // came from; the target column below is gated separately. Both must be in
    // scope, so a caller can neither pull another branch's section out of the
    // archive nor drop their own onto another branch's board.
    const section = await this.prisma.leadSection.findFirst({
      where: {
        id,
        deletedAt: { not: null },
        companyId,
        column: { ...branchIdWhere(scope) },
      },
      select: { id: true, name: true, deletionBatchId: true },
    });
    if (!section) {
      throw new NotFoundException("Arxivda bo'lim topilmadi");
    }

    const column = await this.prisma.leadColumn.findFirst({
      where: {
        id: dto.targetColumnId,
        deletedAt: null,
        companyId,
        ...branchIdWhere(scope),
      },
      select: { id: true, systemKey: true, branchId: true },
    });
    if (!column) {
      throw new NotFoundException('Ustun topilmadi');
    }

    // Section restore + (optionally) its leads + all audit rows run in one
    // transaction so the restore and its audit trail are atomic.
    const released: OwnershipChange[] = [];
    const restoredLeadCount = await this.prisma.$transaction(async (tx) => {
      const maxOrder = await tx.leadSection.aggregate({
        where: { columnId: dto.targetColumnId, deletedAt: null },
        _max: { order: true },
      });
      await tx.leadSection.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
          deletionBatchId: null,
          columnId: dto.targetColumnId,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      await this.entityHistoryService.recordRestore({
        entityType: 'LeadSection',
        entityId: id,
        newValues: { columnId: dto.targetColumnId },
        changedById: userId,
        companyId,
        tx,
      });

      if (!dto.withLeads) return 0;

      const leads = await tx.lead.findMany({
        where: section.deletionBatchId
          ? {
              deletionBatchId: section.deletionBatchId,
              deletedAt: { not: null },
            }
          : { sectionId: id, deletedAt: { not: null } },
        select: {
          id: true,
          statusEnum: true,
          convertedStudentId: true,
          firstName: true,
          lastName: true,
          ownerId: true,
        },
      });
      if (leads.length === 0) return 0;

      const leadMax = await tx.lead.aggregate({
        where: { sectionId: id, deletedAt: null },
        _max: { order: true },
      });
      let order = (leadMax._max.order ?? -1) + 1;

      for (const l of leads) {
        const status = this.restoredStatus(l, column.systemKey);
        const release = restoreRelease(l, status, {
          branchId: column.branchId,
          companyId,
          actorId: userId,
        });
        await tx.lead.update({
          where: { id: l.id },
          data: {
            deletedAt: null,
            deletedById: null,
            deletionBatchId: null,
            lostReason: null,
            sectionId: id,
            order: order++,
            statusEnum: status,
            status: status.toLowerCase(),
            // Same rule as the section itself: the restored leads land on the
            // target column's board, so that is their branch now.
            branchId: column.branchId,
            ...(release ? RELEASED_OWNER : {}),
          },
        });
        await this.entityHistoryService.recordRestore({
          entityType: 'Lead',
          entityId: l.id,
          newValues: { sectionId: id, statusEnum: status },
          changedById: userId,
          companyId,
          tx,
        });
        if (release) {
          await this.ownership.recordChange(tx, release);
          released.push(release);
        }
      }
      return leads.length;
    });
    for (const change of released) this.ownership.emit(change);

    return {
      message: dto.withLeads ? "Bo'lim va lidlari tiklandi" : "Bo'lim tiklandi",
      id,
      columnId: dto.targetColumnId,
      restoredLeadCount,
    };
  }
}
