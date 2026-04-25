import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateDepartureReasonDto } from './dto/create-departure-reason.dto';
import { UpdateDepartureReasonDto } from './dto/update-departure-reason.dto';

@Injectable()
export class DepartureReasonsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  findAll(companyId: number) {
    return this.prisma.departureReason.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    dto: CreateDepartureReasonDto,
    companyId: number,
    userId: number,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Sabab nomi bo'sh bo'lishi mumkin emas");
    }

    const existing = await this.prisma.departureReason.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Bu nomdagi sabab allaqachon mavjud');
    }

    const created = await this.prisma.departureReason.create({
      data: { name, companyId },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'DepartureReason',
      entityId: created.id,
      newValues: created,
      changedById: userId,
      companyId,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateDepartureReasonDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.departureReason.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Sabab topilmadi');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Sabab nomi bo'sh bo'lishi mumkin emas");
      }
      if (name !== existing.name) {
        const clash = await this.prisma.departureReason.findFirst({
          where: { companyId, name, deletedAt: null, id: { not: id } },
        });
        if (clash) {
          throw new ConflictException('Bu nomdagi sabab allaqachon mavjud');
        }
      }
    }

    const updated = await this.prisma.departureReason.update({
      where: { id },
      data: { name: dto.name?.trim() },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'DepartureReason',
      entityId: id,
      oldValues: existing,
      newValues: updated,
      changedById: userId,
      companyId,
    });

    return updated;
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.departureReason.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Sabab topilmadi');
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'DepartureReason',
      entityId: id,
      oldValues: existing,
      changedById: userId,
      companyId,
    });

    await this.prisma.departureReason.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Sabab o'chirildi" };
  }
}
