import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
import { MockExamBillingService } from './mock-exam-billing.service';
import { effectiveMockFee } from './mock-exam-pricing.util';
import { MockExamStats, summarizeMockExam } from './mock-exam-stats';

export interface ExamPaidTotals {
  paidCount: number;
  revenue: number;
}

/**
 * Loads what `summarizeMockExam` counts. The exam is found exactly the way
 * `MockExamsService.findOne` finds it, so the block exists whenever the page
 * does, and an out-of-scope id reads as 404.
 */
@Injectable()
export class MockExamStatsService {
  constructor(
    private prisma: PrismaService,
    private billing: MockExamBillingService,
  ) {}

  async getStats(
    examId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<MockExamStats> {
    const exam = await this.prisma.mockExam.findFirst({
      where: {
        id: examId,
        deletedAt: null,
        companyId,
        ...branchIdWhere(scope),
      },
      select: {
        price: true,
        offeredLevels: true,
        examTimes: true,
        announcedAt: true,
      },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }

    const rows = await this.prisma.mockExamParticipant.findMany({
      where: { examId, deletedAt: null },
      select: {
        id: true,
        registeredVia: true,
        studentId: true,
        convertedAt: true,
        feeAmount: true,
        paid: true,
        paymentMethod: true,
        formData: true,
        level: true,
        examTime: true,
        telegramChatId: true,
        resultSentAt: true,
        resultSendError: true,
      },
    });

    // Only a paid row with no stored method can be an old balance payment.
    const fromBalance = await this.billing.paidFromBalanceIds(
      rows.filter((p) => p.paid && p.paymentMethod === null).map((p) => p.id),
    );
    return summarizeMockExam(exam, rows, fromBalance);
  }

  /**
   * Paid registrations and their money per exam, for the exams list. The same
   * rule as `MockExamsService.revenueSummary`, so the column adds up to the
   * card above it.
   */
  async paidTotals(
    exams: { id: string; price: number }[],
  ): Promise<Map<string, ExamPaidTotals>> {
    const totals = new Map<string, ExamPaidTotals>(
      exams.map((e) => [e.id, { paidCount: 0, revenue: 0 }]),
    );
    if (exams.length === 0) return totals;

    const priceOf = new Map(exams.map((e) => [e.id, e.price]));
    const paid = await this.prisma.mockExamParticipant.findMany({
      where: {
        examId: { in: exams.map((e) => e.id) },
        deletedAt: null,
        paid: true,
      },
      select: { examId: true, feeAmount: true },
    });
    for (const p of paid) {
      const total = totals.get(p.examId);
      if (!total) continue;
      total.paidCount += 1;
      total.revenue += effectiveMockFee(
        p.feeAmount,
        priceOf.get(p.examId) ?? 0,
      );
    }
    return totals;
  }
}
