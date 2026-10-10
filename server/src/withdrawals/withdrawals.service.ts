import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { EntityHistoryService } from '../common/entity-history';
import {
  resolveStudentBranchId,
  tryResolveStudentBranchId,
} from '../common/finance/resolve-branch';
import { loadTransferState } from '../balance-notices/load-transfer-state';
import {
  tashkentDateStr,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Returns the data needed to populate the withdrawal dialog: current
   * student balance, max withdrawable, and the list of teachers active
   * on the student's enrollments (used when crediting a teacher).
   */
  async preview(studentId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        balance: true,
        statusChangedAt: true,
      },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: { deletedAt: null },
      },
      select: {
        groupId: true,
        group: {
          select: {
            id: true,
            name: true,
            teachers: {
              select: {
                teacher: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    deletedAt: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const teacherSuggestions: Array<{
      userId: number;
      name: string;
      groupId: string;
      groupName: string;
    }> = [];
    const seen = new Set<string>();
    for (const en of enrollments) {
      for (const t of en.group.teachers) {
        const teacher = t.teacher;
        if (!teacher || teacher.deletedAt || !teacher.isActive) continue;
        const key = `${teacher.id}:${en.group.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        teacherSuggestions.push({
          userId: teacher.id,
          name: `${teacher.firstName} ${teacher.lastName}`.trim(),
          groupId: en.group.id,
          groupName: en.group.name,
        });
      }
    }

    // The lock every withdrawal dialog shows before anything is typed (ADR-0077).
    const transfer = await loadTransferState(
      this.prisma,
      student,
      await tryResolveStudentBranchId(this.prisma, studentId, companyId),
      new Date(),
    );

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      currentBalance: student.balance,
      maxWithdrawable: student.balance > 0 ? student.balance : 0,
      teacherSuggestions,
      transfer,
    };
  }

  /**
   * Drain a portion of the student's positive balance into the centre's
   * account. The amount is revenue of the month it is withdrawn in — always
   * the current Tashkent month, never one the client picks (ADR-0055): the
   * canonical net profit adds it as its own leg (`loadBalanceWithdrawals`),
   * so a past month's figure never moves after the fact. Optionally credits
   * the teacher's salary with a SalaryAccrual linked to the new
   * BALANCE_WITHDRAWAL transaction (attendanceId is NULL — there's no
   * underlying lesson), dated the day of the withdrawal so it lands in the
   * open payroll period.
   *
   * Refused until the transfer condition holds (ADR-0077).
   *
   * All writes happen in one Serializable transaction.
   */
  async create(dto: CreateWithdrawalDto, userId: number, companyId: number) {
    // Draining a student's positive balance into recognised revenue is a
    // financial write like any other — the caller must own their branch.
    const studentBranchId = await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true, statusChangedAt: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    if (student.balance < dto.amount) {
      throw new BadRequestException(
        `Balansda yetarli pul yo'q (mavjud: ${student.balance} so'm)`,
      );
    }

    // The money goes to the centre only after the student was told and the
    // term passed: notice + 10 bank days + 30 days (ADR-0077). Every
    // withdrawal, the profile's «Yechib olish» included. The student's branch
    // decides the holidays, not the caller's.
    const transfer = await loadTransferState(
      this.prisma,
      student,
      studentBranchId,
      new Date(),
    );
    if (!transfer.allowed) throw new BadRequestException(transfer.refusal);

    // Validate teacher selection up-front so we don't open a tx just to roll back.
    let teacherGroupId: string | null = null;
    if (dto.creditTeacher) {
      if (!dto.teacherUserId) {
        throw new BadRequestException('Ustoz tanlanishi shart');
      }
      teacherGroupId = await this.assertTeacherCoversStudent({
        teacherUserId: dto.teacherUserId,
        studentId: dto.studentId,
        companyId,
      });
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: number; balance: number }[]>`
          SELECT id, balance FROM "Student" WHERE id = ${dto.studentId} FOR UPDATE
        `;
        if (!locked.length) {
          throw new NotFoundException("O'quvchi topilmadi");
        }

        // One instant decides the month, the ledger timestamp and the
        // teacher's accrual date, so the report and the payroll can never
        // file this withdrawal under two different months. It is read while
        // holding the student's row lock: the ledger replay orders a
        // student's rows by (createdAt, id) and fails closed when that order
        // disagrees with the balance chain, and a clock read before the lock
        // could sort ahead of a write that committed while this one waited.
        const now = new Date();
        const targetMonth = tashkentMonthKey(now);
        if (dto.targetMonth != null && dto.targetMonth !== targetMonth) {
          throw new BadRequestException(
            'Yechib olish faqat joriy oy uchun yoziladi',
          );
        }

        const balanceBefore = locked[0].balance;
        if (balanceBefore < dto.amount) {
          throw new BadRequestException(
            `Balansda yetarli pul yo'q (mavjud: ${balanceBefore} so'm)`,
          );
        }
        const balanceAfter = balanceBefore - dto.amount;

        // A withdrawal recognises the student's prepaid money as revenue, so it
        // belongs to that student's branch — otherwise the amount lands in no
        // branch's P&L at all (D4).
        const branchId = await resolveStudentBranchId(
          tx,
          dto.studentId,
          companyId,
        );

        const transaction = await tx.transaction.create({
          data: {
            type: TransactionType.BALANCE_WITHDRAWAL,
            amount: -dto.amount,
            balanceBefore,
            balanceAfter,
            studentId: dto.studentId,
            branchId,
            companyId,
            performedById: userId,
            createdAt: now,
            description: dto.reason ?? `Yechib olish (${targetMonth})`,
            metadata: {
              targetMonth,
              creditTeacher: dto.creditTeacher,
              teacherUserId: dto.teacherUserId ?? null,
              groupId: teacherGroupId,
              reason: dto.reason ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        await tx.student.update({
          where: { id: dto.studentId },
          data: { balance: balanceAfter },
        });

        let accrualId: string | null = null;
        if (dto.creditTeacher && dto.teacherUserId && teacherGroupId) {
          const accrual = await tx.salaryAccrual.create({
            data: {
              userId: dto.teacherUserId,
              studentId: dto.studentId,
              groupId: teacherGroupId,
              attendanceId: null,
              lessonDate: utcMidnightFromDateStr(tashkentDateStr(now)),
              amount: dto.amount,
              perLessonCost: dto.amount,
              companyId,
              deductionTransactionId: transaction.id,
            },
          });
          accrualId = accrual.id;
        }

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: dto.studentId,
          oldValues: { balans: balanceBefore },
          newValues: {
            balans: balanceAfter,
            yechilgan_summa: dto.amount,
            oy: targetMonth,
            ustoz_balansiga_yozildi: dto.creditTeacher ? 'Ha' : "Yo'q",
            sabab: dto.reason ?? null,
            status: 'PUL_YECHIB_OLINDI',
          },
          changedById: userId,
          companyId,
          tx,
        });

        return { transaction, accrualId, balanceAfter, targetMonth };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return {
      id: result.transaction.id,
      studentId: dto.studentId,
      amount: dto.amount,
      targetMonth: result.targetMonth,
      creditTeacher: dto.creditTeacher,
      teacherUserId: dto.teacherUserId ?? null,
      accrualId: result.accrualId,
      balanceAfter: result.balanceAfter,
      reason: dto.reason ?? null,
      createdAt: result.transaction.createdAt,
    };
  }

  /**
   * Confirm the chosen teacher is assigned to one of the student's active
   * enrollments. Returns the groupId we'll attach the accrual to.
   */
  private async assertTeacherCoversStudent(params: {
    teacherUserId: number;
    studentId: number;
    companyId: number;
  }): Promise<string> {
    const link = await this.prisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: {
          deletedAt: null,
          teachers: { some: { teacherId: params.teacherUserId } },
        },
      },
      select: { groupId: true },
    });
    if (!link) {
      throw new ForbiddenException(
        "Tanlangan ustoz bu o'quvchining guruhlarida yo'q",
      );
    }
    return link.groupId;
  }
}
