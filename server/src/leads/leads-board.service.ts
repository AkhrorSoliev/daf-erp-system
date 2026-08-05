import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import { leadBranchWhere } from './shared/lead-scope';

/**
 * Builds the leads board: every column with its sections and a per-section
 * lead count. Sections are collapsed on the client by default, so the actual
 * leads are loaded lazily via LeadsService.getSectionLeads — the board only
 * carries counts.
 */
@Injectable()
export class LeadsBoardService {
  constructor(private prisma: PrismaService) {}

  /**
   * The board had NO tenancy filter at all — `where: { deletedAt: null }`
   * returned every column, section and lead in the database, so one branch's
   * director could see, drag and delete another branch's leads.
   *
   * Board STRUCTURE (columns + sections) is company-level by design; only the
   * LEAD COUNTS are branch-filtered, so both branches share one funnel layout
   * while each sees its own pipeline.
   */
  async getBoard(companyId: number, scope: ReportBranchIds) {
    const columns = await this.prisma.leadColumn.findMany({
      where: { deletedAt: null, companyId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        isSystem: true,
        systemKey: true,
        sections: {
          where: { deletedAt: null, companyId },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, order: true },
        },
      },
    });

    const counts = await this.prisma.lead.groupBy({
      by: ['sectionId'],
      // Converted leads have left the funnel — they now live in the students
      // list, so they must not be counted on the active board. (LOST leads are
      // already excluded because deleting a lead sets deletedAt.)
      where: {
        deletedAt: null,
        companyId,
        sectionId: { not: null },
        statusEnum: { not: LeadStatus.CONVERTED },
        ...leadBranchWhere(scope),
      },
      _count: true,
    });
    const countBySection = new Map<string, number>();
    for (const row of counts) {
      if (row.sectionId) countBySection.set(row.sectionId, row._count);
    }

    return columns.map((column) => ({
      id: column.id,
      name: column.name,
      order: column.order,
      isSystem: column.isSystem,
      systemKey: column.systemKey,
      sections: column.sections.map((section) => ({
        id: section.id,
        name: section.name,
        order: section.order,
        leadCount: countBySection.get(section.id) ?? 0,
      })),
    }));
  }
}
