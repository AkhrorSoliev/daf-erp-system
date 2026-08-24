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
import { resolveStudentBranchId } from '../common/finance/resolve-branch';
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
      select: { id: true, firstName: true, lastName: true, balance: true },
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

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      currentBalance: student.balance,
      maxWithdrawable: student.balance > 0 ? student.balance : 0,
      teacherSuggestions,
    };
  }

  /**
   * Drain a portion of the student's positive balance into the system as
   * revenue for a chosen accounting month. Optionally credit the teacher's
   * salary for that month by writing a SalaryAccrual linked to the new
   * BALANCE_WITHDRAWAL transaction (attendanceId is NULL — there's no
   * underlying lesson row).
   *
   * All writes happen in one Serializable transaction.
   */
  async create(dto: CreateWithdrawalDto, userId: number, companyId: number) {
    // Draining a student's positive balance into recognised revenue is a
    // financial write like any other — the caller must own their branch.
    await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    if (student.balance < dto.amount) {
      throw new BadRequestException(
        `Balansda yetarli pul yo'q (mavjud: ${student.balance} so'm)`,
      );
    }

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

    const targetMonthDate = new Date(`${dto.targetMonth}-01T00:00:00.000Z`);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: number; balance: number }[]>`
          SELECT id, balance FROM "Student" WHERE id = ${dto.studentId} FOR UPDATE
        `;
        if (!locked.length) {
          throw new NotFoundException("O'quvchi topilmadi");
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
            description: dto.reason ?? `Yechib olish (${dto.targetMonth})`,
            metadata: {
              targetMonth: dto.targetMonth,
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
              lessonDate: targetMonthDate,
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
            oy: dto.targetMonth,
            ustoz_balansiga_yozildi: dto.creditTeacher ? 'Ha' : "Yo'q",
            sabab: dto.reason ?? null,
            status: 'PUL_YECHIB_OLINDI',
          },
          changedById: userId,
          companyId,
          tx,
        });

        return { transaction, accrualId, balanceAfter };
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
      targetMonth: dto.targetMonth,
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
