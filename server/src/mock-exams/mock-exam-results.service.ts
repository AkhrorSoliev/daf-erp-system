import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
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
 *   - rank = recomputed via `recalculateRanks()` (DESC by totalScore, ties
 *     get the same rank, next rank skips by group size — i.e. dense rank
 *     when scores are equal, but standard competition ranking otherwise:
 *     two participants tied for 1st → both rank 1, next is rank 3).
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
  async matrix(examId: string) {
    const exam = await this.ensureExam(examId);
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
  ) {
    const exam = await this.ensureExam(examId);
    if (exam.status !== MockExamStatus.GRADING) {
      throw new BadRequestException(
        "Ballarni faqat GRADING (baholanmoqda) holatida kiritish mumkin",
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
          throw new BadRequestException(
            `Bo'lim topilmadi: ${s.subjectId}`,
          );
        }
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

    return this.matrix(examId);
  }

  async recalculateRanks(examId: string, companyId: number, userId: number) {
    await this.ensureExam(examId);

    const graded = await this.prisma.mockExamParticipant.findMany({
      where: {
        examId,
        deletedAt: null,
        totalScore: { not: null },
      },
      select: { id: true, totalScore: true },
      orderBy: { totalScore: 'desc' },
    });

    // Standard competition ranking (1224 — ties share the same rank,
    // next rank skips by the size of the tied group).
    let currentRank = 0;
    let lastScore: number | null = null;
    let groupCount = 0;

    const updates: Array<{ id: string; rank: number }> = [];
    for (const p of graded) {
      groupCount++;
      if (p.totalScore !== lastScore) {
        currentRank = groupCount;
        lastScore = p.totalScore;
      }
      updates.push({ id: p.id, rank: currentRank });
    }

    if (updates.length === 0) {
      // Clear any leftover ranks (e.g. after deletion of graded participants).
      await this.prisma.mockExamParticipant.updateMany({
        where: { examId, deletedAt: null, rank: { not: null } },
        data: { rank: null },
      });
    } else {
      await this.prisma.$transaction(
        updates.map((u) =>
          this.prisma.mockExamParticipant.update({
            where: { id: u.id },
            data: { rank: u.rank },
          }),
        ),
      );
      // Wipe rank on ungraded participants so stale values don't linger.
      await this.prisma.mockExamParticipant.updateMany({
        where: {
          examId,
          deletedAt: null,
          totalScore: null,
          rank: { not: null },
        },
        data: { rank: null },
      });
    }

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExam',
      entityId: examId,
      oldValues: { action: 'ranks_recalculated' },
      newValues: {
        action: 'ranks_recalculated',
        graded: updates.length,
      },
      changedById: userId,
      companyId,
    });

    return { message: "O'rinlar qayta hisoblandi", graded: updates.length };
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
    // Upsert each subject score.
    for (const s of entry.scores) {
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

    const totalScore = allScores.reduce((sum, s) => sum + s.score, 0);
    const percentage = examMaxScore > 0 ? (totalScore / examMaxScore) * 100 : 0;
    const passed =
      examPassingScore !== null ? totalScore >= examPassingScore : null;

    // A participant is "graded" once every subject has a score row.
    const isFullyGraded =
      totalSubjectCount > 0 && allScores.length === totalSubjectCount;

    await tx.mockExamParticipant.update({
      where: { id: entry.participantId },
      data: {
        totalScore,
        percentage: Number(percentage.toFixed(2)),
        passed,
        feedback: entry.feedback ?? undefined,
        gradedAt: isFullyGraded ? now : null,
        gradedById: isFullyGraded ? userId : null,
      },
    });
  }

  private async ensureExam(examId: string) {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
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
