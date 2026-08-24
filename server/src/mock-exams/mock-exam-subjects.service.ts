import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateMockExamSubjectDto } from './dto/create-mock-exam-subject.dto';
import { UpdateMockExamSubjectDto } from './dto/update-mock-exam-subject.dto';
import { ReorderMockExamSubjectsDto } from './dto/reorder-mock-exam-subjects.dto';

/**
 * Sub-sections within a mock exam (e.g. IELTS → Reading / Writing /
 * Listening / Speaking). Each carries its own maxScore and shows up as a
 * column in the result entry table (Faza 6).
 *
 * Subjects can be CRUD'd while the exam is still in the registration phases.
 * Once results are being entered (GRADING) or already announced, editing
 * subjects is blocked — changing maxScore retroactively would corrupt the
 * existing per-subject scores.
 */
@Injectable()
export class MockExamSubjectsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async list(examId: string) {
    await this.ensureExam(examId);
    return this.prisma.mockExamSubject.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
    });
  }

  async create(
    examId: string,
    dto: CreateMockExamSubjectDto,
    companyId: number,
    userId: number,
  ) {
    const exam = await this.ensureExam(examId);
    this.ensureSubjectsEditable(exam.status);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Bo'lim nomi bo'sh bo'lishi mumkin emas");
    }

    const maxOrder = await this.prisma.mockExamSubject.aggregate({
      where: { examId },
      _max: { order: true },
    });

    const created = await this.prisma.mockExamSubject.create({
      data: {
        examId,
        name,
        maxScore: dto.maxScore,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'MockExamSubject',
      entityId: created.id,
      newValues: { name, maxScore: dto.maxScore, examId },
      changedById: userId,
      companyId,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateMockExamSubjectDto,
    companyId: number,
    userId: number,
  ) {
    const existing = await this.prisma.mockExamSubject.findUnique({
      where: { id },
      include: { exam: { select: { status: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }
    this.ensureSubjectsEditable(existing.exam.status);

    const data: { name?: string; maxScore?: number } = {};
    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new BadRequestException("Bo'lim nomi bo'sh bo'lishi mumkin emas");
      }
      data.name = trimmed;
    }
    if (dto.maxScore !== undefined) {
      data.maxScore = dto.maxScore;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Yangilanadigan maydon ko'rsatilmagan");
    }

    const updated = await this.prisma.mockExamSubject.update({
      where: { id },
      data,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExamSubject',
      entityId: id,
      oldValues: { name: existing.name, maxScore: existing.maxScore },
      newValues: { name: updated.name, maxScore: updated.maxScore },
      changedById: userId,
      companyId,
    });

    return updated;
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.mockExamSubject.findUnique({
      where: { id },
      include: { exam: { select: { status: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Bo'lim topilmadi");
    }
    this.ensureSubjectsEditable(existing.exam.status);

    // Hard delete — subjects have no soft-delete column; their scores cascade
    // via onDelete: Cascade on MockExamSubjectScore.subjectId.
    await this.prisma.mockExamSubject.delete({ where: { id } });

    await this.entityHistoryService.recordDelete({
      entityType: 'MockExamSubject',
      entityId: id,
      oldValues: { name: existing.name, maxScore: existing.maxScore },
      changedById: userId,
      companyId,
    });

    return { message: "Bo'lim o'chirildi" };
  }

  async reorder(examId: string, dto: ReorderMockExamSubjectsDto) {
    await this.ensureExam(examId);

    const subjects = await this.prisma.mockExamSubject.findMany({
      where: { examId },
      select: { id: true },
    });
    const ids = new Set(subjects.map((s) => s.id));
    for (const id of dto.subjectIds) {
      if (!ids.has(id)) {
        throw new BadRequestException("Bo'lim topilmadi");
      }
    }
    if (dto.subjectIds.length !== subjects.length) {
      throw new BadRequestException(
        "Barcha bo'limlar tartibda ko'rsatilishi kerak",
      );
    }

    await this.prisma.$transaction(
      dto.subjectIds.map((id, index) =>
        this.prisma.mockExamSubject.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    return { message: "Bo'limlar tartibi yangilandi" };
  }

  private async ensureExam(examId: string) {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return exam;
  }

  private ensureSubjectsEditable(status: MockExamStatus) {
    if (
      status === MockExamStatus.GRADING ||
      status === MockExamStatus.ANNOUNCED ||
      status === MockExamStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        "Imtihon bo'limlarini bahalanish yoki e'lon qilinganidan keyin o'zgartirib bo'lmaydi",
      );
    }
  }
}
