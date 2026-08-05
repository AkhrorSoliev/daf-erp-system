import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
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
   * Board STRUCTURE is per BRANCH: a section names a level, weekday pattern,
   * hour and teacher ("A1 SPSH 15:00 Eldor"), which is a forming group and
   * therefore belongs to exactly one branch. Filtering the columns cascades to
   * their sections for free, since a section's branch IS its column's.
   *
   * `branch` is returned so a CEO viewing every branch at once can tell two
   * identically-shaped boards apart; a single-branch view ignores it.
   */
  async getBoard(companyId: number, scope: ReportBranchIds) {
    const columns = await this.prisma.leadColumn.findMany({
      where: { deletedAt: null, companyId, ...branchIdWhere(scope) },
      orderBy: [{ branchId: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        name: true,
        order: true,
        isSystem: true,
        systemKey: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
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
      branchId: column.branchId,
      branch: column.branch,
      sections: column.sections.map((section) => ({
        id: section.id,
        name: section.name,
        order: section.order,
        leadCount: countBySection.get(section.id) ?? 0,
      })),
    }));
  }
}
