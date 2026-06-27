import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLeadColumnDto } from './dto/create-lead-column.dto';
import { UpdateLeadColumnDto } from './dto/update-lead-column.dto';
import { ReorderLeadColumnsDto } from './dto/reorder-lead-columns.dto';

/**
 * Board columns. One row is seeded as a fixed/system column (systemKey NEW)
 * and cannot be renamed, reordered or deleted — it always stays at position 0.
 * Custom columns are fully manageable and live at positions 1 and beyond.
 */
@Injectable()
export class LeadColumnsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreateLeadColumnDto, companyId: number, userId: number) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Ustun nomi bo'sh bo'lishi mumkin emas");
    }

    const existing = await this.prisma.leadColumn.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Bu nomdagi ustun allaqachon mavjud');
    }

    const maxOrder = await this.prisma.leadColumn.aggregate({
      where: { deletedAt: null },
      _max: { order: true },
    });

    const created = await this.prisma.leadColumn.create({
      data: {
        name,
        order: (maxOrder._max.order ?? -1) + 1,
        isSystem: false,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'LeadColumn',
      entityId: created.id,
      newValues: { name: created.name },
      changedById: userId,
      companyId,
    });

    return {
      id: created.id,
      name: created.name,
      order: created.order,
      isSystem: created.isSystem,
      systemKey: created.systemKey,
      sections: [],
    };
  }

  async update(
    id: string,
    dto: UpdateLeadColumnDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.leadColumn.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Ustun topilmadi');
    }
    if (existing.isSystem) {
      throw new BadRequestException(
        "Tizim ustuni nomini o'zgartirib bo'lmaydi",
      );
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Ustun nomi bo'sh bo'lishi mumkin emas");
    }
    if (name !== existing.name) {
      const clash = await this.prisma.leadColumn.findFirst({
        where: { name, deletedAt: null, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Bu nomdagi ustun allaqachon mavjud');
      }
    }

    const updated = await this.prisma.leadColumn.update({
      where: { id },
      data: { name },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'LeadColumn',
      entityId: id,
      oldValues: { name: existing.name },
      newValues: { name: updated.name },
      changedById: userId,
      companyId,
    });

    return { id: updated.id, name: updated.name };
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.leadColumn.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Ustun topilmadi');
    }
    if (existing.isSystem) {
      throw new BadRequestException("Tizim ustunini o'chirib bo'lmaydi");
    }

    const sectionCount = await this.prisma.leadSection.count({
      where: { columnId: id, deletedAt: null },
    });
    if (sectionCount > 0) {
      throw new BadRequestException(
        "Avval ustundagi bo'limlarni o'chiring",
      );
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'LeadColumn',
      entityId: id,
      oldValues: { name: existing.name },
      changedById: userId,
      companyId,
    });

    await this.prisma.leadColumn.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Ustun o'chirildi" };
  }

  /**
   * Reorders custom columns. The single system column (NEW) is always pinned to
   * position 0; custom columns follow at 1, 2, 3, ...
   */
  async reorder(dto: ReorderLeadColumnsDto) {
    const columns = await this.prisma.leadColumn.findMany({
      where: { deletedAt: null },
      select: { id: true, isSystem: true, systemKey: true },
    });
    const customIds = new Set(
      columns.filter((c) => !c.isSystem).map((c) => c.id),
    );

    for (const id of dto.columnIds) {
      if (!customIds.has(id)) {
        throw new BadRequestException(
          'Ustun topilmadi yoki tizim ustuni ko‘chirib bo‘lmaydi',
        );
      }
    }
    if (dto.columnIds.length !== customIds.size) {
      throw new BadRequestException(
        "Barcha maxsus ustunlar tartibda ko'rsatilishi kerak",
      );
    }

    await this.prisma.$transaction([
      ...columns
        .filter((c) => c.isSystem)
        .map((c) =>
          this.prisma.leadColumn.update({
            where: { id: c.id },
            data: { order: 0 },
          }),
        ),
      ...dto.columnIds.map((id, index) =>
        this.prisma.leadColumn.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    ]);

    return { message: 'Ustunlar tartibi yangilandi' };
  }
}
