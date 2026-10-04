import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreatePaymentPromiseDto } from './dto/create-payment-promise.dto';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';
import {
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';
import {
  promiseDateRange,
  promiseRefusal,
  type PromiseMonthState,
} from './promise-rule';

@Injectable()
export class PaymentPromisesService {
  constructor(
    private prisma: PrismaService,
    private entityHistory: EntityHistoryService,
  ) {}

  /**
   * The student must be one this caller can act on.
   *
   * Every method here was keyed on `(studentId, companyId)` alone, so naming a
   * student id was enough — a Namangan director could read a Fargona debtor's
   * promise history, record a new promise on them, or cancel one. The same gate
   * already existed on the payment and transaction reads
   * (`transactions-read.service.ts`); the promises module was written alongside
   * them and did not get it.
   *
   * 404, not 403: a 403 confirms the id exists in another branch, and the rows
   * behind it carry the amount, the date and the admin's note.
   */
  private async assertStudentInScope(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<void> {
    if (branchIds == null) return; // CEO — every branch
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        companyId,
        deletedAt: null,
        ...studentBranchWhere(branchIds),
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
  }

  /** The student's latest promise created in the current Tashkent month, any status. */
  private monthPromise(studentId: number, companyId: number, now: Date) {
    return this.prisma.paymentPromise.findFirst({
      where: {
        studentId,
        companyId,
        createdAt: tashkentMonthRangeUtc(tashkentMonthKey(now)),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        promiseDate: true,
        promisedAmount: true,
        createdAt: true,
      },
    });
  }

  /**
   * The promise rule (ADR-0072) as a check. The payment and the call log call
   * it BEFORE their own writes, so a bad promise is a 400 with nothing saved —
   * a payment never stands half-done because of its promise.
   */
  async assertPromiseAllowed(p: {
    studentId: number;
    companyId: number;
    promiseDate: string;
    mode: 'create' | 'upsert';
  }): Promise<void> {
    const now = new Date();
    const refusal = promiseRefusal(
      now,
      await this.monthPromise(p.studentId, p.companyId, now),
      p.mode,
      p.promiseDate,
    );
    if (refusal) throw new BadRequestException(refusal);
  }

  /** `GET /payment-promises/month`: what the drawer form and the dialogs may offer. */
  async monthState(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<PromiseMonthState> {
    await this.assertStudentInScope(studentId, companyId, branchIds);
    const now = new Date();
    const p = await this.monthPromise(studentId, companyId, now);
    const create = promiseDateRange(now, p, 'create');
    const edit =
      p?.status === 'OPEN' ? promiseDateRange(now, p, 'upsert') : null;
    return {
      monthPromise: p
        ? {
            id: p.id,
            status: p.status,
            promiseDate: p.promiseDate.toISOString(),
            promisedAmount: p.promisedAmount,
            createdAt: p.createdAt.toISOString(),
          }
        : null,
      create: 'refusal' in create ? null : create,
      edit: edit && !('refusal' in edit) ? edit : null,
    };
  }

  /**
   * Record a debtor's commitment to pay by a date — at most 7 days ahead and
   * once per Tashkent month (ADR-0072). It resolves to KEPT when a payment
   * restores the balance, or to BROKEN by the daily cron.
   */
  async create(
    dto: CreatePaymentPromiseDto,
    userId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    await this.assertStudentInScope(dto.studentId, companyId, branchIds);
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    const now = new Date();
    const refusal = promiseRefusal(
      now,
      await this.monthPromise(dto.studentId, companyId, now),
      'create',
      dto.promiseDate,
    );
    if (refusal) throw new BadRequestException(refusal);
    return this.writeNewPromise(
      {
        studentId: dto.studentId,
        promiseDate: dto.promiseDate,
        comment: dto.comment.trim(),
        promisedAmount: dto.promisedAmount ?? null,
        balance: student.balance,
      },
      userId,
      companyId,
    );
  }

  /**
   * Create-or-update the month's promise (the call flow's «To'laydi» + sana,
   * and a part payment's date for the rest). This month's OPEN promise gets
   * the new date — only within 7 days of its creation day; otherwise the
   * month's first promise is written (ADR-0072).
   */
  async upsertOpenPromise(
    params: { studentId: number; promiseDate: string; comment: string },
    userId: number,
    companyId: number,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    const now = new Date();
    const month = await this.monthPromise(params.studentId, companyId, now);
    const refusal = promiseRefusal(now, month, 'upsert', params.promiseDate);
    if (refusal) throw new BadRequestException(refusal);
    const comment = params.comment.trim();
    if (month) {
      // The rule let it through, so this is the month's OPEN promise.
      const promiseDate = new Date(params.promiseDate);
      const updated = await this.prisma.paymentPromise.update({
        where: { id: month.id },
        // reminderFiredAt: null re-arms the overdue cron for the new date.
        data: {
          promiseDate,
          comment,
          balanceAtPromise: student.balance,
          reminderFiredAt: null,
        },
      });
      await this.entityHistory.recordUpdate({
        entityType: 'Student',
        entityId: String(params.studentId),
        oldValues: { toLovSanasi: month.promiseDate.toISOString() },
        newValues: { toLovSanasi: promiseDate.toISOString() },
        changedById: userId,
        companyId,
      });
      return updated;
    }
    return this.writeNewPromise(
      {
        studentId: params.studentId,
        promiseDate: params.promiseDate,
        comment,
        promisedAmount: null,
        balance: student.balance,
      },
      userId,
      companyId,
    );
  }

  /**
   * Writes the month's first promise. An OPEN promise left from an earlier
   * month is closed first (CANCELLED): one OPEN promise per student is a
   * partial unique index, and the old one is not this month's (ADR-0072).
   */
  private async writeNewPromise(
    p: {
      studentId: number;
      promiseDate: string;
      comment: string;
      promisedAmount: number | null;
      balance: number;
    },
    userId: number,
    companyId: number,
  ) {
    const branchId = await this.resolveStudentBranch(p.studentId, companyId);
    try {
      const { promise, superseded } = await this.prisma.$transaction(
        async (tx) => {
          const old = await tx.paymentPromise.findFirst({
            where: { studentId: p.studentId, companyId, status: 'OPEN' },
            select: { id: true },
          });
          if (old) {
            await tx.paymentPromise.update({
              where: { id: old.id },
              data: {
                status: 'CANCELLED',
                resolvedAt: new Date(),
                resolvedById: userId,
              },
            });
          }
          const promise = await tx.paymentPromise.create({
            data: {
              studentId: p.studentId,
              promiseDate: new Date(p.promiseDate),
              comment: p.comment,
              promisedAmount: p.promisedAmount,
              status: 'OPEN',
              balanceAtPromise: p.balance,
              createdById: userId,
              branchId,
              companyId,
            },
          });
          return { promise, superseded: Boolean(old) };
        },
      );
      if (superseded) {
        await this.entityHistory.recordStatusChange({
          entityType: 'Student',
          entityId: String(p.studentId),
          oldValues: { vada: 'OCHIQ' },
          newValues: {
            vada: 'BEKOR_QILINDI',
            action: "TO'LOV_VA'DASI_BEKOR_QILINDI",
            sabab: "Yangi oy va'dasi bilan almashtirildi",
          },
          changedById: userId,
          companyId,
        });
      }
      await this.entityHistory.recordCreate({
        entityType: 'Student',
        entityId: String(p.studentId),
        newValues: {
          action: "TO'LOV_VA'DASI_BERILDI",
          sana: p.promiseDate,
          izoh: p.comment,
          ...(p.promisedAmount != null && { summa: p.promisedAmount }),
        },
        changedById: userId,
        companyId,
      });
      return promise;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          "Bu o'quvchida belgilangan to'lov sanasi allaqachon mavjud",
        );
      }
      throw err;
    }
  }

  async cancel(
    id: string,
    userId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const promise = await this.prisma.paymentPromise.findFirst({
      where: { id, companyId, status: 'OPEN' },
    });
    if (!promise)
      throw new NotFoundException("Belgilangan to'lov sanasi topilmadi");
    // Gated on the promise's STUDENT, because the promise itself carries no
    // branch — cancelling one is a write on that student's debt record.
    await this.assertStudentInScope(promise.studentId, companyId, branchIds);

    const updated = await this.prisma.paymentPromise.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        resolvedAt: new Date(),
        resolvedById: userId,
      },
    });

    await this.entityHistory.recordStatusChange({
      entityType: 'Student',
      entityId: String(promise.studentId),
      oldValues: { vada: 'OCHIQ' },
      newValues: {
        vada: 'BEKOR_QILINDI',
        action: "TO'LOV_VA'DASI_BEKOR_QILINDI",
      },
      changedById: userId,
      companyId,
    });

    return updated;
  }

  async findByStudent(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    // Gate on the student, then return their history in full — the per-entity
    // rule this codebase uses everywhere: access is decided once, at the
    // entity, rather than by filtering rows the caller already reached.
    await this.assertStudentInScope(studentId, companyId, branchIds);
    return this.prisma.paymentPromise.findMany({
      where: { studentId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Same branch-resolution order as PaymentsWriteService: active enrollment's
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
