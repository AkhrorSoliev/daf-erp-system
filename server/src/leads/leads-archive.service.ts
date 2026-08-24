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

const DELETED_BY_SELECT = {
  select: { id: true, firstName: true, lastName: true },
};

/**
 * Leads-owned archive: reads archived leads + sections and restores them back
 * onto the board. Kept separate from the generic CEO-only /archive module
 * because leads need a richer restore (pick a target column + section; restore a
 * section with or without its cascade-archived leads) and it is open to
 * CEO / Branch Director / Administrator — not CEO-only.
 */
@Injectable()
export class LeadsArchiveService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Archived leads (column 1) + archived sections (column 2).
   *
   * Had NO tenancy filter of any kind — every archived lead and section in the
   * database, across companies. The restore endpoints below were the same, so
   * the archive page was a way around every gate on the live board.
   */
  async getArchive(companyId: number, scope: ReportBranchIds) {
    const [leads, sections] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          deletedAt: { not: null },
          companyId,
          ...leadBranchWhere(scope),
        },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          statusEnum: true,
          lostReason: true,
          deletedAt: true,
          deletedBy: DELETED_BY_SELECT,
          // Origin label — the section/column may themselves be archived, so we
          // intentionally do NOT filter them by deletedAt.
          section: {
            select: {
              id: true,
              name: true,
              column: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.leadSection.findMany({
        // An archived section keeps pointing at its column even when that
        // column is itself archived, so the branch is still resolvable.
        where: {
          deletedAt: { not: null },
          companyId,
          column: { ...branchIdWhere(scope) },
        },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          deletionBatchId: true,
          deletedBy: DELETED_BY_SELECT,
          column: {
            select: {
              id: true,
              name: true,
              branchId: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const leadCountBySection =
      await this.archivedLeadCountsForSections(sections);

    return {
      leads,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        deletedAt: s.deletedAt,
        deletedBy: s.deletedBy,
        column: s.column,
        leadCount: leadCountBySection.get(s.id) ?? 0,
      })),
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
      select: { id: true, statusEnum: true, convertedStudentId: true },
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
      return r;
    });

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
        select: { id: true, statusEnum: true, convertedStudentId: true },
      });
      if (leads.length === 0) return 0;

      const leadMax = await tx.lead.aggregate({
        where: { sectionId: id, deletedAt: null },
        _max: { order: true },
      });
      let order = (leadMax._max.order ?? -1) + 1;

      for (const l of leads) {
        const status = this.restoredStatus(l, column.systemKey);
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
      }
      return leads.length;
    });

    return {
      message: dto.withLeads ? "Bo'lim va lidlari tiklandi" : "Bo'lim tiklandi",
      id,
      columnId: dto.targetColumnId,
      restoredLeadCount,
    };
  }
}
