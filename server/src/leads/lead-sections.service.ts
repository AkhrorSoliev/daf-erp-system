import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLeadSectionDto } from './dto/create-lead-section.dto';
import { UpdateLeadSectionDto } from './dto/update-lead-section.dto';
import { MoveLeadSectionDto } from './dto/move-lead-section.dto';
import { ReorderLeadSectionsDto } from './dto/reorder-lead-sections.dto';

/**
 * Sections are the collapsible cards inside a board column. Deleting a section
 * cascade-archives every lead inside it (section + leads share one
 * deletionBatchId); a section can also be moved between columns.
 */
@Injectable()
export class LeadSectionsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreateLeadSectionDto, companyId: number, userId: number) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Bo'lim nomi bo'sh bo'lishi mumkin emas");
    }

    const column = await this.prisma.leadColumn.findFirst({
      where: { id: dto.columnId, deletedAt: null },
    });
    if (!column) {
      throw new NotFoundException('Ustun topilmadi');
    }

    const maxOrder = await this.prisma.leadSection.aggregate({
      where: { columnId: dto.columnId, deletedAt: null },
      _max: { order: true },
    });

    const created = await this.prisma.leadSection.create({
      data: {
        name,
        columnId: dto.columnId,
        order: (maxOrder._max.order ?? -1) + 1,
        companyId,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'LeadSection',
      entityId: created.id,
      newValues: { name: created.name, columnId: created.columnId },
      changedById: userId,
      companyId,
    });

    return {
      id: created.id,
      name: created.name,
      columnId: created.columnId,
      order: created.order,
      leadCount: 0,
    };
  }

  async update(
    id: string,
    dto: UpdateLeadSectionDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.leadSection.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Bo'lim nomi bo'sh bo'lishi mumkin emas");
    }

    const updated = await this.prisma.leadSection.update({
      where: { id },
      data: { name },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'LeadSection',
      entityId: id,
      oldValues: { name: existing.name },
      newValues: { name: updated.name },
      changedById: userId,
      companyId,
    });

    return { id: updated.id, name: updated.name, columnId: updated.columnId };
  }

  /**
   * Cascade-archives the section AND every lead inside it. The section and its
   * leads share one fresh deletionBatchId, so the archive can offer "restore the
   * section with its leads" as a group while keeping each section's batch
   * isolated from others.
   */
  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.leadSection.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const batchId = randomUUID();
    const now = new Date();

    // Soft-delete + cross-entity audit (section + every cascaded lead) all run
    // in one transaction so the archive and its audit trail are atomic.
    const archivedLeadCount = await this.prisma.$transaction(async (tx) => {
      const leads = await tx.lead.findMany({
        where: { sectionId: id, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      });

      await tx.lead.updateMany({
        where: { sectionId: id, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      await tx.leadSection.update({
        where: { id },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });

      await this.entityHistoryService.recordDelete({
        entityType: 'LeadSection',
        entityId: id,
        oldValues: { name: existing.name, columnId: existing.columnId },
        changedById: userId,
        companyId,
        tx,
      });
      for (const lead of leads) {
        await this.entityHistoryService.recordDelete({
          entityType: 'Lead',
          entityId: lead.id,
          oldValues: { firstName: lead.firstName, lastName: lead.lastName },
          changedById: userId,
          companyId,
          tx,
        });
      }

      return leads.length;
    });

    return {
      message: "Bo'lim va undagi lidlar arxivga ko'chirildi",
      columnId: existing.columnId,
      archivedLeadCount,
    };
  }

  /** Moves a section into another column, appended to that column's end. */
  async move(
    id: string,
    dto: MoveLeadSectionDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.leadSection.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const column = await this.prisma.leadColumn.findFirst({
      where: { id: dto.targetColumnId, deletedAt: null },
      select: { id: true, systemKey: true },
    });
    if (!column) {
      throw new NotFoundException('Ustun topilmadi');
    }

    // Already in the target column — nothing to move (within-column ordering is
    // handled by reorder()).
    if (existing.columnId === dto.targetColumnId) {
      return {
        id: existing.id,
        name: existing.name,
        columnId: existing.columnId,
        order: existing.order,
      };
    }

    const maxOrder = await this.prisma.leadSection.aggregate({
      where: { columnId: dto.targetColumnId, deletedAt: null },
      _max: { order: true },
    });

    const updated = await this.prisma.leadSection.update({
      where: { id },
      data: {
        columnId: dto.targetColumnId,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'LeadSection',
      entityId: id,
      oldValues: { columnId: existing.columnId },
      newValues: { columnId: updated.columnId },
      changedById: userId,
      companyId,
    });

    // Landing in the fixed NEW column re-syncs the carried leads' funnel stage
    // to NEW — same rule as moving a single lead — except converted leads keep
    // their CONVERTED status (their convertedStudentId must stay coherent).
    if (column.systemKey === 'NEW') {
      const toSync = await this.prisma.lead.findMany({
        where: {
          sectionId: id,
          deletedAt: null,
          convertedStudentId: null,
          statusEnum: { not: LeadStatus.NEW },
        },
        select: { id: true, statusEnum: true },
      });
      if (toSync.length > 0) {
        await this.prisma.lead.updateMany({
          where: { id: { in: toSync.map((l) => l.id) } },
          data: { statusEnum: LeadStatus.NEW, status: 'new' },
        });
        for (const l of toSync) {
          await this.entityHistoryService.recordUpdate({
            entityType: 'Lead',
            entityId: l.id,
            oldValues: { statusEnum: l.statusEnum },
            newValues: { statusEnum: LeadStatus.NEW },
            changedById: userId,
            companyId,
          });
        }
      }
    }

    return {
      id: updated.id,
      name: updated.name,
      columnId: updated.columnId,
      order: updated.order,
    };
  }

  /** Reorders the sections of a single column top-to-bottom. */
  async reorder(dto: ReorderLeadSectionsDto) {
    const sections = await this.prisma.leadSection.findMany({
      where: { columnId: dto.columnId, deletedAt: null },
      select: { id: true },
    });
    const ids = new Set(sections.map((s) => s.id));

    for (const id of dto.sectionIds) {
      if (!ids.has(id)) {
        throw new BadRequestException("Bo'lim topilmadi");
      }
    }
    if (dto.sectionIds.length !== sections.length) {
      throw new BadRequestException(
        "Barcha bo'limlar tartibda ko'rsatilishi kerak",
      );
    }

    await this.prisma.$transaction(
      dto.sectionIds.map((id, index) =>
        this.prisma.leadSection.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    return { message: "Bo'limlar tartibi yangilandi" };
  }
}
