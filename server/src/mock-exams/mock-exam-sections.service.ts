import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateMockExamSectionDto } from './dto/create-mock-exam-section.dto';
import { UpdateMockExamSectionDto } from './dto/update-mock-exam-section.dto';
import { ReorderMockExamSectionsDto } from './dto/reorder-mock-exam-sections.dto';

/**
 * Mock-exam sections group related exams (e.g. "IELTS Mock", "SAT Mock").
 * A section can only be deleted when it has no exams left.
 */
@Injectable()
export class MockExamSectionsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async list() {
    const sections = await this.prisma.mockExamSection.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        _count: {
          select: { exams: { where: { deletedAt: null } } },
        },
      },
    });
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      order: s.order,
      examCount: s._count.exams,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async create(
    dto: CreateMockExamSectionDto,
    companyId: number,
    userId: number,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Bo'lim nomi bo'sh bo'lishi mumkin emas");
    }

    const maxOrder = await this.prisma.mockExamSection.aggregate({
      where: { deletedAt: null },
      _max: { order: true },
    });

    const created = await this.prisma.mockExamSection.create({
      data: {
        name,
        color: dto.color ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
        createdById: userId,
        companyId,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'MockExamSection',
      entityId: created.id,
      newValues: { name: created.name, color: created.color },
      changedById: userId,
      companyId,
    });

    return {
      id: created.id,
      name: created.name,
      color: created.color,
      order: created.order,
      examCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async update(
    id: string,
    dto: UpdateMockExamSectionDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.mockExamSection.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const data: { name?: string; color?: string | null } = {};
    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new BadRequestException(
          "Bo'lim nomi bo'sh bo'lishi mumkin emas",
        );
      }
      data.name = trimmed;
    }
    if (dto.color !== undefined) {
      data.color = dto.color;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Yangilanadigan maydon ko'rsatilmagan");
    }

    const updated = await this.prisma.mockExamSection.update({
      where: { id },
      data,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExamSection',
      entityId: id,
      oldValues: { name: existing.name, color: existing.color },
      newValues: { name: updated.name, color: updated.color },
      changedById: userId,
      companyId,
    });

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      order: updated.order,
    };
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.mockExamSection.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }

    const examCount = await this.prisma.mockExam.count({
      where: { sectionId: id, deletedAt: null },
    });
    if (examCount > 0) {
      throw new BadRequestException(
        "Avval bo'limdagi imtihonlarni boshqa joyga ko'chiring yoki o'chiring",
      );
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'MockExamSection',
      entityId: id,
      oldValues: { name: existing.name, color: existing.color },
      changedById: userId,
      companyId,
    });

    await this.prisma.mockExamSection.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Bo'lim o'chirildi" };
  }

  async reorder(dto: ReorderMockExamSectionsDto) {
    const sections = await this.prisma.mockExamSection.findMany({
      where: { deletedAt: null },
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
        this.prisma.mockExamSection.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    return { message: "Bo'limlar tartibi yangilandi" };
  }
}
