import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
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

  async list(examId: string, companyId: number, scope: ReportBranchIds) {
    await this.ensureExam(examId, companyId, scope);
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
    scope: ReportBranchIds,
  ) {
    const exam = await this.ensureExam(examId, companyId, scope);
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
    await this.syncExamMaxScore(examId);

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
    scope: ReportBranchIds,
  ) {
    const existing = await this.findSubjectInScope(id, companyId, scope);
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
      // O'tish balidan past maksimum — PDF'da hamma katak (to'liq ball ham)
      // "o'tmadi" deb qizil chiqardi.
      if (
        existing.passingScore != null &&
        dto.maxScore < existing.passingScore
      ) {
        throw new BadRequestException(
          `Maksimal ball o'tish balidan (${existing.passingScore}) kam bo'lishi mumkin emas`,
        );
      }
      data.maxScore = dto.maxScore;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Yangilanadigan maydon ko'rsatilmagan");
    }

    const updated = await this.prisma.mockExamSubject.update({
      where: { id },
      data,
    });
    if (data.maxScore !== undefined) {
      await this.syncExamMaxScore(existing.examId);
    }

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

  async remove(
    id: string,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const existing = await this.findSubjectInScope(id, companyId, scope);
    this.ensureSubjectsEditable(existing.exam.status);

    // Hard delete — subjects have no soft-delete column; their scores cascade
    // via onDelete: Cascade on MockExamSubjectScore.subjectId.
    await this.prisma.mockExamSubject.delete({ where: { id } });
    await this.syncExamMaxScore(existing.examId);

    await this.entityHistoryService.recordDelete({
      entityType: 'MockExamSubject',
      entityId: id,
      oldValues: { name: existing.name, maxScore: existing.maxScore },
      changedById: userId,
      companyId,
    });

    return { message: "Bo'lim o'chirildi" };
  }

  async reorder(
    examId: string,
    dto: ReorderMockExamSubjectsDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    await this.ensureExam(examId, companyId, scope);

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

  /**
   * Kompaniya va filial qamrovi bilan — `MockExamsService` dagi bilan bir xil.
   * Ilgari faqat id bo'yicha qidirilardi.
   */
  private async ensureExam(
    examId: string,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const exam = await this.prisma.mockExam.findFirst({
      where: {
        id: examId,
        deletedAt: null,
        companyId,
        ...branchIdWhere(scope),
      },
      select: { id: true, status: true },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return exam;
  }

  private async findSubjectInScope(
    id: string,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const subject = await this.prisma.mockExamSubject.findFirst({
      where: {
        id,
        exam: { deletedAt: null, companyId, ...branchIdWhere(scope) },
      },
      include: { exam: { select: { status: true } } },
    });
    if (!subject) {
      throw new NotFoundException("Bo'lim topilmadi");
    }
    return subject;
  }

  /**
   * Imtihon `maxScore` — fanlar maksimumlari yig'indisi (yaratishda shunday
   * olinadi). Fan qo'shilsa/o'zgarsa/o'chsa yangilanmasa, foiz 100% dan
   * oshib ketardi va natijalar jadvali "90 / 75" ko'rsatardi.
   */
  private async syncExamMaxScore(examId: string) {
    const agg = await this.prisma.mockExamSubject.aggregate({
      where: { examId },
      _sum: { maxScore: true },
    });
    const total = agg._sum.maxScore ?? 0;
    if (total > 0) {
      await this.prisma.mockExam.update({
        where: { id: examId },
        data: { maxScore: total },
      });
    }
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
