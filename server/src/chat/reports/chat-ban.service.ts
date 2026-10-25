import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityHistoryService } from '../../common/entity-history/entity-history.service';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatBanService {
  private readonly logger = new Logger(ChatBanService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
    private readonly gateway: NotificationsGateway,
  ) {}

  ban(studentId: number, companyId: number, actorId: number) {
    return this.set(studentId, companyId, actorId, true);
  }
  unban(studentId: number, companyId: number, actorId: number) {
    return this.set(studentId, companyId, actorId, false);
  }

  private async set(
    studentId: number,
    companyId: number,
    actorId: number,
    banned: boolean,
  ) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, userId: true, chatBannedAt: true },
    });
    if (!s) throw new NotFoundException("O'quvchi topilmadi");
    if (banned === (s.chatBannedAt != null)) {
      return { chatBannedAt: s.chatBannedAt?.toISOString() ?? null };
    }
    const at = banned ? new Date() : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: { chatBannedAt: at },
      });
      await this.history.recordUpdate({
        tx,
        entityType: 'Student',
        entityId: studentId,
        changedById: actorId,
        companyId,
        oldValues: { chatBannedAt: s.chatBannedAt },
        newValues: { chatBannedAt: at },
      });
    });
    try {
      if (s.userId) this.gateway.sendToUser(s.userId, { type: 'chat.access' });
    } catch (err) {
      this.logger.warn(
        `chat.access push to student ${studentId} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
    return { chatBannedAt: at?.toISOString() ?? null };
  }
}
