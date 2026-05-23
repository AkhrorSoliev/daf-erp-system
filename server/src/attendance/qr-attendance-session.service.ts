import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AttendanceService } from './attendance.service';
import { DAY_NAME_TO_JS, tashkentDateStr } from './shared/date-utils';
import { HolidaysService } from '../holidays/holidays.service';
import {
  QrSession,
  QrToken,
  SESSION_TTL,
  TOKEN_TTL,
  TOKEN_EXPIRES_IN,
} from './shared/qr-types';

@Injectable()
export class QrAttendanceSessionService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private attendanceService: AttendanceService,
    private holidaysService: HolidaysService,
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
      await this.attendanceService.validateLessonDate(
        groupId,
        date,
        companyId,
        roles,
      );

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true, name: true, exactDays: true, startDate: true },
    });

    const sessionKey = `qr-session:${groupId}:${date}`;
    const existingSession = await this.redis.get(sessionKey);
    if (existingSession) {
      const parsed: QrSession = JSON.parse(existingSession);
      if (parsed.teacherId !== teacherId) {
        throw new BadRequestException(
          "Bu sana uchun boshqa o'qituvchi allaqachon QR sessiya boshlagan",
        );
      }
      // Same teacher restarting — drop the old token and reissue
      await this.redis.del(`qr-token:${parsed.currentToken}`);
    }

    const sessionId = randomUUID();
    const token = randomUUID();

    const totalStudents = await this.prisma.enrollment.count({
      where: {
        groupId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { deletedAt: null },
      },
    });

    const lessonNumber = await this.computeLessonNumber(
      group?.startDate ?? null,
      group?.exactDays ?? null,
      parsedDate,
    );

    // Session TTL: until lesson ends, capped at SESSION_TTL
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

    const session: QrSession = {
      sessionId,
      teacherId,
      companyId,
      currentToken: token,
      createdAt: new Date().toISOString(),
      lessonNumber,
    };
    await this.redis.set(sessionKey, JSON.stringify(session), 'EX', sessionTtl);

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

    return { sessionId, token, expiresIn: TOKEN_EXPIRES_IN, totalStudents };
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
      throw new BadRequestException(
        'QR sessiya topilmadi yoki muddati tugagan',
      );
    }

    const session: QrSession = JSON.parse(raw);
    if (session.sessionId !== sessionId) {
      throw new BadRequestException('Sessiya mos kelmadi');
    }
    if (session.teacherId !== teacherId) {
      throw new ForbiddenException(
        'Faqat sessiya egasi tokenni yangilashi mumkin',
      );
    }

    await this.redis.del(`qr-token:${session.currentToken}`);

    // Preserve remaining TTL — rotation must not extend the session
    const remainingTtl = await this.redis.ttl(sessionKey);
    if (remainingTtl <= 0) {
      throw new BadRequestException('QR sessiya muddati tugagan');
    }

    const newToken = randomUUID();
    session.currentToken = newToken;
    await this.redis.set(
      sessionKey,
      JSON.stringify(session),
      'EX',
      remainingTtl,
    );

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

    return { token: newToken, expiresIn: TOKEN_EXPIRES_IN };
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

    await this.redis.del(`qr-token:${session.currentToken}`);
    await this.redis.del(sessionKey);

    return { message: 'QR sessiya tugatildi' };
  }

  private async computeLessonNumber(
    startDate: Date | null,
    exactDays: string[] | null,
    parsedDate: Date,
  ): Promise<number | null> {
    if (!startDate || !exactDays?.length) return null;

    const allowedDays = new Set(
      exactDays.map((d) => DAY_NAME_TO_JS[d.toLowerCase()]),
    );
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      startDate,
      parsedDate,
    );

    let count = 0;
    const current = new Date(startDate);
    while (current <= parsedDate) {
      const dateStr = tashkentDateStr(current);
      if (allowedDays.has(current.getDay()) && !holidaySet.has(dateStr)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }
}
