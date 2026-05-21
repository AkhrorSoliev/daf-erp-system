import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLeadSectionDto } from './dto/create-lead-section.dto';
import { UpdateLeadSectionDto } from './dto/update-lead-section.dto';
import { ReorderLeadSectionsDto } from './dto/reorder-lead-sections.dto';

/**
 * Sections are the collapsible cards inside a board column. A section can only
 * be deleted once it is empty (its leads moved elsewhere first).
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

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.leadSection.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const leadCount = await this.prisma.lead.count({
      where: { sectionId: id, deletedAt: null },
    });
    if (leadCount > 0) {
      throw new BadRequestException(
        "Avval bo'limdagi lidlarni boshqa joyga ko'chiring",
      );
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'LeadSection',
      entityId: id,
      oldValues: { name: existing.name, columnId: existing.columnId },
      changedById: userId,
      companyId,
    });

    await this.prisma.leadSection.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Bo'lim o'chirildi", columnId: existing.columnId };
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
