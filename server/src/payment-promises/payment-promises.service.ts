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

  /**
   * Record a debtor's commitment to pay by a date. One OPEN promise per
   * student is enforced by a partial unique index (P2002 → friendly Uzbek
   * 400). The promise auto-resolves to KEPT when a payment restores the
   * balance (see PaymentsWriteService.settleKeptPromises), or is flipped to
   * BROKEN by the daily cron if the date passes while the student still owes.
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

    const branchId = await this.resolveStudentBranch(dto.studentId, companyId);

    try {
      const promise = await this.prisma.paymentPromise.create({
        data: {
          studentId: dto.studentId,
          promiseDate: new Date(dto.promiseDate),
          comment: dto.comment.trim(),
          status: 'OPEN',
          balanceAtPromise: student.balance,
          createdById: userId,
          branchId,
          companyId,
        },
      });

      await this.entityHistory.recordCreate({
        entityType: 'Student',
        entityId: String(dto.studentId),
        newValues: {
          action: "TO'LOV_VA'DASI_BERILDI",
          sana: dto.promiseDate,
          izoh: dto.comment.trim(),
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

  /**
   * Create-or-update the student's OPEN payment promise. Used by the outreach
   * call flow ("To'laydi" + sana): an admin re-calling a debtor can set a new
   * date without first cancelling the old one. If an OPEN promise exists its
   * date/comment are refreshed (and the overdue cron re-armed); otherwise a new
   * one is created. Returns the promise.
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

    const comment = params.comment.trim();
    const promiseDate = new Date(params.promiseDate);

    const existing = await this.prisma.paymentPromise.findFirst({
      where: { studentId: params.studentId, companyId, status: 'OPEN' },
      select: { id: true, promiseDate: true },
    });

    if (existing) {
      const updated = await this.prisma.paymentPromise.update({
        where: { id: existing.id },
        data: {
          promiseDate,
          comment,
          balanceAtPromise: student.balance,
          // Re-arm the overdue reminder cron for the new date.
          reminderFiredAt: null,
        },
      });
      await this.entityHistory.recordUpdate({
        entityType: 'Student',
        entityId: String(params.studentId),
        oldValues: { toLovSanasi: existing.promiseDate.toISOString() },
        newValues: { toLovSanasi: promiseDate.toISOString() },
        changedById: userId,
        companyId,
      });
      return updated;
    }

    const branchId = await this.resolveStudentBranch(
      params.studentId,
      companyId,
    );
    const created = await this.prisma.paymentPromise.create({
      data: {
        studentId: params.studentId,
        promiseDate,
        comment,
        status: 'OPEN',
        balanceAtPromise: student.balance,
        createdById: userId,
        branchId,
        companyId,
      },
    });
    await this.entityHistory.recordCreate({
      entityType: 'Student',
      entityId: String(params.studentId),
      newValues: {
        action: "TO'LOV_VA'DASI_BERILDI",
        sana: params.promiseDate,
        izoh: comment,
      },
      changedById: userId,
      companyId,
    });
    return created;
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
