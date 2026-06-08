import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreatePaymentPromiseDto } from './dto/create-payment-promise.dto';

@Injectable()
export class PaymentPromisesService {
  constructor(
    private prisma: PrismaService,
    private entityHistory: EntityHistoryService,
  ) {}

  /**
   * Record a debtor's commitment to pay by a date. One OPEN promise per
   * student is enforced by a partial unique index (P2002 → friendly Uzbek
   * 400). The promise auto-resolves to KEPT when a payment restores the
   * balance (see PaymentsWriteService.settleKeptPromises), or is flipped to
   * BROKEN by the daily cron if the date passes while the student still owes.
   */
  async create(dto: CreatePaymentPromiseDto, userId: number, companyId: number) {
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
          promisedAmount: dto.promisedAmount ?? null,
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
          ...(dto.promisedAmount != null ? { summa: dto.promisedAmount } : {}),
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

  async cancel(id: string, userId: number, companyId: number) {
    const promise = await this.prisma.paymentPromise.findFirst({
      where: { id, companyId, status: 'OPEN' },
    });
    if (!promise) throw new NotFoundException("Belgilangan to'lov sanasi topilmadi");

    const updated = await this.prisma.paymentPromise.update({
      where: { id },
      data: { status: 'CANCELLED', resolvedAt: new Date(), resolvedById: userId },
    });

    await this.entityHistory.recordStatusChange({
      entityType: 'Student',
      entityId: String(promise.studentId),
      oldValues: { vada: 'OCHIQ' },
      newValues: { vada: 'BEKOR_QILINDI', action: "TO'LOV_VA'DASI_BEKOR_QILINDI" },
      changedById: userId,
      companyId,
    });

    return updated;
  }

  findByStudent(studentId: number, companyId: number) {
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
