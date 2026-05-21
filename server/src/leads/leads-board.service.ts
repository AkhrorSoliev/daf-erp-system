import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Builds the leads board: every column with its sections and a per-section
 * lead count. Sections are collapsed on the client by default, so the actual
 * leads are loaded lazily via LeadsService.getSectionLeads — the board only
 * carries counts.
 */
@Injectable()
export class LeadsBoardService {
  constructor(private prisma: PrismaService) {}

  async getBoard() {
    const columns = await this.prisma.leadColumn.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        isSystem: true,
        systemKey: true,
        sections: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, order: true },
        },
      },
    });

    const counts = await this.prisma.lead.groupBy({
      by: ['sectionId'],
      where: { deletedAt: null, sectionId: { not: null } },
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
