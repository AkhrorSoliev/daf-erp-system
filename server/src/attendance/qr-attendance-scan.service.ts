import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { calculatePerLessonCost } from '../billing/debtor-check.helper';
import { QrSession, QrToken } from './shared/qr-types';

@Injectable()
export class QrAttendanceScanService {
  private readonly logger = new Logger(QrAttendanceScanService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notificationsGateway: NotificationsGateway,
    private entityHistoryService: EntityHistoryService,
    private lessonBillingService: LessonBillingService,
    private eventEmitter: EventEmitter2,
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
    const parsedLessonDate = new Date(date + 'T00:00:00.000Z');

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

    // Late-joiner gate: a student enrolled "from lesson 5" must not be able
    // to scan into earlier lessons. NULL startDate (legacy data) is permissive.
    if (enrollment.startDate && enrollment.startDate > parsedLessonDate) {
      throw new BadRequestException(
        "Sizning darslaringiz bu sanadan keyin boshlanadi",
      );
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        name: true,
        branchId: true,
        course: { select: { price: true, lessonPaymentCount: true } },
      },
    });
    if (!group) {
      throw new BadRequestException('Guruh topilmadi');
    }

    // Balance gate: block scans when the balance can't cover one lesson at
    // this group's per-lesson cost. The structured response lets the student
    // portal surface a clear "balance short by N" message instead of a
    // generic error — and stops the QR flow before any side effects run.
    const perLessonCost = calculatePerLessonCost(
      group.course.price,
      group.course.lessonPaymentCount,
    );
    const studentBalance = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { balance: true },
    });
    if (studentBalance && studentBalance.balance < perLessonCost) {
      return {
        success: false,
        balanceInsufficient: true,
        message:
          "Balansingiz dars uchun yetmadi. Iltimos, ma'muriyatga murojaat qiling",
        balance: studentBalance.balance,
        debtAmount: perLessonCost - studentBalance.balance,
      };
    }

    // Cache the lesson number from the session so the early-return path
    // (already-marked) and the success path both surface the same value.
    let lessonNumber: number | null = null;
    const sessionRaw = await this.redis.get(`qr-session:${groupId}:${date}`);
    if (sessionRaw) {
      const sessionData: QrSession = JSON.parse(sessionRaw);
      lessonNumber = sessionData.lessonNumber;
    }

    // Already marked PRESENT? Nothing to do.
    const existing = await this.prisma.attendance.findUnique({
      where: {
        groupId_studentId_date: {
          groupId,
          studentId,
          date: parsedLessonDate,
        },
      },
    });
    if (existing && existing.status === AttendanceStatus.PRESENT) {
      return {
        message: 'Davomat allaqachon belgilangan',
        alreadyMarked: true,
        status: AttendanceStatus.PRESENT,
        groupName: group.name,
        lessonNumber,
      };
    }

    // Atomic block: upsert + LessonBillingService — same pattern as the
    // manual attendance flow, so QR and manual stay byte-for-byte equivalent.
    const { attendance, oldStatus, oldValues } = await this.prisma.$transaction(
      async (tx) => {
        const existingInTx = await tx.attendance.findUnique({
          where: {
            groupId_studentId_date: {
              groupId,
              studentId,
              date: parsedLessonDate,
            },
          },
        });
        const oldStatus = existingInTx?.status ?? null;
        const oldValues = existingInTx ? { ...existingInTx } : null;

        const attendance = await tx.attendance.upsert({
          where: {
            groupId_studentId_date: {
              groupId,
              studentId,
              date: parsedLessonDate,
            },
          },
          create: {
            groupId,
            studentId,
            date: parsedLessonDate,
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

        await this.lessonBillingService.processAttendanceBilling(tx, {
          attendanceId: attendance.id,
          enrollmentId: enrollment.id,
          studentId,
          groupId,
          branchId: group.branchId,
          lessonDate: parsedLessonDate,
          oldStatus,
          newStatus: AttendanceStatus.PRESENT,
          companyId,
          performedById: userId,
        });

        return { attendance, oldStatus, oldValues };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );

    // History records run outside the tx — these are audit-only side effects
    // that don't affect the financial atomicity guarantees.
    if (oldValues) {
      await this.entityHistoryService.recordUpdate({
        entityType: 'Attendance',
        entityId: attendance.id,
        oldValues,
        newValues: attendance,
        changedById: userId,
        companyId,
      });
    } else {
      await this.entityHistoryService.recordCreate({
        entityType: 'Attendance',
        entityId: attendance.id,
        newValues: attendance,
        changedById: userId,
        companyId,
      });
    }

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

    // Per-student Telegram ping. Skip when oldStatus is already PRESENT —
    // the early-return above catches the common case, but a student who was
    // marked LATE/ABSENT manually then scans the QR will still flip to
    // PRESENT here and deserves the notification.
    if (oldStatus !== AttendanceStatus.PRESENT) {
      this.eventEmitter.emit('attendance.student.recorded', {
        studentId,
        groupId,
        groupName: group.name,
        date,
        oldStatus,
        newStatus: AttendanceStatus.PRESENT,
        companyId,
      });
    }

    return {
      message: 'Davomat muvaffaqiyatli belgilandi',
      status: AttendanceStatus.PRESENT,
      alreadyMarked: false,
      groupName: group.name,
      lessonNumber,
    };
  }
}
