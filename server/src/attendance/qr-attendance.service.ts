import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryService } from '../salary/salary.service';
import { AttendanceMethod, AttendanceStatus, EnrollmentStatus, HolidayStatus } from '@prisma/client';
import { AttendanceService } from './attendance.service';

interface QrSession {
  sessionId: string;
  teacherId: number;
  companyId: number;
  currentToken: string;
  createdAt: string;
  lessonNumber: number | null;
}

interface QrToken {
  groupId: string;
  date: string;
  sessionId: string;
  teacherId: number;
  companyId: number;
}

const SESSION_TTL = 7200; // 2 soat
const TOKEN_TTL = 50; // 50 soniya (45s + 5s grace)

@Injectable()
export class QrAttendanceService {
  private readonly logger = new Logger(QrAttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notificationsGateway: NotificationsGateway,
    private entityHistoryService: EntityHistoryService,
    private attendanceService: AttendanceService,
    private transactionsService: TransactionsService,
    private salaryService: SalaryService,
  ) {}

  async startSession(
    groupId: string,
    date: string,
    teacherId: number,
    companyId: number,
    roles?: string[],
  ) {
    // Validate date is a valid lesson date (includes time check for teachers)
    const { group: validatedGroup, parsedDate } =
      await this.attendanceService.validateLessonDate(groupId, date, companyId, roles);

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true, name: true, exactDays: true, startDate: true },
    });

    // Mavjud sessiyani tekshirish
    const sessionKey = `qr-session:${groupId}:${date}`;
    const existingSession = await this.redis.get(sessionKey);
    if (existingSession) {
      const parsed: QrSession = JSON.parse(existingSession);
      // Agar boshqa teacher boshlagan bo'lsa
      if (parsed.teacherId !== teacherId) {
        throw new BadRequestException(
          'Bu sana uchun boshqa o\'qituvchi allaqachon QR sessiya boshlagan',
        );
      }
      // Agar o'sha teacher qayta boshlasa — eski tokenni o'chirib, yangi sessiya
      await this.redis.del(`qr-token:${parsed.currentToken}`);
    }

    const sessionId = randomUUID();
    const token = randomUUID();

    // Jami o'quvchilar soni
    const totalStudents = await this.prisma.enrollment.count({
      where: {
        groupId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { deletedAt: null },
      },
    });

    // Dars raqamini hisoblash
    let lessonNumber: number | null = null;
    if (group?.startDate && group.exactDays?.length) {
      const dayNameToJs: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const allowedDays = new Set(
        group.exactDays.map((d) => dayNameToJs[d.toLowerCase()]),
      );
      // Get holidays in range for accurate lesson count
      const holidays = await this.prisma.holiday.findMany({
        where: {
          status: HolidayStatus.ACTIVE,
          deletedAt: null,
          date: { gte: group.startDate, lte: parsedDate },
        },
        select: { date: true },
      });
      const holidaySet = new Set(
        holidays.map((h) => {
          const y = h.date.getFullYear();
          const m = String(h.date.getMonth() + 1).padStart(2, '0');
          const d = String(h.date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }),
      );
      let count = 0;
      const current = new Date(group.startDate);
      while (current <= parsedDate) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        if (allowedDays.has(current.getDay()) && !holidaySet.has(dateStr)) {
          count++;
        }
        current.setDate(current.getDate() + 1);
      }
      lessonNumber = count;
    }

    // Sessiya TTL: dars tugashigacha yoki maksimum SESSION_TTL
    let sessionTtl = SESSION_TTL;
    if (validatedGroup.lessonEndTime) {
      const now = new Date();
      const [endH, endM] = validatedGroup.lessonEndTime.split(':').map(Number);
      const lessonEndToday = new Date(now);
      lessonEndToday.setHours(endH, endM, 0, 0);
      const remainingSeconds = Math.floor(
        (lessonEndToday.getTime() - now.getTime()) / 1000,
      );
      if (remainingSeconds > 0) {
        sessionTtl = Math.min(remainingSeconds, SESSION_TTL);
      }
    }

    // Sessiyani Redis ga yozish
    const session: QrSession = {
      sessionId,
      teacherId,
      companyId,
      currentToken: token,
      createdAt: new Date().toISOString(),
      lessonNumber,
    };
    await this.redis.set(sessionKey, JSON.stringify(session), 'EX', sessionTtl);

    // Tokenni Redis ga yozish
    const tokenData: QrToken = {
      groupId,
      date,
      sessionId,
      teacherId,
      companyId,
    };
    await this.redis.set(
      `qr-token:${token}`,
      JSON.stringify(tokenData),
      'EX',
      TOKEN_TTL,
    );

    return { sessionId, token, expiresIn: 45, totalStudents };
  }

  async rotateToken(
    groupId: string,
    date: string,
    sessionId: string,
    teacherId: number,
  ) {
    const sessionKey = `qr-session:${groupId}:${date}`;
    const raw = await this.redis.get(sessionKey);
    if (!raw) {
      throw new BadRequestException('QR sessiya topilmadi yoki muddati tugagan');
    }

    const session: QrSession = JSON.parse(raw);
    if (session.sessionId !== sessionId) {
      throw new BadRequestException('Sessiya mos kelmadi');
    }
    if (session.teacherId !== teacherId) {
      throw new ForbiddenException('Faqat sessiya egasi tokenni yangilashi mumkin');
    }

    // Eski tokenni o'chirish
    await this.redis.del(`qr-token:${session.currentToken}`);

    // Sessiyaning qolgan TTL ini olish (qayta tiklamaslik uchun)
    const remainingTtl = await this.redis.ttl(sessionKey);
    if (remainingTtl <= 0) {
      throw new BadRequestException('QR sessiya muddati tugagan');
    }

    // Yangi token
    const newToken = randomUUID();
    session.currentToken = newToken;
    await this.redis.set(sessionKey, JSON.stringify(session), 'EX', remainingTtl);

    const tokenData: QrToken = {
      groupId,
      date,
      sessionId,
      teacherId: session.teacherId,
      companyId: session.companyId,
    };
    await this.redis.set(
      `qr-token:${newToken}`,
      JSON.stringify(tokenData),
      'EX',
      TOKEN_TTL,
    );

    return { token: newToken, expiresIn: 45 };
  }

  async stopSession(
    groupId: string,
    date: string,
    sessionId: string,
    teacherId: number,
  ) {
    const sessionKey = `qr-session:${groupId}:${date}`;
    const raw = await this.redis.get(sessionKey);
    if (!raw) {
      return { message: 'Sessiya allaqachon tugatilgan' };
    }

    const session: QrSession = JSON.parse(raw);
    if (session.sessionId !== sessionId || session.teacherId !== teacherId) {
      throw new ForbiddenException('Faqat sessiya egasi tugatishi mumkin');
    }

    // Tokenni va sessiyani o'chirish
    await this.redis.del(`qr-token:${session.currentToken}`);
    await this.redis.del(sessionKey);

    return { message: 'QR sessiya tugatildi' };
  }

  async scanQr(
    token: string,
    studentId: number,
    userId: number,
    companyId: number,
  ) {
    // Tokenni Redis dan olish
    const raw = await this.redis.get(`qr-token:${token}`);
    if (!raw) {
      throw new BadRequestException("QR kod eskirgan yoki noto'g'ri");
    }

    const tokenData: QrToken = JSON.parse(raw);
    const { groupId, date, teacherId } = tokenData;

    // O'quvchining guruhga yozilganligini tekshirish
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

    // BALANS TEKSHIRUVI: balance < 0 bo'lsa bloklash (0 = to'liq to'langan)
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

    // Allaqachon belgilangan bo'lsa
    const existing = await this.prisma.attendance.findUnique({
      where: {
        groupId_studentId_date: {
          groupId,
          studentId,
          date: new Date(date),
        },
      },
    });

    // Guruh nomi va dars raqamini olish (sessiyadan)
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });

    // Dars raqamini Redis sessiyadan o'qish (startSession da hisoblangan)
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

    // Davomat yozish (upsert)
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

    // Entity history
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

    // CYCLE DEDUCTION + SALARY ACCRUAL
    try {
      const groupData = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: {
          branchId: true,
          course: { select: { price: true, lessonPaymentCount: true } },
          teachers: { select: { teacherId: true } },
        },
      });

      if (groupData) {
        const { price, lessonPaymentCount: rawLPC } = groupData.course;
        const lessonPaymentCount = rawLPC || 12;
        const perLessonCost = Math.round(price / lessonPaymentCount);
        const parsedLessonDate = new Date(date + 'T00:00:00.000Z');

        // Check cycle boundary → deduct full cycle if crossed
        const totalAttended = await this.prisma.attendance.count({
          where: {
            groupId,
            studentId,
            status: { in: ['PRESENT', 'LATE'] },
          },
        });

        const cyclesPaid = Math.floor((totalAttended - 1) / lessonPaymentCount) + 1;
        const cyclesDeducted = await this.prisma.transaction.count({
          where: {
            studentId,
            enrollmentId: enrollment.id,
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
            await this.transactionsService.deductLessonFee({
              studentId,
              amount: price,
              attendanceId: attendance.id,
              enrollmentId: enrollment.id,
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
            enrollmentId: enrollment.id,
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
              attendanceId: attendance.id,
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
      }
    } catch (err) {
      this.logger.error(`Financial processing failed for QR scan: student ${studentId}, group ${groupId}`, err);
    }

    // O'quvchi ma'lumotlarini olish
    const studentData = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, photo: true },
    });

    // Teacher ga SSE orqali real-time xabar yuborish
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
}
