import { Injectable, NotFoundException } from '@nestjs/common';
import { CallOutcome, CallReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { EntityHistoryService } from '../common/entity-history';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
} from '../attendance/shared/date-utils';
import { PaymentPromisesService } from '../payment-promises/payment-promises.service';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { ListCallLogsQueryDto } from './dto/list-call-logs-query.dto';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';

// Uzbek labels for the audit trail (EntityHistory is read by humans).
const REASON_LABEL: Record<CallReason, string> = {
  ABSENCE: 'Darsga kelmagani',
  DEBT: 'Qarz / to‘lov',
  REMOVAL: 'Ko‘p dars qoldirgani',
  OTHER: 'Boshqa',
};
const OUTCOME_LABEL: Record<CallOutcome, string> = {
  ANSWERED: 'Gaplashildi',
  NO_ANSWER: 'Javob bermadi',
  PROMISED: 'Keladi / to‘laydi dedi', // legacy
  WILL_COME: 'Keladi dedi',
  WILL_PAY: 'To‘laydi dedi',
  LEFT: 'O‘qishni tashladi',
};

interface ListContext {
  userId: number;
  companyId: number;
  roles: string[];
  query: ListCallLogsQueryDto;
  /** The request's RESOLVED scope from `@BranchScope()`. */
  branchScope: ReportBranchIds;
}

@Injectable()
export class CallLogsService {
  constructor(
    private prisma: PrismaService,
    private entityHistory: EntityHistoryService,
    private paymentPromises: PaymentPromisesService,
  ) {}

  /**
   * Record a phone call an admin just made to a student from /outreach. Unlike
   * the old Comment-task flow, this logs a call that already happened (who,
   * reason, outcome, optional note). Also writes a Student EntityHistory row.
   */
  async create(dto: CreateCallLogDto, userId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    // The row is attributed to the STUDENT's branch (below), which is right —
    // but resolving a branch is not authorising one. A call log carries a
    // note about a conversation with somebody's customer, and a WILL_PAY
    // outcome opens a `PaymentPromise` on that student, so it reaches the
    // debtors workflow of a branch the caller may not even view.
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );

    const branchId = await this.resolveStudentBranch(dto.studentId, companyId);
    const note = dto.note?.trim() || null;

    // "Keyingi aloqa" (call again later) date — only for non-payment outcomes.
    // WILL_PAY carries its date in promiseDate (→ payment promise), so a stray
    // followUpAt there is ignored to keep the two concepts separate.
    const followUpAt =
      dto.outcome !== 'WILL_PAY' && dto.followUpAt
        ? new Date(dto.followUpAt)
        : null;

    const log = await this.prisma.callLog.create({
      data: {
        studentId: dto.studentId,
        reason: dto.reason,
        outcome: dto.outcome,
        note,
        followUpAt,
        calledById: userId,
        branchId,
        companyId,
      },
    });

    await this.entityHistory.recordCreate({
      entityType: 'Student',
      entityId: String(dto.studentId),
      newValues: {
        action: "QO'NG'IROQ_QILINDI",
        sabab: REASON_LABEL[dto.reason],
        natija: OUTCOME_LABEL[dto.outcome],
        ...(note ? { izoh: note } : {}),
        ...(followUpAt ? { keyingiAloqa: tashkentDateStr(followUpAt) } : {}),
      },
      changedById: userId,
      companyId,
    });

    // "To'laydi" + sana → create/refresh the student's OPEN payment promise so
    // it surfaces on the "To'lov sanalari" tab. Date is optional.
    if (dto.outcome === 'WILL_PAY' && dto.promiseDate) {
      await this.paymentPromises.upsertOpenPromise(
        {
          studentId: dto.studentId,
          promiseDate: dto.promiseDate,
          comment: note ?? "Qo'ng'iroqda to'layman dedi",
        },
        userId,
        companyId,
      );
    }

    return log;
  }

  /**
   * Branch-scoped, paginated call history. No `studentId` → the /outreach
   * "Qo'ng'iroq tarixi" tab (all calls in scope). With `studentId` → one
   * student's history (profile tab). Newest first.
   */
  async list(ctx: ListContext) {
    const page = ctx.query.page ?? 1;
    const pageSize = ctx.query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) {
      return { total: 0, page, pageSize, items: [] };
    }

    const where: Prisma.CallLogWhereInput = {
      companyId: ctx.companyId,
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(ctx.query.studentId ? { studentId: ctx.query.studentId } : {}),
      ...(ctx.query.date
        ? { createdAt: tashkentDayRangeUtc(ctx.query.date) }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.callLog.findMany({
        where,
        select: {
          id: true,
          reason: true,
          outcome: true,
          note: true,
          createdAt: true,
          student: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          calledBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.callLog.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      outcome: r.outcome,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      student: r.student,
      calledBy: r.calledBy,
    }));

    return { total, page, pageSize, items };
  }

  // CEO spans every branch; everyone else — Administrator included — is confined
  // to their own. Call logs carry student names and phone numbers, so a
  // company-wide Administrator view leaked the other branch's contact list.
  /**
   * The request's RESOLVED scope, straight from `@BranchScope()`.
   *
   * This used to call `resolveCallerReportBranchIds(userId)` itself with no
   * requested branch, so the page ignored the header switcher entirely: a CEO
   * who picked Namangan still saw both branches. Taking the decorator's value
   * fixes that AND removes a private copy of the rule — re-deriving a scope
   * inside a service is the documented mistake that had a workbook printing
   * one branch on its cover and another in its totals.
   *
   * `null` (every branch) becomes `undefined` here because that is what these
   * queries already spell "no restriction" as; `[]` stays `[]`, and stays
   * nothing.
   */
  private toBranchIds(scope: ReportBranchIds): number[] | undefined {
    return scope ?? undefined;
  }

  // Same branch-resolution order as PaymentPromisesService: active enrollment's
  // group branch first, then the student's branch link.
  private async resolveStudentBranch(
    studentId: number,
    companyId: number,
  ): Promise<number | null> {
    const activeEnrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: 'ACTIVE',
        group: { companyId, deletedAt: null },
      },
      select: { group: { select: { branchId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (activeEnrollment?.group?.branchId) {
      return activeEnrollment.group.branchId;
    }
    const studentBranch = await this.prisma.studentBranch.findFirst({
      where: { studentId, student: { companyId } },
      select: { branchId: true },
    });
    return studentBranch?.branchId ?? null;
  }
}
