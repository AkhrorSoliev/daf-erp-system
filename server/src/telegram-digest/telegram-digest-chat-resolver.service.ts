import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonalRecipientKind } from './telegram-digest-payloads';

/**
 * Looks up a digest recipient's Telegram chat at SEND time, so a staff member
 * deactivated between the event and 20:00 gets nothing.
 *
 * Students are filtered on `deletedAt` only. `Student.isActive` is true only
 * for ACTIVE students, so filtering on it would stop receipts to frozen,
 * departed and graduated students — who get them today and keep getting them
 * (CEO decision 2026-09-23). Staff use the full active filter the rest of the
 * notification pipeline applies.
 */
@Injectable()
export class TelegramDigestChatResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveChatId(
    kind: PersonalRecipientKind,
    id: number,
  ): Promise<string | null> {
    if (kind === 'STUDENT') {
      const student = await this.prisma.student.findFirst({
        where: { id, deletedAt: null },
        select: { telegramChatId: true },
      });
      return student?.telegramChatId ?? null;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { telegramChatId: true },
    });
    return user?.telegramChatId ?? null;
  }
}
