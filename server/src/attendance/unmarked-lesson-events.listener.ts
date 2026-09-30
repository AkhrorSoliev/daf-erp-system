import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationType,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import {
  UNMARKED_LESSON_HELD,
  type UnmarkedLessonHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';

/**
 * «Bo'ldi» was entered for a lesson nobody marked in time: its teacher —
 * the substitute, if one taught it — learns the lesson earned nothing
 * (ADR-0054). DB + SSE + push now; Telegram in the 20:00 digest.
 */
@Injectable()
export class UnmarkedLessonEventsListener {
  private readonly logger = new Logger(UnmarkedLessonEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent(UNMARKED_LESSON_HELD)
  async handleHeld(p: UnmarkedLessonHeldPayload) {
    if (p.teacherPayExempt) return;
    try {
      const date = new Date(`${p.date}T00:00:00.000Z`);
      const override = await this.prisma.lessonTeacherOverride.findFirst({
        where: { groupId: p.groupId, date, deletedAt: null },
        select: { teacherIds: true },
      });
      const teacherIds =
        override?.teacherIds ??
        (
          await this.prisma.groupTeacher.findMany({
            where: { groupId: p.groupId },
            select: { teacherId: true },
          })
        ).map((t) => t.teacherId);
      const teachers = await this.prisma.user.findMany({
        where: {
          id: { in: teacherIds },
          deletedAt: null,
          isActive: true,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      });

      const [y, m, d] = p.date.split('-');
      const title = 'Dars haqi yozilmadi';
      const message = `"${p.groupName}", ${d}.${m}.${y}: davomat dars vaqtida olinmagani uchun bu dars haqi yozilmadi.`;
      for (const teacher of teachers) {
        try {
          const notification = await this.notificationsService.create({
            userId: teacher.id,
            type: NotificationType.SYSTEM,
            title,
            message,
            relatedEntityType: 'Group',
            relatedEntityId: p.groupId,
            companyId: p.companyId,
          });
          this.gateway.sendToUser(teacher.id, {
            type: 'notification',
            notification,
          });
          try {
            await this.pushService.sendToUser(teacher.id, {
              title,
              body: message,
              url: `/groups/${p.groupId}`,
            });
          } catch (err) {
            this.logger.warn(
              `Push failed for teacher ${teacher.id}: ${err instanceof Error ? err.message : err}`,
            );
          }
          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: teacher.id,
            companyId: p.companyId,
            category: TelegramDigestCategory.LESSON_PAY_FORFEITED,
            relatedEntityId: `${p.groupId}:${p.date}`,
            payload: {
              groupId: p.groupId,
              groupName: p.groupName,
              date: p.date,
            },
          });
        } catch (err) {
          this.logger.error(
            `Could not tell teacher ${teacher.id} about lost pay: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Held-lesson notice failed for ${p.groupId} ${p.date}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
