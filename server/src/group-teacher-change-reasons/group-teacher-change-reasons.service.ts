import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateGroupTeacherChangeReasonDto } from './dto/create-group-teacher-change-reason.dto';
import { UpdateGroupTeacherChangeReasonDto } from './dto/update-group-teacher-change-reason.dto';

@Injectable()
export class GroupTeacherChangeReasonsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  findAll(companyId: number) {
    return this.prisma.groupTeacherChangeReason.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    dto: CreateGroupTeacherChangeReasonDto,
    companyId: number,
    userId: number,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Sabab nomi bo'sh bo'lishi mumkin emas");
    }

    const existing = await this.prisma.groupTeacherChangeReason.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Bu nomdagi sabab allaqachon mavjud');
    }

    const created = await this.prisma.groupTeacherChangeReason.create({
      data: { name, companyId },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'GroupTeacherChangeReason',
      entityId: created.id,
      newValues: created,
      changedById: userId,
      companyId,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateGroupTeacherChangeReasonDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.groupTeacherChangeReason.findFirst({
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
        const clash = await this.prisma.groupTeacherChangeReason.findFirst({
          where: { companyId, name, deletedAt: null, id: { not: id } },
        });
        if (clash) {
          throw new ConflictException('Bu nomdagi sabab allaqachon mavjud');
        }
      }
    }

    const updated = await this.prisma.groupTeacherChangeReason.update({
      where: { id },
      data: { name: dto.name?.trim() },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'GroupTeacherChangeReason',
      entityId: id,
      oldValues: existing,
      newValues: updated,
      changedById: userId,
      companyId,
    });

    return updated;
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.groupTeacherChangeReason.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Sabab topilmadi');
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'GroupTeacherChangeReason',
      entityId: id,
      oldValues: existing,
      changedById: userId,
      companyId,
    });

    await this.prisma.groupTeacherChangeReason.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Sabab o'chirildi" };
  }
}
