import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';

/**
 * Managed reference list of lead sources (Instagram, tavsiya, ...). Used by the
 * add-lead form. Full management UI lands in a later phase; for now the board
 * only needs list + create (the create supports the empty-state prompt where
 * a lead cannot be added until at least one source exists).
 */
@Injectable()
export class LeadSourcesService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  findAll() {
    return this.prisma.leadSource.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
  }

  /**
   * Sources for the leads filter bar: every active source plus any soft-deleted
   * source still referenced by a non-deleted lead (so those leads stay
   * filterable). Each carries a `deleted` flag for the "(o'chirilgan)" label.
   */
  async findAllForFilter() {
    const usedRows = await this.prisma.lead.findMany({
      where: { deletedAt: null, sourceId: { not: null } },
      select: { sourceId: true },
      distinct: ['sourceId'],
    });
    const usedIds = usedRows
      .map((r) => r.sourceId)
      .filter((id): id is string => id !== null);

    const sources = await this.prisma.leadSource.findMany({
      where: {
        OR: [{ deletedAt: null, isActive: true }, { id: { in: usedIds } }],
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, deletedAt: true },
    });

    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      deleted: s.deletedAt !== null,
    }));
  }

  async create(dto: CreateLeadSourceDto, companyId: number, userId: number) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Manba nomi bo'sh bo'lishi mumkin emas");
    }

    const existing = await this.prisma.leadSource.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Bu nomdagi manba allaqachon mavjud');
    }

    const maxOrder = await this.prisma.leadSource.aggregate({
      where: { deletedAt: null },
      _max: { order: true },
    });

    const created = await this.prisma.leadSource.create({
      data: { name, order: (maxOrder._max.order ?? -1) + 1 },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'LeadSource',
      entityId: created.id,
      newValues: { name: created.name },
      changedById: userId,
      companyId,
    });

    return { id: created.id, name: created.name };
  }

  async update(
    id: string,
    dto: UpdateLeadSourceDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.leadSource.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Manba topilmadi');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Manba nomi bo'sh bo'lishi mumkin emas");
    }
    if (name !== existing.name) {
      const clash = await this.prisma.leadSource.findFirst({
        where: { name, deletedAt: null, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Bu nomdagi manba allaqachon mavjud');
      }
    }

    const updated = await this.prisma.leadSource.update({
      where: { id },
      data: { name },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'LeadSource',
      entityId: id,
      oldValues: { name: existing.name },
      newValues: { name: updated.name },
      changedById: userId,
      companyId,
    });

    return { id: updated.id, name: updated.name };
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.leadSource.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Manba topilmadi');
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'LeadSource',
      entityId: id,
      oldValues: { name: existing.name },
      changedById: userId,
      companyId,
    });

    await this.prisma.leadSource.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Manba o'chirildi" };
  }
}
