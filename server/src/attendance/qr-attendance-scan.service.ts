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
import { assertAttendanceWindowOpen } from './shared/attendance-window-guard';
import { QrSession, QrToken } from './shared/qr-types';
import { AttendanceValidationService } from './attendance-validation.service';
import { LessonAdmissionService } from '../billing/lesson-admission.service';

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
    private validation: AttendanceValidationService,
    private admission: LessonAdmissionService,
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
        'Sizning darslaringiz bu sanadan keyin boshlanadi',
      );
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true, branchId: true },
    });
    if (!group) {
      throw new BadRequestException('Guruh topilmadi');
    }

    // The lesson as the database has it now — its effective times and the
    // company's lead — on every scan, never what the session remembers: the
    // last token outlives its session by up to TOKEN_TTL, so a scan after
    // the lesson ended, or once «Dars bo'ldimi?» was asked, is refused here.
    // Before the transaction, before any write.
    const lesson = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
    );
    await assertAttendanceWindowOpen(this.prisma, {
      groupId,
      date,
      parsedDate: parsedLessonDate,
      times: {
        startTime: lesson.effectiveStartTime,
        endTime: lesson.effectiveEndTime,
        opensMinutesBefore: lesson.opensMinutesBefore,
      },
      student: true,
    });

    // Contract 3.2 (ADR-0047): from the month's 2nd lesson a scan admits
    // only a student whose payments reach this lesson.
    const admission = await this.admission.forLesson({
      groupId,
      lessonDay: date,
      studentIds: [studentId],
    });
    const verdict = admission.get(studentId);
    if (verdict?.admitted === false) {
      throw new BadRequestException(
        verdict.reason === 'BELOW_MIN_SHARE'
          ? `Oy to'lovining kamida ${verdict.minPaidPercent}% i to'lanmagan: shartnomaga ko'ra 2-darsdan boshlab shu qismi to'lanmaguncha darsga qo'yilmaysiz`
          : "To'lov qilinmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaysiz",
      );
    }

    // The session only supplies the lesson number, so the early-return path
    // (already marked) and the success path surface the same value.
    const sessionRaw = await this.redis.get(`qr-session:${groupId}:${date}`);
    const lessonNumber = sessionRaw
      ? (JSON.parse(sessionRaw) as QrSession).lessonNumber
      : null;

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
            // A LATE row's minutes go with it (ADR-0048).
            lateMinutes: null,
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
