import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryService } from '../salary/salary.service';
import { QrSession, QrToken } from './shared/qr-types';

@Injectable()
export class QrAttendanceScanService {
  private readonly logger = new Logger(QrAttendanceScanService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notificationsGateway: NotificationsGateway,
    private entityHistoryService: EntityHistoryService,
    private transactionsService: TransactionsService,
    private salaryService: SalaryService,
  ) {}

  async scanQr(
    token: string,
    studentId: number,
    userId: number,
    companyId: number,
  ) {
    const raw = await this.redis.get(`qr-token:${token}`);
    if (!raw) {
      throw new BadRequestException("QR kod eskirgan yoki noto'g'ri");
    }

    const tokenData: QrToken = JSON.parse(raw);
    const { groupId, date, teacherId } = tokenData;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        groupId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (!enrollment) {
      throw new BadRequestException('Siz bu guruhga yozilmagansiz');
    }

    // Balance gate: block scans when fully consumed (balance < 0).
    // balance = 0 still allowed (will be checked again before cycle deduction).
    const studentBalance = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { balance: true },
    });
    if (studentBalance && studentBalance.balance < 0) {
      return {
        success: false,
        balanceInsufficient: true,
        message: "Balans yetarli emas. Iltimos, ma'muriyatga murojaat qiling",
        balance: studentBalance.balance,
      };
    }

    const existing = await this.prisma.attendance.findUnique({
      where: {
        groupId_studentId_date: {
          groupId,
          studentId,
          date: new Date(date),
        },
      },
    });

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });

    // Lesson number was computed once in startSession and cached
    let lessonNumber: number | null = null;
    const sessionKey = `qr-session:${groupId}:${date}`;
    const sessionRaw = await this.redis.get(sessionKey);
    if (sessionRaw) {
      const sessionData: QrSession = JSON.parse(sessionRaw);
      lessonNumber = sessionData.lessonNumber;
    }

    if (existing && existing.status === AttendanceStatus.PRESENT) {
      return {
        message: 'Davomat allaqachon belgilangan',
        alreadyMarked: true,
        status: AttendanceStatus.PRESENT,
        groupName: group?.name,
        lessonNumber,
      };
    }

    const oldValues = existing ? { ...existing } : null;
    const attendance = await this.prisma.attendance.upsert({
      where: {
        groupId_studentId_date: {
          groupId,
          studentId,
          date: new Date(date),
        },
      },
      create: {
        groupId,
        studentId,
        date: new Date(date),
        status: AttendanceStatus.PRESENT,
        markedById: userId,
        markedMethod: AttendanceMethod.QR,
        companyId,
      },
      update: {
        status: AttendanceStatus.PRESENT,
        markedById: userId,
        markedMethod: AttendanceMethod.QR,
      },
    });

    if (oldValues) {
      this.entityHistoryService.recordUpdate({
        entityType: 'Attendance',
        entityId: attendance.id,
        oldValues,
        newValues: attendance,
        changedById: userId,
        companyId,
      });
    } else {
      this.entityHistoryService.recordCreate({
        entityType: 'Attendance',
        entityId: attendance.id,
        newValues: attendance,
        changedById: userId,
        companyId,
      });
    }

    await this.processFinancialEffects(
      attendance.id,
      enrollment.id,
      groupId,
      studentId,
      date,
      companyId,
    );

    const studentData = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, photo: true },
    });

    this.notificationsGateway.sendToUser(teacherId, {
      type: 'qr-attendance',
      groupId,
      date,
      studentId,
      status: AttendanceStatus.PRESENT,
      student: {
        firstName: studentData?.firstName,
        lastName: studentData?.lastName,
        photo: studentData?.photo,
      },
      scannedAt: new Date().toISOString(),
    });

    return {
      message: 'Davomat muvaffaqiyatli belgilandi',
      status: AttendanceStatus.PRESENT,
      alreadyMarked: false,
      groupName: group?.name,
      lessonNumber,
    };
  }

  private async processFinancialEffects(
    attendanceId: string,
    enrollmentId: string,
    groupId: string,
    studentId: number,
    date: string,
    companyId: number,
  ) {
    try {
      const groupData = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: {
          branchId: true,
          course: { select: { price: true, lessonPaymentCount: true } },
          teachers: { select: { teacherId: true } },
        },
      });

      if (!groupData) return;

      const { price, lessonPaymentCount: rawLPC } = groupData.course;
      const lessonPaymentCount = rawLPC || 12;
      const perLessonCost = Math.round(price / lessonPaymentCount);
      const parsedLessonDate = new Date(date + 'T00:00:00.000Z');

      const totalAttended = await this.prisma.attendance.count({
        where: {
          groupId,
          studentId,
          status: { in: ['PRESENT', 'LATE'] },
        },
      });

      const cyclesPaid =
        Math.floor((totalAttended - 1) / lessonPaymentCount) + 1;
      const cyclesDeducted = await this.prisma.transaction.count({
        where: {
          studentId,
          enrollmentId,
          type: 'LESSON_DEDUCTION',
        },
      });

      if (cyclesPaid > cyclesDeducted) {
        // Prepaid guard — same rule as manual attendance. QR already
        // blocks scans for balance < 0 upstream, but we repeat the check
        // here because the block allows balance = 0 (fully consumed
        // prepaid) through, and that case can't cover a new cycle.
        const studentRow = await this.prisma.student.findUnique({
          where: { id: studentId },
          select: { balance: true },
        });
        if ((studentRow?.balance ?? 0) >= price) {
          const activeContract = await this.prisma.contract.findFirst({
            where: {
              studentId,
              groupId,
              status: 'ACTIVE',
              deletedAt: null,
            },
            select: { id: true },
          });
          await this.transactionsService.deductLessonFee({
            studentId,
            amount: price,
            attendanceId,
            enrollmentId,
            contractId: activeContract?.id,
            companyId,
            branchId: groupData.branchId,
          });
        } else {
          this.logger.warn(
            `Skipping cycle deduction: student ${studentId} balance (${studentRow?.balance ?? 0}) insufficient for cycle fee (${price}) in group ${groupId}`,
          );
        }
      }

      // Coverage lookup for accrual: only earn for paid lessons (B.1).
      const coverage = await this.prisma.transaction.findFirst({
        where: {
          studentId,
          enrollmentId,
          type: 'LESSON_DEDUCTION',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (coverage) {
        for (const teacher of groupData.teachers) {
          await this.salaryService.createAccrual({
            teacherId: teacher.teacherId,
            studentId,
            groupId,
            attendanceId,
            lessonDate: parsedLessonDate,
            perLessonCost,
            companyId,
            deductionTransactionId: coverage.id,
          });
        }
      } else {
        this.logger.warn(
          `Skipping salary accrual: student ${studentId} has no payment coverage in group ${groupId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Financial processing failed for QR scan: student ${studentId}, group ${groupId}`,
        err,
      );
    }
  }
}
