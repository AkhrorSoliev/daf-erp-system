import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { applyCompetitionRanks } from './mock-exam-ranking';
import {
  BulkEnterScoresDto,
  ParticipantScoresDto,
} from './dto/bulk-enter-scores.dto';

/**
 * Per-participant per-subject results entry. The whole flow is gated to the
 * GRADING status — admins must explicitly move the exam there from
 * REGISTRATION_CLOSED before scores can be saved, and ANNOUNCED/ARCHIVED
 * lock the table (re-grading would invalidate already-published rankings).
 *
 * Computation rules:
 *   - totalScore = sum of MockExamSubjectScore.score per participant (only
 *     subjects that the participant has a score row for count; missing
 *     scores are treated as 0 for sum/percentage but the participant is
 *     considered "ungraded" until every subject has a score).
 *   - percentage = totalScore / exam.maxScore × 100
 *   - passed = exam.passingScore != null && totalScore >= exam.passingScore
 *   - rank = recomputed after every save (and on announce) by
 *     `applyCompetitionRanks` — DESC by totalScore, ties share a rank, the
 *     next rank skips by the group size (1, 1, 3).
 *   - a `score: null` entry deletes that subject's score (a mistyped score
 *     for a no-show can be cleared); with no scores left the participant is
 *     ungraded again (totals null).
 */
@Injectable()
export class MockExamResultsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Matrix view used by the frontend results table.
   * Shape: { subjects, participants: [{ id, name, scores: {subjectId: score}, ... }] }
   */
  async matrix(examId: string, companyId: number, scope: ReportBranchIds) {
    const exam = await this.ensureExam(examId, companyId, scope);
    const subjects = await this.prisma.mockExamSubject.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
    });
    const participants = await this.prisma.mockExamParticipant.findMany({
      where: { examId, deletedAt: null },
      orderBy: [{ rank: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        subjectScores: {
          select: {
            subjectId: true,
            score: true,
            feedback: true,
          },
        },
      },
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        maxScore: exam.maxScore,
        passingScore: exam.passingScore,
      },
      subjects,
      participants: participants.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        totalScore: p.totalScore,
        percentage: p.percentage,
        passed: p.passed,
        rank: p.rank,
        feedback: p.feedback,
        gradedAt: p.gradedAt,
        scoresBySubjectId: Object.fromEntries(
          p.subjectScores.map((s) => [s.subjectId, s.score]),
        ),
      })),
    };
  }

  async bulkSave(
    examId: string,
    dto: BulkEnterScoresDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const exam = await this.ensureExam(examId, companyId, scope);
    if (exam.status !== MockExamStatus.GRADING) {
      throw new BadRequestException(
        'Ballarni faqat GRADING (baholanmoqda) holatida kiritish mumkin',
      );
    }

    const subjects = await this.prisma.mockExamSubject.findMany({
      where: { examId },
      select: { id: true, maxScore: true },
    });
    const subjectMaxById = new Map(subjects.map((s) => [s.id, s.maxScore]));

    const participants = await this.prisma.mockExamParticipant.findMany({
      where: { examId, deletedAt: null },
      select: { id: true },
    });
    const participantIds = new Set(participants.map((p) => p.id));

    // Validate every entry up-front before opening a transaction.
    for (const entry of dto.participants) {
      if (!participantIds.has(entry.participantId)) {
        throw new BadRequestException(
          `Ishtirokchi topilmadi: ${entry.participantId}`,
        );
      }
      for (const s of entry.scores) {
        const max = subjectMaxById.get(s.subjectId);
        if (max === undefined) {
          throw new BadRequestException(`Bo'lim topilmadi: ${s.subjectId}`);
        }
        if (s.score === null) continue; // bahoni o'chirish
        if (s.score < 0 || s.score > max) {
          throw new BadRequestException(
            `Ball 0 dan ${max} gacha bo'lishi kerak (subject ${s.subjectId})`,
          );
        }
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.participants) {
        await this.persistParticipantScores(
          tx,
          entry,
          exam.maxScore,
          exam.passingScore,
          subjects.length,
          now,
          userId,
        );
      }
    });

    // O'rinlar har saqlashda yangilanadi — e'londan oldin tugmani bosish
    // esdan chiqsa ham PDF'da to'g'ri o'rin chiqsin.
    await applyCompetitionRanks(this.prisma, examId);

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExam',
      entityId: examId,
      oldValues: { action: 'scores_saved' },
      newValues: {
        action: 'scores_saved',
        participantsUpdated: dto.participants.length,
      },
      changedById: userId,
      companyId,
    });

    return this.matrix(examId, companyId, scope);
  }

  async recalculateRanks(
    examId: string,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    await this.ensureExam(examId, companyId, scope);

    const graded = await applyCompetitionRanks(this.prisma, examId);

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExam',
      entityId: examId,
      oldValues: { action: 'ranks_recalculated' },
      newValues: { action: 'ranks_recalculated', graded },
      changedById: userId,
      companyId,
    });

    return { message: "O'rinlar qayta hisoblandi", graded };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async persistParticipantScores(
    tx: Prisma.TransactionClient,
    entry: ParticipantScoresDto,
    examMaxScore: number,
    examPassingScore: number | null,
    totalSubjectCount: number,
    now: Date,
    userId: number,
  ) {
    // Upsert each subject score; `null` clears it.
    for (const s of entry.scores) {
      if (s.score === null) {
        await tx.mockExamSubjectScore.deleteMany({
          where: { participantId: entry.participantId, subjectId: s.subjectId },
        });
        continue;
      }
      await tx.mockExamSubjectScore.upsert({
        where: {
          participantId_subjectId: {
            participantId: entry.participantId,
            subjectId: s.subjectId,
          },
        },
        create: {
          participantId: entry.participantId,
          subjectId: s.subjectId,
          score: s.score,
          feedback: s.feedback ?? null,
        },
        update: {
          score: s.score,
          feedback: s.feedback ?? null,
        },
      });
    }

    // Recompute totals from the DB (including any pre-existing rows we didn't
    // touch in this call — partial saves are valid).
    const allScores = await tx.mockExamSubjectScore.findMany({
      where: { participantId: entry.participantId },
      select: { score: true },
    });

    // Hech bir bahosi qolmagan ishtirokchi — baholanmagan (o'rin ham olmaydi).
    const hasScores = allScores.length > 0;
    const totalScore = hasScores
      ? allScores.reduce((sum, s) => sum + s.score, 0)
      : null;
    const percentage =
      totalScore === null
        ? null
        : Number(
            (examMaxScore > 0 ? (totalScore / examMaxScore) * 100 : 0).toFixed(
              2,
            ),
          );
    const passed =
      totalScore !== null && examPassingScore !== null
        ? totalScore >= examPassingScore
        : null;

    // A participant is "graded" once every subject has a score row.
    const isFullyGraded =
      totalSubjectCount > 0 && allScores.length === totalSubjectCount;

    await tx.mockExamParticipant.update({
      where: { id: entry.participantId },
      data: {
        totalScore,
        percentage,
        passed,
        feedback: entry.feedback ?? undefined,
        gradedAt: isFullyGraded ? now : null,
        gradedById: isFullyGraded ? userId : null,
      },
    });
  }

  /**
   * Kompaniya va filial qamrovi bilan — `MockExamsService` dagi bilan bir xil.
   * Ilgari faqat id bo'yicha qidirilardi: boshqa filial imtihonining ism,
   * telefon va baholarini ko'rish hamda o'zgartirish mumkin edi.
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
      select: {
        id: true,
        title: true,
        status: true,
        maxScore: true,
        passingScore: true,
      },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return exam;
  }
}
