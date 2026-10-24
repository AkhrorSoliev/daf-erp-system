import { Injectable } from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import { PrismaService } from '../prisma/prisma.service';
import {
  displayStatus,
  summarize,
  type LevelTestDisplayStatus,
  type LevelTestStats,
} from './level-test.stats';
import { TOTAL_QUESTIONS } from './level-test.logic';
import type { CorrectByLevel } from './level-test.types';

/** O'quvchi profili ro'yxatida eng ko'pi bilan shuncha urinish. */
const STUDENT_ATTEMPTS_LIMIT = 50;

export interface StudentLevelTestAttempt {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: LevelTestDisplayStatus;
  /** BEGINNER | A1 | A2 | B1 | B2 | UNKNOWN; null — natija chiqarilmagan. */
  result: string | null;
  answered: number;
  correct: number;
  total: number;
  correctByLevel: CorrectByLevel;
}

export interface StudentLevelTests {
  /** Oxirgi natijali urinish (profilda tepada ko'rsatiladi). */
  latest: StudentLevelTestAttempt | null;
  attempts: StudentLevelTestAttempt[];
}

const sumCorrect = (c: CorrectByLevel): number =>
  Object.values(c).reduce((s, n) => s + (n ?? 0), 0);

/**
 * Daraja testi natijalarini o'qish: o'quvchi profili (ADR-0122) va «Bot
 * hisoboti»dagi umumiy statistika. Yozmaydi.
 */
@Injectable()
export class LevelTestResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O'quvchining urinishlari. O'quvchi filialiga qarab tekshiriladi
   * (`assertCallerMayTouchStudent`): boshqa filial o'quvchisini ko'rib bo'lmaydi.
   */
  async forStudent(
    userId: number,
    companyId: number,
    studentId: number,
  ): Promise<StudentLevelTests> {
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const rows = await this.prisma.levelTestAttempt.findMany({
      where: { studentId, companyId },
      orderBy: { createdAt: 'desc' },
      take: STUDENT_ATTEMPTS_LIMIT,
    });
    const now = new Date();
    const attempts = rows.map((r): StudentLevelTestAttempt => {
      const correctByLevel = (r.correctByLevel ?? {}) as CorrectByLevel;
      return {
        id: r.id,
        startedAt: r.createdAt,
        finishedAt: r.finishedAt,
        status: displayStatus(r.status, r.createdAt, now),
        result: r.result,
        answered: r.answered,
        correct: sumCorrect(correctByLevel),
        total: TOTAL_QUESTIONS,
        correctByLevel,
      };
    });
    return {
      latest:
        attempts.find((a) => a.result !== null && a.result !== 'UNKNOWN') ??
        null,
      attempts,
    };
  }

  /** Oy ("YYYY-MM", Toshkent) bo'yicha umumiy statistika. */
  async stats(companyId: number, monthKey: string): Promise<LevelTestStats> {
    const range = tashkentMonthRangeUtc(monthKey);
    const rows = await this.prisma.levelTestAttempt.findMany({
      where: { companyId, createdAt: range },
      select: {
        chatId: true,
        status: true,
        result: true,
        answered: true,
        createdAt: true,
        studentId: true,
        leadId: true,
      },
    });
    return summarize(rows, new Date());
  }
}
