import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExitType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateStudentExitReasonDto } from './dto/create-student-exit-reason.dto';
import { UpdateStudentExitReasonDto } from './dto/update-student-exit-reason.dto';

@Injectable()
export class StudentExitReasonsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  findAll(companyId: number, appliesTo?: ExitType) {
    return this.prisma.studentExitReason.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(appliesTo ? { appliesTo: { has: appliesTo } } : {}),
      },
      select: {
        id: true,
        name: true,
        appliesTo: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    dto: CreateStudentExitReasonDto,
    companyId: number,
    userId: number,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Sabab nomi bo'sh bo'lishi mumkin emas");
    }

    const existing = await this.prisma.studentExitReason.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Bu nomdagi sabab allaqachon mavjud');
    }

    const created = await this.prisma.studentExitReason.create({
      data: { name, appliesTo: dto.appliesTo, companyId },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'StudentExitReason',
      entityId: created.id,
      newValues: { name: created.name, appliesTo: created.appliesTo.join(',') },
      changedById: userId,
      companyId,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateStudentExitReasonDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.studentExitReason.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Sabab topilmadi');
    }

    const data: { name?: string; appliesTo?: ExitType[] } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Sabab nomi bo'sh bo'lishi mumkin emas");
      }
      if (name !== existing.name) {
        const clash = await this.prisma.studentExitReason.findFirst({
          where: { companyId, name, deletedAt: null, id: { not: id } },
        });
        if (clash) {
          throw new ConflictException('Bu nomdagi sabab allaqachon mavjud');
        }
      }
      data.name = name;
    }

    if (dto.appliesTo !== undefined) {
      data.appliesTo = dto.appliesTo;
    }

    const updated = await this.prisma.studentExitReason.update({
      where: { id },
      data,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'StudentExitReason',
      entityId: id,
      oldValues: {
        name: existing.name,
        appliesTo: existing.appliesTo.join(','),
      },
      newValues: {
        name: updated.name,
        appliesTo: updated.appliesTo.join(','),
      },
      changedById: userId,
      companyId,
    });

    return updated;
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.studentExitReason.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Sabab topilmadi');
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'StudentExitReason',
      entityId: id,
      oldValues: {
        name: existing.name,
        appliesTo: existing.appliesTo.join(','),
      },
      changedById: userId,
      companyId,
    });

    await this.prisma.studentExitReason.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Sabab o'chirildi" };
  }
}
