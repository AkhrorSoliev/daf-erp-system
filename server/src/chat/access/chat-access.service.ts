import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { CHAT_OFF_MESSAGE } from '../chat.constants';
import {
  WINDOW_DAYS,
  evaluateQuota,
  lockReasons,
  reasonText,
  tomorrowWarning,
  type ChatLockReason,
  type DayUsage,
  type QuotaResult,
} from './chat-access.rules';

export interface ChatAccess {
  enabled: boolean;
  canWrite: boolean;
  reasons: ChatLockReason[];
  /** One Uzbek sentence per reason, in the same order. */
  messages: string[];
  /** «Ertaga yozish yopiladi…» while the quota still holds today. */
  warning: string | null;
  quota: QuotaResult;
}

/** The one place that decides whether a student may write (spec §1). */
@Injectable()
export class ChatAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async forStudent(
    studentId: number,
    companyId: number,
    now: Date = new Date(),
  ): Promise<ChatAccess> {
    const today = tashkentDateStr(now);
    const from = addDaysToDateStr(today, -(WINDOW_DAYS - 1));

    const [enabled, activeMin, radioMin, student, usage] = await Promise.all([
      this.settings.get(companyId, 'chat.enabled'),
      this.settings.get(companyId, 'chat.weekMinutesActive'),
      this.settings.get(companyId, 'chat.weekMinutesRadio'),
      this.prisma.student.findFirst({
        where: { id: studentId, companyId, deletedAt: null },
        select: {
          balance: true,
          gender: true,
          dateOfBirth: true,
          phone: true,
          verifiedPhone: true,
          chatBannedAt: true,
        },
      }),
      this.prisma.studentAppSession.groupBy({
        by: ['day'],
        where: {
          studentId,
          day: {
            gte: utcMidnightFromDateStr(from),
            lte: utcMidnightFromDateStr(today),
          },
        },
        _sum: { activeSeconds: true, radioSeconds: true },
      }),
    ]);
    if (!student) throw new NotFoundException('Talaba topilmadi');

    // `day` is a @db.Date column: it comes back as UTC midnight of the Tashkent day.
    const days: DayUsage[] = usage.map((u) => ({
      day: u.day.toISOString().slice(0, 10),
      activeSeconds: u._sum.activeSeconds ?? 0,
      radioSeconds: u._sum.radioSeconds ?? 0,
    }));
    const quota = evaluateQuota(days, today, { activeMin, radioMin });
    const reasons = lockReasons(student, quota);

    return {
      enabled,
      canWrite: enabled && reasons.length === 0,
      reasons,
      messages: reasons.map((r) => reasonText(r, quota)),
      warning: reasons.length === 0 ? tomorrowWarning(quota) : null,
      quota,
    };
  }

  async assertEnabled(companyId: number): Promise<void> {
    if (!(await this.settings.get(companyId, 'chat.enabled'))) {
      throw new ForbiddenException(CHAT_OFF_MESSAGE);
    }
  }

  async assertCanWrite(studentId: number, companyId: number): Promise<void> {
    const access = await this.forStudent(studentId, companyId);
    if (!access.enabled) throw new ForbiddenException(CHAT_OFF_MESSAGE);
    if (!access.canWrite) throw new ForbiddenException(access.messages[0]);
  }
}
