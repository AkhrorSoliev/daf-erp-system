import { Injectable, NotFoundException } from '@nestjs/common';
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
      data: rows.map(
        ({ statusEnum, convertedStudentId, ownerId, ...lead }) => ({
          ...lead,
          notes: restoreNotes({ statusEnum, convertedStudentId, ownerId }),
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  /** One archived lead for the side panel: who phoned, who owned it, why it left. */
  async getArchivedLead(id: string, companyId: number, scope: ReportBranchIds) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        AND: [
          {
            id,
            ...this.leadBase(companyId, scope),
            deletedAt: { not: null },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        extraPhone: true,
        statusEnum: true,
        convertedStudentId: true,
        statusChangeReason: true,
        lostReason: true,
        createdAt: true,
        calledAt: true,
        calledBy: DELETED_BY_SELECT,
        ownerId: true,
        owner: DELETED_BY_SELECT,
        ownedAt: true,
        source: { select: { id: true, name: true } },
        section: {
          select: {
            id: true,
            name: true,
            column: { select: { id: true, name: true } },
          },
        },
        deletedAt: true,
        deletedBy: DELETED_BY_SELECT,
        ownershipLogs: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 30,
          select: {
            id: true,
            kind: true,
            fromUserId: true,
            toUserId: true,
            actorId: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Arxivda lid topilmadi');

    const { ownershipLogs, ownerId, ...rest } = lead;
    const ids = [
      ...new Set(
        ownershipLogs
          .flatMap((l) => [l.fromUserId, l.toUserId, l.actorId])
          .filter((u): u is number => u !== null),
      ),
    ];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );
    const nameOf = (u: number | null) =>
      u === null ? null : (names.get(u) ?? null);
    return {
      ...rest,
      notes: restoreNotes({
        statusEnum: lead.statusEnum,
        convertedStudentId: lead.convertedStudentId,
        ownerId,
      }),
      ownershipLog: ownershipLogs.map((l) => ({
        id: l.id,
        kind: l.kind,
        from: nameOf(l.fromUserId),
        to: nameOf(l.toUserId),
        actor: nameOf(l.actorId),
        reason: l.reason,
        createdAt: l.createdAt,
      })),
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
